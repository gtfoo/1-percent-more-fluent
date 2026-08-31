# Tasks — 1-percent-more-fluent

What this app owes, and to whom. Written only by this app's agent; read by
anyone, so nobody has to ask what happened to a letter they sent.

Never imported by `AGENTS.md`: this churns, and anything that loads at the start
of every session costs each task its context before the first word.

A deferred or declined letter lands here **and** gets a reply — the reply says
"deferred", this says what it was deferred to. Correspondence in
[MAIL.md](MAIL.md); closed mail in [MAIL-ARCHIVE.md](MAIL-ARCHIVE.md).

---

## Open

- [ ] **Local dev runs on 3003, which `INFRA.md` allocates to indie-degree** —
      this app's port is **3100**. Production has it right everywhere
      (`DEPLOY.md`, the systemd unit, the Caddy reverse proxy); local is the
      problem. `scripts/dev.sh` and roughly fifteen check and smoke scripts
      hardcode 3003, and `dev.sh`'s comment still claims 3003 "matches the
      fluent entry in gtfoo/.claude/launch.json" — which the gtfoo agent has
      since corrected to 3100. So a dev server started from the gtfoo workspace
      now listens on 3100 while every check script here probes 3003, and both
      would collide with indie-degree if run together.

      Two parts: a mechanical 3003 → 3100 sweep, and a `.claude/launch.json` of
      our own, since this repo has none and the only fluent dev-server config in
      the fleet lives in someone else's tree. Held because it changes the local
      dev port, which is the owner's call rather than mine.
      *from: gtfoo agent, 2026-08-30*

- [ ] **The band number is inert below level 70 — decide what replaces it** —
      measured 2026-08-30 on 23 blind generations scored by the app's own
      verifier. Changing the stated band from 500 to 6,613 — levels 0 to 70, so
      most of the range — moved the text not at all: measured against one fixed
      yardstick those three conditions produced 7.2%, 5.9%, 7.2% out-of-band.
      Only 20,000 responded, at 11.3%. **The model can be pushed harder but not
      simpler**, which is exactly the app's known failure profile (every
      floor-zone failure is over-ceiling). The asked-for percentage is a real
      but weak lever: 3/7/15/30% delivered 5.3/7.2/10.0/10.5%, a tenfold ask for
      a twofold move, saturating by 15%. Edge anchors in the *initial* prompt
      were tested and do nothing at the floor (29.2% → 29.3%), so that idea is
      dead and `registerAnchors` stays where it is, in the too-easy correction
      path, where it did help slightly.

      **This explains the original band experiment; it does not reopen it.**
      Pasting the band's words lifted levels 30 and 50 and *not* level 10 — see
      the floor's recorded history in `generate.ts`. The word-level dump says
      why: at a ~700-word band the words falling outside are "falta", "café",
      "espacio", "verano", "jardín" — ordinary words with no simpler synonym.
      Knowing which words are in the set was never the floor's problem; the set
      being too small for an arbitrary topic is, and pasting it cannot fix that.
      An earlier draft of this entry cited 44% → 78% as a floor result. It is
      the aggregate across all three benched levels, carried by the upper two.

      So the floor needs no further decision: the scaffold, the 2.6× ceiling and
      MIN_READER_LEVEL 12 already scope it, and three measurements now agree no
      prompt change improves it. What is left is narrower — **paste the band
      between roughly levels 25 and 70**, the one range where the number is
      measured inert *and* pasting is measured to work, at +55% latency and
      ~1,100 input tokens a call. Above ~70 nothing is needed: the model's
      default register already sits there, which is why 20,000 was the only band
      that moved it. Awaiting the owner.
      *from: own measurement, 2026-08-30*

## Closed with a decision

- [x] **The beginner floor** — decided by the owner 2026-08-19 on the completed
      bench (36 samples across two runs; combined pass-rate even, rates
      one-sided). All three levers at once: the repetition scaffold is ON below
      level 20, the difficulty ceiling widens to 2.6× there (evidence-anchored:
      scaffold medians 2.16–2.33×), and **no reader places or calibrates below
      level 12** — the product's stated position is that true beginners belong
      in a beginner course first, said out loud on the placement page. The
      sub-12 zone stays reachable to measurement tools; readers never see it.
      *from: owner, 2026-08-17 (concept review item 3), closed 2026-08-19*

## Deferred

- [ ] **Defer the quiz to a second call** — ~27% of output tokens, and the
      reader does not need comprehension questions until minutes after they
      start. Deferred because text streaming was expected to subsume it; it does
      not on Gemini, which buffers structured output and delivers it in one
      burst. Live again if prefetch and the retry fix are not enough.
      *from: owner, deferred 2026-08-13*

## Declined

- [x] **Redact or history-rewrite `DEPLOY.md`** — declined by the owner on
      2026-08-14, on measurement rather than judgement: the host IP is already
      public via DNS, the app ports are verified closed from outside, and a force
      push does not purge GitHub. Recorded in `~/Git/.comms-accepted` and in
      `DEPLOY.md` itself so it is not re-raised.
      *from: gtfoo agent, 2026-08-14*

