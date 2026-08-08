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
 *   story        a premise with tension - someone wants something, or something
 *                is about to go wrong. "Mexico" is a setting, not a story, and
 *                produces a travel brochure. Written for adults: the stakes are
 *                money, work, family, ageing and compromise, because a reader
 *                who has to work at every sentence deserves something worth the
 *                effort at the end of it.
 *   article      a subject with an ANGLE. "Coffee" is a category; "how coffee
 *                got from Ethiopia to everywhere" has a shape to follow.
 *   conversation two people who each want something. Without that the model
 *                writes two people taking turns describing a subject, which is
 *                what makes generated dialogue feel dead.
 *
 * Every FIELD appears in all three formats. That is deliberate and it is what
 * `field` is for: it turns the set into a breadth check. If one field's
 * terminology comes back visibly weaker than the rest, it shows up three times
 * rather than once, and scripts/check-suggestions.ts fails if a field goes
 * missing from a format.
 *
 * ENGLISH ONLY, on purpose. Everything else the reader sees follows the
 * interface language, and these deliberately do not - the label is a hint about
 * a topic, not something to read for practice, and translating thirty topics
 * three ways is upkeep with no learning in it. Do not "fix" this.
 */
import type { Format } from "./formats";

/**
 * The domains the set spans. Not shown anywhere - this exists to keep the three
 * formats covering the same ground, and to make a gap a test failure.
 */
export type Field =
  | "food"
  | "payments"
  | "language"
  | "engineering"
  | "philosophy"
  | "sport"
  | "medicine"
  | "travel";

export const FIELDS: Field[] = [
  "food",
  "payments",
  "language",
  "engineering",
  "philosophy",
  "sport",
  "medicine",
  "travel",
];

export interface Suggestion {
  /** Short enough for a chip. */
  label: string;
  /** What actually goes in the topic box. */
  topic: string;
  field: Field;
}

/** Shown in the topic box before anything is typed. */
export const PLACEHOLDERS: Record<Format, string> = {
  // Each one is written like the topics below it rather than naming a category.
  // The previous set - "folklore, a small mystery, something that happened" -
  // taught the opposite of what the file says makes a good topic, and one of
  // them named a film that would be out of date within the year.
  story: "letting go of the person who trained you",
  article: "what happens to a parcel after you order it",
  conversation: "telling a colleague their work isn't good enough",
};

export const SUGGESTIONS: Record<Format, Suggestion[]> = {
  story: [
    {
      label: "The family restaurant",
      topic:
        "someone inherits the family restaurant and wants to change the menu their parent spent thirty years building",
      field: "food",
    },
    {
      label: "Waiting to be paid",
      topic: "a freelancer whose rent is due before the client's invoice clears",
      field: "payments",
    },
    {
      label: "The inheritance",
      topic:
        "two siblings dividing a parent's flat, and the one worthless object neither will give up",
      field: "payments",
    },
    {
      label: "Her mother's language",
      topic:
        "a parent realises their child can no longer hold a conversation with their grandmother",
      field: "language",
    },
    {
      label: "The signature",
      topic:
        "an engineer who approved a part that later failed, and the report now being written",
      field: "engineering",
    },
    {
      label: "The reference",
      topic: "being asked to vouch for a former colleague you would not hire",
      field: "philosophy",
    },
    {
      label: "The last season",
      topic: "an athlete who knows this is the end and has not told the team",
      field: "sport",
    },
    {
      label: "The appointment",
      topic:
        "someone who has put off a check-up for a year, and the week they stop putting it off",
      field: "medicine",
    },
    {
      label: "Going back",
      topic:
        "someone returns to the country they left at twenty and finds they no longer fit",
      field: "travel",
    },
    {
      label: "The visa",
      topic: "a couple waiting on a decision that will settle which country they live in",
      field: "travel",
    },
  ],
  article: [
    {
      label: "Why sourdough waits",
      topic: "what is actually happening in the dough during the long rise",
      field: "food",
    },
    {
      label: "Why chilli burns",
      topic: "what makes a chilli hot, why it hurts, and why people keep going back",
      field: "food",
    },
    {
      label: "Where your payment goes",
      topic: "what actually happens in the seconds after a card is tapped",
      field: "payments",
    },
    {
      label: "Why writing gets simpler",
      topic:
        "why writing systems get simplified over time, what it makes easier, and what is lost",
      field: "language",
    },
    {
      label: "Clean rooms",
      topic:
        "how a semiconductor factory keeps dust out, and why a single particle ruins a wafer",
      field: "engineering",
    },
    {
      label: "Bridges that sway",
      topic: "why some bridges move in the wind, and what engineers do about it",
      field: "engineering",
    },
    {
      label: "The Stoics on anger",
      topic: "what the Stoics got right about anger, and where modern psychology disagrees",
      field: "philosophy",
    },
    {
      label: "What altitude really does",
      topic: "whether training at altitude actually makes athletes faster",
      field: "sport",
    },
    {
      label: "Sleep and memory",
      topic: "what the brain does with the day's memories while you sleep",
      field: "medicine",
    },
    {
      label: "How salt drew the map",
      topic: "how one mineral decided where roads ran and where cities were built",
      field: "travel",
    },
  ],
  conversation: [
    {
      label: "The supplier",
      topic:
        "a restaurant owner telling a supplier the produce has slipped, when neither wants to lose the other",
      field: "food",
    },
    {
      label: "Overdue invoice",
      topic:
        "asking a client to settle an invoice two weeks late without damaging the relationship",
      field: "payments",
    },
    {
      label: "Payment fraud",
      topic:
        "explaining to a shop owner how to cut payment fraud without turning away real customers",
      field: "payments",
    },
    {
      label: "Lost in translation",
      topic: "a translator telling a client their slogan will not survive the target market",
      field: "language",
    },
    {
      label: "The prototype failed",
      topic:
        "an engineer and a supplier working out what went wrong in testing and who changes what",
      field: "engineering",
    },
    {
      label: "Lead times",
      topic:
        "pressing a supplier on lead times, minimum order, and what happens when the schedule slips",
      field: "engineering",
    },
    {
      label: "The uncomfortable truth",
      topic:
        "two colleagues disagreeing about whether to tell a client something they will not want to hear",
      field: "philosophy",
    },
    {
      label: "After a bad race",
      topic: "a coach and an athlete talking honestly when the athlete would rather not",
      field: "sport",
    },
    {
      label: "Describing a symptom",
      topic: "telling a doctor about something that is genuinely hard to put into words",
      field: "medicine",
    },
    {
      label: "At the border",
      topic: "a traveller and an official over a document that is not quite right",
      field: "travel",
    },
  ],
};
