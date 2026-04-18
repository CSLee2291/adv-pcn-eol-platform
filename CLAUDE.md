# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PCN/EOL Automation Platform for Advantech Component Engineering. Automates Product Change Notice and End-of-Life processing: PDF ingestion → AI analysis → rule engine → Denodo where-used queries → customer notification.

## Commands

```bash
# Development (start PostgreSQL first, then API + Web)
docker compose up postgres -d
pnpm --filter api dev          # Backend on port 3000
pnpm --filter web dev          # Frontend on port 5173

# Or start everything via Turbo
pnpm dev

# Database
export NODE_TLS_REJECT_UNAUTHORIZED=0   # Required for corporate TLS proxy
pnpm --filter api run db:migrate -- --name <name>
pnpm --filter api run db:seed
pnpm --filter api run db:studio

# Build & Quality
pnpm --filter api exec tsc --noEmit     # Type-check backend
pnpm --filter web exec tsc --noEmit     # Type-check frontend
pnpm --filter api lint
pnpm --filter web lint
pnpm --filter api test                  # Vitest

# Generate Prisma client after schema changes
pnpm --filter api run db:generate
```

## Architecture

Monorepo with pnpm workspaces + Turborepo:
- `apps/api/` — Fastify 5 backend (TypeScript, ESM)
- `apps/web/` — React 18 + Vite SPA (not Next.js — pure client-side rendering)
- `packages/shared/` — Shared types (`ApiResponse<T>`, `PcnEvent`, `RiskLevel`, etc.) and constants

### Backend Module Pattern

Each domain module in `apps/api/src/modules/<name>/` follows:
- `<name>.routes.ts` — Fastify route registration
- `<name>.controller.ts` — Request/reply handling
- `<name>.service.ts` — Business logic (uses Prisma + external APIs)
- `<name>.types.ts` — Zod schemas and TypeScript interfaces

Routes are registered in `app.ts` with prefix `/api/v1/<name>`.

### Key Backend Patterns

**AI Service Factory** (`modules/ai-analysis/ai.service.ts`): `AI_SERVICE_MODE=mock|real` switches between `MockAiService` (heuristic-based) and `RealAiService` (Azure OpenAI GPT-4o). Both implement `IAiService` interface.

**Denodo Client Singleton** (`modules/where-used/denodo.client.ts`): Shared Axios instance with Basic Auth, self-signed cert bypass, and OData param serialization (no URL-encoding of `$` params). All 4 Denodo services use `getDenodoClient()`.

**Where-Used Pipeline** (`modules/where-used/whereused.service.ts`):
1. Extract affected MPNs from AI analysis result
2. MPN → ITEM_NUMBER via API-1 (`denodo-mpn.service.ts`)
3. Parallel: Parts Info (API-2+4) + Where-Used BOM (API-3)
4. Excel export via ExcelJS

### Database (Prisma)

Schema at `apps/api/prisma/schema.prisma`. 7 models:
- `PcnEventMaster` — Main PCN event (19 Excel columns mapped)
- `AiAnalysisResult` — AI summary, F/F/F changes, risk level (1:1 with event)
- `CeAssessment` — CE engineer review decision
- `WhereUsedResult` — Denodo query results (all 4 API datasets merged)
- `PcnCaseMaster` — Per-customer case tracking
- `CustomerMaster` — Customer registry with notification rules
- `NotificationLog` — Email delivery audit trail

Event lifecycle: `PENDING → AI_ANALYZED → CE_REVIEWED → WHERE_USED_DONE → NOTIFIED → CLOSED`

### Frontend Structure

React Router routes defined in `App.tsx`. Layout uses `AppShell` (macOS-style window chrome + Sidebar) wrapping an `<Outlet>`.

- `components/ui/` — shadcn/ui primitives (Button, Card, Table, Dialog, Tabs, etc.) using Radix UI + CVA
- `components/layout/` — AppShell, Sidebar, ThemeToggle
- `components/dashboard/` — KpiStrip, MainChart (Recharts), SecondaryCards
- `pages/` — Route-level page components
- `services/api.ts` — Axios client with all API endpoint functions
- `store/theme.ts` — Zustand store for dark/light mode

Vite proxies `/api` → `http://localhost:3000` in dev mode (`vite.config.ts`).

### Shared Types

`packages/shared/types/index.ts` exports `ApiResponse<T>`, `PcnEvent`, `AiAnalysisResult`, `DashboardKpi`, and all enum types. `packages/shared/constants/index.ts` has risk level colors and status labels.

## Environment Variables

Backend env validated by Zod in `apps/api/src/config/env.ts`. Key vars:
- `DATABASE_URL` — PostgreSQL connection string
- `AI_SERVICE_MODE` — `mock` (default) or `real` (requires Azure OpenAI creds)
- `DENODO_REST_BASE_URL`, `DENODO_USERNAME`, `DENODO_PASSWORD` — Denodo VDP REST API
- `EMAIL_INGEST_MODE` — `mock` (default) or `real`

Corporate network requires `NODE_TLS_REJECT_UNAUTHORIZED=0` for Prisma engine downloads.

## CI/CD

Three GitHub Actions workflows in `.github/workflows/`:
- `ci.yml` — Lint, typecheck, build, test (with PostgreSQL service container) on push/PR to main/develop
- `deploy-staging.yml` — Deploy on push to `develop`
- `deploy-production.yml` — Deploy on tag `v*`

## Documentation Rules
- After implementing any phase, update the corresponding `Phase*_Implementation.md` file
- Record: actual approach used, deviations from plan, verification results
- Do not delete original intent — add an "Actual Implementation" section below each spec section