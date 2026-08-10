/**
 * A ceiling on the endpoints that spend money.
 *
 * Four routes call a paid API: /api/generate and /api/gloss reach a model,
 * /api/tts and /api/tts/word reach ElevenLabs, which bills by the character.
 * None of them had any ceiling at all, and all four sit behind
 * getOrCreateUserId - which MINTS A USER ROW when there is no cookie. So the
 * app would hand a fresh identity to every request that asked for one and then
 * spend against it: the per-reader framing was not a limit, because a reader
 * was free.
 *
 * Fixed windows in SQLite rather than a token bucket in memory. Three reasons:
 * the process restarts on every deploy and an in-memory counter forgets
 * everything at exactly the moment a deploy makes the site interesting; there
 * is one box and one process, so there is nothing to share state with; and the
 * database is already here, already durable, and already backed up. A sliding
 * window would be fairer at the boundary and is not worth a dependency.
 *
 * This is a COST ceiling, not a security control. It will not stop a botnet
 * with a thousand addresses. It stops the thing that actually happens to small
 * sites: one script, one address, running all night.
 */
import { getDb } from "./db";

export interface Verdict {
  ok: boolean;
  /** Seconds until the offending window rolls over. 0 when ok. */
  retryAfter: number;
}

export interface Rule {
  limit: number;
  windowSec: number;
}

export interface Plan {
  /** Names the buckets. Changing it resets everyone's counters. */
  name: string;
  /** Per address. The only anchor an attacker cannot mint more of. */
  perIp: Rule[];
  /** Per reader. Catches a signed-in reader looping on a real account. */
  perUser: Rule[];
}

const HOUR = 3600;
const DAY = 86_400;

/**
 * What a real reader does in an hour, with room to spare.
 *
 * Generation is the expensive one and also the slowest: a piece takes the best
 * part of a minute to produce and several minutes to read, so ten in an hour is
 * already far beyond anyone reading rather than testing. Lookups are the
 * opposite - tapping forty words in one piece is ordinary - so the ceiling is
 * high enough to be invisible and still finite.
 *
 * The per-IP numbers are roughly double the per-user ones rather than equal,
 * because a household behind one address is a real thing and a family sharing a
 * router should not lock each other out.
 */
export const PLANS = {
  generate: {
    name: "generate",
    perIp: [{ limit: 20, windowSec: HOUR }, { limit: 80, windowSec: DAY }],
    perUser: [{ limit: 10, windowSec: HOUR }, { limit: 40, windowSec: DAY }],
  },
  gloss: {
    name: "gloss",
    perIp: [{ limit: 400, windowSec: HOUR }],
    perUser: [{ limit: 150, windowSec: HOUR }],
  },
  tts: {
    name: "tts",
    perIp: [{ limit: 60, windowSec: HOUR }, { limit: 200, windowSec: DAY }],
    perUser: [{ limit: 20, windowSec: HOUR }, { limit: 80, windowSec: DAY }],
  },
  wordTts: {
    name: "word-tts",
    perIp: [{ limit: 300, windowSec: HOUR }],
    perUser: [{ limit: 120, windowSec: HOUR }],
  },
  /**
   * Not a paid route, and limited anyway: placement is what CREATES a reader,
   * so it is the door an attacker walks through to get a user id to spend
   * against. Nobody places ten times an hour.
   */
  placement: {
    name: "placement",
    perIp: [{ limit: 10, windowSec: HOUR }, { limit: 30, windowSec: DAY }],
    perUser: [],
  },
} as const satisfies Record<string, Plan>;

/**
 * The caller's address, as seen by Caddy.
 *
 * The LAST entry, not the first. X-Forwarded-For is a list a client can start
 * itself, and each proxy appends the peer it actually saw - so everything
 * before the final entry is attacker-controlled text, and the final entry is
 * the one Caddy wrote. Reading the first entry, which is the more common
 * mistake, would let anyone become a new address per request by sending a
 * header, which is the exact hole this file exists to close.
 *
 * Trustworthy here because the app binds 127.0.0.1 (see DEPLOY.md): Caddy is
 * the only thing that can reach it, so there is exactly one proxy in the chain.
 */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const hops = (forwarded ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // No header means nothing proxied us - local development. One shared bucket
  // is right there: it is one developer.
  return hops.at(-1) ?? "local";
}

/**
 * Charge this request to an address.
 *
 * Called BEFORE the reader is resolved, because resolving a reader creates
 * one. Two calls rather than one taking both anchors: the address has to be
 * charged before a user id exists, and a single function would then have to be
 * called twice, charging the address twice and quietly halving its own limit.
 */
export function spendIp(plan: Plan, ip: string, now = Date.now()): Verdict {
  return charge(plan.perIp, `${plan.name}:ip:${ip}`, now);
}

/** Charge this request to a reader. Catches a real account looping. */
export function spendUser(plan: Plan, userId: string, now = Date.now()): Verdict {
  return charge(plan.perUser, `${plan.name}:user:${userId}`, now);
}

/**
 * Count against every rule, then say whether to serve it.
 *
 * Counts FIRST and asks afterwards, deliberately. Checking before incrementing
 * leaves a window where two requests both read "under the limit" and both
 * proceed; the read that matters is the one the write returns.
 *
 * A refusal consumes a slot in the window that refused it - something over the
 * line should not get a free retry every second - but it STOPS THERE and does
 * not touch the longer windows behind it. Rules are charged shortest window
 * first for exactly that reason.
 *
 * That ordering is what keeps the day's allowance honest. Charging every window
 * on every call meant a reader who hit the hourly ceiling and pressed the
 * button a few more times had quietly eaten their day, and would find
 * themselves locked out an hour later having generated nothing. Only requests
 * arriving at an acceptable pace count against the daily cap, which is what the
 * daily cap is for: it exists to stop twenty-four hourly bursts, not to punish
 * retries.
 */
function charge(rules: readonly Rule[], key: string, now: number): Verdict {
  const shortestFirst = [...rules].sort((a, b) => a.windowSec - b.windowSec);
  for (const rule of shortestFirst) {
    const startSec = Math.floor(now / 1000 / rule.windowSec) * rule.windowSec;
    const used = bump(`${key}:${rule.windowSec}`, startSec);
    if (used > rule.limit) {
      return { ok: false, retryAfter: startSec + rule.windowSec - Math.floor(now / 1000) };
    }
  }
  return { ok: true, retryAfter: 0 };
}

/** Increment one window and return the new count, in a single statement. */
function bump(bucket: string, startSec: number): number {
  const row = getDb()
    .prepare(
      `INSERT INTO rate_limits (bucket, window_at, count) VALUES (?, ?, 1)
         ON CONFLICT(bucket, window_at) DO UPDATE SET count = count + 1
       RETURNING count`,
    )
    .get(bucket, startSec) as { count: number };

  // Amortised cleanup: only when a window is opened for the first time, which
  // is once per bucket per window rather than once per request. Without this
  // the table grows forever and nothing ever reads the old rows again.
  if (row.count === 1) prune(startSec);
  return row.count;
}

/** Two days back, so the longest window in PLANS is always intact. */
function prune(startSec: number): void {
  getDb()
    .prepare("DELETE FROM rate_limits WHERE window_at < ?")
    .run(startSec - 2 * DAY);
}

/** The 429 itself, with the header a well-behaved client will honour. */
export function tooMany(verdict: Verdict, message: string): Response {
  return Response.json(
    { error: message },
    { status: 429, headers: { "Retry-After": String(verdict.retryAfter) } },
  );
}
