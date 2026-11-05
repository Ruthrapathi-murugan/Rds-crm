# RDS CRM

Customer relationship management for **Ruthra Digital Solutions** (Palani, Tamil Nadu). Leads, customers, services, projects, tasks, quotations, GST-ready invoices, payments, receipts, reports and an audit trail in one Next.js application backed by MongoDB.

---

## Contents

1. [Features](#features)
2. [Tech stack](#tech-stack)
3. [Local development](#local-development)
4. [MongoDB Atlas setup](#mongodb-atlas-setup)
5. [Environment variables](#environment-variables)
6. [First admin account](#first-admin-account)
7. [Deploying to Vercel](#deploying-to-vercel)
8. [Reminders & cron](#reminders--cron)
9. [Database indexes](#database-indexes)
10. [Backups & recovery](#backups--recovery)
11. [Troubleshooting](#troubleshooting)
12. [How things work](#how-things-work)
13. [Project structure](#project-structure)
14. [Scripts](#scripts)

---

## Features

| Module | Highlights |
| --- | --- |
| Dashboard | Live KPIs, monthly revenue, lead funnel, your tasks and follow-ups, overdue invoices, recent enquiries and project activity |
| Leads | Sources, pipeline statuses, follow-ups, communication log, assignment, archive, one-time conversion to customer (+ optional project) |
| Customers | Profile with GSTIN and state, invoiced / received / outstanding totals, related projects, quotations, invoices, payments, tasks, communications |
| Services | Catalogue in three categories with prices, SAC codes and default tax rates from Settings |
| Projects | List and board views, priorities, deadlines with overdue flags, progress, checklists, financial summary, activity log |
| Tasks | Today / upcoming / overdue / completed views, calendar, reminders (in-app and email) |
| Quotations | Numbered per financial year, line items with discounts and GST, PDF, convert to invoice once |
| Invoices | Drafts without numbers, gap-free numbering on issue, CGST+SGST or IGST, "Tax Invoice" only when GST-registered, PDF, print, email, cancel with reason |
| Payments | Partial and full payments, advances, idempotent recording, duplicate-reference protection, receipts, voiding |
| Reports | Revenue, receivables ageing, payment methods, revenue by service, lead sources and conversion, projects, customer activity — with CSV export |
| Administration | Company settings and tax rates, users and roles, audit log |

Roles: **Super Admin**, **Admin**, **Manager**, **Staff**. Staff see only the leads, projects and tasks assigned to or created by them and have no access to finance.

## Tech stack

| Area | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, Cache Components, Turbopack), React 19, TypeScript |
| UI | Tailwind CSS 4, shadcn/ui (Radix), Lucide icons, Sonner toasts, Recharts |
| Data | MongoDB (Atlas in production) + Mongoose 9 |
| Validation & forms | Zod 4, React Hook Form |
| Documents & email | `@react-pdf/renderer` with Noto Sans (₹ glyph), Nodemailer |
| Dates | date-fns 4 + `@date-fns/tz` — everything shown in Asia/Kolkata |
| Tests | Vitest + mongodb-memory-server (real replica set, transactions included) |
| Hosting | Vercel |

## Local development

Requirements: Node.js 20.9+ (developed on Node 24) and npm.

```bash
npm install
cp .env.example .env.local        # then edit (see below)
```

**Option A — use MongoDB Atlas.** Put your Atlas connection string in `MONGODB_URI` (see the next section).

**Option B — no Atlas needed.** Run a local single-node replica set that stores data in `.data/` (git-ignored):

```bash
npm run dev:db                    # leave running in its own terminal
# .env.local → MONGODB_URI=mongodb://127.0.0.1:27017/rds_crm?replicaSet=rds-local
```

Then prepare the database, create your account and start the app:

```bash
npm run db:setup                  # indexes, default settings, service catalogue
npm run create-admin -- --email you@example.com --name "Your Name"
npm run dev                       # http://localhost:3000
```

## MongoDB Atlas setup

1. Create a project and a cluster at [cloud.mongodb.com](https://cloud.mongodb.com). An **M10** or higher dedicated cluster in **Mumbai (ap-south-1)** gives continuous backups; M0 (free) works for trials. The app needs a **replica set** — every Atlas cluster is one — because payments, invoice numbering and lead conversion use transactions.
2. **Database Access → Add database user**: a strong generated password, role *Read and write to any database* (or scoped to the `rds_crm` database).
3. **Network Access**: for Vercel add `0.0.0.0/0` (Vercel has no fixed IPs on most plans; access is still protected by the user/password and TLS). For stricter setups use Vercel's static IPs or Atlas private endpoints.
4. **Connect → Drivers** and copy the `mongodb+srv://…` string. Insert the password and add the database name before the `?`:

   ```
   MONGODB_URI=mongodb+srv://crm-app:<password>@cluster0.xxxxx.mongodb.net/rds_crm?retryWrites=true&w=majority
   ```

5. Run `npm run db:setup` once against Atlas (from your machine, with `MONGODB_URI` pointing at Atlas) to build indexes and seed defaults, then `npm run create-admin`.

## Environment variables

All variables are documented in [.env.example](.env.example) and validated on first use by [src/lib/env.ts](src/lib/env.ts), which reports every missing or invalid variable by name (never by value).

| Variable | Required | Purpose |
| --- | --- | --- |
| `MONGODB_URI` | yes | MongoDB connection string including the database name |
| `AUTH_SECRET` | yes | Secret used to protect session tokens, 32+ characters |
| `APP_URL` | yes | Public base URL (no trailing slash), used in emails |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` | no | Outgoing email (invoices, reminders, password-reset codes). Leave `SMTP_HOST` empty to disable — self-service password reset then cannot deliver codes |
| `CRON_SECRET` | for reminders | Bearer token for `/api/cron/reminders`, 16+ characters |

Generate secrets:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Changing `AUTH_SECRET` signs everyone out (existing sessions stop matching). `.env.local` is git-ignored — never commit real credentials.

**Email**: any SMTP provider works (Google Workspace, Zoho Mail, Amazon SES, Brevo…). Port 465 uses implicit TLS; 587 uses STARTTLS. Use an app password where your provider requires one, and set `MAIL_FROM` to an address on a domain with SPF/DKIM configured.

## First admin account

Public sign-up is disabled. The first **Super Admin** is created from the command line against the target database:

```bash
npm run create-admin -- --email owner@yourdomain.in --name "Owner Name"
```

A strong temporary password is printed **once**; it must be changed at first sign-in. To recover a locked-out owner, re-run with `--reset` (signs out all their sessions and issues a new temporary password). All further accounts are created in **Settings → Users**, which also shows each new temporary password once.

To run the scripts against production, point `ENV_FILE` at a file containing the production `MONGODB_URI` and `AUTH_SECRET`, e.g. `ENV_FILE=.env.production.local npm run create-admin -- …` (keep that file out of git).

## Deploying to Vercel

1. Push the repository to GitHub/GitLab/Bitbucket and **Import** it in Vercel (framework preset: Next.js; build command `next build`; no output directory override).
2. In **Settings → Environment Variables** add `MONGODB_URI`, `AUTH_SECRET`, `APP_URL` (e.g. `https://crm.yourdomain.in`), the SMTP variables and `CRON_SECRET` for *Production* (and *Preview* with a separate database if you use previews).
3. Set the **Function Region** to Mumbai (`bom1`) so functions sit next to an Atlas cluster in ap-south-1.
4. Deploy, then add your custom domain. HTTPS is automatic; the session cookie uses the `__Host-` prefix and `Secure` in production.
5. Run `npm run db:setup` and `npm run create-admin` against the production database (see above) if you have not already.
6. Verify: `https://<your-domain>/api/health` returns `{"status":"ok"}`; sign in; create a test lead; open **Settings** and fill in business details, GST registration and bank/UPI details before issuing invoices.

Production build locally: `npm run build && npm start`.

## Reminders & cron

`GET /api/cron/reminders` sends due task reminders, lead follow-up alerts and a daily overdue-invoice alert to admins (in-app notifications, plus email to the assignee when SMTP is configured). Runs are idempotent: tasks are claimed atomically and every notification carries a unique dedupe key, so overlapping or repeated runs never double-send.

- Set `CRON_SECRET` (16+ characters). Without it the endpoint answers `503`; a wrong or missing bearer token gets `401`.
- [vercel.json](vercel.json) runs the endpoint **once a day at 08:00 IST** (`30 2 * * *` UTC), which deploys on every Vercel plan. When `CRON_SECRET` is set on the Vercel project, Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically.
- For timely task reminders run it **every 15 minutes**: on the Vercel **Pro** plan change the schedule to `*/15 * * * *` (the Hobby plan rejects deployments with crons that run more than once a day), or keep the daily cron and add an external scheduler such as [cron-job.org](https://cron-job.org) calling the URL every 15 minutes with the header `Authorization: Bearer <CRON_SECRET>`.
- In-app reminders are also visible without the cron: the dashboard and Tasks page always show what is due and overdue.

Trigger a run manually:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://your-app.vercel.app/api/cron/reminders
```

## Database indexes

Every collection's indexes are declared on its Mongoose model in [src/models](src/models) and built by `npm run db:setup` (`syncIndexes`, safe to re-run after upgrades). Notable ones:

| Collection | Index | Why |
| --- | --- | --- |
| invoices | `invoiceNumber` unique (partial: only when set) | No duplicate invoice numbers; drafts have none |
| quotations | `quotationNumber` unique | No duplicate quotation numbers |
| customers | `sourceLead` unique (partial) | A lead can only be converted once, even under concurrent clicks |
| payments | `idempotencyKey` unique (partial); `method + transactionReference` unique while recorded | Double-submits and the same UTR/UPI reference cannot be recorded twice |
| sessions | `tokenHash` unique; TTL on `expiresAt` | Fast session lookup; expired sessions removed automatically |
| ratelimits | TTL on `expiresAt` | Rate-limit windows clean themselves up |
| notifications | `dedupeKey` unique (partial); TTL 90 days after read | No duplicate reminders; old read notifications pruned |
| leads, projects, tasks, invoices, payments, activitylogs | compound indexes on status/date/assignee/customer | Fast lists, filters and reports |

## Backups & recovery

- **Atlas backups**: on M10+ enable *Cloud Backup* with continuous backup (point-in-time restore). Keep at least 7 days of snapshots plus monthly snapshots for a year — invoices and payments are financial records.
- **Logical exports** (any tier, also useful before major changes):

  ```bash
  mongodump --uri="$MONGODB_URI" --out=backup-$(date +%F)
  mongorestore --uri="$RESTORE_URI" --nsInclude="rds_crm.*" backup-YYYY-MM-DD/
  ```

  Store dumps encrypted and off the machine (e.g. a private cloud bucket). They contain customer personal data.
- **Restore drill**: restore into a separate cluster/database, point a preview deployment at it, sign in and spot-check invoices and payments. Do this at least once a quarter.
- **Never delete** invoices or payments directly in the database. Issued invoices are cancelled and payments voided in the app so the audit trail stays intact; numbering relies on the `counters` collection — restore it together with the rest of the data.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `Invalid or missing environment variables` | The message lists each variable by name. Set them in `.env.local` (local) or Vercel project settings, then redeploy. |
| `MongoServerSelectionError` / timeouts | Atlas Network Access does not include the server IP (add `0.0.0.0/0` for Vercel), wrong password (URL-encode special characters), or cluster paused. |
| `Transaction numbers are only allowed on a replica set member` | You are using a standalone MongoDB. Use Atlas or `npm run dev:db`. |
| Signed out immediately after login | `AUTH_SECRET` differs between deployments/instances, or the site is served over plain HTTP in production (the `__Host-` cookie requires HTTPS). |
| "Too many sign-in attempts" | Login is limited to 8 attempts per email+IP and 30 per IP every 15 minutes. Wait, use **Forgot password?**, or ask an admin to reset the password. |
| Password-reset code never arrives | SMTP is not configured or the provider rejected the message — check **EmailLog** entries with template `password_reset_otp` (status `not_configured` / `failed`). Codes can be re-requested once a minute and 5 times an hour per email. |
| GST options missing on invoices | Mark the business as GST-registered and enter the GSTIN and state in **Settings**. |
| "x% is not one of the tax rates configured" | Add or re-activate that rate in **Settings → Tax rates**. |
| Email button missing / "Email is not configured" | Set all SMTP variables and `MAIL_FROM`, then redeploy. Check the provider's SMTP logs for authentication errors. |
| Reminders not arriving | `CRON_SECRET` not set, Hobby plan only running daily, or the task has no reminder. Call the cron URL manually to see counts. |
| PDF route fails on Vercel | Ensure `next.config.ts` still contains the `outputFileTracingIncludes` entry for the Noto Sans fonts. |
| Something else | Check Vercel → Logs for `[api] unhandled error` lines (no personal data is logged) and the audit log in **Settings → Audit log**. |

## How things work

- **Money** is stored and calculated as integer paise; tax and discount rates as integer basis points (18% = 1800). All totals are recomputed on the server; client-sent totals are never used.
- **GST**: tax rates come only from **Settings**. A document can charge GST only when the business is GST-registered with a GSTIN; the title "Tax Invoice" is used only in that case. Intra-state supply splits into equal CGST + SGST; inter-state uses IGST. Confirm rates and SAC codes with your tax adviser.
- **Numbering**: `PREFIX/26-27/0001` (≤ 16 characters, restarts each 1 April IST). Invoice numbers are assigned only when a draft is issued, inside a transaction, so drafts and failed attempts never leave gaps.
- **Financial definitions** (used identically by the dashboard, reports and CSVs): *Invoiced* = issued invoices (sent / partially paid / paid) by invoice date; *Received* = recorded payments by payment date; *Outstanding* = balance of sent / partially paid invoices; *Overdue* = outstanding past the due date (IST).
- **Dates** are stored in UTC and displayed, grouped and bounded ("today", "this month") in Asia/Kolkata.
- **Security**: database-backed sessions (only an HMAC of the token is stored), scrypt password hashing, login rate limiting, self-service password reset by 6-digit email OTP (HMAC-stored, 5-minute expiry, 5 attempts, 60-second resend cooldown, identical responses for unknown emails, all sessions revoked on reset), server-side permission checks on every route and page, record-level scoping for Staff, CSRF origin checks, strict Zod validation (unknown fields stripped), security headers, CSV formula-injection protection, HTML escaping in emails, and an append-only audit log for sign-ins, permission changes and money events.

## Project structure

```
src/
  app/
    (auth)/login/          Sign-in page
    (dashboard)/           Authenticated pages (dashboard, leads, customers, services,
                           projects, tasks, quotations, invoices, payments, reports,
                           settings, account)
    api/                   Route handlers (one folder per module) + health and cron
  components/              UI: common, data-table, forms, layout, charts and per-module folders
  config/                  Brand constants and navigation
  hooks/                   Client hooks
  lib/                     env, mongodb, auth, permissions, validations, finance maths,
                           pdf templates, csv, mailer, utils (money, dates)
  models/                  Mongoose models (one per collection)
  services/                Business logic, used by pages and route handlers
  types/                   Shared TypeScript types
scripts/                   dev-db, db-setup, create-admin
tests/                     Integration tests (in-memory MongoDB replica set)
```

Conventions for contributors are in [AGENTS.md](AGENTS.md).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / serve it |
| `npm run lint` | ESLint |
| `npm run typecheck` | Route types + TypeScript |
| `npm test` | All unit and integration tests |
| `npm run test:coverage` | Tests with coverage for `src/lib` and `src/services` |
| `npm run dev:db` | Local MongoDB replica set in `.data/` |
| `npm run db:setup` | Build indexes, seed default settings and the service catalogue (idempotent) |
| `npm run create-admin` | Create (or `--reset`) a Super Admin |

A liveness check is available at `GET /api/health`.
