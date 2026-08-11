# 1 Percent More Fluent

Generated reading and listening material in the language you're learning,
pitched at a level you can actually read. You say what you feel like reading —
a folk tale, a piece about the trade war, two friends arguing about a film —
and it writes one, checks how hard it actually came out, and rewrites it if it
missed.

Spanish today; Simplified Chinese and Indonesian next.

## The idea

Duolingo-style drilling caps out early, and reading real Spanish (Wikipedia,
news) means the difficulty is whatever the topic happens to be. This sits in
between: unlimited material, on any topic, held at the level where reading is
still fluent but still teaching something.

Three things make that work.

**Difficulty is measured, not requested.** Asking a model for "B1 Spanish"
produces whatever it feels like. So the app never does. It asks for concrete
constraints — a vocabulary band, a mean sentence length, a permitted set of
tenses — then tokenises the result and checks it against a frequency list
before showing it to anyone. Measured: models land 12–15% of words outside the
band on the first attempt and 4–8% when handed the specific offending words, so
one correction round is the norm.

**The level is a number, not a label.** One continuous value, 0–100, anchored
to vocabulary size (500 words at 0, 20,000 at 100, geometric). CEFR is derived
from it for display and is never an input. Being continuous is what lets it be
nudged a few points after every session instead of jumping between buckets.

**Calibration comes from behaviour, not self-report.** After each piece the
level moves on three signals: how many words you tapped for a definition (the
honest one — you are not consciously producing it), a three-question
comprehension check in Spanish, and a one-tap "too easy / just right / too
hard". Target is ~5% of words looked up: below that the text is wasted
practice, above it comprehension collapses.

## Two things the level model gets wrong if you let it

Both of these shipped, both were wrong, and both are now covered by tests
(`npm run placement`, `npm run calibration`). They are worth knowing about
because anyone rebuilding this would hit them.

**Cognates break a naive yes/no vocabulary test.** Rare Spanish words are
disproportionately Latinate, so they are *more* transparent to an English
speaker, not less — `epinefrina`, `presidir`, `humanamente`, `cafeteria` are
all readable with no Spanish at all. Combined with band-area scoring, where the
widest band carried 60% of the estimate from five items, this rated a genuine
A2/B1 learner as C2. Three fixes: catch trials are drawn **per band** so the
false-alarm correction measures each band's own inflation; credit is
**monotonic**, so a band is never credited above the bands beneath it; and the
scale is capped at rank 20,000, past which the corpus tail predicts nothing.

**Zero lookups is ambiguous.** Someone who found the text trivial taps nothing
— and so does someone who opened a wall of incomprehensible Spanish and gave
up. Reading both as "too easy" pushed a drowning reader *upwards*. Lookups now
only count as evidence when something else shows the piece was actually read.
Early sessions are also allowed to move much further than late ones, so a bad
starting estimate escapes in one session rather than seven.

**The vocabulary band stops constraining the model as it widens.** At level 45
a text lands ~5% outside its band, as intended. At level 84 the band is ~11,000
words, so almost nothing falls outside it and the model just writes its default
register — measured 0.0–1.5%. With only a ceiling on the budget, that is a
runaway: the text stops getting harder, the reader looks nothing up, the
controller reads that as "too easy" and climbs again, all the way to 100.

Three things close it. `measure()` now has a **floor** as well as a ceiling. The
correction names concrete words from just past the band (`registerAnchors`),
because "be harder" alone does nothing — the model cannot know where the band
ends. And the prompt states the budget as a **target to hit**, not a cap to stay
under; framed as "at most 7%" the model optimises for safety and lands near 1%.

Even so it under-shoots, so the loop is closed on the other side too: a session
whose piece measurably undershot its own level **can lower the reader's level
but never raise it**. That guard does not depend on the model complying.

The safety net for all of these is the read-back check at the end of the
placement test: five paragraphs on one topic, ascending in difficulty, and the question
"which is the last one you can follow?" It is free and instant (the samples are
pre-generated and committed), it is grounded in real text rather than an
abstract CEFR label, and it catches a badly wrong estimate in twenty seconds.
It is weighted at 65% against the word test's 35%.

## Setup

```bash
npm install
```

Copy `.env.example` to `.env.local` and fill in:

- `GOOGLE_GENERATIVE_AI_API_KEY` — text generation. Free tier is plenty.
- `ELEVENLABS_API_KEY` — speech. Optional; the app runs read-only without it.
- `AUTH_SECRET` + `AUTH_RESEND_KEY` — sign-in by magic link. Optional, and
  leaving them out is a supported state: reading rides on a cookie, as it
  always has. An account exists only so a level built over weeks follows you to
  another device, and signing in claims whatever that browser already read.

Then build the Spanish word data (~1 MB, downloads two public lists):

