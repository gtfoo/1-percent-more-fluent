import { redirect } from "next/navigation";
import { currentUser, passkeysConfigured } from "@/auth";
import { listPasskeys } from "@/server/passkeys";
import { Passkeys } from "@/components/Passkeys";
import { getUserId, getProfile, getUiPreference } from "@/server/user";
import { getLanguage } from "@/lib/languages";
import { uiFor } from "@/lib/ui";

/**
 * Managing the passkeys on this account.
 *
 * Its own page rather than a card on the home page. It was in the middle of the
 * reading flow, between the level and the word list, where it interrupted the
 * one thing someone came here to do - and account settings are not something
 * anybody needs in front of them every visit. The header carries the link.
 */
export default async function PasskeysPage() {
  // Off unless there is something to manage. Reachable by URL, so the guard
  // lives here and not only in whether the header renders a link.
  if (!passkeysConfigured()) redirect("/");
  const signedIn = await currentUser();
  if (!signedIn) redirect("/signin");

  const userId = await getUserId();
  const profile = userId ? getProfile(userId) : null;
  const { strings: t, format: f } = profile
    ? uiFor(getLanguage(profile.language), profile.level, await getUiPreference())
    : uiFor(getLanguage(null), 0, "english");

  const passkeys = listPasskeys(signedIn.id);

  return (
    <div className="mx-auto max-w-xl">
      <Passkeys
        t={t}
        canAdd
        rows={passkeys.map((p) => ({
          credentialId: p.credentialId,
          addedOn: p.addedOn,
          // Formatted here: the interpolating strings are functions, and a
          // function cannot cross to a client component.
          label: f.passkeyOn(p.addedOn, p.backedUp),
        }))}
      />
    </div>
  );
}
