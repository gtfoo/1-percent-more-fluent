/**
 * Geometry for the level chart. Pure: no React, no database, no clock.
 *
 * Separate from the component so the load-bearing part is testable offline,
 * the same reason rank-suggestions.ts is a pure function rather than logic
 * inside Compose.
 *
 * Two decisions are encoded here rather than in the markup, because both are
 * about honesty rather than looks:
 *
 *  - The x axis is the SESSION INDEX, not the clock. The level only changes
 *    when a piece is finished, so those are the only points where the line is
 *    defined. A time axis would stretch a fortnight away from the app into a
 *    third of the chart and squash a productive weekend into a smudge. The
 *    calendar owns time; this owns readings.
 *
 *  - The y window never fits tight to the data. A four-point calibration
 *    wobble auto-fitted to its own range fills the frame and reads as a
 *    collapse. MIN_WINDOW keeps a small move looking small.
 */
import { vocabSizeFor } from "./level";

/** One finished reading, or the placement that started it all. */
export interface LevelPoint {
  /** ISO timestamp. Used only for the end labels. */
  at: string;
  levelBefore: number;
  levelAfter: number;
  /** Why the level moved, in the reader's language. Null when unremarkable. */
  note: string | null;
  /**
   * The placement test rather than a reading. Drawn hollow: it is a guess from
   * a word list, where every other point is measured from something read.
   */
  origin?: boolean;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * `hold` - the level stayed put between two readings.
 * `adjusted` - it moved without a reading: the Too hard / Too easy buttons,
 *   which write no session row, so the WHEN is genuinely unknown.
 * `replaced` - the reader re-took the level check inside this gap.
 * `session` - the move a finished piece caused.
 */
export type SegmentKind = "hold" | "adjusted" | "replaced" | "session";

export interface Segment {
  from: Point;
  to: Point;
  kind: SegmentKind;
}

export interface Dot extends Point {
  level: number;
  note: string | null;
  origin: boolean;
}

export interface Tick {
  y: number;
  level: number;
  words: number;
}

export interface Plot {
  segments: Segment[];
  dots: Dot[];
  ticks: Tick[];
  /** Empty when there is nothing to draw, so the caller can skip the svg. */
  empty: boolean;
}

export interface Box {
  width: number;
  height: number;
  /** Room for the word labels on the left and the dates underneath. */
  padLeft: number;
  padRight: number;
  padTop: number;
  padBottom: number;
}

export const DEFAULT_BOX: Box = {
  width: 640,
  height: 200,
  padLeft: 96,
  padRight: 12,
  padTop: 12,
  padBottom: 26,
};

/** The smallest level range the y axis will show. */
export const MIN_WINDOW = 20;

/** Breathing room above and below the data, in level points. */
const MARGIN = 5;

export function plotLevels(points: LevelPoint[], box: Box = DEFAULT_BOX): Plot {
  if (points.length === 0) {
    return { segments: [], dots: [], ticks: [], empty: true };
  }

  const levels = points.flatMap((p) => [p.levelBefore, p.levelAfter]);
  let lo = Math.min(...levels) - MARGIN;
  let hi = Math.max(...levels) + MARGIN;

  // Widen symmetrically rather than from the bottom, so a flat series sits in
  // the middle instead of hugging an edge. Also the divide-by-zero guard: a
  // reader whose level never moved would otherwise have hi === lo.
  if (hi - lo < MIN_WINDOW) {
    const pad = (MIN_WINDOW - (hi - lo)) / 2;
    lo -= pad;
    hi += pad;
  }
  lo = Math.max(0, lo);
  hi = Math.min(100, hi);
  // Clamping both ends can re-narrow the window at the extremes of the scale.
  if (hi - lo < MIN_WINDOW) {
    if (lo === 0) hi = Math.min(100, MIN_WINDOW);
    else lo = Math.max(0, 100 - MIN_WINDOW);
  }

  const left = box.padLeft;
  const right = box.width - box.padRight;
  const top = box.padTop;
  const bottom = box.height - box.padBottom;

  // A single point sits in the middle rather than on the left edge, where it
  // would read as the start of a line that failed to draw.
  const xFor = (i: number) =>
    points.length === 1 ? (left + right) / 2 : left + (i * (right - left)) / (points.length - 1);
  // Inverted: a higher level is nearer the top.
  const yFor = (level: number) =>
    bottom - ((clamp(level, lo, hi) - lo) / (hi - lo)) * (bottom - top);

  const segments: Segment[] = [];
  const dots: Dot[] = [];

  points.forEach((p, i) => {
    const x = xFor(i);

    if (i > 0) {
      const prev = points[i - 1]!;
      const from = { x: xFor(i - 1), y: yFor(prev.levelAfter) };
      const to = { x, y: yFor(p.levelBefore) };
      // A level that is not where the last reading left it moved outside a
      // session. That is the only thing we know, and it is what gets drawn.
      const moved = Math.abs(p.levelBefore - prev.levelAfter) > 0.01;
      segments.push({ from, to, kind: moved ? gapKind(p) : "hold" });
    }

    // The reading itself: a vertical step. Not a diagonal, because the level
    // is constant between readings and a slope would claim otherwise.
    if (Math.abs(p.levelAfter - p.levelBefore) > 0.01) {
      segments.push({
        from: { x, y: yFor(p.levelBefore) },
        to: { x, y: yFor(p.levelAfter) },
        kind: "session",
      });
    }

    dots.push({
      x,
      y: yFor(p.levelAfter),
      level: p.levelAfter,
      note: p.note,
      origin: Boolean(p.origin),
    });
  });

  return { segments, dots, ticks: ticksFor(lo, hi, yFor), empty: false };
}

/**
 * Which kind of gap. The caller marks a point as `replaced` when the placement
 * timestamp falls inside the gap that precedes it; everything else is the
 * self-adjustment buttons.
 */
function gapKind(point: LevelPoint): SegmentKind {
  return point.origin ? "replaced" : "adjusted";
}

/**
 * Four ticks, labelled in words.
 *
 * Vocabulary is geometric in level - vocabSizeFor is 500 x 40^(level/100) - so
 * an evenly spaced LEVEL axis is a log-words axis, which is the right scale for
 * vocabulary growth and costs no extra arithmetic. The axis says "words"
 * because that is the promise in the app's name; the level number underneath
 * is the machinery.
 */
function ticksFor(lo: number, hi: number, yFor: (level: number) => number): Tick[] {
  const count = 4;
  return Array.from({ length: count }, (_, i) => {
    const level = lo + ((hi - lo) * i) / (count - 1);
    return { y: yFor(level), level, words: vocabSizeFor(level) };
  });
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** An SVG path for a run of segments of one kind. */
export function pathOf(segments: Segment[]): string {
  return segments
    .map((s) => `M ${round(s.from.x)} ${round(s.from.y)} L ${round(s.to.x)} ${round(s.to.y)}`)
    .join(" ");
}

const round = (n: number) => Math.round(n * 10) / 10;
