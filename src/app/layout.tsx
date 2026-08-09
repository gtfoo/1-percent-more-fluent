import type { Metadata, Viewport } from "next";
import Image from "next/image";
import { Geist, Source_Serif_4 } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { getUserId, getProfile, getUiPreference } from "@/server/user";
import { authConfigured, currentUser, passkeysConfigured, signOut } from "@/auth";
import { getLanguage } from "@/lib/languages";
import { uiFor } from "@/lib/ui";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// Spanish needs the accented Latin glyphs; Source Serif carries them and reads
// well at the long line lengths this app uses.
const reading = Source_Serif_4({
  variable: "--font-reading",
  subsets: ["latin", "latin-ext"],
});

/**
 * Colours the browser chrome around the page, and the status bar on an
 * installed home-screen app. Two entries because the app has a dark theme: one
 * value would leave a cream bar above a dark page.
 */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf8f5" },
    { media: "(prefers-color-scheme: dark)", color: "#14130f" },
  ],
};

export const metadata: Metadata = {
  title: "1 Percent More Fluent",
  description:
    "Short stories, articles and conversations generated in the language you are learning, at a level you can actually read.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Read-only: a layout cannot write cookies, so this treats "no cookie" as a
  // first-time visitor rather than creating a user for one page view.
  const userId = await getUserId();
  const profile = userId ? getProfile(userId) : null;
  const placed = profile !== null;
  const signInReady = authConfigured() && Boolean(process.env.AUTH_RESEND_KEY);
  const signedIn = signInReady && (await currentUser()) !== null;
  // The header follows the interface language too; a lone English link above
  // otherwise-translated chrome is the half-done look this is meant to avoid.
  const { strings: t } = profile
    ? uiFor(getLanguage(profile.language), profile.level, await getUiPreference())
    : uiFor(getLanguage(null), 0, "english");

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${reading.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="border-b border-border">
          <div className="mx-auto flex w-full max-w-3xl items-baseline justify-between px-5 py-4">
            {/* self-start rather than baseline-aligned: the row is
                items-baseline for the text links, and an image has no baseline
                to align to, so it would otherwise hang below them. */}
            <Link
              href="/"
              className="flex items-center gap-2 self-start text-lg font-semibold tracking-tight"
            >
              <Image
                src="/logo-96.png"
                alt=""
                width={28}
                height={28}
                priority
                className="rounded"
              />
              1 Percent More Fluent
            </Link>
            {/* Only once there is a level to re-test. A first-time visitor was
                being offered "Re-test my level" before ever taking one, which
                reads as an app that has confused them with somebody else.
                Kept for placed users because the reader page has no language
                switcher, so this is the only route back to setup from there. */}
            <div className="flex items-baseline gap-4">
              {placed && (
                <Link
                  href="/setup"
                  className="text-sm text-muted underline-offset-4 hover:text-accent hover:underline"
                >
                  {t.retakeLevel}
                </Link>
              )}
              {/* Account settings belong up here rather than in the middle of
                  the reading flow, which is where this started - a card between
                  the level and the word list, interrupting the one thing
                  somebody came to do. Only when signed in, because there is
                  nothing to manage otherwise. */}
              {signedIn && passkeysConfigured() && (
                <Link
                  href="/passkeys"
                  className="text-sm text-muted underline-offset-4 hover:text-accent hover:underline"
                >
                  {t.passkeyNav}
                </Link>
              )}
              {/* Only where there is something to offer. Auth is optional and
                  often unconfigured, and "Sign in" that leads to "signing in
                  isn't set up" is worse than no link at all. */}
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
                      className="text-sm text-muted underline-offset-4 hover:text-accent hover:underline"
                    >
                      {t.signOut}
                    </button>
                  </form>
                ) : (
                  <Link
                    href="/signin"
                    className="text-sm text-muted underline-offset-4 hover:text-accent hover:underline"
                  >
                    {t.signIn}
                  </Link>
                ))}
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-8">{children}</main>
      </body>
    </html>
  );
}
