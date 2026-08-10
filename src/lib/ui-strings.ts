/**
 * The interface, in the language being learned.
 *
 * Once a reader is comfortable enough, English chrome around target-language
 * prose is a small constant interruption - you read a Chinese story and then
 * "How did that feel?" pulls you back out. Above a threshold the chrome
 * switches too.
 *
 * EVERY key is required. That is the whole point of stating it as a type: the
 * obvious failure mode for this feature is a half-translated UI, where a string
 * added next month silently falls back to English in one language and nobody
 * notices for weeks. A missing key is a compile error instead.
 *
 * EVERY VALUE IS A PLAIN STRING, and that is a hard constraint rather than a
 * style: this object is handed to client components, and React Server
 * Components refuse to serialise a function across that boundary. The first
 * version had two interpolating functions in here and every page 500ed at
 * runtime while the types were perfectly happy - see UiFormatters below.
 *
 * The placement test is deliberately NOT covered. You take it before the app
 * knows anything about you, so there is no level to test against, and its
 * instructions are the one thing a beginner must be able to read.
 */
export interface UiStrings {
  /** English name of the language these strings are in, for the toggle. */
  uiLanguageNote: string;

  // Chrome
  retakeLevel: string;

  // Compose
  whatToRead: string;
  /** The label on the topic box. Distinct from the heading above it. */
  topicLabel: string;
  orStartFrom: string;
  formatStory: string;
  formatArticle: string;
  formatConversation: string;
  lengthShort: string;
  lengthMedium: string;
  lengthLong: string;
  writeIt: string;
  writing: string;
  writingNote: string;

  // Home
  everythingRead: string;

  // Signing in, which is optional and only exists to carry progress
  // between devices. Nothing in the app is behind it.
  signIn: string;
  signOut: string;
  signInWhy: string;
  emailAddress: string;
  emailMeALink: string;
  linkExpires: string;
  noSignInHere: string;
  checkYourEmail: string;
  checkYourEmailNote: string;
  checkYourEmailSpam: string;
  tryAnotherAddress: string;

  /** Short enough to sit in the header beside the other two links. */
  passkeyNav: string;
  passkeyHeading: string;
  passkeyRemove: string;
  passkeySignIn: string;
  passkeyAdd: string;
  passkeyAdded: string;
  passkeyWorking: string;
  passkeyWhy: string;
  orDivider: string;

  // The words you looked up
  yourWords: string;
  yourWordsNote: string;
  noWordsYet: string;
  noWordsYetNote: string;
  exportWords: string;
  removeWord: string;

  // Reader
  listen: string;
  preparing: string;
  play: string;
  pause: string;
  finishedReading: string;
  didYouFollow: string;
  // Shown after answering, so the reader finds out which ones they got.
  howYouDid: string;
  correctAnswer: string;
  yourAnswer: string;
  howDidThatFeel: string;
  tooEasy: string;
  justRight: string;
  tooHard: string;
  mispitched: string;
  selectMore: string;
  justOneWord: string;
  lookingUp: string;
  close: string;
  writeAnother: string;
  seeResult: string;

  // What happens to the level after a reading. This is the app's own moment -
  // the one time it tells you it has changed its mind about you - and it was
  // the last thing on the reading page still hardcoded in English.
  saveMyLevel: string;
  savingLevel: string;
  nudgedUp: string;
  nudgedDown: string;
  levelHeld: string;
  /**
   * Reader is a CLIENT component, so this cannot be a formatter - see the note
   * at the top of this file, and the runtime 500 that produced it. The caller
   * substitutes the number for `{percent}`.
   *
   * A token rather than concatenation around the number: the number does not
   * sit in the same place in every language, and splitting the sentence in two
   * hands a translator two fragments they cannot reorder.
   */
  lookedUpPercent: string;
  belowSweetSpot: string;
  aboveSweetSpot: string;
  atSweetSpot: string;
  /** Labels the "36 → 33" line. Just the word. */
  levelWord: string;
  readSomethingElse: string;
  /** The link to /progress, offered exactly when the level has just moved. */
  seeProgress: string;

