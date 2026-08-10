import { DAY_FINISHED, DAY_LOOKED, DAY_MADE, type ReadingDay } from "@/lib/streaks";

const CELL = 11;
const GAP = 3;
const STEP = CELL + GAP;
const LEFT = 4;
const TOP = 4;

/**
 * A year of reading days.
 *
 * Server-rendered SVG, no JavaScript: the tooltips are native `<title>`
 * elements. Columns are weeks, rows are days of the week, which is the shape
 * everyone already knows how to read.
 *
 * The shade says WHAT KIND of day it was, not merely that something happened -
 * asking for a piece is the faintest, finishing one is the strongest. A single
 * shade would flatten "I opened the app" and "I read a whole piece" into the
 * same square, which is the sort of flattering arithmetic that makes a habit
 * tracker useless.
 */
export function ReadingCalendar({
  days,
  title,
  dayTitle,
}: {
  /** Every day in the window, gaps included. */
  days: ReadingDay[];
  title: string;
  /** Pre-formatted per day: the interpolating strings are server-only. */
  dayTitle: (day: ReadingDay) => string;
}) {
  // The first column starts on whatever weekday the window opens, so the rows
  // stay aligned to real weekdays rather than to the arbitrary start date.
  const offset = weekdayOf(days[0]?.day ?? "1970-01-01");
  const weeks = Math.ceil((days.length + offset) / 7);
  const width = LEFT * 2 + weeks * STEP;
  const height = TOP * 2 + 7 * STEP;

  return (
    // Scrolls rather than shrinks. A year is 53 columns wide, and letting it
    // scale to a phone gives 5px squares - too small to read and far too small
    // to aim a tooltip at. Fixed pixel size inside an overflow container keeps
    // one square one square on every screen.
    //
    // dir="rtl" on the scroller, not on the drawing: it starts the scroll at
    // the right-hand edge, which is where this week is. Opening a habit view on
    // last August would be the wrong end of the year.
    <div className="-mx-1 overflow-x-auto px-1" dir="rtl">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="max-w-none"
        role="img"
        aria-label={title}
      >
        <title>{title}</title>
        {days.map((day, i) => {
          const slot = i + offset;
          return (
            <rect
              key={day.day}
              x={LEFT + Math.floor(slot / 7) * STEP}
              y={TOP + (slot % 7) * STEP}
              width={CELL}
              height={CELL}
              rx={2}
              fill={fillFor(day)}
              stroke={day.weight === 0 ? "var(--border)" : "none"}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            >
              <title>{dayTitle(day)}</title>
            </rect>
          );
        })}
      </svg>
    </div>
  );
}

function fillFor(day: ReadingDay): string {
  switch (day.weight) {
    case DAY_FINISHED:
      return "var(--accent)";
    case DAY_LOOKED:
      // No third colour variable exists, and inventing one for a calendar
      // would mean maintaining it in both themes forever. Opacity on the
      // accent gets a middle shade that follows the theme automatically.
      return "color-mix(in srgb, var(--accent) 55%, var(--surface))";
    case DAY_MADE:
      return "var(--accent-soft)";
    default:
      return "var(--surface)";
  }
}

/** 0 = Monday, so the grid reads Monday-first like a calendar. */
function weekdayOf(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return (new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay() + 6) % 7;
}
