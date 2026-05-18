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
- **File uploads**: Multer (received on server) → streamed to **Replit Object Storage (GCS)** — files persist across container restarts
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

## Email Notifications

Student email notifications are sent when a submission is approved or rejected. Requires SMTP configuration via environment variables:

| Variable | Description | Example |
|---|---|---|
| `SMTP_HOST` | SMTP server hostname | `smtp.gmail.com` |
| `SMTP_PORT` | SMTP port (default: 587) | `587` |
| `SMTP_USER` | SMTP username / email | `you@gmail.com` |
| `SMTP_PASS` | SMTP password or app password | `yourpassword` |
| `SMTP_FROM` | Sender address (defaults to SMTP_USER) | `noreply@school.edu` |

If not configured, email sending is skipped silently (no error). For Gmail, use an App Password (not your main password).

## PDF Scan Feature

Uploaded documents are automatically scanned using AI (OpenAI via Replit AI Integrations — no API key needed). Scans run on the server immediately after upload.

**How it works:**
- PDFs: text is extracted with `pdf-parse`, then analyzed by `gpt-5-mini`
- Images: sent directly to the vision API for analysis
- The scan detects: Student Name, Student Number, Graduation Year, School Name, School Year, Grade Level, Organization Name, Total Hours Volunteered, and each log entry (date, activity, hours, contact signature)

**Results are shown:**
- On the student form after file selection (before submission)
- On the admin detail page in the "Review Details" sidebar

**Scan statuses:**
- `passed` — all required fields detected
- `warnings` — form is correct template but some fields are missing/incomplete; submission still allowed
- `failed` — wrong template, illegible, or critical issues; submission is blocked
- `error` — scan system error; submission still allowed with a note

**Scan data is stored** in the `scan_data` and `scan_status` columns on the submissions table.

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
- `POST /api/submissions/upload` — Upload file (multipart/form-data); scanned then stored to GCS
- `GET /api/submissions/file/:objectPath` — Stream uploaded file from GCS object storage
