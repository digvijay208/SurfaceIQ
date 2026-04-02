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
- Production-ready storage adapters for hosted Postgres and Vercel Blob

## Local setup

1. Install dependencies:

```powershell
npm.cmd install
```

2. Install the Playwright browser:

```powershell
npx.cmd playwright install chromium
```

3. Copy `.env.example` to `.env.local` in the repo root and fill in the values you want to use locally.

If you want the worker to use the same hosted Neon and Blob config as Vercel, run this from the repo root:

```powershell
vercel env pull .env.local --environment=production
```

SurfaceIQ now loads the repo-root `.env.local` for both `apps/web` and `apps/worker`, so one local env file can drive the full stack.

4. Start both the web app and worker together:

```powershell
npm.cmd run dev
```

5. If you prefer, you can still run them separately:

```powershell
npm.cmd run dev:web
```

```powershell
npm.cmd run dev:worker
```

6. Open `http://localhost:3000`

## Showcase deploy mode

For a public Vercel showcase before the full backend migration, set:

```bash
SURFACEIQ_APP_SECRET=replace-with-a-long-random-secret
SURFACEIQ_SHOWCASE_MODE=1
NEXT_PUBLIC_SURFACEIQ_SHOWCASE_MODE=1
```

This keeps the hosted demo polished and read-only while the global database, queue, artifact storage, and worker stack are migrated.

## Production backend mode

To let users create accounts and run scans from the hosted Vercel URL, configure:

```bash
SURFACEIQ_APP_SECRET=replace-with-a-long-random-secret
DATABASE_URL=postgres://username:password@host:5432/surfaceiq
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_token
SURFACEIQ_SHOWCASE_MODE=0
NEXT_PUBLIC_SURFACEIQ_SHOWCASE_MODE=0
```

Then:

1. Set the same values on the Vercel project for `apps/web`.
2. Set the same `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, and `SURFACEIQ_APP_SECRET` on the deployed worker service.
3. Start the worker against the shared production database so it can claim pending scans and upload artifacts.

SurfaceIQ now auto-selects:

- local file storage when `DATABASE_URL` is missing
- hosted Postgres for users, sessions, scans, findings, pages, and run steps when `DATABASE_URL` is present
- Vercel Blob for artifacts when `BLOB_READ_WRITE_TOKEN` is present

## User workflow

1. Create an account or sign in.
2. Start a scan in one of three modes:
   - `Public scan`
   - `Login with credentials`
   - `Import session cookies`
3. Watch the run workspace as SurfaceIQ records steps, screenshots, and findings.
4. Review the generated report summary, findings table, recommendations, best-practice observations, and per-run evidence.

## Notes

- Local development still stores users, sessions, scan state, steps, and findings in `.data/db.json`
- Local development still writes HTML and screenshot artifacts under `.artifacts`
- Production mode writes structured data to Postgres and artifacts to Vercel Blob
- Target credentials and imported session cookies are encrypted before persistence using `SURFACEIQ_APP_SECRET`
- The MVP does not perform destructive exploit payloads or aggressive injection attempts