```bash
npm run wordlist
```

```bash
npm run dev
```

## Deploying

See [DEPLOY.md](DEPLOY.md). It runs as a systemd service on a droplet behind
Caddy, deployed by GitHub Actions over SSH.

It **cannot** go serverless: it writes a SQLite database and caches synthesised
audio on disk, and both have to survive a deploy.

The one trap is worth knowing before you touch any of it. Next's standalone
server calls `process.chdir(__dirname)`, so in production the working directory
is `.next/standalone` — which every rebuild deletes. Anything resolved from
`process.cwd()` would therefore start from an empty database on each deploy and
orphan the audio cache, silently. `DATA_DIR` is set explicitly and
`src/server/paths.ts` refuses to start if it ever resolves inside the build
output. `npm run standalone` runs the production server locally so this class
of bug is catchable before it ships — `next dev` does not chdir, so it hides it.

## Cost

Text is nearly free — a 400-word story is about 600 output tokens. **Speech is
effectively 100% of the running cost**, at $0.10 per 1,000 characters on
`eleven_multilingual_v2` (or $0.05 on `eleven_flash_v2_5`, which is arguably
clearer for a learner anyway). A 400-word story is ~2,400 characters, so ~24
cents.

Two rules follow, and both are load-bearing:

1. **Audio is cached by content hash** in `public/audio/`, keyed on text +
   voice + model. Re-listening is free, forever. That directory is a cache you
   have paid real money for — deleting it is safe but not cheap.
2. **Nothing is synthesised speculatively.** Audio is only ever generated for a
   piece that already passed verification and that you explicitly asked to
   hear. A rejected draft must never reach the TTS call.

The home page shows the running character total.

**Conversations are spoken as dialogue, not narrated.** Each character gets a
distinct, gender-matched voice and the speaker names are never read aloud —
otherwise you hear "Alice colon, good morning" in one flat voice, which is
unfollowable when you are still decoding the words. The generator declares each
speaker's gender (inferring it from a name would not survive the move to
Chinese or Indonesian), `src/server/voices.ts` casts them from the premade pool,
and ElevenLabs' `/v1/text-to-dialogue` takes all the turns in **one** request —
so it costs the same as single-voice narration, slightly less in fact, since
the names are dropped.

One subtlety worth knowing before touching it: the two audio paths return
timings in different coordinate spaces. Narration aligns to the paragraphs
joined by a blank line; a dialogue aligns to the turns concatenated with no
names and no separators. `splitTurns` in `src/lib/dialogue.ts` is shared by the
server and the reader precisely so those offsets cannot drift apart.

On a free ElevenLabs key only the ~21 **premade** voices work via the API —
library and professional voices return `402 paid_plan_required`, including some
that used to be premade. `npm run voices` lists what a given key can actually
use, plus remaining quota.

## Adding a language

Everything language-specific lives behind one interface. Adding a language is
a module in `src/lib/languages/`, a build strategy in
`scripts/build-wordlist.ts`, and a data entry in `src/server/frequency.ts`.
The generator, reader, difficulty checker and placement test do not change.

```bash
LANGUAGE=zh-CN npm run wordlist   # free: frequency list, test items, anchors
LANGUAGE=zh-CN npm run samples    # costs model calls: the graded read-back set
```

Run them in that order — `wordlist` seeds an empty `samples.json`, which
`frequency.ts` imports statically and therefore needs to exist before anything,
including `samples`, can load. Until the samples are generated the placement
test simply skips the read-back step rather than showing a blank screen.

Two things genuinely could not be shared with Spanish, and they are the
interesting part of `build-wordlist.ts`:

- **Vetting.** Spanish has a 636k-form open dictionary to check candidates
  against. There is no equally reachable Chinese one, so a single build-time
  model call vets the sampled items instead — dropping proper nouns, phrases,
  and Traditional characters that the Simplified corpus is contaminated with.
- **Pseudowords.** Substituting a vowel is meaningless without an alphabet. The
  Chinese analogue swaps one character of a real two-character word for a
  character from another — and it happens to catch the exact over-claim that
  matters there: *"I know both characters, so I must know the word."* Which is
  the same shape as cognate over-claiming in Spanish, from a different cause.

The load-bearing part of the interface is **`baseForms`**. A frequency list
holds surface forms, so taken literally an inflection of a common verb reads as
a rare word — which overstates difficulty and pushes the generator into stilted
prose. Spanish answers this by stripping inflectional endings; Chinese will
answer it by decomposing a compound its segmenter produced but the list lacks.
Same contract, unrelated implementations.

The interface was deliberately shaped against the *hardest* case rather than
the easiest. Spanish alone would suggest "a regex for letters and a suffix
stripper", which would not survive first contact with a language that has no
spaces and no inflection.