  // Progress. Read back out of data the app was already keeping.
  progressNav: string;
  progressHeading: string;
  wordsYouCanRead: string;
  whenYouStarted: string;
  rightNow: string;
  levelHeading: string;
  /**
   * Always shown, never conditional on there having been a drop. Reassurance
   * that appears only after bad news reads as an apology for it.
   */
  levelNote: string;
  levelFromCheck: string;
  legendSession: string;
  legendAdjusted: string;
  legendReplaced: string;
  breadthHeading: string;
  breadthNote: string;
  breadthStarted: string;
  habitHeading: string;
  habitNote: string;
  /**
   * What each shade in the calendar means. habitNote says the same thing in
   * prose, but prose cannot map a colour to a meaning, and the mapping used to
   * live only in a tooltip - which does not exist on a touchscreen.
   */
  legendMade: string;
  legendLooked: string;
  legendFinished: string;
  noProgressYet: string;
  noProgressYetNote: string;

  // Things that went wrong
  somethingWentWrong: string;
  couldNotLoadAudio: string;
  couldNotSave: string;
  couldNotAdjust: string;
  generationFailed: string;
  lookupFailed: string;
}

/**
 * English: the source of truth, and the fallback below the threshold.
 *
 * Every other language's strings are a translation OF this file, so when a
 * string changes here the type system points at each one that has to follow.
 */
export const EN: UiStrings = {
  uiLanguageNote: "English",

  retakeLevel: "Re-test my level",

  whatToRead: "What do you feel like reading?",
  topicLabel: "What do you want to read about?",
  orStartFrom: "Or start from one of these:",
  formatStory: "Story",
  formatArticle: "Article",
  formatConversation: "Conversation",
  lengthShort: "Short",
  lengthMedium: "Medium",
  lengthLong: "Long",
  writeIt: "Write it",
  writing: "Writing…",
  writingNote:
    "Writing, then checking it against your level and rewriting anything too hard. Usually 20–40 seconds.",

  everythingRead: "Everything you’ve read",

  signIn: "Sign in",
  signOut: "Sign out",
  signInWhy:
    "Only to carry your level and your reading to another device. Everything works without an account — this browser remembers you either way.",
  emailAddress: "you@example.com",
  emailMeALink: "Email me a sign-in link",
  linkExpires: "No password. The link works once and expires in 15 minutes.",
  noSignInHere: "Signing in isn’t set up on this server yet.",
  checkYourEmail: "Check your email",
  checkYourEmailNote:
    "A sign-in link is on its way. It works once and expires in 15 minutes.",
  checkYourEmailSpam:
    "Nothing arriving? Check spam, and confirm the address was right — we can’t tell you whether an address is registered, because that would let anyone use this page to find out.",
  tryAnotherAddress: "Try a different address",

  passkeyNav: "Passkeys",
  passkeyHeading: "Signing in without email",
  passkeyRemove: "Remove",
  passkeySignIn: "Use a passkey",
  passkeyAdd: "Add a passkey to this device",
  passkeyAdded: "Added. Next time this device signs you in without email.",
  passkeyWorking: "Waiting for your device…",
  passkeyWhy:
    "A passkey signs you in with your fingerprint or face instead of an emailed link. It stays on this device.",
  orDivider: "or",

  yourWords: "Words you looked up",
  yourWordsNote:
    "Every word you tapped while reading. The ones that keep coming back are the ones worth learning.",
  noWordsYet: "Nothing here yet.",
  noWordsYetNote:
    "Tap a word while you’re reading and it lands here, with its meaning already saved.",
  exportWords: "Export for Anki",
  removeWord: "Remove",

  listen: "Listen",
  preparing: "Preparing…",
  play: "Play",
  pause: "Pause",
  finishedReading: "I’ve finished reading",
  didYouFollow: "Did you follow it?",
  howYouDid: "How you did",
  correctAnswer: "Correct answer",
  yourAnswer: "You chose this",
  howDidThatFeel: "How did that feel?",
  tooEasy: "Too easy",
  justRight: "Just right",
  tooHard: "Too hard",
  mispitched: "Mispitched?",
  selectMore: "Select more:",
  justOneWord: "just one word",
  lookingUp: "Looking up…",
  close: "Close",
  writeAnother: "Write me another",
  seeResult: "See how that went",

  saveMyLevel: "Save and update my level",
  savingLevel: "Saving…",
  nudgedUp: "Nudged up",
  nudgedDown: "Nudged down",
  levelHeld: "Level held",
  lookedUpPercent: "You looked up {percent}% of the words",
  belowSweetSpot:
    "— comfortably below the sweet spot, so the next piece will stretch you more.",
  aboveSweetSpot: "— above the sweet spot, so the next piece will ease off.",
  atSweetSpot: "— right around the sweet spot.",
  levelWord: "Level",
  readSomethingElse: "Read something else",
  seeProgress: "See how far you’ve come",

  progressNav: "Your progress",
  progressHeading: "How far you’ve come",
  wordsYouCanRead: "Words you can read",
  whenYouStarted: "When you started",
  rightNow: "Right now",
  levelHeading: "Your level, piece by piece",
  levelNote:
    "The level moves after every piece you finish. It goes down as well as up — that’s the app correcting its guess about you, not you going backwards.",
  levelFromCheck: "Where the level check put you",
  legendSession: "after a piece you finished",
  legendAdjusted: "you adjusted the level yourself",
  legendReplaced: "you re-took the level check",
  breadthHeading: "What you’ve read about",
  breadthNote:
    "One square for each kind of writing in each subject. Not a target — a picture of what you’ve covered.",
  breadthStarted: "Started, not finished",
  habitHeading: "Days you read",
  habitNote:
    "A day counts if you finished a piece, looked a word up, or asked for something new. Days run midnight to midnight, where you are.",
  legendMade: "asked for something",
  legendLooked: "looked a word up",
  legendFinished: "finished a piece",
  noProgressYet: "Nothing to show yet.",
  noProgressYetNote:
    "Finish one piece and this fills in: your level over time, what you’ve read about, and the days you showed up.",

  somethingWentWrong: "Something went wrong.",
  couldNotLoadAudio: "Could not load audio.",
  couldNotSave: "Could not save.",
  couldNotAdjust: "Could not adjust level.",
  generationFailed: "Generation failed.",
  lookupFailed: "Couldn’t look that one up.",
};

