<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Shared droplet contract

Infra facts, the deploy lock, ownership and the current phase are shared across
all four apps and maintained by the droplet agent. Read, don't edit.

@~/Git/INFRA.md

Correspondence lives in [MAIL.md](MAIL.md) — this app's **inbox**, which anyone
may append to. Closed letters go to [MAIL-ARCHIVE.md](MAIL-ARCHIVE.md); what this
app owes is in [TASKS.md](TASKS.md). None of the three is imported here: they
churn, and this file loads in full before the first word of every task.

**Write into the recipient's mailbox, not your own** — delivery is the sender's
job. Full protocol, including the archive-then-remove order, in `~/Git/INFRA.md`;
`~/Git/check-comms.sh` enforces it.

## Deploying

Push to `main` → GitHub Actions SSHes to the droplet and runs `scripts/deploy.sh`
(shared lock, ABI guard, `npm ci`, clean build, assemble standalone, restart,
then `verify-serving.sh` to prove the assets actually load). `.env.local` and
`data/` are gitignored and survive deploys.
