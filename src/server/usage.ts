/**
 * One line per billable call, for the shared spend dashboard.
 *
 * Requested by the gtfoo agent, which reads `/var/lib/usage/<app>.jsonl` from
 * every app on the droplet and renders `/admin/usage`. Append-only JSONL rather
 * than a shared database, so no app can block another and a crash mid-write
 * costs one line.
 *
 * THIS MUST NEVER BREAK A REQUEST. Accounting is worth less than the thing being
 * accounted for: a reader waiting on a story does not care that the spend log is
 * unwritable. Every failure here is swallowed, warned about once, and forgotten.
 *
 * It is currently inert in production: `/var/lib/usage` does not exist yet and
 * `deploy` cannot create it, since /var/lib is the droplet agent's. The code is
 * written and waiting rather than half-built, so switching it on is a mkdir and
 * a chown with nothing to deploy.
 */
import { appendFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * The droplet's name for this app, not the repo's.
 *
 * `~/Git/1-percent-more-fluent` deploys to `/home/deploy/1-percent-more-fluent`,
 * and the dashboard keys on the deployed name - carpark's repo is `carpark-sg`
 * and its line says `carpark`. Getting this wrong is silent: the file is written
 * happily and the dashboard shows nothing.
 */
const APP = "1-percent-more-fluent";

/**
 * Read per call rather than captured at import, so the destination is not fixed
 * by whichever module happened to load first. It also lets the check point this
 * somewhere writable, and then somewhere that is not, without reloading the
 * module.
 */
function usageDir(): string {
  return process.env.USAGE_DIR ?? "/var/lib/usage";
}

/**
 * What happened to the call, which matters as much as what it cost.
 *
 * `rate_limited` is the one worth having: on a free tier it is the ONLY
 * trustworthy signal of where the ceiling actually is, since the documented
 * limits change without notice. Today that ceiling was hit repeatedly and the
 * only way to see it was reading the service log by hand.
 */
export type UsageStatus = "ok" | "rate_limited" | "error";

export interface UsageEntry {
  provider: string;
  /** The model that ANSWERED, not the alias that was asked for. */
  model: string;
  op: string;
  requests?: number;
  in_tokens?: number | null;
  out_tokens?: number | null;
  /** For providers not billed on tokens - characters for ElevenLabs. */
  units?: number | null;
  /**
   * Null unless somebody actually measured it. Free-tier Gemini is null, NOT
   * zero: printing "$0.00" beside a provider you depend on implies a
   * measurement nobody took, and the dashboard counts requests for those
   * instead.
   */
  usd?: number | null;
  status?: UsageStatus;
}

/** Warned about once per process, so a missing directory is not a log flood. */
let warned = false;

export function recordUsage(entry: UsageEntry): void {
  const line =
    JSON.stringify({
      ts: new Date().toISOString(),
      app: APP,
      provider: entry.provider,
      model: entry.model,
      op: entry.op,
      requests: entry.requests ?? 1,
      in_tokens: entry.in_tokens ?? null,
      out_tokens: entry.out_tokens ?? null,
      units: entry.units ?? null,
      usd: entry.usd ?? null,
      status: entry.status ?? "ok",
    }) + "\n";

  // Not awaited: the caller is on a request path and this is bookkeeping. The
  // mode only applies if the file is being created; the dashboard reads it as
  // another user, so it has to be world-readable.
  const dir = usageDir();
  void appendFile(join(dir, `${APP}.jsonl`), line, { mode: 0o644 }).catch((err) => {
    if (warned) return;
    warned = true;
    console.warn(
      `usage: cannot write ${dir}/${APP}.jsonl (${
        err instanceof Error ? err.message : String(err)
      }). Spend will not be reported; nothing else is affected.`,
    );
  });
}

/**
 * Read an error as a status.
 *
 * Deliberately broader than a 429: Google says "RESOURCE_EXHAUSTED" and also
 * "This model is currently experiencing high demand", Anthropic says 529
 * "overloaded", and all three mean the same thing to somebody reading the
 * dashboard - we asked for more than we could have right then.
 */
export function usageStatusFor(err: unknown): UsageStatus {
  const m = err instanceof Error ? err.message : String(err);
  return /quota|rate.?limit|429|resource.?exhausted|exhausted|overloaded|529|503|high demand|capacity|temporarily/i.test(
    m,
  )
    ? "rate_limited"
    : "error";
}
