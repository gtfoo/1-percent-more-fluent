# Deploying to 1-percent-more-fluent.gtfoo.com

Same shape as Carpark SG: a systemd service on the droplet behind Caddy, with
GitHub Actions pushing deploys over SSH. Everything below the "one-time setup"
line is automatic afterwards — push to `main` and it deploys.

**This app cannot go serverless.** It writes a SQLite database and caches
synthesised audio on disk, and both must survive a deploy. It needs a box with
a persistent filesystem.

---

## The one thing that will bite you

Next's standalone server runs `process.chdir(__dirname)` on its sixth line, so
in production the working directory is `.next/standalone` — **a directory every
rebuild deletes and recreates**.

Anything resolved from `process.cwd()` therefore points inside the build
output. Left alone, each deploy would start from a brand-new empty database and
orphan the entire audio cache, which costs real money to regenerate. Nothing
errors; the app just quietly forgets everything.

So `DATA_DIR` is set explicitly in the unit file below, and
[src/server/paths.ts](src/server/paths.ts) throws at startup if it ever
resolves inside `.next/standalone`. Do not remove that guard.

Verify the standalone build locally before trusting a deploy — `next dev` does
not chdir, so this class of bug is invisible until you run the real thing:

```bash
npm run build && bash scripts/try-standalone.sh
```

---

## One-time setup

### 1. DNS

An `A` record for `1-percent-more-fluent.gtfoo.com` pointing at the droplet's
IP. If it is behind Cloudflare, set it to **DNS only** (grey cloud) until Caddy
has issued a certificate, or the ACME challenge will fail.

### 2. On the droplet

```bash
cd ~ && git clone git@github.com:gtfoo/1-percent-more-fluent.git
cd 1-percent-more-fluent
```

Create `.env.local` — it is gitignored, so it lives only on the server:

```bash
GOOGLE_GENERATIVE_AI_API_KEY=...
ELEVENLABS_API_KEY=...

# Optional, all have sensible defaults:
# LLM_MODELS=gemini-3.5-flash,gemini-flash-latest
# ELEVENLABS_VOICE_ID=Xb7hH8MSUJpSbSDYk0k2
# ELEVENLABS_MODEL_ID=eleven_multilingual_v2
# ELEVENLABS_MAX_CHARS=6000
```

Then build the word data and the app once by hand, so the first deploy is not
also the first build:

```bash
npm ci
npx tsx scripts/build-wordlist.ts
LANGUAGE=zh-CN npx tsx scripts/build-wordlist.ts
npm run build
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public
```

### 3. systemd

`/etc/systemd/system/fluent.service`:

```ini
[Unit]
Description=1 Percent More Fluent
After=network.target

[Service]
Type=simple
User=deploy
WorkingDirectory=/home/deploy/1-percent-more-fluent
EnvironmentFile=/home/deploy/1-percent-more-fluent/.env.local

# The two that matter. DATA_DIR must point OUTSIDE the build output - see the
# note at the top of this file.
Environment=DATA_DIR=/home/deploy/1-percent-more-fluent/data
Environment=NODE_ENV=production
Environment=PORT=3100
Environment=HOSTNAME=127.0.0.1

ExecStart=/usr/bin/node .next/standalone/server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

Check `PORT=3100` is not already taken — `ss -ltnp | grep 3100`. Carpark SG is
on this box too.

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now fluent
sudo systemctl status fluent
```

Let the deploy user restart it without a password —
`/etc/sudoers.d/fluent-deploy`, created with `visudo -f`:

```
deploy ALL=(root) NOPASSWD: /bin/systemctl restart fluent
```

### 4. Caddy

Add to the `Caddyfile`, then `sudo systemctl reload caddy`:

```
1-percent-more-fluent.gtfoo.com {
    reverse_proxy localhost:3100
}
```

Caddy obtains and renews the certificate itself. Audio is served by the app
rather than by Caddy, so there is no static-file rule to keep in sync — the
route handler does byte ranges properly, which audio seeking needs.

### 5. GitHub secrets

`Settings → Secrets and variables → Actions`:

| Secret | Value |
|---|---|
| `DROPLET_HOST` | droplet IP or hostname |
| `DROPLET_USER` | `deploy` |
| `DROPLET_SSH_KEY` | private key whose public half is in the deploy user's `authorized_keys` |
| `DROPLET_PORT` | SSH port, omit for 22 |
| `FLUENT_APP_DIR` | `/home/deploy/1-percent-more-fluent` |

---

## After that

Push to `main`. The workflow SSHes in, hard-resets to `origin/main`, and runs
[scripts/deploy.sh](scripts/deploy.sh): `npm ci` (which recompiles
better-sqlite3 for the host), `next build`, copy the standalone extras, restart.

By hand, if ever needed:

```bash
cd ~/1-percent-more-fluent && git pull --ff-only && bash scripts/deploy.sh
```

```bash
sudo journalctl -u fluent -f
```

## What persists, and what does not

`data/` is gitignored and never touched by a deploy. It holds
`fluent.sqlite` — every profile, piece and session — and `data/audio`, the
synthesised speech.

**Back up `data/`.** The database is the only record of what anyone has read,
and the audio cache represents money already spent with ElevenLabs. Losing it
is not fatal but it is not free either.

`src/data/` (the frequency lists) is also gitignored but costs nothing to
rebuild; `deploy.sh` regenerates it automatically if it is missing.

## Cost, with no access control

The site is public and there is no login, so anyone with the URL can generate
text and speech on your keys. Text is negligible. Speech is not: $0.10 per
1,000 characters, roughly 24 cents for a 400-word story.

The only guard in the code is `ELEVENLABS_MAX_CHARS`, which caps a *single*
request at 6,000 characters. It does nothing about volume. The practical
control is the ElevenLabs balance itself — keep it small, and top up as needed
rather than holding a large prepaid balance. The home page shows the running
character total.