`npm run language` asserts the contract for every registered language —
including that `tokenize` round-trips exactly, which the reader depends on to
make words tappable and to line audio timings up with them.

## Layout

```
src/lib/          shared by client and server — no node built-ins
  languages/      one module per language, behind a common interface
    types.ts      the contract, and why each part of it exists
    es.ts         Spanish: text handling, morphology, grammar gates, CEFR
  level.ts        the level scale and calibration controller (language-neutral)
  dialogue.ts     splitting conversations into speaker turns
src/server/       server-only
  frequency.ts    the per-language corpora, keyed by code
  generate.ts     prompt building, generation, the verify-and-retry loop
  difficulty.ts   measures generated text against the level
  placement.ts    the yes/no vocabulary test and its scoring
  tts.ts          ElevenLabs, content-hash cache, character timings
  voices.ts       casting conversations from the premade voice pool
  gloss.ts        word lookups, cached globally
scripts/          data building and measurement, not part of the app
```

## Scripts

| | |
|---|---|
| `npm run wordlist` | rebuild the frequency list and placement test data (free) |
| `npm run samples` | rebuild the graded read-back paragraphs (**costs LLM calls**) |
| `npm run placement` | score synthetic learners against the placement test |
| `npm run calibration` | assert the level controller moves the right way |
| `npm run language` | assert the contract every registered language must satisfy |
| `npm run voices` | list usable ElevenLabs voices and remaining quota |
| `npm run models` | list available text models and smoke-test one |
| `npm run bench` | time the real generation prompt across candidate models |
| `npm run inspect` | dump stored pieces, profiles and spend |
| `bash scripts/set-level.sh 38` | force every profile to a level, bypassing the test |
| `bash scripts/check.sh` | types, lint, model checks, production build |

## Data sources

Full licences and provenance in [NOTICE.md](NOTICE.md).

- Frequency list: [hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords)
  (OpenSubtitles 2018, MIT). Conversational, which matches what a learner wants
  to read — but full of proper nouns, so test items are vetted against:
- Dictionary: [an-array-of-spanish-words](https://github.com/words/an-array-of-spanish-words),
  ~636k forms. Used only to filter placement-test items and to guarantee a
  generated pseudoword is not an obscure real word.
- **Chinese placement**: the vocabulary list of 《国际中文教育中文水平等级标准》
  (GF 0025—2021, 教育部/国家语委), via [ivankra/hsk30](https://github.com/ivankra/hsk30)
  (MIT). Rebuild with `npm run hsk`.

  Chinese is banded by HSK level rather than by frequency rank, because the
  frequency ruler could not be failed: its hardest band, notionally ranks
  11,001–20,000, contained 不便, 安好, 指头 and 往日 — four ordinary words
  standing in for nine thousand. A subtitle corpus does not hold 9,000 rare
  Chinese words to put there. HSK is ordered pedagogically, is the scale
  learners already use, and its top band is genuinely the top. 成语 arrive with
  it: they are part of levels 7–9, and since film dialogue rarely uses them they
  sort into the rarer half of that band, which is where they belong.

## Known limitations

- **Simplified Chinese is word-band only.** Reading difficulty in Chinese is
  driven by characters as much as by words, and word rank alone mis-estimates
  it in both directions: `中文` sits at rank 11,048 yet any beginner reads it
  (中 and 文 are among the commonest characters), while `犹豫` at rank 6,080 is
  genuinely hard. The calibration loop absorbs some of this. The cheap partial
  fix needs no new data — derive character frequencies by summing word counts
  per character from the same list, and discount an out-of-band word whose
  characters are all common. The seam for it is marked in `zh-CN.ts`.
- **No pinyin annotation.** The gloss card gives meaning, not pronunciation.
- **The morphology is a heuristic, not a lemmatiser.** It strips productive
  endings and undoes stem-changing diphthongs. It errs towards "known", which
  is the safe direction — a word wrongly called known costs one tap, a word
  wrongly called rare distorts every generation.
- **Pseudowords are vetted against the dictionary**, but a few sit close enough
  to real words (`celiente` / `caliente`) to inflate the false-alarm rate.
  Inherent to the test design; the correction handles it.
- **Glosses are context-free**, cached per word. Wrong for idioms. Making them
  context-sensitive is the obvious next step, at the cost of cache hit rate.
- **Conversations are single-voice.** Two `voice_id`s for a two-speaker
  dialogue is cheap to add and would sound much better.
- **No spaced repetition yet.** Tapped words are recorded in `lookups` — that
  table is deliberately the feed for it.
- **No shared content pool.** Every piece is generated per user. Caching by
  (language, level band, format, normalised topic) is the thing that stops cost
  scaling with users; the schema is ready for it.
- Generation takes 20–40 seconds, mostly the correction round.
