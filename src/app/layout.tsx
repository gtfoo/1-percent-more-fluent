import type { Metadata } from "next";
import { Geist, Source_Serif_4 } from "next/font/google";
import Link from "next/link";
import "./globals.css";

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

export const metadata: Metadata = {
  title: "1 Percent More Fluent",
  description:
    "Short stories, articles and conversations generated in the language you are learning, at a level you can actually read.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${reading.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="border-b border-border">
          <div className="mx-auto flex w-full max-w-3xl items-baseline justify-between px-5 py-4">
            <Link href="/" className="text-lg font-semibold tracking-tight">
              1 Percent More Fluent
            </Link>
            <Link
              href="/setup"
              className="text-sm text-muted underline-offset-4 hover:text-accent hover:underline"
            >
              Re-test my level
            </Link>
          </div>
        </header>
        <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-8">{children}</main>
      </body>
    </html>
  );
}
