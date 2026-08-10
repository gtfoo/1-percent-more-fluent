import Link from "next/link";
import { redirect } from "next/navigation";
import { getUserId, getProfile, getUiPreference } from "@/server/user";
import { breadth, levelSeries, progressSummary, readingDays } from "@/server/progress";
import { getLanguage } from "@/lib/languages";
import { uiFor } from "@/lib/ui";
import { fieldLabels } from "@/lib/field-labels";
import { FIELDS } from "@/lib/suggestions";
import { FORMATS, type Format } from "@/lib/formats";
import { levelForVocab } from "@/lib/level";
import { cookies } from "next/headers";
import { TZ_COOKIE } from "@/lib/cookies";
import { currentRun, dayShift, daysRead, fillDays, localDay, longestRun } from "@/lib/streaks";
import type { LevelPoint } from "@/lib/chart";
import { LevelChart } from "@/components/LevelChart";
import { BreadthGrid } from "@/components/BreadthGrid";
import { ReadingCalendar } from "@/components/ReadingCalendar";

/** How far back the calendar looks. */
const WINDOW_DAYS = 364;

/**
 * How far this reader has come, in the one unit the app's name promises.
 *
 * Everything here is read back out of data the app was already keeping - see
 * src/server/progress.ts. Nothing on this page is a client component, so the
 * interpolating formatters can carry the numbers, which is where they belong.
 */
