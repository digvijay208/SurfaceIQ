# Architecture

## Current implementation

- `apps/web`: Next.js App Router application hosted on Vercel for auth, scan creation, dashboard views, and artifact delivery
- `packages/core`: shared domain logic, scan rules, storage contracts, and reporting helpers
- `apps/worker`: Playwright-based scan worker that claims pending scans, crawls targets, captures artifacts, and writes findings

## Storage model

- Local development falls back to `.data/db.json` for structured records and `.artifacts/` for HTML and screenshot artifacts
- Hosted mode uses Neon Postgres for users, sessions, scans, pages, findings, artifacts metadata, and run steps
- Hosted mode uses Vercel Blob for private artifact storage
- Storage is selected through environment-based adapters, so the same codebase supports local and hosted execution

## Current hosted deployment

- `surfaceiq.vercel.app` hosts the web application on Vercel
- Neon provides the shared hosted Postgres database
- Vercel Blob stores private hosted artifacts
- The scan worker currently runs on the maintainer's device and connects to the same hosted database and Blob store

## Current operational constraint

- The hosted app is fully usable for signup, login, scan creation, and results viewing
- Real scan execution still depends on the worker process being started on the maintainer's device
- If the local worker is offline, hosted scans remain in `pending` until the worker is started again

## Planned future upgrade

- Move the worker from the maintainer's device to a dedicated always-on host when budget allows
