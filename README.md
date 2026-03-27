# SurfaceIQ

Authorized website security scanner MVP inspired by TinyFish-style web-agent workflows.

## What this repo contains

- `apps/web`: Next.js dashboard and API routes
- `apps/worker`: background scanner worker
- `packages/core`: shared scan types, rules, storage, and reporting logic

## MVP scope

- Same-origin public website crawling
- Optional authenticated browser scanning with test credentials or imported session cookies
- Safe, non-destructive checks only
- Findings report with evidence and remediation guidance
- Per-user accounts with isolated scans, artifacts, and reports
- Filesystem-backed storage for local development
- Postgres/Redis-ready boundaries via repository and queue-style workflow separation

## Local setup

1. Install dependencies:

```powershell
npm.cmd install
```

2. Install the Playwright browser:

```powershell
npx.cmd playwright install chromium
```

3. Start both the web app and worker together:

```powershell
npm.cmd run dev
```

4. If you prefer, you can still run them separately:

```powershell
npm.cmd run dev:web
```

```powershell
npm.cmd run dev:worker
```

5. Open `http://localhost:3000`

## User workflow

1. Create an account or sign in.
2. Start a scan in one of three modes:
   - `Public scan`
   - `Login with credentials`
   - `Import session cookies`
3. Watch the run workspace as SurfaceIQ records steps, screenshots, and findings.
4. Review the generated report summary, findings table, recommendations, best-practice observations, and per-run evidence.

## Notes

- The worker stores users, sessions, scan state, steps, and findings in `.data/db.json`
- HTML and screenshot artifacts are written under `.artifacts`
- Target credentials and imported session cookies are encrypted before persistence using `SURFACEIQ_APP_SECRET` or the local development fallback secret
- The MVP does not perform destructive exploit payloads or aggressive injection attempts
