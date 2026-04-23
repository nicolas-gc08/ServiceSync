# ServiceSync

ServiceSync is a web application for managing student volunteer hour submissions and administrative review.

## Features

- Student upload portal for submitting signed service hour log forms (PDF or image)
- Admin dashboard to review, approve, or reject submissions
- AI-assisted validation that flags incomplete or incorrect forms
- Email notifications to students when their submission is reviewed
- Google Cloud Storage for all uploaded files

## Prerequisites

Before deploying, you will need:

- **Node.js 20+** and **pnpm** (`npm install -g pnpm`)
- A **PostgreSQL** database (any provider: Supabase, Railway, Neon, self-hosted, etc.)
- A **Google Cloud Storage** bucket and a service account with Storage Object Admin access
- An **OpenAI API key** (for AI form validation)
- Optionally, an **SMTP email account** for student notifications

Your server will also need `poppler-utils` installed for PDF processing:

```bash
# Ubuntu / Debian
sudo apt install poppler-utils
```

## Setup

1. Clone the repository:
```bash
   git clone <your-repo-url>
   cd ServiceSync
```

2. Install dependencies:
```bash
   pnpm install
```

3. Copy the example env file and fill in all values:
```bash
   cp .env.example .env
```

   See `.env.example` for descriptions of every variable.

4. Push the database schema:
```bash
   pnpm --filter db push
```

5. Build and start:
```bash
   pnpm run build
   pnpm --filter api-server start
```

## Environment Variables

See `.env.example` for the full list with descriptions. The required ones are:

| Variable | Purpose |
|---|---|
| `SESSION_SECRET` | Signs admin session cookies |
| `ADMIN_PASSWORD` | Admin dashboard login password |
| `DATABASE_URL` | PostgreSQL connection string |
| `GCS_PROJECT_ID` | Google Cloud project ID |
| `GCS_CLIENT_EMAIL` | GCS service account email |
| `GCS_PRIVATE_KEY` | GCS service account private key |
| `STORAGE_BUCKET` | GCS bucket name for file uploads |
| `OPENAI_API_KEY` | OpenAI key for AI form scanning |

## Notes

- `ADMIN_USERNAME` defaults to `admin` if not set.
- Email notifications are silently skipped if SMTP variables are not configured.
- The `AI_INTEGRATIONS_*` variable names have been renamed to `OPENAI_API_KEY` and `OPENAI_BASE_URL`.