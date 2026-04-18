# School Volunteer Hours Submission System

## Overview

A full-stack web application for managing student volunteer hours submissions at a school. Students submit their hours via a form with file uploads; faculty/admin review, approve, or reject submissions from a secure dashboard.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Frontend**: React + Vite + TanStack Query + Wouter
- **UI components**: shadcn/ui + Tailwind CSS
- **File uploads**: Multer (stored in `artifacts/api-server/uploads/`)
- **Auth**: Simple cookie-based session (no external auth service)

## Architecture

- `artifacts/volunteer-hours/` — React frontend (student form + admin dashboard)
- `artifacts/api-server/` — Express backend API (auth, submissions, file uploads)
- `lib/db/` — Drizzle ORM schema and database client
- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth)
- `lib/api-client-react/` — Generated React Query hooks
- `lib/api-zod/` — Generated Zod validation schemas

## Key Credentials (default, change in production)

- Admin username: `admin`
- Admin password: `volunteer2024`
- Can be overridden via `ADMIN_USERNAME` and `ADMIN_PASSWORD` environment variables

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Routes

### Student
- `/` — Submission form

### Admin (requires login)
- `/admin/login` — Faculty login
- `/admin` — Dashboard (all submissions, search/filter, stats)
- `/admin/submissions/:id` — Submission detail with approve/reject/notes

### API
- `POST /api/auth/login` — Login
- `POST /api/auth/logout` — Logout
- `GET /api/auth/me` — Auth status
- `GET /api/submissions` — List submissions (search/filter params)
- `POST /api/submissions` — Create submission
- `GET /api/submissions/stats` — Stats summary
- `GET /api/submissions/:id` — Get submission
- `PATCH /api/submissions/:id` — Update status/notes
- `POST /api/submissions/upload` — Upload file (multipart/form-data)
- `GET /api/submissions/file/:filename` — Serve uploaded file
