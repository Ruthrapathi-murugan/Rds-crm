<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## RDS CRM project conventions

- Next.js 16 with `cacheComponents` + `partialPrefetching`. Request-time reads (cookies, session, DB) must sit behind `<Suspense>`; never call `new Date()`/`Date.now()` in a prerendered path without `await connection()` first. Route protection uses `src/proxy.ts` (not `middleware.ts`), but every route handler and server action re-checks the session and permissions itself.
- Money: integer paise and integer basis points only, via `src/lib/utils/money.ts`.
- Dates: UTC in storage, Asia/Kolkata for display and calendar boundaries, via `src/lib/utils/date.ts`.
- Server-only modules import `"server-only"`; Vitest aliases it to a stub.
- Env vars are read only through `getServerEnv()` in `src/lib/env.ts`.
- Standalone Node scripts must be ES modules (`.mts`): some deps (e.g. `@react-pdf/*`) export only an `import` condition.
- Verify with `npm run typecheck && npm run lint && npm test && npm run build`.

## How a module is built (Leads is the reference — copy its shape)

| Layer | Reference file | Rules |
| --- | --- | --- |
| Enums & labels | `src/lib/constants.ts` | Stored values are snake_case keys; labels for display. Badge tones in `src/lib/status-tones.ts`. |
| Model | `src/models/lead.ts` | Already defined for every collection. Money fields `*Paise`, timestamps on, indexes declared. |
| Validation | `src/lib/validations/lead.ts` | One Zod schema shared by form and API. Forms hold strings; schemas transform (rupees → paise via `moneyInput`, "yyyy-MM-dd" → Date via `dateInput`, IST datetime via `dateTimeInput`, `optionalObjectId` → id or null). Export `XInput = z.input`, `XData = z.output`. Unknown keys are stripped (no mass assignment). |
| Service | `src/services/lead.service.ts` | `import "server-only"`. Every function takes `user: SessionUser` first, calls `connectToDatabase()`, applies `ownershipFilter(user)` from `services/scope.ts` where records are personal (leads, projects, tasks), returns plain DTOs (string ids, ISO dates) — never Mongoose docs. Throw `NotFoundError`/`ConflictError`/`BadRequestError` from `lib/errors.ts`. Log with `logActivity()` (pass `sensitive: true` for money/permission events). Use `withTransaction()` for multi-document writes. Optional refs: pass `undefined`, not `null`, to Mongoose. Use `nextSimpleNumber()` for LD-/CU-/PRJ-/PAY- numbers. |
| API | `src/app/api/leads/**/route.ts` | Wrap with `apiRoute({ permission }, handler)`; parse with `parseBody(req, schema)`; return a plain value (sent as `{ data }`). Never trust ids/prices/status from the client beyond the schema. |
| List page | `src/app/(dashboard)/leads/page.tsx` | Sync page → `PageHeader` + `<Suspense fallback={<TableSkeleton/>}>` around an async list component that calls `requireUser()`, checks permission (`<AccessDenied/>`), reads `searchParams`, calls the service. Use `ListView` > `ListToolbar` / `ListBody` > `DataCard` > `Table` with `SortableHeader`, then `ListPagination`. Empty state via `EmptyState`. |
| Detail page | `src/app/(dashboard)/leads/[id]/page.tsx` | Suspense + `DetailSkeleton`; `notFound()` when the service returns null; `stagger grid` of `Card`s; `ActivityTimeline` from `listEntityActivity()`. |
| Forms | `src/components/leads/lead-form-sheet.tsx` | `useForm<XInput>({ resolver: zodResolver(schema, undefined, { raw: true }) })` so raw strings are posted; fields from `components/forms/fields.tsx` and `combobox-field.tsx`; `FormSheet` for create/edit; `api()` + `handleFormError()` from `lib/client/api.ts`; `toast` + `router.refresh()` on success. Option lists via `useOptions("/api/.../options")`. |
| Confirmations | `components/common/confirm-dialog.tsx` | Every destructive or financial action is confirmed. |
| Tests | `tests/leads.test.ts` | Vitest against an in-memory replica set: `beforeEach(resetDatabase)`, `createTestUser(role)`. Cover permissions/scoping, validation, and invariants. |

UI tone: light theme, `bg-app` page background, cards with `stagger`/`animate-fade-up` entrances, `hover-lift` on clickable cards, `StatusBadge`/`EnumBadge` (dot + label, never colour alone), `formatINR()` for money, `formatDate()`/`formatDateTime()` for dates. Charts use `--chart-1…8` (validated palette; one hue for single-measure charts).

Local development without Atlas: `npm run dev:db` (in-memory replica set persisted to `.data/`), then `npm run db:setup` and `npm run create-admin`.