- [x] **Localise the sign-in email** — declined by the owner. Sign-in is a
      one-off moment and the link works regardless of the words around it, so it
      is not worth the four-language string burden the repo already flags as its
      main schedule risk.
      *from: own proposal, 2026-08-14*

- [x] **A reader-facing voice speed control** — declined by the owner on cost.
      Speed changes the audio, so it joins the cache key and each speed becomes a
      separately billed clip of the same text. Range is 0.7–1.2 if it ever comes
      back; a single "slower" preset is the cheap version.
      *from: owner request then withdrawal, 2026-08-13*

## Done

- [x] **The budget framing now flips with the zone** — the prompt had one
      wording for a problem with two opposite halves. Above the floor the
      budget must read as a target, or the model plays safe and lands near 1%;
      below it every failure on record is already OVER the ceiling, so the same
      words push the wrong way. `BENCH_MODE=framing`, 18 samples on the free
      tier: median ratio-to-budget improved at all three floor levels
      (2.80→2.10, 2.47→2.38, 2.14→1.71) with **zero** under-floor failures,
      which was the risk worth checking. First-pass rate did not move (67%
      either way, n=3 a cell), so this shipped on the rates rather than the
      pass count — the same call the scaffold got, for the same reason. It is a
      nudge, not a fix: the floor still sits near 2× budget.
      *from: own proposal, 2026-08-30*
- [x] **Glossary spot-check** — the definitions had never been measured, and a
      gloss is the one thing here that teaches a meaning DIRECTLY, to a reader
      who tapped precisely because they could not judge it. 72 glosses judged by
      claude-haiku-4-5, a different lab than wrote them (every stored piece is
      Gemini's): piece glossaries 33/36 correct, `gloss_cache` 32/36, and **zero
      "wrong" in either** — nothing in the sample was a meaning the word does
      not have. Every miss was *under*-contextualisation, which settled the open
      question about the context-free cache: one frozen sense misfits a later
      context in 2 of the 24 sampled words that appear in more than one piece,
      both mild shades ("suelo" served as "ground, soil" where a city was
      subsiding and "ground level" was meant). So the cache keeps its
      `(language, word)` key, and the gloss prompt now asks for the sense in the
      sentence instead of "the plain dictionary meaning" it had been
      contradicting while handing the model that sentence.
      `scripts/judge-glossary.ts` reruns it for ~$0.05.
      *from: own measurement gap, 2026-08-30*
- [x] **A consistency rule in the piece prompt** — the correctness spot-check's
      single flagged failure was narrative inconsistency, not grammar, and
      nothing in the prompt had ever asked for consistency. One line added,
      naming the reason: a reader at this level cannot tell a contradiction from
      a word they have misunderstood. Too rare to bench, so the next
      `judge-correctness.ts` run is the check. *from: 2026-08-17 item 4
      follow-on, 2026-08-30*
- [x] **Generation feels faster since the retry fix** — owner confirmed on
      2026-08-19, alongside prefetch making the next piece instant. The latency
      thread that started the whole optimisation arc is closed.
      *from: owner, parked 2026-08-13, verified 2026-08-19*
- [x] **Audio verified on a real phone** — playback and the word-highlighting
      handoff (switching on when the alignment lands after synthesis) both
      confirmed by the owner on a real device. The last unobserved half of the
      audio streaming work is now observed. *from: own testing gap, 2026-08-12*
- [x] **Recycle looked-up words into the next piece** — up to six of the
      reader's tapped words woven into each new generation, exempt from the
      budget like terms, shown as "brings back words you looked up" with only
      the words actually present. Verified live: a prefetched piece arrived
      carrying four of the test reader's real historical lookups.
      *from: owner, 2026-08-17 (concept review item 1)*
- [x] **Prefetch the next piece on session finish** — `/api/generate/next`,
      topic derived from the finished piece's own terms without a model call,
      idempotent before it is metered, finished-pieces-only, same
      PLANS.generate ceilings. Live check: 31s to generate behind the review
      panel, second ask 0s and identical. *from: owner, 2026-08-17 (item 2)*
- [x] **Correctness spot-check** — 15 recent pieces judged by claude-haiku-4-5
      (different lab than wrote them): es 7/8 natural, zh-CN 6/6 natural with
      zero errors, id 1/1 flagged for a narrative CONSISTENCY error (not
      grammar) — a failure class to watch as Indonesian grows. No evidence the
      app teaches wrong language at this sample. `scripts/judge-correctness.ts`
      reruns it for ~$0.03. *from: owner, 2026-08-17 (item 4)*
- [x] **Usage emission** — live in production, confirmed with real lines in
      `/var/lib/usage/1-percent-more-fluent.jsonl`. *from: gtfoo agent*
- [x] **Sign-in email states its expiry** — shipped, and shared with
      career-side-quests and indie-degree, who both adopted it. *from: owner*
- [x] **Native-speaker voices per language** — shipped after a full-length
      audition; the previous voice failed only on long pieces. *from: owner*
- [x] **Adopt the 2026-08-15 correspondence protocol** — mail un-ignored and
      tracked, archive and this file created, outbox letters delivered to their
      recipients. *from: droplet agent via `INFRA.md`*
