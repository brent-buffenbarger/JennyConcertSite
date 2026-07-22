# Deployment Guide

End-to-end walkthrough for shipping Jenny & Brent's Concert Log to the public internet.

**The shape of the deployment:**

- **Frontend** (React SPA) → **Cloudflare Pages**. Free, auto-deploys on every push to `main`.
- **Backend** (FastAPI, needs macOS Notes access) → runs on **your Mac**, exposed to the internet through a free **Cloudflare Tunnel**.
- **Uploaded photos + Apple Notes** → stay on your Mac. The Mac is the source of truth.
- **Editing** → protected by HTTP Basic auth. Public browsing is open; adding/editing requires the shared password you set up.
- **Cost:** ~$10/year for the domain. Everything else is free.
- **Trade-off:** your Mac must stay on and connected for editing and photo uploads to work. If the Mac sleeps or reboots, editing breaks until it's back. Public browsing keeps working if you cache aggressively — see the "Optional resilience" section at the end.

The whole setup takes about 90 minutes end to end, mostly waiting for DNS.

---

## Part 1 &mdash; Prerequisites

Before you start, you'll want:

1. **A domain name.** Cheapest reliable registrar for a `.com` is Cloudflare Registrar itself (~$10/year, at cost, no markup). Namecheap and Porkbun are the next cheapest. Skip GoDaddy.
2. **A Cloudflare account.** Free at [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up).
3. **A GitHub account** with access to the `brent-buffenbarger/JennyConcertSite` repo. You already have this.
4. **`cloudflared` installed locally** on your Mac. We'll cover this in Part 3.

You do **not** need an AWS account. You do **not** need a credit card for Cloudflare Pages / R2 free tier / Tunnel.

---

## Part 2 &mdash; Buy the domain and put it on Cloudflare

If you already own a domain and it's already on Cloudflare, skip to Part 3.

### 2a. Register the domain

Two paths:

**Easiest &mdash; buy it on Cloudflare directly:**

