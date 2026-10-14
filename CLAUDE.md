# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**BTK Akademi LMS** — a Turkish-language student learning management platform, built as a **full-stack monorepo**:

- `web/` — React 18 + TypeScript + Vite + CSS Modules single-page app (frontend)
- `server/` — Fastify 5 + Prisma 5 + SQLite REST API (backend)
- `ui/` — design source of truth: `DESIGN.md` (tokens/specs) + `code.html` (static mockup)
- `docs/gereksinimler.md` — functional/non-functional requirements (referenced as FR-xx / NFR-xx)

All user-facing text, API error messages, and seed content are **Turkish**. `<html lang="tr">`.

## Commands

Backend and frontend are separate npm packages; run each from its own directory.

**Backend (`server/`):**
```bash
npm install
cp .env.example .env            # required before first run (DATABASE_URL, JWT_SECRET, PORT=4000, PUBLIC_WEB_URL)
npm run dev                     # tsx watch → http://localhost:4000
npm run build                   # tsc (type-check + emit to dist/)
npm test                        # vitest run (full suite; pretest applies migrations to test.db)
npx vitest run src/routes/courses.test.ts   # run ONE test file
npm run prisma:migrate          # create/apply a dev migration
npm run prisma:generate         # regenerate Prisma client after schema edits
npm run prisma:seed             # seed dev.db
```

**Frontend (`web/`):**
```bash
npm install
npm run dev                     # vite → http://localhost:5173 (expects backend at :4000)
npm run build                   # tsc -b && vite build
npm run typecheck               # tsc --noEmit (app + node configs)
```

The frontend calls the backend at `VITE_API_BASE_URL` (default `http://localhost:4000`). Run both for the full app.

## Backend Architecture

Standards live in `server/ARCHITECTURE.md`; the full API contract in `server/CONTRACT.md`. Key points:

- **Layering (intentional, YAGNI):** `routes/*.ts` do request validation + response shaping; business logic lives inline as Prisma calls or in `lib/*.ts`. There is **no service layer**. One route file per resource family, all registered in `src/app.ts` `buildApp()`.
- **Errors:** always `throw new AppError(code, message, statusCode)`. The global handler in `src/errors.ts` wraps it as `{ "error": { code, message } }`. Never hand-write JSON error responses in handlers.
- **Prisma:** always import the singleton from `lib/prisma.ts`; never `new PrismaClient()` elsewhere.
- **ESM:** imports use the `.js` extension (e.g. `./routes/auth.js`) even for `.ts` sources.
- **RBAC & dual-role model** (`middleware/rbac.ts`): preHandlers `requireAuth` and `requireRole(...roles)`. A user has `role` (the currently **active** role) and `roles` (CSV of all roles they hold). `auth/switch-role` changes the active role. `resolveSession` re-validates the token against the DB on **every** request, so admin changes (disable, role removal) take effect immediately.
- **Access-control helpers** (`lib/`): `canManageCourse` (ADMIN or assigned INSTRUCTOR), `assertEnrolled`, `loadPublishedLesson`, and `assertLessonUnlocked` (SEQUENTIAL-access courses gate each lesson until prior lessons are completed — enforced on completion + activity endpoints, and locked lessons have their `contentUrl`/`description` nulled in the course-detail response).
- **Scheduler** (`src/scheduler/`): an in-process `SchedulerEngine` runs interval jobs (`jobs.ts`: streak/badge updates, at-risk-student detection, announcement/exam sync, DB maintenance, task reminders). Started by `buildApp()` unless `NODE_ENV=test` or `enableScheduler:false`. Admins inspect job state via `adminScheduler` routes.
- **Tests:** Vitest, `*.test.ts` beside the file under test. The suite uses its own `test.db` (the `pretest` script runs `prisma migrate deploy` against it). Tests build the app via `buildApp()` and use `app.inject()`.

## Frontend Architecture

- **No global state** — props all the way down; no Redux/Context for data. Data comes from hooks.
- **Data layer:** `lib/apiClient.ts` `apiFetch<T>(path, options)` injects the `Bearer` token from `localStorage` and, on a 401 (except auth endpoints), clears the token and redirects to `/giris`. Endpoint-specific hooks live in `data/` and feature-level `*/data/` folders; to change a data source, edit the hook, not the components.
- **Design tokens are the single source of truth** (`src/styles/tokens.css`): **no raw hex/rgba in component CSS** — use `var(--color-*)` and `rgb(var(--rgb-*) / alpha)` only. 13 typography roles drive the `Text` primitive. Dark/theme support is token-based.
- **CSS Modules per component** (`Component/Component.module.css`), locally scoped — one component per folder with an `index.ts` barrel.
- **Routing** (`src/routes/index.tsx`): `RequireAuth` wraps the authenticated app shell; `RequireRole` gates admin/instructor pages. **Public pages** (e.g. `/dogrula/:code` certificate verification, `/basarilar/:userId` shareable achievements) are registered **outside** `RequireAuth`/`AppShell`. Sidebar nav is defined in `layout/Sidebar/navItems.ts` — keep it in sync with the router.

## Data Model & Database

- Schema: `server/prisma/schema.prisma`; migrations in `server/prisma/migrations/`.
- SQLite has no native enums here: "enum" fields are `String` with an `// Allowed literals:` comment (e.g. `role`, `accessMode`, `contentType`, badge `type`).
- **`dev.db` is committed to git** (for cross-machine portability). Because SQLite runs in WAL mode, run `sqlite3 server/prisma/dev.db "PRAGMA wal_checkpoint(TRUNCATE);"` before staging `dev.db`, otherwise recent writes sit in the gitignored `dev.db-wal` and the committed file is stale.

## Project-Specific Gotchas

- **Do not run `npm audit fix --force`.** `vitest` is pinned to `^2.1.1`; the forced upgrade removes the `vite` peer dependency and breaks the whole test suite. The remaining advisories are dev-only (esbuild/vite).
- **On Windows, the Prisma CLI may not load `.env` reliably.** Pass an absolute URL when running migrations manually: `DATABASE_URL="file:C:/.../server/prisma/dev.db" npx prisma migrate deploy`.
- **Do not run two backend test processes at once** — they share `test.db` and collide with SQLite "database is locked" errors that look like real failures. Re-run serially to confirm.
- **PDF certificates** (`lib/certificates.ts`) bundle `server/assets/fonts/DejaVuSans.ttf` — pdfkit's built-in Helvetica lacks Turkish glyphs (ğ/ş/ı/İ), so the TTF must stay registered.
