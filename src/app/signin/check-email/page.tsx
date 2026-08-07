import Link from "next/link";
import { getUserId, getProfile, getUiPreference } from "@/server/user";
import { getLanguage } from "@/lib/languages";
import { uiFor } from "@/lib/ui";

/** Shown once a link has been sent. Auth.js routes here via `verifyRequest`. */
export default async function CheckEmail() {
  const userId = await getUserId();
  const profile = userId ? getProfile(userId) : null;
  const { strings: t } = profile
    ? uiFor(getLanguage(profile.language), profile.level, await getUiPreference())
    : uiFor(getLanguage(null), 0, "english");

  return (
    <div className="mx-auto max-w-md space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">{t.checkYourEmail}</h1>
      <p className="text-muted">{t.checkYourEmailNote}</p>
      {/* Deliberately says nothing about whether the address is registered:
          otherwise this page is a free tool for finding out who has an account. */}
      <p className="text-sm text-muted">{t.checkYourEmailSpam}</p>
      <Link
        href="/signin"
        className="inline-block text-sm text-muted underline-offset-4 hover:text-accent hover:underline"
      >
        {t.tryAnotherAddress}
      </Link>
    </div>
  );
}