1. Sign in to [dash.cloudflare.com](https://dash.cloudflare.com).
2. Go to **Domain Registration → Register Domains**.
3. Search for the name you want. Aim for `.com` if available; it's the most universally understood. Pick something short. `jennyconcerts.com` if you can, otherwise `jennysshows.com` or similar.
4. Buy it. Cloudflare bills at cost (~$10/year for a `.com`, ~$8/year for some other TLDs). No renewal upsells, no privacy add-ons to buy separately.

If you buy through Cloudflare Registrar, DNS is automatically hosted on Cloudflare and you can skip to Part 3.

**If you already have a domain at another registrar:**

1. Sign in to Cloudflare.
2. Click **+ Add a domain**. Enter the domain.
3. Choose the **Free** plan.
4. Cloudflare will show you two nameservers (like `art.ns.cloudflare.com`, `lea.ns.cloudflare.com`).
5. Log into your current registrar and change the domain's nameservers to the two Cloudflare gave you. DNS propagation takes anywhere from 5 minutes to 24 hours.
6. Wait for Cloudflare to send you a "Your domain is now active" email. Don't proceed until you see that.

---

## Part 3 &mdash; Push the code to GitHub

The repo `brent-buffenbarger/JennyConcertSite` is empty. Time to push the current codebase.

Run these from the project root (`/Users/brent/Projects/Hobby/JennyConcertWebsite`):

```bash
# Verify the .gitignore is in place before initializing.
cat .gitignore | head -5   # should print .DS_Store, .AppleDouble, etc.

# Initialize the repo, add the remote, stage everything.
git init -b main
git remote add origin git@github.com:brent-buffenbarger/JennyConcertSite.git
git add .
git status  # scan the list for anything sensitive (like backend/.env) and abort if you see one

git commit -m "Initial commit: concert journal site"
git push -u origin main
```

If `git push` fails because of SSH auth, you'll need to add your SSH key to GitHub: [github.com/settings/keys](https://github.com/settings/keys).

**Sanity check:** open [github.com/brent-buffenbarger/JennyConcertSite](https://github.com/brent-buffenbarger/JennyConcertSite) and confirm the code is there. You should see the `.github/workflows/ci.yml` file &mdash; the CI job will run automatically. Check the **Actions** tab and confirm both `Frontend build` and `Backend tests` pass green.

If CI fails, fix it first before proceeding. A red CI means the code won't deploy cleanly.

---

## Part 4 &mdash; Deploy the frontend to Cloudflare

Cloudflare has merged Pages into **Workers Builds**. The new flow expects a `wrangler.jsonc` config that tells Cloudflare how to publish your build output. The good news: **the config is already checked into this repo** at `wrangler.jsonc`, and it publishes `frontend/dist/` as a static-assets Worker with SPA routing support. So the setup is:

1. Add the repo through the Workers Builds onboarding.
2. Fill in the fields as described below.
3. Save. Cloudflare builds and deploys automatically.

You still get a free `*.workers.dev` (or `*.pages.dev` &mdash; naming varies) subdomain, the same free unlimited bandwidth, and the same automatic redeploys on push to `main`.

### 4a. Connect the repo

1. In the Cloudflare dashboard, go to **Workers & Pages** → **Create** → **Import a repository**.
2. Authorize Cloudflare to access your GitHub account. Grant access to the `JennyConcertSite` repo only (don't grant your whole account).
3. Select the repo. Cloudflare kicks you into the build configuration screen.

### 4b. Fill in the fields exactly like this

| Field on the screen | What to enter | Notes |
| --- | --- | --- |
| **Project name** | `jenny-concerts` (or anything) | Becomes your free `*.workers.dev` subdomain. Lowercase, no spaces. Must match the `name` field in `wrangler.jsonc` &mdash; if you change one, change both. |
| **Production branch** | `main` | Should already be pre-filled. |
| **Build command** | `cd frontend && npm ci && npm run build` | The `cd frontend` matters because our repo has the SPA in a subdirectory. |
| **Deploy command** | `npx wrangler deploy` | This is what publishes the Worker. It reads `wrangler.jsonc` at the repo root and uploads `frontend/dist/`. |
| **Builds for non-production branches** | *checked* (default) | So preview deploys build automatically when you push to any non-main branch. Fine to leave on. |

### 4c. Advanced settings

Expand the **Advanced settings** dropdown:

| Field | Value |
| --- | --- |
| **Non-production branch deploy command** | `npx wrangler versions upload` | Publishes a preview version instead of promoting to production. This is the recommended default; you can leave it as whatever Cloudflare pre-fills. |
| **Path** | *leave empty* | Not used when `wrangler.jsonc` is present; the assets directory is set inside the config file. |
| **API token** | click **Create new token** | Cloudflare generates one automatically with the permissions Wrangler needs. |
| **API token name** | auto-fills after creating the token | No action required. |

### 4d. Environment variables

Still in Advanced settings, find the **Variables and secrets** section and add one variable:

| Variable name | Variable value | Type |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `https://api.jennyconcerts.com` | plaintext |

Replace `api.jennyconcerts.com` with `api.<your-domain>` &mdash; whatever hostname you plan to use for the backend tunnel. You'll wire the DNS for this in Part 5, so it's fine if the hostname doesn't resolve yet; the frontend just needs to know where to send requests once it's live.

The type **must** be `plaintext`, not `secret`. Vite reads env vars at build time; Cloudflare only exposes plaintext variables to the build.

### 4e. Save and deploy

Click **Save and Deploy** at the bottom.

Cloudflare will:
1. Clone the repo.
2. Run `cd frontend && npm ci && npm run build`. This produces `frontend/dist/`.
3. Run `npx wrangler deploy`. Wrangler reads `wrangler.jsonc` at the repo root, finds `assets.directory = "./frontend/dist"`, and uploads those files as a Worker with static-asset handling.
4. Assign your project a `https://jenny-concerts.<something>.workers.dev` URL (or a Pages-style URL &mdash; Cloudflare is in the middle of unifying these).
5. Watch for pushes to `main` and redeploy automatically. This is your CD.

The first build takes ~2 minutes. Watch the deploy log in real time from the project's **Deployments** tab &mdash; that's also where you go to debug if the build fails.

### 4f. Confirm the deploy landed

Open the URL when the build finishes. **The site will load but every interaction will fail** because the backend isn't reachable yet. That's expected. On to Part 5.

### Troubleshooting Part 4

- **Build fails with "package.json not found":** the Build command isn't `cd`-ing into `frontend/` first. Fix it to `cd frontend && npm ci && npm run build`.
- **Deploy fails with "wrangler.jsonc not found":** the config file isn't at the repo root. Confirm `git ls-files | grep wrangler` shows `wrangler.jsonc` at the top level.
- **Deploy fails with "assets directory ./frontend/dist not found":** the build ran but produced output somewhere else. Check the build log for where Vite says it wrote files, then update `wrangler.jsonc`'s `assets.directory`.
- **Site loads but every route except `/` returns 404:** the `not_found_handling` in `wrangler.jsonc` isn't set. Confirm the config file has `"not_found_handling": "single-page-application"`. Push a fix and Cloudflare will redeploy.
- **Environment variable not applied:** confirm the variable is set as **plaintext**, not secret, and that it's set on the **Production** environment (or on both if you also want it in previews). Trigger a redeploy from the Deployments tab; Vite reads env vars only at build time, so changing the variable requires a fresh build.
- **CORS errors in browser devtools after Part 6:** the API URL in `VITE_API_BASE_URL` doesn't match what's in the backend's `ALLOWED_ORIGINS`, OR the site's origin isn't in `ALLOWED_ORIGINS`. Fix both sides.

---

## Part 5 &mdash; Expose the local backend via Cloudflare Tunnel

This is the piece that lets the public site talk to your Mac.

### 5a. Install cloudflared

```bash
brew install cloudflared
cloudflared --version   # confirm it installed
```

### 5b. Authenticate

```bash
cloudflared tunnel login
```

A browser opens. Sign in to Cloudflare, pick your domain (the one you set up in Part 2). This drops a `cert.pem` at `~/.cloudflared/cert.pem` &mdash; that's how cloudflared knows which Cloudflare account to talk to.

### 5c. Create a tunnel

```bash
cloudflared tunnel create jenny-concerts
```

This prints a **tunnel ID** (a UUID) and creates a credentials file at `~/.cloudflared/<tunnel-id>.json`. Note the UUID; you'll paste it into a config file next.

### 5d. Configure the tunnel

Create `~/.cloudflared/config.yml`:

```yaml
tunnel: <paste-the-tunnel-id-here>
credentials-file: /Users/brent/.cloudflared/<paste-the-tunnel-id-here>.json

ingress:
  - hostname: api.jennyconcerts.com
    service: http://localhost:8000
  - service: http_status:404
```

Replace `<paste-the-tunnel-id-here>` with the UUID from step 5c (both places).
Replace `api.jennyconcerts.com` with `api.<your-domain>`.

### 5e. Point DNS at the tunnel

```bash
cloudflared tunnel route dns jenny-concerts api.jennyconcerts.com
```

This adds a CNAME record to Cloudflare DNS pointing `api.jennyconcerts.com` to your tunnel. It resolves within seconds.

### 5f. Start the tunnel

```bash
cloudflared tunnel run jenny-concerts
```

Leave that running in a terminal for now. In another terminal, start the backend:

```bash
cd /Users/brent/Projects/Hobby/JennyConcertWebsite
source .venv/bin/activate
uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

Test it from anywhere:

```bash
curl https://api.jennyconcerts.com/health
# {"status":"ok"}
```

If you see that, the tunnel is live. Congrats.

---

## Part 6 &mdash; Set the backend env vars for production

Edit `backend/.env` (this file is gitignored and only lives on your Mac):

```dotenv
# Existing OpenAI keys, unchanged
OPENAI_API_KEY=your_api_key_here
OPENAI_MODEL=gpt-5.6
OPENAI_ENRICHMENT_ENABLED=true

# NEW: admin credentials for the shared password
# Pick a long random password. Anyone with these can add/edit/delete on the public site.
ADMIN_USERNAME=jenny
ADMIN_PASSWORD=<generate-a-long-random-password>

# NEW: allow the Cloudflare Pages origin(s) to call the API
# Include both the *.pages.dev URL and your custom domain if you set one up (Part 8).
ALLOWED_ORIGINS=https://jenny-concerts.pages.dev,https://jennyconcerts.com
```

Generate a strong password:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(24))"
```

Restart the backend (`Ctrl+C` in the uvicorn terminal, re-run the `uvicorn` command). Now hit the site &mdash; add a show, sync from Notes, upload a photo. When you first try to save, the site prompts for the username and password you just set. Enter them, they persist for the session.

---

## Part 7 &mdash; Make the backend + tunnel start on Mac boot

You don't want to remember to start these every time. macOS has `launchd` for exactly this.

### 7a. Backend service

Create `~/Library/LaunchAgents/com.jenny.concerts-backend.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.jenny.concerts-backend</string>
  <key>WorkingDirectory</key>
  <string>/Users/brent/Projects/Hobby/JennyConcertWebsite</string>
  <key>ProgramArguments</key>
  <array>
    <string>/Users/brent/Projects/Hobby/JennyConcertWebsite/.venv/bin/uvicorn</string>
    <string>app.main:app</string>
    <string>--app-dir</string>
    <string>backend</string>
    <string>--host</string>
    <string>127.0.0.1</string>
    <string>--port</string>
    <string>8000</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/jenny-backend.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/jenny-backend.err.log</string>
</dict>
</plist>
```

> **Copy-paste warning:** when you copy the XML above into a file, make sure the terminal or editor does not wrap long lines. If a `<string>` value ends up with a literal newline inside it (for example the path becomes `.venv/bin/\nuvicorn`), launchd will silently reject the job with `Load failed: 5: Input/output error` even though `plutil` will report the file as "OK". If you hit that error, open the file in a real editor and confirm each `<string>...</string>` is on a single line.

Load it:

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.jenny.concerts-backend.plist
```

> **Note on `load` vs. `bootstrap`:** older docs (including some Apple ones) tell you to use `launchctl load`. That command still exists but is deprecated and produces cryptic errors on modern macOS. Use `bootstrap` / `bootout` / `kickstart` as shown throughout this doc.

### 7b. Tunnel service

The easiest way is to let `cloudflared` install itself as a launchd service:

```bash
sudo cloudflared service install
```

That reads `~/.cloudflared/config.yml` and installs a system-level launchd job that starts the tunnel on boot.

### 7c. Prevent your Mac from sleeping (or accept the trade-off)

If your Mac sleeps, the tunnel and backend stop responding. Options:

- **In System Settings → Displays → Advanced**, set "Prevent automatic sleeping on power adapter when the display is off" to on. This is the cleanest option if the Mac is plugged in.
- Or wrap the launchd job with `caffeinate -i` in front of uvicorn (dirtier).
- Or accept that the site's editing goes offline when the Mac sleeps; browsing may still work depending on caching.

---

## Part 8 &mdash; Custom domain for the frontend (optional but recommended)

Right now the site is at `jenny-concerts.pages.dev`. That works, but you already bought a domain in Part 2. Use it.

1. In Cloudflare Pages → your project → **Custom domains** → **Set up a custom domain**.
2. Enter `jennyconcerts.com` (or `www.jennyconcerts.com` &mdash; pick one and stick with it).
3. Cloudflare auto-adds the DNS records because the domain is on Cloudflare.
4. Wait 30-60 seconds. The domain becomes live with HTTPS automatically.

**Update `ALLOWED_ORIGINS` in `backend/.env`** to include the custom domain, then restart the backend so CORS accepts it.

---

## Part 9 &mdash; Test the full loop

From a device that isn't your Mac (phone, laptop on cellular, incognito browser):

1. Open the site at your custom domain.
2. Browse. Cards, list view, atlas &mdash; everything should render.
3. Click **Sign in**. Enter the admin credentials.
4. Add a test show. It should save.
5. Open Apple Notes on your Mac and confirm the show is there.
6. Delete the test show from Apple Notes (or leave it &mdash; it's your log).
7. Click **Sync** on the site. Confirm the site updates.

If any step fails, check:
- **Sign in fails:** wrong credentials in `backend/.env`, or CORS blocked (check browser devtools console).
- **Adding a show 400s or 500s:** backend logs at `/tmp/jenny-backend.log` and `/tmp/jenny-backend.err.log`.
- **Site loads but no API calls succeed:** the tunnel is down. Run `cloudflared tunnel info jenny-concerts` to check status.

---

## Ongoing costs

| Item | Cost |
| --- | --- |
| Domain (Cloudflare Registrar `.com`) | ~$10/year |
| Cloudflare Pages | $0 |
| Cloudflare Tunnel | $0 |
| Cloudflare DNS | $0 |
| GitHub (public or private repo) | $0 |
| GitHub Actions (free tier: 2000 min/month private, unlimited public) | $0 |
| OpenAI enrichment (existing) | whatever you already pay |

**Total new costs: ~$10/year.**

---

## Ongoing operations

**When you push code changes to `main`:**
- Cloudflare Pages sees the push, runs `npm run build` in the `frontend/` directory, and redeploys within 90 seconds.
- GitHub Actions runs the CI to verify the frontend builds and backend tests pass.
- No action needed from you.

**When you add or edit a show through the public site:**
- The request goes over Cloudflare Tunnel to your Mac's backend.
- Backend writes to Apple Notes on your Mac.
- Site refreshes and shows the new state.

**When you upload a photo through the public site:**
- File uploads to your Mac at `/Users/brent/Projects/Hobby/JennyConcertWebsite/data/concert-uploads/`.
- The photo is served back over the tunnel when anyone views the show.
- **These photos are not backed up automatically.** Add them to Time Machine or another backup. If your Mac dies, they're gone.

**When you change the venue photo pack (running `npm run media:concerts`):**
- Files land in `frontend/public/media/venues/` on your Mac.
- Commit and push. Cloudflare Pages rebuilds and the new photos are live.

---

## Rotating the admin password

Edit `backend/.env`, then restart the backend service. `kickstart -k` is the cleanest one-liner &mdash; it stops the current process and starts a fresh one that picks up the new env values:

```bash
launchctl kickstart -k gui/$(id -u)/com.jenny.concerts-backend
```

Then click **Editor** in the site's header (small dot in the top-right), sign out, sign back in with the new credential.

### Managing the launchd services (day-to-day reference)

`$(id -u)` returns your user ID. Every command below assumes the plist at `~/Library/LaunchAgents/com.jenny.concerts-backend.plist`.

| What you want to do | Command |
| --- | --- |
| Start the backend (and register it to auto-start on login) | `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.jenny.concerts-backend.plist` |
| Stop and unregister | `launchctl bootout gui/$(id -u)/com.jenny.concerts-backend` |
| Restart in place (after editing `.env` or the plist itself) | `launchctl kickstart -k gui/$(id -u)/com.jenny.concerts-backend` |
| Confirm it's loaded | `launchctl list \| grep jenny` |
| Detailed status (PID, exit codes, last error) | `launchctl print gui/$(id -u)/com.jenny.concerts-backend` |
| Watch stdout live | `tail -f /tmp/jenny-backend.log` |
| Watch stderr live | `tail -f /tmp/jenny-backend.err.log` |
| Health check | `curl http://127.0.0.1:8000/health` |

`launchctl list | grep jenny` output columns are **PID, exit status, label**. PID `-` means the job is registered but not currently running (usually because it just crashed &mdash; check the stderr log). A number means it's alive.

If `launchctl print` reports `state = not running` or the PID keeps changing, the process is crash-looping. Check `/tmp/jenny-backend.err.log` for the traceback.

---

## Optional resilience (defer until you actually need it)

**If your Mac being offline is painful:**

- Add a small Cloudflare Worker or a static JSON cache that serves the last-known catalog when the tunnel is down. The site would render read-only in that state instead of throwing errors.
- Migrate photo storage to Cloudflare R2 (10GB free) so photos survive if your Mac dies.
- Long term: move the source of truth off Apple Notes into a proper database, then host the backend on Fly.io free tier ($0/month). This is a real refactor.

None of these are needed for launch. Add them if the pain shows up.

---

## Troubleshooting quick reference

| Symptom | Where to look |
| --- | --- |
| Site loads but every API call fails with CORS error | `ALLOWED_ORIGINS` in `backend/.env` missing the site's origin. Restart backend after fixing. |
| Every mutation returns 401 | You aren't signed in. Click the Sign in button in the header. |
| Every mutation returns 503 | Backend has no `ADMIN_USERNAME`/`ADMIN_PASSWORD` set. |
| `cloudflared` errors on start | `cat ~/.cloudflared/config.yml`; verify the tunnel ID matches the credentials file. |
| Pages build fails | Check the build log in the Cloudflare Pages dashboard. Usually a missing env var or a build script error. |
| GitHub Actions CI fails | Click the failed job in the Actions tab; the failure is at the bottom of the log. Fix and push again. |
| Photo uploads succeed but don't display | Check `data/concert-uploads/index.json` and the corresponding file exists on your Mac. Then check the backend serves `/api/concerts/uploads/{id}/file` correctly. |
