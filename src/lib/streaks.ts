/**
 * Reading days, and the runs they form.
 *
 * Pure and clock-free: `asOf` is always passed in. A streak that reads the
 * clock cannot be tested without freezing time, and this app renders on the
 * server on every request, so two page loads a second apart must agree.
 *
 * The unit is a DAY, never an event. Ten lookups on one afternoon is one day,
 * not ten - counting events would let a single sitting manufacture a streak.
 */

/**
 * How much a day contains, strongest signal wins.
 *
 * Ordered so a bigger number is a stronger day, which is what the calendar's
 * shading reads. `made` is weakest deliberately: asking for a piece is showing
 * up, but it is not yet reading.
 */
export const DAY_NONE = 0;
export const DAY_MADE = 1;
export const DAY_LOOKED = 2;
export const DAY_FINISHED = 3;

export type DayWeight =
  | typeof DAY_NONE
  | typeof DAY_MADE
  | typeof DAY_LOOKED
  | typeof DAY_FINISHED;

export interface ReadingDay {
  /** YYYY-MM-DD, as SQLite's date() returns it. */
  day: string;
  weight: DayWeight;
  /** Everything that happened, for the tooltip. */
  events: number;
}

/** Days with anything on them. */
export function daysRead(days: ReadingDay[]): number {
  return days.filter((d) => d.weight > DAY_NONE).length;
}

/** The longest unbroken run of days anywhere in the window. */
export function longestRun(days: ReadingDay[]): number {
  const set = new Set(days.filter((d) => d.weight > DAY_NONE).map((d) => d.day));
  let best = 0;
  for (const day of set) {
    // Only count from the START of a run, so an n-day run is walked once
    // rather than n times.
    if (set.has(dayBefore(day))) continue;
    let run = 1;
    let cursor = day;
    while (set.has(dayAfter(cursor))) {
      cursor = dayAfter(cursor);
      run++;
    }
    if (run > best) best = run;
  }
  return best;
}

/**
 * The run ending now.
 *
 * Counts back from `asOf`, and from the day BEFORE it if `asOf` itself is
 * empty. That is the humane reading: at nine in the morning you have not
 * broken yesterday's streak, you simply have not read yet today. Treating a
 * fresh morning as a broken run is the exact mechanic that makes streaks feel
 * like a debt.
 */
export function currentRun(days: ReadingDay[], asOf: string): number {
  const set = new Set(days.filter((d) => d.weight > DAY_NONE).map((d) => d.day));
  let cursor = set.has(asOf) ? asOf : dayBefore(asOf);
  let run = 0;
  while (set.has(cursor)) {
    run++;
    cursor = dayBefore(cursor);
  }
  return run;
}

/**
 * Every day in the window, empty ones included.
 *
 * The calendar needs the gaps - an empty square is the point of it - and the
 * caller only ever gets days that had something on them.
 */
export function fillDays(
  present: ReadingDay[],
  fromDay: string,
  toDay: string,
): ReadingDay[] {
  const byDay = new Map(present.map((d) => [d.day, d]));
  const out: ReadingDay[] = [];
  let cursor = fromDay;
  // Guarded rather than while(true): a malformed date would otherwise spin
  // forever on a server rendering a page.
  for (let i = 0; i < 400 && cursor <= toDay; i++) {
    out.push(byDay.get(cursor) ?? { day: cursor, weight: DAY_NONE, events: 0 });
    cursor = dayAfter(cursor);
  }
  return out;
}

/**
 * Date arithmetic on the YYYY-MM-DD string.
 *
 * Deliberately via Date.UTC rather than string surgery, so month ends and leap
 * years are the platform's problem. UTC throughout, matching the SQLite
 * `date()` bucketing these strings came from - mixing the two would move days
 * by one for anyone east or west of Greenwich.
 */
function shift(day: string, by: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const t = Date.UTC(y!, m! - 1, d!) + by * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

export const dayBefore = (day: string) => shift(day, -1);
export const dayAfter = (day: string) => shift(day, 1);
