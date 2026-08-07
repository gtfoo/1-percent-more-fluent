import Link from "next/link";
import { getUserId, getProfile, getProfiles, getUiPreference } from "@/server/user";
import { listPieces } from "@/server/generate";
import { countVocabulary } from "@/server/vocabulary";
import { currentUser, passkeysConfigured } from "@/auth";
import { countPasskeys } from "@/server/auth-adapter";
import { Passkey } from "@/components/Passkey";
import { isTtsConfigured, charactersSpentTotal } from "@/server/tts";
import { labelFor, paramsFor } from "@/lib/level";
import { getLanguage, LANGUAGES } from "@/lib/languages";
import { uiFor } from "@/lib/ui";
import { Compose } from "@/components/Compose";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export default async function Home() {
  const userId = await getUserId();
  const profile = userId ? getProfile(userId) : null;

  if (!profile) {
    // Read from the registry rather than written into the copy. This page said
    // "Read Spanish" and "it writes one, in Spanish" for as long as Chinese has
    // been supported - the first thing a new visitor saw was the app describing
    // itself as something it had outgrown, and adding a third language would
    // have left it wrong again.
    const names = Object.values(LANGUAGES).map((l) => l.name);
    const offered =
      names.length > 1
        ? `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`
        : names[0];

    return (
      <div className="max-w-xl space-y-5">
        <h1 className="text-3xl font-semibold tracking-tight">
          Read {offered} at the level you’re actually at
        </h1>
        <p className="text-muted">
          Tell it what you feel like reading — a folk tale, how noise-cancelling
          headphones work, chasing a client for an overdue invoice — and it
          writes one, pitched so you understand most of it but not all of it.
        </p>
        <p className="text-muted">
          First, a 90-second vocabulary check. No grammar questions, and you
          don’t need to know your CEFR or HSK level.
        </p>
        <Link
          href="/setup"
          className="inline-block rounded-lg bg-accent px-5 py-2.5 font-medium text-white hover:opacity-90"
        >
          Find my level
        </Link>
      </div>
    );
  }

  const language = getLanguage(profile.language);
  const params = paramsFor(profile.level, language);
  // Above a level the chrome switches too; see src/lib/ui.ts.
  const { strings: t, format: f, inTarget } = uiFor(language, profile.level, await getUiPreference());
  const recent = listPieces(profile.userId, language.code);
  // Only linked once there is something behind the link. An empty list offered
  // from the home page is a promise the app has not kept yet.
  const words = countVocabulary(profile.userId, language.code);

  // Offered once, to someone signed in who has no passkey on file yet. Someone
  // who already has one does not need to be told about them every visit.
  const signedIn = passkeysConfigured() ? await currentUser() : null;
  const offerPasskey = signedIn !== null && countPasskeys(signedIn.id) === 0;
  // Operator information, shown to the operator only. ADMIN_USER_ID is the
  // `fluent_uid` cookie of whoever runs the site; unset means nobody sees it.
  const isAdmin =
    Boolean(process.env.ADMIN_USER_ID) &&
    process.env.ADMIN_USER_ID === profile.userId;
  const spent = isAdmin ? charactersSpentTotal() : 0;

  // Every language this learner has placed in, for the switcher. Each keeps its
  // own level, so the label shown next to each is that language's, not this one's.
  const placed = getProfiles(profile.userId).map((p) => {
    const l = getLanguage(p.language);
    return { code: p.language, name: l.name, label: labelFor(p.level, l) };
  });

  // ...and the ones they could start. Without these the switcher is useless to
  // anyone with a single language, which is everybody at first: there is nothing
  // to switch BETWEEN until a second one exists.
  const available = Object.values(LANGUAGES)
    .filter((l) => !placed.some((p) => p.code === l.code))
    .map((l) => ({ code: l.code, name: l.name }));

  return (
    <div className="space-y-10">
      <section className="rounded-xl border border-border bg-surface px-5 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <LanguageSwitcher
              current={{ code: language.code, name: language.name, label: params.label }}
              placed={placed}
              available={available}
              uiInTarget={inTarget}
            />
            <p className="text-2xl font-semibold">
              {params.label}{" "}
              <span className="text-base font-normal text-muted">
                {f.aboutWords(params.vocabBand.toLocaleString())}
              </span>
            </p>
          </div>
          <p className="text-sm text-muted">
            {f.aimingFor(params.sentenceWords, Math.round(params.newWordBudget * 100))}
          </p>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold tracking-tight">
          {t.whatToRead}
        </h2>
        <Compose ttsReady={isTtsConfigured()} t={t} />
      </section>

      {/* Only for someone already signed in, and only if they have not already
          done it here. Registration is gated server-side too - a passkey can
          never create an account on its own; see getUserInfo in src/auth.ts. */}
      {offerPasskey && (
        <section>
          <Passkey mode="register" t={t} />
        </section>
      )}

      {words > 0 && (
        <section>
          <Link
            href="/words"
            className="flex items-baseline justify-between gap-4 rounded-xl border border-border bg-surface px-5 py-4 hover:bg-accent-soft"
          >
            <span className="font-medium">{t.yourWords}</span>
            <span className="shrink-0 text-sm text-muted">{words}</span>
          </Link>
        </section>
      )}

      {recent.length > 0 && (
        <section>
          <h2 className="mb-4 text-xl font-semibold tracking-tight">
            {t.everythingRead}
          </h2>
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {recent.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/read/${p.id}`}
                  className="flex items-baseline justify-between gap-4 px-5 py-3 hover:bg-accent-soft"
                >
                  <span className="font-medium">{p.title}</span>
                  <span className="shrink-0 text-sm text-muted">
                    {p.format} · {labelFor(p.level, language)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {isAdmin && spent > 0 && (
        <p className="text-sm text-muted">
          <span className="mr-2 rounded border border-border px-1.5 py-0.5 text-xs uppercase tracking-wide">
            admin
          </span>
          Speech synthesised across all readers: {spent.toLocaleString()}{" "}
          characters · roughly ${((spent / 1000) * 0.1).toFixed(2)} at
          ElevenLabs’ multilingual rate. Replays are free.
        </p>
      )}
    </div>
  );
}
