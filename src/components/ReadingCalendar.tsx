import { DAY_FINISHED, DAY_LOOKED, DAY_MADE, type ReadingDay } from "@/lib/streaks";
import type { UiStrings } from "@/lib/ui-strings";

const CELL = 11;
const GAP = 3;
const STEP = CELL + GAP;
const LEFT = 4;
/** Room above the squares for the month names. */
const MONTHS = 14;
const TOP = MONTHS + 2;

/**
 * A year of reading days.
 *
 * Server-rendered SVG, no JavaScript. Columns are weeks, rows are days of the
 * week, which is the shape everyone already knows how to read.
 *
 * The shade says WHAT KIND of day it was, not merely that something happened -
 * asking for a piece is the faintest, finishing one is the strongest. A single
 * shade would flatten "I opened the app" and "I read a whole piece" into the
 * same square, which is the sort of flattering arithmetic that makes a habit
 * tracker useless.
 *
 * The month names and the key below are not decoration. Both facts they carry -
 * where in the year a square sits, and what its shade means - used to live only
 * in `<title>` tooltips, and a touchscreen has no hover: on a phone the whole
 * drawing was an undecodable field of colour.
 */
export function ReadingCalendar({
  days,
  title,
  dayTitle,
  locale,
  t,
}: {
  /** Every day in the window, gaps included. */
  days: ReadingDay[];
  title: string;
  /** Pre-formatted per day: the interpolating strings are server-only. */
  dayTitle: (day: ReadingDay) => string;
  /** For the month names. */
  locale: string;
  t: UiStrings;
}) {
  // The first column starts on whatever weekday the window opens, so the rows
  // stay aligned to real weekdays rather than to the arbitrary start date.
  const offset = weekdayOf(days[0]?.day ?? "1970-01-01");
  const weeks = Math.ceil((days.length + offset) / 7);
  const width = LEFT * 2 + weeks * STEP;
  const height = TOP + 7 * STEP + 4;

  const month = new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" });

  return (
    <div className="space-y-3">
      {/* Scrolls rather than shrinks. A year is 53 columns wide, and letting it
          scale to a phone gives 5px squares - too small to read and far too
          small to aim at. Fixed pixel size inside an overflow container keeps
          one square one square on every screen.

          dir="rtl" on the scroller, not on the drawing: it starts the scroll at
          the right-hand edge, which is where this week is. Opening a habit view
          on last August would be the wrong end of the year. */}
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

          {monthStarts(days, offset).map((m) => (
            <text
              key={m.day}
              x={LEFT + m.column * STEP}
              y={MONTHS - 4}
              fontSize={10}
              fill="var(--muted)"
            >
              {month.format(new Date(`${m.day}T00:00:00Z`))}
            </text>
          ))}

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

      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
        <Swatch fill="var(--accent-soft)" label={t.legendMade} />
        <Swatch fill={LOOKED_FILL} label={t.legendLooked} />
        <Swatch fill="var(--accent)" label={t.legendFinished} />
      </ul>
    </div>
  );
}

function Swatch({ fill, label }: { fill: string; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className="inline-block h-3 w-3 shrink-0 rounded-[2px]"
        style={{ backgroundColor: fill }}
      />
      {label}
    </li>
  );
}

// No third colour variable exists, and inventing one for a calendar would mean
// maintaining it in both themes forever. Mixing the accent into the surface
// gets a middle shade that follows the theme automatically.
const LOOKED_FILL = "color-mix(in srgb, var(--accent) 55%, var(--surface))";

function fillFor(day: ReadingDay): string {
  switch (day.weight) {
    case DAY_FINISHED:
      return "var(--accent)";
    case DAY_LOOKED:
      return LOOKED_FILL;
    case DAY_MADE:
      return "var(--accent-soft)";
    default:
      return "var(--surface)";
  }
}

/**
 * The column each month begins in.
 *
 * Labelled at the first day of the month rather than at even intervals, so the
 * name sits over the week it actually names. The first month is skipped when
 * the window opens partway through it - a label over three visible days of
 * March points at something that is mostly not there.
 */
function monthStarts(days: ReadingDay[], offset: number): { day: string; column: number }[] {
  const starts: { day: string; column: number }[] = [];
  days.forEach((d, i) => {
    if (!d.day.endsWith("-01")) return;
    starts.push({ day: d.day, column: Math.floor((i + offset) / 7) });
  });
  return starts;
}

/** 0 = Monday, so the grid reads Monday-first like a calendar. */
function weekdayOf(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return (new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay() + 6) % 7;
}
