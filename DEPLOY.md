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

## The droplet as it actually is

Discovered by inspection, so the commands below use real values rather than
placeholders:

| | |
|---|---|
| Host | `167.71.196.128`, `ubuntu-s-1vcpu-1gb-sgp1` — **1 vCPU, 1GB**, with a 2GB swapfile |
| Deploy user | `deploy`, reachable with the existing `~/.ssh/carpark_deploy` key |
| Apps live at | `/home/deploy/<name>` — `carpark` (3001), `career-side-quests` (3002), `gtfoo` (3000) |
| This app | `/home/deploy/1-percent-more-fluent`, port **3100** (confirmed free) |
| Node | v20.20.2 at `/usr/bin/node` |

**The deploy user has almost no sudo.** `sudo -l` reports exactly one
permitted command: `/usr/bin/systemctl restart carpark`. So creating the
systemd unit, editing the Caddyfile and reloading Caddy all need a separate
root session — they cannot be automated through the deploy account, and the
GitHub Actions deploy will not work until the sudoers line below is added.

The 2GB swapfile is what lets `next build` finish on a 1GB box. Do not remove it.

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

# Strongly recommended on the server. Google's free tier is 20 requests a day
# for the whole droplet, shared by every visitor, and generation simply stops
# when it runs out. The chain falls through to another lab instead.
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...

# Optional, all have sensible defaults:
# LLM_MODELS=google:gemini-3.5-flash,anthropic:claude-haiku-4-5
# ELEVENLABS_VOICE_ID=Xb7hH8MSUJpSbSDYk0k2
# ELEVENLABS_MODEL_ID=eleven_multilingual_v2
# ELEVENLABS_MAX_CHARS=6000

# Optional. Sign-in by magic link, so a level follows you between devices.
# Omitting all four leaves the app exactly as it is without them: no sign-in
# offered, /api/auth/* answers 404.
# AUTH_SECRET="..."                 # openssl rand -base64 32, QUOTED - see below
# AUTH_RESEND_KEY=re_...
# AUTH_EMAIL_FROM=login@gtfoo.com
# AUTH_URL=https://1-percent-more-fluent.gtfoo.com
# AUTH_PASSKEYS=1                   # optional, experimental - see below
```

Passkeys are opt-in because WebAuthn is still **experimental** in Auth.js: it
refuses to boot without an experimental flag and warns on every start. Removing
the line turns them off without a code change. They require HTTPS, which the
deployed site has, and they bind to the domain — a passkey registered against
`localhost` will not work on the deployed site and vice versa.

A passkey can only ever be **added by someone already signed in**. Auth.js's
default would register a brand-new account for any unrecognised address, with
the email unverified because nothing was ever sent to it — so squatting a
passkey on someone's address, then waiting for them to sign in by magic link,
would hand you their account. The `getUserInfo` override in `src/auth.ts`
refuses that.

Two ways sign-in fails **silently**, both learned the hard way on
`career-side-quests`:

- **An unquoted `AUTH_SECRET`.** `openssl rand -base64 32` can emit a `#`, and
  dotenv reads that as the start of a comment and discards the rest, so the
  variable parses as missing. The symptom is a sign-in page insisting nothing is
  configured while the line sits plainly in the file. Quote it.
- **A subdomain sender.** Resend treats `1-percent-more-fluent.gtfoo.com` as a
  different domain from `gtfoo.com`, needing its own DNS records. `gtfoo.com` is
  already verified there, so `login@gtfoo.com` works today. Sending from the
  unverified subdomain produces no error anywhere — the mail just never arrives.

A provider with no key is dropped from the chain rather than tried, so adding
just one of the two optional keys is fine — and adding neither leaves behaviour
exactly as it was. After editing `.env.local`, restart the service: systemd
reads it via `EnvironmentFile` at start, so a change does nothing until then.

```bash
sudo systemctl restart fluent
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

### 3. systemd — **needs root**

Everything in this section and the next requires a root session; the `deploy`
user cannot do any of it.

```bash
sudo tee /etc/systemd/system/fluent.service > /dev/null <<'EOF'
[Unit]
Description=1 Percent More Fluent
After=network.target

[Service]
Type=simple
User=deploy
WorkingDirectory=/home/deploy/1-percent-more-fluent
EnvironmentFile=/home/deploy/1-percent-more-fluent/.env.local
Environment=DATA_DIR=/home/deploy/1-percent-more-fluent/data
Environment=NODE_ENV=production
Environment=PORT=3100
Environment=HOSTNAME=127.0.0.1
ExecStart=/usr/bin/node .next/standalone/server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

# The deploy user must be able to restart it, or GitHub Actions cannot deploy.
echo 'deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart fluent' \
  | sudo tee /etc/sudoers.d/fluent-deploy > /dev/null
sudo chmod 440 /etc/sudoers.d/fluent-deploy
sudo visudo -c

# Free port 3100 first if a temporary process is holding it.
sudo pkill -f 'standalone/server.j[s]' || true

