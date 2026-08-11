import Link from "next/link";
import { getUserId, getProfile, getUiPreference } from "@/server/user";
import { authConfigured, currentUser, passkeysConfigured, signOut } from "@/auth";
import { getLanguage } from "@/lib/languages";
import { uiFor } from "@/lib/ui";
import { ThemeToggle } from "@/components/ThemeToggle";

/**
 * Everything that is not reading.
 *
 * The header used to carry these one by one - re-test, passkeys, sign in or out
 * - and ran out of room on a phone at exactly the wrong moment: a signed-in
 * reader with a level has the most to manage and the least space to do it in.
 * One link out of the reading flow, and the flow keeps the rest of the bar.
 *
 * A page rather than a dropdown. Everything on it is either a link or a form,
 * so a page needs no JavaScript to open, cannot be closed by a stray tap, and
 * is reachable from the reader - which has no other route back to setup.
 */
export default async function SettingsPage() {
  const userId = await getUserId();
  const profile = userId ? getProfile(userId) : null;
  const signInReady = authConfigured() && Boolean(process.env.AUTH_RESEND_KEY);
  const signedIn = signInReady && (await currentUser()) !== null;

  const { strings: t } = profile
    ? uiFor(getLanguage(profile.language), profile.level, await getUiPreference())
    : uiFor(getLanguage(null), 0, "english");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.settings}</h1>
        <p className="mt-2 text-muted">{t.settingsNote}</p>
      </div>

      {/* First, because it is the only thing here that changes what the page
          looks like while you are looking at it. */}
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-surface px-5 py-4">
        <span className="font-medium">{t.themeLabel}</span>
        {/* `t` is a plain-strings object, which is what makes it safe to hand
            to a client component - see UiStrings. */}
        <ThemeToggle t={t} />
      </section>

      {/* Only once there is a level to re-test. A first-time visitor was being
          offered "Re-test my level" before ever taking one, which reads as an
          app that has confused them with somebody else. */}
      {profile && (
        <Row href="/setup" label={t.retakeLevel} />
      )}

      {signedIn && passkeysConfigured() && (
        <Row href="/passkeys" label={t.passkeyNav} />
      )}

      {/* Only where there is something to offer. Auth is optional and often
          unconfigured, and a "Sign in" that leads to "signing in isn't set up"
          is worse than no link at all. */}
      {signInReady &&
        (signedIn ? (
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button
              type="submit"
              className="flex w-full items-center justify-between gap-4 rounded-xl border border-border bg-surface px-5 py-4 text-left font-medium hover:bg-accent-soft"
            >
              {t.signOut}
              <span aria-hidden="true" className="text-muted">
                ›
              </span>
            </button>
          </form>
        ) : (
          <Row href="/signin" label={t.signIn} note={t.signInWhy} />
        ))}
    </div>
  );
}

function Row({ href, label, note }: { href: string; label: string; note?: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface px-5 py-4 hover:bg-accent-soft"
    >
      <span>
        <span className="font-medium">{label}</span>
        {note && <span className="mt-1 block text-sm text-muted">{note}</span>}
      </span>
      <span aria-hidden="true" className="shrink-0 text-muted">
        ›
      </span>
    </Link>
  );
}
