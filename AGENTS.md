# AGENTS.md — Expense Tracker

Primary configuration for Copilot agents and contributors working on this project.
Read this before writing any code.

---

## Skills

Load the relevant skill BEFORE starting any task. Use `read_file` on the SKILL.md path.

| Task type | Skill to load |
|---|---|
| Next.js routing, RSC boundaries, async APIs | `.agents/skills/next-best-practices/SKILL.md` |
| UI components, design, pages, dashboard, empty states | `.agents/skills/frontend-design/SKILL.md` |
| Writing or configuring unit tests | `.agents/skills/vitest/SKILL.md` |
| Verifying deployed URL before submission | `.agents/skills/webapp-testing/SKILL.md` |
| Missing library docs (Supabase, OpenRouter, etc.) | Use Context7 — see `.github/instructions/context7.instructions.md` |

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16+, App Router, TypeScript strict mode |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Auth + Database | Supabase — Auth, Postgres, JS client (no ORM) |
| Row-level security | Supabase RLS enabled on every table from day one |
| Response validation | Zod — parse every AI response before saving |
| Search | Postgres full-text search via `tsvector` + GIN index |
| Workflow orchestration | n8n runs externally; this repo integrates via webhooks only |
| Application orchestrator | This repo validates requests and forwards them to n8n webhooks |
| Unit testing | Vitest + @testing-library/react |
| Dev bundler | Turbopack (default in Next.js 16+, no config needed) |
| Deployment | Vercel — `next build`, env vars set in Vercel dashboard |

---

## Project Structure

Use this layout unless there is a clear reason to change it:

```text
.
├─ app/
│  ├─ (employee)/
│  │  ├─ page.tsx                         # Employee expense intake + history screen
│  │  └─ _components/
│  │     ├─ EmployeeIdentityForm.tsx
│  │     ├─ ExpenseSubmitForm.tsx
│  │     ├─ ExpenseHistoryTable.tsx
│  │     └─ ExpenseSummaryCards.tsx
│  ├─ (director)/
│  │  ├─ page.tsx                         # Finance director analytics + assistant UI
│  │  └─ _components/
│  │     ├─ DirectorAccessForm.tsx
│  │     ├─ DirectorChatPanel.tsx
│  │     └─ DirectorKpiCards.tsx
│  ├─ api/
│  │  ├─ expenses/route.ts                # Intake endpoint: validate + forward to n8n
│  │  ├─ history/route.ts                 # Employee history + aggregates
│  │  └─ director/chat/route.ts           # Director assistant endpoint: validate + forward to n8n
│  ├─ globals.css
│  ├─ layout.tsx
│  └─ page.tsx                            # Landing / route to main flows
├─ components/
│  ├─ ui/                                 # shadcn/ui primitives
│  └─ shared/                             # Shared app-wide components
├─ lib/
│  ├─ supabase/
│  │  ├─ server.ts                        # Server-only Supabase client
│  │  ├─ browser.ts                       # Browser Supabase client
│  │  └─ storage.ts                       # Receipt upload helpers
│  ├─ schemas/
│  │  ├─ expense.ts                       # Zod contracts for payloads/responses
│  │  └─ director.ts
│  ├─ n8n/
│  │  ├─ client.ts                        # Shared webhook caller with timeout/retry logic
│  │  └─ contracts.ts                     # Typed webhook request/response models
│  ├─ policies/
│  │  ├─ category-map.ts                  # Canonical categories
│  │  └─ expense-policy.ts                # Shared policy helpers (non-authoritative; n8n is source)
│  ├─ format/
│  │  └─ currency.ts
│  └─ constants.ts
├─ hooks/
│  ├─ useEmployeeIdentity.ts
│  └─ useExpenseHistory.ts
├─ types/
│  ├─ database.ts                         # Generated Supabase types
│  └─ expense.ts
├─ supabase/
│  ├─ migrations/                         # SQL migrations (generated/applied via Supabase workflow)
│  ├─ seeds/
│  │  └─ users.seed.sql                   # Initial PoC employees
│  └─ policies/                           # Optional policy snippets/docs for RLS
├─ integrations/
│  └─ webhooks.md                         # Contract docs for external n8n webhooks
├─ tests/
│  ├─ unit/
│  │  ├─ policies/
│  │  ├─ schemas/
│  │  └─ format/
│  └─ fixtures/
│     ├─ receipts/
│     └─ policy-cases/
├─ public/
│  └─ images/
├─ Documents/
│  ├─ expense-tracker-specs.md
│  └─ expense-tracker-specs.en.md
├─ AGENTS.md
├─ package.json
├─ tsconfig.json
├─ vitest.config.ts
├─ next.config.ts
└─ .env.example
```