sudo systemctl daemon-reload
sudo systemctl enable --now fluent
sudo systemctl status fluent --no-pager
```

Notes on that unit:

- `DATA_DIR` is the line that matters. It must point outside the build output —
  see the warning at the top of this file.
- `EnvironmentFile` reads `.env.local` directly. systemd's parser wants plain
  `KEY=value` with no `export` and no quotes, which is what the file contains.
- `carpark.service` uses `npm run start` instead; this app needs
  `node .next/standalone/server.js` because it builds with `output: "standalone"`.

**Two deploys can collide.** GitHub's `concurrency` group only serialises runs
within a repository, so a push to `carpark-sg` and a push here can build on the
droplet at the same time. Two simultaneous `npm ci` + `next build` on a 1GB box
is what the 2GB swapfile is protecting against. If a build dies anyway, look for
`sudo dmesg | grep -i oom`.

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

**GitHub secrets are per-repository.** The ones on `carpark-sg` are not visible
here — `gtfoo` is a personal account, so there are no organisation secrets to
inherit. All five have to be added again on this repo, with the same names as
carpark uses and only `DROPLET_APP_DIR` differing in value.

`Settings → Secrets and variables → Actions`, or with the CLI:

```bash
gh auth login
gh secret set DROPLET_HOST    -R gtfoo/1-percent-more-fluent
gh secret set DROPLET_USER    -R gtfoo/1-percent-more-fluent
gh secret set DROPLET_SSH_KEY -R gtfoo/1-percent-more-fluent < ~/.ssh/id_droplet
gh secret set DROPLET_PORT    -R gtfoo/1-percent-more-fluent   # omit for 22
gh secret set DROPLET_APP_DIR -R gtfoo/1-percent-more-fluent
```

| Secret | Value |
|---|---|
| `DROPLET_HOST` | `167.71.196.128` |
| `DROPLET_USER` | `deploy` |
| `DROPLET_SSH_KEY` | the same key carpark uses — `~/.ssh/carpark_deploy` already authenticates as `deploy` |
| `DROPLET_PORT` | omit; SSH is on 22 |
| `DROPLET_APP_DIR` | `/home/deploy/1-percent-more-fluent` — the only value that differs from carpark's |

Check them with `gh secret list -R gtfoo/1-percent-more-fluent`.

### Order matters

Steps 1–4 must be done **before** the first successful deploy. The workflow
only pulls and rebuilds; it does not clone the repo, write `.env.local`, or
create the systemd unit. Until the droplet is set up, pushes to `main` will
show a red X in Actions — that is expected, not a broken workflow.

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

## Troubleshooting

### The service restart-loops on `EADDRINUSE`

```bash
systemctl show fluent -p NRestarts --value   # climbing = looping
journalctl -u fluent -n 20 --no-pager
```

Something else holds port 3100. **Do not try to kill it by command-line
pattern** — Next rewrites its process title to `next-server (v16.2.10)` once
running, so `pkill -f standalone/server.js` matches nothing and appears to
succeed. Kill by port, and stop systemd first so it is not racing you for the
socket:

```bash
systemctl stop fluent
for pid in $(ss -ltnp | grep ':3100 ' | grep -oP 'pid=\K[0-9]+' | sort -u); do kill -9 "$pid"; done
systemctl reset-failed fluent
systemctl start fluent
```

Then confirm it is genuinely stable rather than merely up — `NRestarts` must
not move:

```bash
systemctl show fluent -p NRestarts --value; sleep 15; systemctl show fluent -p NRestarts --value
```


### `ERR_SSL_PROTOCOL_ERROR`

Run `bash scripts/diagnose-tls.sh` from anywhere. It probes the target, a
hostname that definitely does not exist, and a known-good one, all against the
same IP. **The comparison is the diagnosis:**

- Target behaves like the **bogus** name (both "no certificate") → Caddy does
  not know this hostname. The site block is missing from the config Caddy is
  actually running. Not a certificate problem.
- Target gets a certificate but the browser still complains → a real TLS or
  cert problem; check the issuer and expiry it prints.
- Target does not resolve → DNS, not Caddy.

For the first case, on the droplet:

```bash
# Is it in the file?
grep -n "1-percent-more-fluent" /etc/caddy/Caddyfile

# Is it in the RUNNING config? This is the one that matters - the admin API
# reports what Caddy actually loaded, not what the file says.
curl -s localhost:2019/config/ | grep -o "1-percent-more-fluent[^\"]*" \
  || echo "NOT in the running config"

# Syntax check before reloading; a bad reload leaves the OLD config running,
# which looks exactly like having changed nothing.
sudo caddy validate --config /etc/caddy/Caddyfile

sudo systemctl reload caddy
sudo journalctl -u caddy -n 40 --no-pager
```

A successful reload obtains the certificate within a few seconds — look for
`certificate obtained successfully` in the log. Note that port 80 returning a
308 redirect proves nothing: Caddy redirects http→https for *any* hostname,
including ones it has never heard of.

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
