# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Full-stack news publishing platform consisting of three independent apps:
- **API** (`src/`) — Express 5 + PostgreSQL backend, port 5000
- **CMS** (`cms/`) — Admin panel (React 19 + Vite), port 5173
- **Web** (`web/`) — Public-facing site (React 19 + Vite), port 5174

## Commands

### Development

```bash
npm run dev:all        # Recommended: API + CMS together (concurrently)
npm run dev            # API only, with nodemon auto-reload
npm run worker         # Background job worker (cron jobs, scheduled tasks)
cd cms && npm run dev  # CMS frontend only
cd web && npm run dev  # Public web frontend only
```

### Database

```bash
npm run db:up          # Start PostgreSQL container (docker-compose, host port 5435)
npm run db:init        # Initialize schema + seed data
```

### Linting

```bash
cd cms && npm run lint  # ESLint for CMS
cd web && npm run lint  # ESLint for Web
```

### Production Build

```bash
npm start              # API production server
cd cms && npm run build
cd web && npm run build
```

> No test suite is configured. No TypeScript compilation step — all JS.

## Architecture

### Backend (`src/`)

- Entry: `src/server.js` → `src/app.js` (Express app factory)
- Routes in `src/routes/` — 22 route files, mounted in `app.js`
- Business logic in `src/services/` (`AiService.js` wraps Anthropic + OpenAI)
- Auth: JWT via `src/middleware/auth.js`; roles via `src/middleware/roles.js`
- Database pool shared via `src/routes/db.js` — import from there, not a new pool
- Background jobs in `src/jobs/`, run by `src/worker.js` (separate process)
- Versioned routes: `analytics.js` (v1) and `analytics_v2.js` (v2); `ads.js` (legacy) and `ads_v2.js` (current)

### Frontend (CMS and Web)

Both apps follow the same pattern:
- `src/api.js` — centralised Axios/fetch client; all API calls go through here
- `src/App.jsx` — router root with protected-route wrappers
- `src/pages/` — one file per route
- `src/components/` — shared UI components

CMS additionally has:
- `src/editor/` — custom TipTap extensions (rich text, code blocks, image upload)
- `src/layout/` — AdminLayout shell (sidebar, header)

### Database

PostgreSQL 15 via Docker. Connection string from `DATABASE_URL` env var (default `postgres://postgres:postgres@127.0.0.1:5435/newsdb`). Schema migrations live in `scripts/` as numbered SQL files; run them manually or via `npm run db:init`.

### Ad System

Documented in Spanish in `SISTEMA_PUBLICIDAD.md`. Key concepts:
- `ads_v2.js` handles intelligent ad serving based on user interest profiles built from pixel events
- Pixel tracking endpoint (`src/routes/pixel.js`) captures user behaviour
- `src/routes/analytics_v2.js` provides campaign metrics

### AI Integration

`src/services/AiService.js` wraps both Anthropic (`@anthropic-ai/sdk`) and OpenAI SDKs. Exposed via `src/routes/ai.js` and `src/routes/editorial-studio.js`. Use `AiService` for any new AI feature rather than importing the SDK directly in a route.

## Environment

Requires a `.env` file at the root:

```
PORT=5000
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5435/newsdb
JWT_SECRET=...
JWT_EXPIRES_IN=7d
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...
```

Each frontend reads `VITE_API_URL` from its own `.env` (Vite convention) to point at the backend.

## Key Conventions

- Spanish is used in documentation files and some UI strings; English is used in code identifiers and comments.
- New API routes go in `src/routes/`, registered in `src/app.js`.
- Frontend API calls always go through `src/api.js` in the respective app, not raw `fetch`.
- CMS pages with AI-assisted editing use TipTap extensions from `cms/src/editor/`.
- The `admin/` directory at root is a legacy artifact — do not add new code there.
