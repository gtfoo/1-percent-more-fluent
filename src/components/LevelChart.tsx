import { plotLevels, pathOf, DEFAULT_BOX, type LevelPoint, type SegmentKind } from "@/lib/chart";
import type { UiStrings } from "@/lib/ui-strings";

/**
 * The level, reading by reading.
 *
 * A server component with no JavaScript at all: the geometry is computed in
 * src/lib/chart.ts and everything interactive is native SVG - a `<title>` is
 * a tooltip in every browser without a line of script.
 *
 * This is the app's first inline SVG, so it sets the conventions: a viewBox
 * with `w-full h-auto` rather than fixed pixels, colours as the raw CSS
 * variables from globals.css so light and dark flip with no JS, and
 * `vectorEffect="non-scaling-stroke"` so a line stays one pixel however wide
 * the phone is.
 */
export function LevelChart({
  points,
  t,
  summary,
  firstDay,
  lastDay,
}: {
  points: LevelPoint[];
  t: UiStrings;
  /** One line, already formatted, describing the axis. */
  summary: string;
  /** The ends of the series, already reduced to a day. */
  firstDay?: string;
  lastDay?: string;
}) {
  const box = DEFAULT_BOX;
  const plot = plotLevels(points, box);
  if (plot.empty) return null;

  const byKind = (kind: SegmentKind) => plot.segments.filter((s) => s.kind === kind);
  const left = box.padLeft;
  const right = box.width - box.padRight;
  const baseline = box.height - box.padBottom + 14;

  return (
    <div className="space-y-3">
      <svg
        viewBox={`0 0 ${box.width} ${box.height}`}
        // Capped, not stretched: see DEFAULT_BOX. Ten points do not need the
        // full width of a desktop, and letting them have it would blow the
        // labels up as surely as a phone shrinks them.
        className="h-auto w-full max-w-md"
        role="img"
        aria-label={summary}
      >
        <title>{summary}</title>

        {/* Gridlines and the words each one is worth. The axis is labelled in
            words rather than levels because that is the promise in the app's
            name; the level number is the machinery underneath. */}
        {plot.ticks.map((tick) => (
          <g key={tick.level}>
            <line
              x1={left}
              y1={tick.y}
              x2={right}
              y2={tick.y}
              stroke="var(--border)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={left - 8}
              y={tick.y + 4}
              textAnchor="end"
              fontSize={11}
              fill="var(--muted)"
            >
              {tick.words.toLocaleString()}
            </text>
          </g>
        ))}

        {/* The dates at the ends only. The x axis is the session index, so
            anything in between would be a date at a position that does not
            mean a date - the calendar below owns time. */}
        {firstDay && (
          <text x={left} y={baseline} fontSize={10} fill="var(--muted)">
            {firstDay}
          </text>
        )}
        {lastDay && lastDay !== firstDay && (
          <text x={right} y={baseline} textAnchor="end" fontSize={10} fill="var(--muted)">
            {lastDay}
          </text>
        )}

        {/* Where the level moved WITHOUT a reading - the too hard / too easy
            buttons write no session row, so the moment is genuinely unknown.
            Dotted, because a solid line would claim to know when. */}
        {(["adjusted", "replaced"] as const).map((kind) => (
          <path
            key={kind}
            d={pathOf(byKind(kind))}
            fill="none"
            stroke="var(--muted)"
            strokeWidth={1.5}
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {/* The readings themselves. One colour for both directions: --warn
            means "something went wrong" everywhere else in this app, and a
            level coming down is the app working, not failing. */}
        <path
          d={pathOf([...byKind("hold"), ...byKind("session")])}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={2}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />

        {plot.dots.map((dot, i) => (
          <circle
            key={i}
            cx={dot.x}
            cy={dot.y}
            r={dot.origin ? 4 : 3}
            fill={dot.origin ? "var(--surface)" : "var(--accent)"}
            stroke="var(--accent)"
            strokeWidth={dot.origin ? 2 : 0}
            vectorEffect="non-scaling-stroke"
          >
            {dot.note && <title>{dot.note}</title>}
          </circle>
        ))}
      </svg>

      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
        <Key kind="solid" label={t.legendSession} />
        <Key kind="dotted" label={t.legendAdjusted} />
        <Key kind="hollow" label={t.levelFromCheck} />
      </ul>
    </div>
  );
}

function Key({ kind, label }: { kind: "solid" | "dotted" | "hollow"; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <svg width={22} height={10} aria-hidden="true">
        {kind === "hollow" ? (
          <circle cx={11} cy={5} r={4} fill="var(--surface)" stroke="var(--accent)" strokeWidth={2} />
        ) : (
          <line
            x1={1}
            y1={5}
            x2={21}
            y2={5}
            stroke={kind === "solid" ? "var(--accent)" : "var(--muted)"}
            strokeWidth={2}
            strokeDasharray={kind === "dotted" ? "3 3" : undefined}
          />
        )}
      </svg>
      {label}
    </li>
  );
}
