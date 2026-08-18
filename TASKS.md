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

- [ ] **The beginner floor: rerun the bench, then decide budget vs scope** —
      the repetition scaffold FAILED its bench (plain 6/9 at levels 8–16,
      scaffold 2/9, level 8 passing nothing either way) and now ships
      **dormant**: default off, bench-only, with a check-recycle tripwire
      against re-enabling it unmeasured. Two fixes have now failed at the
      floor, which points at the budget window itself. The rerun that would say
      whether failures sit over the ceiling or under the asymmetric floor —
      the fixed report distinguishes them — was blocked twice on 08-17:
      `gemini-3.5-flash` quota spent by run one (whose report bug ate the
      rates), `gemini-flash-latest` in transient overload. `BENCH_MODE=floor
      npx tsx scripts/bench-difficulty.ts --run` on a fresh quota day answers
      it; the decision after that is the owner's: widen the floor-level budget
      window, or scope the app honestly to ~A2+.
      *from: owner, 2026-08-17 (concept review item 3)*

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
