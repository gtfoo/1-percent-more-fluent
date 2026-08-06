/**
 * Starting points, for the blank page.
 *
 * These exist because of a specific failure. The generator is only as good as
 * the topic it is handed, and there is a large quality gap between "stablecoins"
 * and "explaining stablecoins to a client who has never used one". The first
 * produces a competent encyclopedia entry; the second produces language you
 * could actually use on a person. Nothing in the UI taught that difference, so
 * these model it instead of explaining it.
 *
 * What makes a good topic differs by format, which is why they are grouped:
 *
 *   story        a premise with tension in it - someone wants something, or
 *                something is about to go wrong. "Mexico" is a setting, not a
 *                story, and produces a travel brochure.
 *   article      a subject with an ANGLE. "Coffee" is a category; "how coffee
 *                got from Ethiopia to everywhere" has a shape to follow.
 *   conversation two people who want something from each other. Without that
 *                the model writes two people taking turns describing a subject,
 *                which is what makes generated dialogue feel dead.
 *
 * Spread deliberately across unrelated fields - philosophy, engineering, food,
 * sport, travel, medicine, payments - so each exercises the protected topic
 * terms on vocabulary the others do not share. The set doubles as a breadth
 * check: if terminology for one of these comes back visibly weaker than the
 * rest, that is worth knowing before demoing it.
 */
import type { Format } from "./formats";

export interface Suggestion {
  /** Short enough for a chip. */
  label: string;
  /** What actually goes in the topic box. */
  topic: string;
}

export const SUGGESTIONS: Record<Format, Suggestion[]> = {
  story: [
    {
      label: "Adventure in Mexico",
      topic: "an adventure in Mexico that does not go the way it was planned",
    },
    {
      label: "The recipe",
      topic:
        "a street food seller changes one ingredient in a recipe their family has used for years, and the regulars notice",
    },
    {
      label: "Night shift",
      topic: "the night shift at a small hotel, and the guest who will not sleep",
    },
    {
      label: "The lost race",
      topic: "a runner training for a race they already know they cannot win",
    },
    {
      label: "Twenty years later",
      topic: "someone returns to the village they grew up in after twenty years away",
    },
    {
      label: "The musician",
      topic: "a musician who is losing their hearing and decides to keep playing anyway",
    },
    {
      label: "Stuck in the lift",
      topic: "two neighbours who have never spoken get stuck in a lift together",
    },
    {
      label: "Something in the water",
      topic: "a lighthouse keeper sees something in the water and tells nobody",
    },
  ],
  article: [
    {
      label: "Diving in Yucatan",
      topic: "scuba diving in the cenotes of the Yucatan, and why they are unlike open water",
    },
    {
      label: "Why sourdough waits",
      topic: "why sourdough needs so much time, and what is actually happening in the dough",
    },
    {
      label: "Noise cancelling",
      topic: "how noise-cancelling headphones actually work, and why they struggle with voices",
    },
    {
      label: "The Stoics on anger",
      topic: "what the Stoics got right about anger, and where modern psychology disagrees",
    },
    {
      label: "Altitude training",
      topic: "the science of altitude training, and whether it really makes athletes faster",
    },
    {
      label: "Clean rooms",
      topic: "how a semiconductor factory keeps dust out, and why a single particle ruins a chip",
    },
    {
      label: "Coffee's journey",
      topic: "how coffee travelled from Ethiopia to almost every country on earth",
    },
    {
      label: "Why chilli burns",
      topic: "what makes a chilli hot, why it hurts, and why people keep eating them",
    },
    {
      label: "Bridges that hum",
      topic: "why some bridges hum or sway in the wind, and what engineers do about it",
    },
    {
      label: "Sleep and memory",
      topic: "what the brain does with the day's memories while you sleep",
    },
  ],
  conversation: [
    {
      label: "Payment fraud",
      topic:
        "how ecommerce merchants can fight payment fraud without blocking real customers, explained to a shop owner",
    },
    {
      label: "Job interview",
      topic:
        "a hiring manager asking a candidate about their experience, and the candidate answering with examples",
    },
    {
      label: "Salary negotiation",
      topic: "a candidate and a recruiter negotiating salary, start date and notice period",
    },
    {
      label: "Overdue invoice",
      topic: "asking a client politely to settle an invoice that is two weeks overdue",
    },
    {
      label: "Failed prototype",
      topic:
        "a hardware engineer explaining to a supplier why the prototype failed testing, and agreeing what to change",
    },
    {
      label: "Lead times",
      topic:
        "asking a supplier about lead times, minimum order quantity and what happens if the schedule slips",
    },
    {
      label: "Voice AI for creators",
      topic:
        "explaining to a content creator how AI voice cloning works and what it can and cannot do for their channel",
    },
    {
      label: "Apologising for a delay",
      topic:
        "apologising to a client for a delayed delivery, explaining the cause and saying what happens next",
    },
    {
      label: "Before the meeting",
      topic:
        "small talk between two colleagues from different companies in the few minutes before a meeting starts",
    },
    {
      label: "The test results",
      topic: "a doctor explaining test results to a patient who is clearly worried",
    },
    {
      label: "After a bad race",
      topic: "a coach and an athlete talking honestly after a race that went badly",
    },
    {
      label: "Should we move?",
      topic: "two friends disagreeing about whether moving to another city is worth it",
    },
  ],
};
