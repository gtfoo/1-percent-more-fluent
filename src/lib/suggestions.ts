/**
 * Starting points, for the blank page.
 *
 * These exist because of a specific failure. The generator is only as good as
 * the topic it is handed, and there is a large quality gap between "stablecoins"
 * and "explaining stablecoins to a client who has never used one". The first
 * produces a competent encyclopedia entry; the second produces language you
 * could actually use on a person. Nothing in the UI taught that difference, so
 * every suggestion below models it: a subject, plus what you are DOING about it
 * and who with.
 *
 * That pattern is also why the app does not need a menu of "scenarios". The
 * topic box already accepts the whole thing, and these teach the shape by
 * example rather than by enumerating a taxonomy of human interaction - the same
 * reasoning that keeps domain vocabulary in the model rather than in a list
 * here. See src/lib/terms.ts.
 *
 * Deliberately spread across unrelated fields. Each one exercises the protected
 * topic terms on vocabulary the others do not share, so the set doubles as a
 * breadth check: if terminology for one of these is visibly weaker than the
 * rest, that is worth knowing.
 */
import type { Format } from "./formats";

export interface Suggestion {
  /** Short enough for a chip. */
  label: string;
  /** What actually goes in the topic box. */
  topic: string;
  /** Suggestions carry a format because it is part of the idea: an interview
   *  is a conversation, an explainer of a mechanism is an article. */
  format: Format;
}

export const SUGGESTIONS: Suggestion[] = [
  {
    label: "Overdue invoice",
    topic: "asking a client politely to settle an invoice that is two weeks overdue",
    format: "conversation",
  },
  {
    label: "Salary negotiation",
    topic:
      "a candidate and a recruiter negotiating salary, start date and notice period",
    format: "conversation",
  },
  {
    label: "Job interview",
    topic:
      "a hiring manager asking a candidate about their experience, and the candidate answering with examples",
    format: "conversation",
  },
  {
    label: "Cross-border payments",
    topic:
      "explaining to a non-technical colleague how a cross-border payment actually settles, and why it takes days",
    format: "article",
  },
  {
    label: "Voice AI for creators",
    topic:
      "explaining to a content creator how AI voice cloning works and what it can and cannot do for their channel",
    format: "conversation",
  },
  {
    label: "Failed prototype",
    topic:
      "a hardware engineer explaining to a supplier why the prototype failed testing, and agreeing what to change",
    format: "conversation",
  },
  {
    label: "Lead times",
    topic:
      "asking a supplier about lead times, minimum order quantity and what happens if the schedule slips",
    format: "conversation",
  },
  {
    label: "Apologising for a delay",
    topic:
      "apologising to a client for a delayed delivery, explaining the cause and saying what happens next",
    format: "conversation",
  },
  {
    label: "Before the meeting",
    topic:
      "small talk between two colleagues from different companies in the few minutes before a meeting starts",
    format: "conversation",
  },
  {
    label: "Why the price rose",
    topic:
      "a short news piece on why component prices went up this year and what it means for small manufacturers",
    format: "article",
  },
];