/**
 * The strings that need a value substituted into them.
 *
 * Kept apart from UiStrings because these are FUNCTIONS, and a function cannot
 * be passed to a client component. Only server components use them, which is
 * enforced by them not being in the object the client receives.
 *
 * Functions rather than templates with numbered placeholders because word order
 * is not universal - a translator has to be able to move the number, not just
 * fill a slot.
 */
export interface UiFormatters {
  aboutWords(band: string): string;
  aimingFor(sentenceWords: number, newWordPercent: number): string;
  /** Only ever called with n > 1 - "met in 1 piece" is noise, not information. */
  metInPieces(n: number): string;

  /**
   * Growth and its opposite, as TWO functions rather than one with a sign
   * branch. The honest negative wording is a different sentence, not the same
   * sentence with a minus in it - a translator has to be able to write it as
   * one. Both take the word count pre-formatted, like aboutWords, and the
   * percentage as a number.
   */
  grownBy(words: string, percent: number): string;
  shrunkBy(words: string, percent: number): string;
  acrossPieces(n: number): string;
  coveredCells(filled: number, total: number): string;
  otherPieces(n: number): string;
  unlabelledPieces(n: number): string;
  daysReadOf(days: number, of: number): string;
  longestRunDays(n: number): string;
  /** The calendar tooltip. `date` arrives already formatted. */
  readOnDay(date: string, events: number): string;
  /** Why a level moved, on the chart dot. */
  lookedUpShare(percent: number): string;
  /**
   * One registered passkey. `synced` is the authenticator's own claim that the
   * credential is backed up - a synced one reaches your other devices, a
   * device-bound one does not, and that is the difference worth surfacing when
   * someone is deciding which to remove.
   */
  passkeyOn(date: string, synced: boolean): string;
}

export const EN_FORMAT: UiFormatters = {
  aboutWords: (band) => `· about ${band} words`,
  aimingFor: (sentenceWords, newWordPercent) =>
    `Aiming for ~${sentenceWords}-word sentences and ${newWordPercent}% new vocabulary`,
  metInPieces: (n) => `You needed this one in ${n} different pieces`,
  grownBy: (words, percent) => `${words} more words than when you started — ${percent}% more.`,
  shrunkBy: (words, percent) =>
    `${words} fewer than the check first guessed, and ${percent}% below it. The check was a guess from a word list; this is measured from what you have actually read.`,
  acrossPieces: (n) => `across ${n} pieces you finished`,
  coveredCells: (filled, total) => `${filled} of ${total} squares`,
  otherPieces: (n) => `Plus ${n} pieces that did not fit any of these subjects.`,
  unlabelledPieces: (n) =>
    `${n} earlier pieces were written before the app started labelling subjects, so they are not on the grid.`,
  daysReadOf: (days, of) => `You read on ${days} of the last ${of} days`,
  longestRunDays: (n) => `Longest run: ${n} days`,
  readOnDay: (date, events) => `${date} — ${events} things`,
  lookedUpShare: (percent) => `you looked up ${percent}% of the words`,
  passkeyOn: (date, synced) =>
    `${synced ? "Synced passkey" : "This device only"} · added ${date}`,
};
