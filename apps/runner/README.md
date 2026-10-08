# Laptop Runner

The runner is the "hand" of the system — it opens a real browser on your machine and operates job portals. The API/queue stays in Railway; this process stays on your laptop.

## Setup

```bash
cp .env.example .env.local   # adjust values
npx playwright install chromium
npm run dev:runner
```

Required env (see root `.env.example`):

- `RUNNER_API_URL` — API base URL
- `RUNNER_EMAIL` / `RUNNER_PASSWORD` — an account registered on the dashboard
- `RUNNER_HEADLESS` — `false` while you watch it work
- `RUNNER_PROFILE_DIR` — persistent browser profile (login sessions survive restarts)
- `RUNNER_CV_DIR` — folder containing your CV with the same filename as the one uploaded in Settings (used to upload CV during applications)
- `ALLOWED_DOMAINS` — comma separated allowlist

## Behavior

- Connects to the API, registers an agent session, then polls the task queue.
- **Apply** tasks: opens the job URL (only after allowlist check), looks for the apply button, fills known fields from your profile, and resolves questions through Answer Memory. If a question has no known answer → stops with `unknown_question` and reports `needs_review`. It never invents answers.
- **Discover** tasks: opens allowed portals, reads job cards from the DOM, and posts them to the API for matching.
- CAPTCHA / password fields / out-of-allowlist URLs → the agent stops and reports a reason. No bypasses.

## Portal adapters

Adapters live in `src/adapters/`. Add a new portal by extending `PortalAdapter` (see `adapters/base.ts`); the agent stays portal-agnostic.