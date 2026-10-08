# AI Job Application Agent

Distributed agent system: Railway runs the brain (API, queue, state), the web dashboard is the control center, and a Runner on your laptop opens a real browser and operates job portals.

```
JOB AGENT USER → WEB DASHBOARD → RAILWAY BACKEND → (SUPABASE-style Postgres on Railway) → AGENT RUNNER → JOB PORTALS → APPLICATION HISTORY → CSV/JSON/XLSX → JOB TRACKER
```

## Workspaces

| Package | Purpose |
| --- | --- |
| `apps/api` | Fastify backend: auth, jobs, matches, approvals, applications, agent tasks, exports, WebSocket hub |
| `apps/web` | Next.js dashboard (Dashboard / Jobs / Approvals / History / Agent / Settings) |
| `apps/runner` | Playwright laptop agent: portal adapters, allowlist, discovery + apply with Answer Memory |
| `packages/types` | Shared zod schemas + enums |
| `packages/database` | Drizzle schema + hand-written SQL migrations (Postgres) |
| `packages/ai` | Rule-based match scoring + answer-memory matching (LLM-ready) |
| `packages/shared` | Text normalization, hashing, CSV/XLSX export helpers |
| `packages/logger` | Pino wrapper |

## Prerequisites

- Node.js >= 20.11, npm
- A Postgres database (local via docker-compose, or Railway)
- (optional) Redis for the queue — not required for the MVP path (in-memory queue used)

## Quick start

```bash
npm install

# 1. start Postgres (local)
docker compose up -d

# 2. configure environment
cp .env.example .env.local        # fill DATABASE_URL, JWT_SECRET, etc.

# 3. apply migrations
npm run db:migrate

# 4. run API + dashboard
npm run dev                        # api :3001, web :3000

# 5. open http://localhost:3000, register, upload CV, set preferences

# 6. run the laptop runner
cd apps/runner && npm ci && npx playwright install chromium
npm run dev:runner
```

Web dev proxies `/api/*` to the API (see `apps/web/next.config.ts`), so cookies stay same-origin.

## Workflow

1. Upload CV + set job preferences in Settings.
2. **Agent page** → queue a *discovery* task (or use `POST /api/agent/discover`).
3. Runner opens allowed portals, reads job cards, posts them to the API.
4. API scores each job (rule-based matcher in `packages/ai`) → jobs appear in **Approvals** with a match %.
5. Approve/reject selected; **APPLY ALL** creates one `apply` task per job.
6. Runner fills known fields, uploads CV, and answers questions through **Answer Memory**. Unknown question → stops `needs_review`, asks you via the dashboard; you save the answer to memory and it is reused everywhere.
7. Submissions land in **History**, exportable as CSV/JSON/XLSX for your Job Tracker.

## Safety

- `agent_policies` allowlist restricts any page the runner may open; navigation outside it is blocked.
- The runner never fills password fields and never interacts with CAPTCHA — it stops, reports `needs_review`, and waits.
- The AI never fabricates personal facts. Missing answers are surfaced to you, saved only after your approval.
- Duplicate detection is keyed on `externalJobId` → normalized URL → company+position.

## Railway deployment (online)

Full step-by-step in Indonesian: **`INSTALASI-ONLINE.md`** (GitHub push → Railway Postgres → deploy → runner).

Quick shape: a **single monolith service** is deployed from the repo root via `railway.json`:

- Build: `npm install --include=dev && npm run db:migrate && npm run build -w @jobagent/web`
- Start: `node scripts/start.mjs` — runs the Fastify API on `API_PORT` (3001, internal) and `next start` on `PORT` (public, Railway-injected). The dashboard proxies `/api/*` → the internal API (`INTERNAL_API_URL`, default `http://localhost:3001`), so one domain + one service is enough.
- Env needed: `DATABASE_URL` (Railway Postgres), `JWT_SECRET` (≥16 chars), `NODE_ENV=production`, `WEB_ORIGIN` (public domain), optional `STORAGE_DIR`/`INTERNAL_API_URL`.
- Healthcheck `/`; migrations run automatically at build.

## Phases

Phase 1 (foundation) is the scaffold in this repo. Phases 2–7 from the blueprint map onto: portal adapters (`runner/src/adapters`), matching (`packages/ai`), approval queue (`apps/api`), realtime WebSocket hub (`apps/api/src/ws`), export (`apps/api/src/routes/export.ts`), and an Android runner (future).