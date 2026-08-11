import type { Metadata, Viewport } from "next";
import Image from "next/image";
import { Geist, Source_Serif_4 } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { getUserId, getProfile, getUiPreference } from "@/server/user";
import { getLanguage } from "@/lib/languages";
import { uiFor } from "@/lib/ui";
import { ReportTimeZone } from "@/components/ReportTimeZone";

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
  //
  // The profile is all this needs now. Working out whether sign-in is
  // configured, and whether anyone is signed in, cost a session lookup on every
  // page in the app to decide which of four header links to draw; /settings
  // asks those questions once, on the one page that acts on the answers.
  const userId = await getUserId();
  const profile = userId ? getProfile(userId) : null;
  // The header follows the interface language too; a lone English link above
  // otherwise-translated chrome is the half-done look this is meant to avoid.
  const { strings: t } = profile
    ? uiFor(getLanguage(profile.language), profile.level, await getUiPreference())
    : uiFor(getLanguage(null), 0, "english");

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${reading.variable} h-full antialiased`}
      // The stored theme is applied by the script below, which runs before this
      // element is painted. suppressHydrationWarning because that script sets
      // an attribute the server did not render - which is the entire point, and
      // which React would otherwise report as a mismatch.
      suppressHydrationWarning
    >
      <head>
        {/*
          Apply a stored theme BEFORE first paint. Without it the page renders
          in the system theme and then snaps to the chosen one, and the flash is
          worst for the reader who picked light on a dark-mode phone - exactly
          the person who cared enough to choose.

          Deliberately not an effect: those run after paint, which is too late.
          The key is the literal string from ThemeToggle; if one changes the
          other must. try/catch because localStorage throws outright in Safari
          private browsing rather than returning null.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('fluent:theme');" +
              "if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}",
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        {/* Renders nothing. Reports which midnight is this reader's, so the
            reading calendar counts their days rather than Greenwich's. */}
        <ReportTimeZone />
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
            {/* One link, not four. This bar used to carry re-test, passkeys and
                sign in or out alongside a long app name, and on a phone it ran
                out of room at exactly the wrong moment: a signed-in reader with
                a level has the most to manage and the least space for it.
                Everything that is not reading now lives behind /settings, which
                is also the only route back to setup from the reader page.

                Rendered whatever the reader's state, because the colour theme
                is behind it and that is worth reaching on a first visit. */}
            <Link
              href="/settings"
              className="shrink-0 text-sm text-muted underline-offset-4 hover:text-accent hover:underline"
            >
              {t.settings}
            </Link>
          </div>
        </header>
        <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-8">{children}</main>
      </body>
    </html>
  );
}
