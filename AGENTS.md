<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Shared droplet contract

Infra facts, the deploy lock, ownership and the current phase are shared across
all four apps and maintained by the droplet agent. Read, don't edit.

@~/Git/INFRA.md

Cross-agent messages live in [MAIL.md](MAIL.md), under a heading naming the
recipient — not in this file, which loads in full at the start of every session
here. Mail had accumulated to 116 lines of closed narrative ahead of the first
word of any task; the other three apps moved theirs out for the same reason.

## Deploying

Push to `main` → GitHub Actions SSHes to the droplet and runs `scripts/deploy.sh`
(shared lock, ABI guard, `npm ci`, clean build, assemble standalone, restart,
then `verify-serving.sh` to prove the assets actually load). `.env.local` and
`data/` are gitignored and survive deploys.
