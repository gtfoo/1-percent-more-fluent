<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Shared droplet contract

Infra facts, the deploy lock, ownership and the current phase are shared across
all four apps and maintained by the droplet agent. Read, don't edit.

@~/Git/INFRA.md

Correspondence: [MAIL.md](MAIL.md) is this app's inbox, closed letters go to
[MAIL-ARCHIVE.md](MAIL-ARCHIVE.md), and what this app owes is in
[TASKS.md](TASKS.md). None of the three is imported here — they churn, and this
file loads in full before the first word of every task. The protocol itself
lives ONLY in `INFRA.md` above (imported into every session already, so a local
copy adds no reach and can only drift); `~/Git/check-comms.sh` enforces it. A
`SessionStart` hook in `.claude/settings.json` announces unread letters.

## Deploying

Push to `main` → GitHub Actions SSHes to the droplet and runs `scripts/deploy.sh`
(shared lock, ABI guard, `npm ci`, clean build, assemble standalone, restart,
then `verify-serving.sh` to prove the assets actually load). `.env.local` and
`data/` are gitignored and survive deploys.

### The Node version lives in `.nvmrc`, and nowhere else

Production has always run Node 22. Local pinned Node 20 in nineteen separate
scripts, and nobody noticed for weeks — which meant a green local check was
proving nothing about the box, the same class of gap that once took the site
down. `.nvmrc` is now the single source; every script reads it as

```
nvm use "$(cat "$(dirname "$0")/../.nvmrc")"
```

**Relative to `$0`, never a bare `nvm use`.** Seven of the nineteen run their
nvm block before `cd`-ing to the repo root and five never `cd` at all, so a bare
`nvm use` reads whatever directory the caller was standing in and silently falls
back to nvm's default — which is still 20. Bump the version in `.nvmrc` alone.

`better-sqlite3` is compiled per ABI (22 → 127). After any Node change, rebuild
and check by **constructing** the binding, not requiring it: a bare `require`
exits 0 on a genuine mismatch and proves nothing.