Notes:
- n8n workflows are maintained outside this repository.
- This repository calls external n8n webhook endpoints from `app/api/*` route handlers.
- Keep webhook request/response contracts documented in `integrations/webhooks.md`.
- Simple flow: Frontend -> Next.js API route -> n8n webhook -> Supabase.
- n8n workflow split rule: receipt OCR must run in a dedicated workflow separate from policy/approval logic.
- n8n intake workflow should call OCR workflow for image submissions and continue with policy evaluation using OCR output.
- n8n ownership rule: external workflows perform employee validation, OCR/AI processing, policy checks, and expense writes.
- App ownership rule: this repository handles UI, request validation, webhook forwarding, and read APIs (history/aggregates).
- Recommended server-only env vars: `N8N_EXPENSE_WEBHOOK_URL`, `N8N_DIRECTOR_CHAT_WEBHOOK_URL`, `N8N_WEBHOOK_BEARER_TOKEN`.
- Keep generated Supabase types in `types/database.ts`; refresh after schema changes.
- If a route has local-only UI pieces, place them in the route's `_components/` folder.
---

## Security Rules (Non-negotiable)

- **`NEXT_PUBLIC_SUPABASE_ANON_KEY` and `NEXT_PUBLIC_SUPABASE_URL`** are safe to expose — by design.
- Store all secrets in `.env.local` locally. Never commit `.env.local` to version control.

Note: `proxy.ts` in Next.js 16+ uses the Node.js runtime. If a future requirement depends on Edge runtime specifically, revisit this convention before implementing it.

---

## Testing Rules

**Override:** The general Next.js instruction (`nextjs.instructions.md`) says "write tests for all critical logic and components." That rule does **not** apply here. Follow only the scoped rules below.

Unit tests are **scoped** — do not test UI components or API route plumbing.

Test Scope:
TBD
---

## Design Rules

- Commit to a bold, specific aesthetic — see `frontend-design` skill for direction.
- No Inter font. No purple gradients. No generic layouts.
- Use CSS variables for all theme colors and spacing tokens.
- Every list screen must have a **designed empty state** — not a blank page.
- Animations: only for meaningful moments

---

## TypeScript Rules

- `strict: true` in `tsconfig.json` — no exceptions.
- No `any` types. Use `unknown` + type guards where the shape is uncertain.
- All Supabase table shapes typed via generated types (`supabase gen types typescript`).

---

## Dependency Rules

- Do not add packages without approval. If you need a new package, note it explicitly and wait for confirmation before installing.
- Pre-approved packages for this project: `@supabase/supabase-js`, `tailwindcss`, `zod`, `shadcn/ui`, `motion`, `vitest`, `@testing-library/react`, `@vitejs/plugin-react`.

---

## Supabase Rules
- Never use the browser client in a Server Component — it leaks session handling
- Always use explicit column selection — never `select('*')` in production queries
- Never use the service role key outside of server-only contexts

---

## Route Handler Error Contract
- 400 → bad input (Zod parse failure), return `{ error: string }`
- 401 → unauthenticated, return `{ error: "unauthorized" }`
- 500 → unexpected server error, return `{ error: "internal" }` — never expose raw messages

## Orchestrator Contract Rules
- Frontend never calls n8n endpoints directly.
- Route handlers validate and forward requests via `lib/n8n/client.ts`.
- Pass a correlation id across route -> n8n for traceability.
- Enforce request/response schema validation (Zod) before forwarding and before returning to UI.
- n8n returns normalized status values: `Approved`, `Rejected`, `Manual Review`.
- OCR responsibility separation: OCR workflow extracts/normalizes receipt data only; policy decisions happen in a separate n8n workflow.

---

## Vitest Config
- Use `@vitejs/plugin-react` in `vitest.config.ts`
- Set `environment: 'jsdom'`
- Never import from `next/` in unit test files — mock at the module level
- Path alias `@/` must be mirrored in `vitest.config.ts` resolve.alias

---

## Key Constraints from Spec
- Employee identity uses full name + employee ID (no fixed ID format).
- Intake supports image + comment and text-only submission.
- Allowed upload formats: JPG, JPEG, PNG, WEBP, GIF.
- Required core tables: `users`, `expenses` (plus optional logging tables).
- `users` table is manually populated for PoC.
- n8n enforces all 8 expense policies and writes category/status/status_reason.
- For image submissions, receipt OCR is isolated in a dedicated n8n workflow before policy checks.
- Security requires jailbreak filtering and separate error workflow logging.
- Bonus stage: Finance Director ID-gated AI assistant with vector-capable expense data.