export default async function ProgressPage() {
  const userId = await getUserId();
  const profile = userId ? getProfile(userId) : null;
  if (!profile) redirect("/");

  const language = getLanguage(profile.language);
  const { strings: t, format: f, inTarget, locale } = uiFor(
    language,
    profile.level,
    await getUiPreference(),
  );
  // Every number on this page is a word count in the thousands, so the
  // separator is doing real work: "2.269" and "2,269" are the same figure in
  // Spanish and English and a thousandfold apart if you read them the other
  // way round. See localeFor.
  const num = (n: number) => n.toLocaleString(locale);

  const summary = progressSummary(profile.userId, language.code);
  if (!summary) redirect("/");

  const readings = levelSeries(profile.userId, language.code);
  const grid = breadth(profile.userId, language.code);

  // Bucketed against the READER's midnight, not Greenwich's. At UTC+8 a UTC
  // day boundary put everything read between midnight and 8am local on the
  // previous day's square, which breaks a streak on days that were in fact
  // read. The cookie is written by the browser and sanitised by dayShift.
  const tz = (await cookies()).get(TZ_COOKIE)?.value;
  const shift = dayShift(tz);

  // The window is anchored to the newest thing that happened, not to the
  // clock. A reader coming back after a month away should see the month they
  // read, not a screen of empty squares with their history pushed off the
  // left-hand edge.
  //
  // The lower bound is widened by a day because it is compared against raw UTC
  // timestamps while the buckets are shifted: without the slack, the oldest
  // local day could be half-collected.
  const days = readingDays(profile.userId, language.code, since(WINDOW_DAYS + 1), shift);
  const lastDay = days.at(-1)?.day ?? todayWhere(tz);
  const calendar = fillDays(days, backFrom(lastDay, WINDOW_DAYS), lastDay);

  const labels = fieldLabels(language.code, inTarget);
  const formatLabel = (format: Format) =>
    format === "story" ? t.formatStory : format === "article" ? t.formatArticle : t.formatConversation;

  return (
    <div className="space-y-12">
      <section className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">{t.progressHeading}</h1>

        {summary.sessions === 0 ? (
          <div className="rounded-xl border border-border bg-surface px-5 py-8 text-center">
            <p className="font-medium">{t.noProgressYet}</p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted">{t.noProgressYetNote}</p>
            <p className="mt-4 text-sm text-muted">
              {t.whenYouStarted}: {num(summary.thenWords)}
            </p>
            <Link
              href="/"
              className="mt-5 inline-block rounded-lg bg-accent px-5 py-2.5 font-medium text-white hover:opacity-90"
            >
              {t.whatToRead}
            </Link>
          </div>
        ) : (
          <>
            <p className="text-sm uppercase tracking-wide text-muted">{t.wordsYouCanRead}</p>
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
              <span className="text-4xl font-semibold tabular-nums">
                {num(summary.nowWords)}
              </span>
              <span className="text-muted">
                {t.whenYouStarted}: {num(summary.thenWords)}
              </span>
            </div>
            {/* Two sentences, not one with a minus sign. A reader whose level
                has come down is told so plainly - that was the whole point of
                showing the level honestly rather than only letting it rise. */}
            <p className="text-muted">
              {summary.deltaWords >= 0
                ? f.grownBy(num(summary.deltaWords), summary.percent)
                : f.shrunkBy(num(Math.abs(summary.deltaWords)), Math.abs(summary.percent))}{" "}
              {f.acrossPieces(summary.sessions)}
            </p>
          </>
        )}
      </section>

      {readings.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">{t.levelHeading}</h2>
          <LevelChart
            points={pointsFor(summary, readings, f, t)}
            t={t}
            summary={`${t.levelHeading} — ${t.wordsYouCanRead}`}
            firstDay={readings[0]!.at.slice(0, 10)}
            lastDay={readings.at(-1)!.at.slice(0, 10)}
            locale={locale}
          />
          <p className="text-sm text-muted">{t.levelNote}</p>
        </section>
      )}

      <section className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-xl font-semibold tracking-tight">{t.breadthHeading}</h2>
          <p className="text-sm text-muted">{f.coveredCells(grid.filled, grid.total)}</p>
        </div>
        <BreadthGrid
          cells={grid.cells}
          fields={FIELDS}
          formats={FORMATS}
          fieldLabel={(field) => labels[field]}
          formatLabel={formatLabel}
          cellTitle={(cell) =>
            cell.state === "filled"
              ? `${labels[cell.field]} · ${formatLabel(cell.format)} — ${cell.count}`
              : cell.state === "started"
                ? `${labels[cell.field]} · ${formatLabel(cell.format)} — ${t.breadthStarted}`
                : `${labels[cell.field]} · ${formatLabel(cell.format)}`
          }
          t={t}
        />
        <p className="text-sm text-muted">{t.breadthNote}</p>
        {/* Two different facts, kept in two sentences. "other" means the model
            looked and none of the subjects fitted; unlabelled means nobody
            looked, because the piece predates the label. */}
        {grid.otherCount > 0 && (
          <p className="text-sm text-muted">{f.otherPieces(grid.otherCount)}</p>
        )}
        {grid.unlabelledCount > 0 && (
          <p className="text-sm text-muted">{f.unlabelledPieces(grid.unlabelledCount)}</p>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">{t.habitHeading}</h2>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-muted">
          <span>{f.daysReadOf(daysRead(calendar), calendar.length)}</span>
          <span>{f.longestRunDays(Math.max(longestRun(calendar), currentRun(calendar, lastDay)))}</span>
        </div>
        <ReadingCalendar
          days={calendar}
          title={t.habitHeading}
          // A day with nothing on it gets its date and no sentence. "19 July -
          // 0 things" is a tooltip that reports an absence back at you; the
          // date alone is the one useful thing an empty square can say.
          dayTitle={(day) => (day.events > 0 ? f.readOnDay(day.day, day.events) : day.day)}
          locale={locale}
          t={t}
        />
        <p className="text-sm text-muted">{t.habitNote}</p>
      </section>
    </div>
  );
}

/**
 * The chart's points: the placement first, then every finished reading.
 *
 * The placement is real measured data - it is where the level check put them -
 * and including it means the chart has two points from the very first reading
 * rather than a lone dot. It is drawn hollow because it was a guess from a word
 * list, where every later point was measured from something actually read.
 */
function pointsFor(
  summary: NonNullable<ReturnType<typeof progressSummary>>,
  readings: ReturnType<typeof levelSeries>,
  f: { lookedUpShare(percent: number): string },
  t: { tooHard: string },
): LevelPoint[] {
  const origin: LevelPoint[] = summary.fromPlacement
    ? [
        {
          at: "",
          levelBefore: levelForVocab(summary.thenWords),
          levelAfter: levelForVocab(summary.thenWords),
          note: null,
          origin: true,
        },
      ]
    : [];

  return [
    ...origin,
    ...readings.map((r) => ({
      at: r.at,
      levelBefore: r.levelBefore,
      levelAfter: r.levelAfter,
      // The reason the level moved, taken from the same row that moved it. A
      // falling line with a stated cause is a measurement; a bare falling line
      // is a scoreboard.
      note:
        r.rating === "too-hard"
          ? t.tooHard
          : r.lookupRate > 0.1
            ? f.lookedUpShare(Math.round(r.lookupRate * 100))
            : null,
    })),
  ];
}

// The clock lives out here, not in the component. This page renders on the
// server on every request, so reading it is legitimate - but the compiler's
// purity rule cannot tell that from inside a component body, and wrapping it is
// both cheaper and more honest than an exception comment.
const DAY_MS = 86_400_000;
const since = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString();
const todayWhere = (tz: string | undefined) => localDay(Date.now(), tz);

function backFrom(day: string, days: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!) - days * DAY_MS).toISOString().slice(0, 10);
}
