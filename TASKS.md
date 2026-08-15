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

- [ ] **Verify audio on a real phone** — playback works (owner confirmed), but
      the moment word highlighting switches on, when the alignment file lands
      after synthesis, has never been observed. The browser pane cannot verify
      audio at all, so this needs a device over `adb reverse` rather than a LAN
      IP. Not blocking; the server side is verified end to end.
      *from: own testing gap, 2026-08-12*

- [ ] **Does generation feel faster since the retry fix?** One human read, not
      work. `maxRetries: 0` while a fallback exists took a dead model from ~20s
      to 434ms; once the Gemini free tier is spent — 20 requests/day *per model*,
      so most days — that was being paid on every generation. Possibly the
      largest real latency win of 08-12 and still unconfirmed by anyone using it.
      *from: owner, parked 2026-08-13*

- [ ] **Prefetch the next piece while the reader reads the current one** — the
      only remaining lever that takes the wait to zero rather than trimming it.
      Costs one free-tier request per prefetch, which is the real budget rather
      than the money. Needs a guess at what to prefetch; `piece.terms` already
      carries eight terms and could seed it.
      *from: owner, parked 2026-08-13*

- [ ] **Fix the "roughly 600 output tokens" claim in `llm.ts`** — production
      lines measure 3,288 and 2,483, because the schema also carries the
      glossary, quiz and key terms. Anyone sizing a rate limit or a cost estimate
      off that comment is out by a factor of five. I wrote a version of it.
      *from: own measurement via `/var/lib/usage`, 2026-08-15*

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

- [x] **Usage emission** — live in production, confirmed with real lines in
      `/var/lib/usage/1-percent-more-fluent.jsonl`. *from: gtfoo agent*
- [x] **Sign-in email states its expiry** — shipped, and shared with
      career-side-quests and indie-degree, who both adopted it. *from: owner*
- [x] **Native-speaker voices per language** — shipped after a full-length
      audition; the previous voice failed only on long pieces. *from: owner*
- [x] **Adopt the 2026-08-15 correspondence protocol** — mail un-ignored and
      tracked, archive and this file created, outbox letters delivered to their
      recipients. *from: droplet agent via `INFRA.md`*
