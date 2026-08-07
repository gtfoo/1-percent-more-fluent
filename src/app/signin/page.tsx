import { redirect } from "next/navigation";
import { authConfigured, currentUser, signIn } from "@/auth";
import { getUserId, getProfile, getUiPreference } from "@/server/user";
import { getLanguage } from "@/lib/languages";
import { uiFor } from "@/lib/ui";

/**
 * Sign in, which nothing in this app requires.
 *
 * The only reason to have an account is to read on your phone and your laptop
 * and have it be the same reading. That is stated plainly on the page, because
 * a sign-in screen with no explanation reads as a wall.
 */
export default async function SignInPage() {
  if (await currentUser()) redirect("/");

  // Follows the interface language like everything else. A signed-out reader
  // usually still has a cookie and therefore a level; a genuinely new visitor
  // has neither, and gets English - the same fallback the layout uses.
  const userId = await getUserId();
  const profile = userId ? getProfile(userId) : null;
  const { strings: t } = profile
    ? uiFor(getLanguage(profile.language), profile.level, await getUiPreference())
    : uiFor(getLanguage(null), 0, "english");

  // A provider needs AUTH_SECRET too, so one configured without the other is
  // not usable and must not be offered.
  const ready = authConfigured() && Boolean(process.env.AUTH_RESEND_KEY);

  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t.signIn}</h1>
      <p className="text-muted">{t.signInWhy}</p>

      {!ready ? (
        <p className="rounded-xl border border-border bg-surface px-5 py-4 text-sm text-muted">
          {t.noSignInHere}
        </p>
      ) : (
        <form
          action={async (formData: FormData) => {
            "use server";
            await signIn("resend", {
              email: String(formData.get("email") ?? ""),
              redirectTo: "/",
            });
          }}
          className="space-y-3"
        >
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            placeholder={t.emailAddress}
            className="w-full rounded-lg border border-border bg-surface px-4 py-3 outline-none focus:border-accent"
          />
          <button
            type="submit"
            className="w-full rounded-lg bg-accent px-5 py-3 font-medium text-white hover:opacity-90"
          >
            {t.emailMeALink}
          </button>
          <p className="text-sm text-muted">{t.linkExpires}</p>
        </form>
      )}
    </div>
  );
}
