# B2B Research & Outreach Agent

Multi-tenant, multi-agent RAG system for automated lead research, personalised
outreach, and reply tracking. Built across 6 milestones — all complete.

Demo tenant: **Meridian Realty Group** (fictional real estate agency).

---

## What's in this milestone

- Multi-tenant data model — 8 tables, every one scoped by `tenant_id`
- Tenant-aware auth (JWT) — register a tenant, register/login users
- A small REST API surface for leads, enough to prove the schema + auth work end to end
- Seed script that builds out the "Meridian Realty Group" demo tenant with
  users, leads, referral-partner companies, knowledge base entries, and a
  couple of messages/replies
- An automated **tenant isolation test** — the requirements doc calls this
  out as the biggest technical risk in the whole project (section 9), so
  it's built and tested starting now rather than bolted on later
- A README (this file) you can hand to an interviewer or a future session

**Not in this milestone** (arriving later — see roadmap): the RAG/vector
layer, the actual agents (Research/RAG/Drafting/Send/Tracking), email
sending, the Next.js dashboard, and demo polish. Milestone 1 is
backend-only and deliberately thin on business logic — it exists to get
the foundation right before anything is built on top of it.

---

## Quick start — full system (Milestones 1–6)

```bash
# 1. Install backend deps
cd b2b-outreach-agent
npm install
cp .env.example .env          # add your GEMINI_API_KEY
npm run seed                  # loads 14 demo leads, 12 KB entries, messages, replies

# 2. Start Chroma (vector DB)
docker-compose up -d

# 3. Embed KB entries
npm run ingest-kb             # needs GEMINI_API_KEY + Chroma running

# 4. Start backend
npm start                     # http://localhost:4000

# 5. Start dashboard (new terminal)
cd ../dashboard
node run-dev.js               # http://localhost:3000
```

Login at `http://localhost:3000` with:
- **Email:** `admin@meridianrealty.test`
- **Password:** `demo-password-123`

**Requirements:** Node.js ≥ 22.5, Docker (for Chroma), a Gemini API key
(free tier at [aistudio.google.com](https://aistudio.google.com)).

### Running the tests

```bash
npm test              # M1: tenant isolation (6 tests, no API key needed)
npm run test:rag      # M2: RAG retrieval   (needs API key + Chroma)
npm run test:pipeline # M3: agent pipeline  (needs API key + Chroma)
npm run test:send     # M4: send + tracking (needs API key + Chroma)
```

---

## Where this fits (the 6-milestone roadmap)

| # | Milestone | Status |
|---|---|---|
| **1** | **Backend foundation** | ✅ done |
| **2** | **RAG layer** (Gemini embeddings + Chroma, per-tenant namespaces) | ✅ done |
| **3** | **Agent pipeline** (Orchestrator, Research, RAG, Drafting + Review Gate) | ✅ done |
| **4** | **Send + tracking** (email sending, Tracking Agent, full REST API) | ✅ done |
| **5** | **Dashboard** (Next.js 16 + shadcn/ui, login, leads, messages, KB, replies, agent logs) | ✅ done |
| **6** | **Demo polish** (enriched seed data, walkthrough script, case-study writeup, architecture diagram) | ✅ done |

---

## Milestone 2: RAG Layer

### What's in Milestone 2

- **Gemini `gemini-embedding-001`** embedding service with correct task types
  (`RETRIEVAL_DOCUMENT` for ingestion, `RETRIEVAL_QUERY` for search) and
  free-tier rate-limit retry logic
- **Chroma vector DB** (self-hosted via Docker) with **one collection per tenant**
  as the namespace strategy — hard isolation, same pattern as the SQLite repo layer
- **KB ingestion script** (`npm run ingest-kb`) that reads all SQLite
  `knowledge_base_entries`, embeds them, upserts to Chroma, and writes the
  Chroma document ID back to the `embedding` column as a sync pointer
- **RAG retrieval integration test** (`npm run test:rag`) — 5 assertions,
  auto-skips cleanly if the API key or Chroma are unavailable

### Additional prerequisites (Milestone 2+)

| Prerequisite | How to get it |
|---|---|
| **Docker Desktop** | [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/) |
| **Gemini API key** | [aistudio.google.com](https://aistudio.google.com) → "Get API key" (free tier) |

Add the key to `.env`:
```
GEMINI_API_KEY=your-key-here
```

### Milestone 2 quick start

```bash
# 1. Start Chroma (persistent — data survives restarts)
docker-compose up -d

# 2. Seed the database (if not already done)
npm run seed

# 3. Embed and ingest all KB entries into Chroma
npm run ingest-kb

# 4. Run the RAG retrieval test
npm run test:rag

# 5. Confirm Milestone 1 tests still pass
npm test
```

### Per-tenant namespace strategy

Each tenant gets exactly one Chroma collection, named `kb_<tenantId>` (UUID
hyphens replaced with underscores). This mirrors the SQLite isolation model:
every operation takes `tenantId` explicitly, and there is no code path that
can query across tenants.

When a tenant is deleted in SQLite (cascade wipes all their rows), the
corresponding Chroma collection should be deleted separately via
`deleteTenantCollection(tenantId)` from `src/rag/chromaClient.js`. This will
be wired into the tenant-deletion flow in Milestone 4.

### New project structure (Milestone 2 additions)

```
src/
  rag/
    geminiEmbedder.js      Gemini embedContent wrapper (task types + retry)
    chromaClient.js        Per-tenant collection management (kb_<tenantId>)
    knowledgeBaseStore.js  High-level ingest / query / delete operations
scripts/
  ingest-kb.js             Embed all KB entries and sync pointers to SQLite
tests/
  rag-retrieval.test.js    Integration test (npm run test:rag)
docker-compose.yml         Chroma server (persistent volume)
```

### Chroma data management

```bash
docker-compose up -d          # start Chroma in background
docker-compose down           # stop (data persists in named volume)
docker-compose down -v        # stop AND wipe all vector data (forces re-ingest)
npm run ingest-kb             # (re-)ingest after wipe or after adding new KB entries
```

---

## Milestone 3: Agent Pipeline

### What's in Milestone 3

- **Orchestrator** — lightweight state machine that runs the pipeline stages
  in sequence, handles per-stage error logging, and progresses lead status
- **Research Agent** — uses Gemini Flash to analyze the lead record and produce
  a structured profile (summary, pain points, opportunities, talking points)
- **RAG Agent** — queries the tenant's Chroma knowledge base (from M2) for the
  most relevant proof points using the research profile as the semantic query
- **Drafting Agent** — uses Gemini Flash to write a personalized <125-word
  outreach email, informed by the research profile and KB snippets
- **Review Gate** — REST endpoint for the tenant user to approve (or edit)
  the drafted message before sending
- **Pipeline integration test** (`npm run test:pipeline`) — 7 assertions
  covering the full flow

### Agent architecture

```
POST /api/pipeline/run { leadId }
        │
        ▼
  ┌─────────────┐
  │ Orchestrator │  loads lead + company from DB
  └──────┬──────┘
         │
    ┌────▼─────┐    Gemini Flash (JSON output)
    │ Research  │ →  structured lead profile
    │  Agent    │    (summary, pain points, opportunities)
    └────┬─────┘
         │
    ┌────▼─────┐    Chroma ANN search (Milestone 2)
    │   RAG    │ →  1-3 relevant KB snippets
    │  Agent   │    (case studies, testimonials)
    └────┬─────┘
         │
    ┌────▼─────┐    Gemini Flash (JSON output)
    │ Drafting │ →  { subject, body, channel }
    │  Agent   │    saved to messages table as draft
    └────┬─────┘
         │
         ▼
  Lead status: "drafted"
  Message status: "draft"
  Awaiting human review

POST /api/pipeline/approve { messageId }
        │
        ▼
  Message status: "approved"
  Ready for sending (Milestone 4)
```

### Pipeline API

| Method | Path | Auth? | Purpose |
|---|---|---|---|
| POST | `/api/pipeline/run` | yes | Run full pipeline (Research → RAG → Drafting) |
| POST | `/api/pipeline/approve` | yes | Approve a drafted message (Review Gate) |

#### POST /api/pipeline/run

```bash
curl -X POST http://localhost:4000/api/pipeline/run \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"leadId": "<lead-uuid>"}'
```

Returns:
```json
{
  "pipeline": {
    "leadId": "...",
    "lead": { "name": "...", "title": "...", "leadType": "..." },
    "researchProfile": { "summary": "...", "painPoints": ["..."], "...": "..." },
    "knowledgeSnippets": [{ "id": "...", "content": "...", "tags": ["..."] }],
    "draftMessage": { "messageId": "...", "subject": "...", "body": "...", "wordCount": 87 },
    "stages": [{ "name": "research", "status": "success", "durationMs": 2340 }],
    "totalDurationMs": 6520
  }
}
```

#### POST /api/pipeline/approve

```bash
curl -X POST http://localhost:4000/api/pipeline/approve \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"messageId": "<message-uuid>"}'
# Or with edited text:
  -d '{"messageId": "...", "approvedText": "Your edited version here"}'
```

### New project structure (Milestone 3 additions)

```
src/
  agents/
    geminiClient.js      Gemini text generation wrapper (JSON + plain text)
    researchAgent.js     Structured lead profile via Gemini
    ragAgent.js          KB query via Chroma (calls Milestone 2)
    draftingAgent.js     Personalized email draft via Gemini
    orchestrator.js      Linear pipeline: Research → RAG → Drafting
  controllers/
    pipeline.controller.js  POST /run, POST /approve
  routes/
    pipeline.routes.js      Mounts behind authenticate middleware
tests/
  pipeline.test.js          Integration test (npm run test:pipeline)
```

### Running the pipeline test

```bash
# Prerequisites: Chroma running, GEMINI_API_KEY set, DB seeded + ingested
npm run test:pipeline
```

---

## Milestone 4: Send + Tracking

### What's in Milestone 4

- **Send Agent** — sends approved messages via the configured email provider, updates message/lead status
- **Tracking Agent** — processes inbound replies, uses Gemini Flash for sentiment analysis (positive/neutral/negative), flags hot leads
- **Simulated email by default** — logs to console, no real emails. Flip to Resend with `EMAIL_PROVIDER=resend` + `RESEND_API_KEY`
- **Full REST API** — messages, replies, knowledge base, agent logs, dashboard stats
- **10 additional test cases** (`npm run test:send`) covering the complete operational loop

### Full operational loop

```
POST /api/pipeline/run           → Research + RAG + Drafting (lead: "drafted")
POST /api/pipeline/approve       → Review Gate (message: "approved")
POST /api/pipeline/send          → Send Agent (message: "sent", lead: "sent")
POST /api/replies/webhook        → Tracking Agent (message replied, lead: "replied"/"hot")
```

### Complete REST API surface

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/register-tenant` | Onboard new tenant + admin |
| POST | `/api/auth/register-user` | Add user to existing tenant |
| POST | `/api/auth/login` | Authenticate |
| GET | `/api/me` | Current user + tenant |
| GET | `/api/tenant/users` | All users in caller's tenant |
| GET/POST | `/api/leads` | List or create leads |
| GET/PUT/DELETE | `/api/leads/:id` | Get, update, or delete a lead |
| PATCH | `/api/leads/:id/status` | Update lead status only |
| GET | `/api/messages` | List messages (filter by status, leadId) |
| GET | `/api/messages/:id` | Get message by ID |
| POST | `/api/pipeline/run` | Run full agent pipeline |
| POST | `/api/pipeline/approve` | Approve draft (Review Gate) |
| POST | `/api/pipeline/send` | Send approved message |
| GET | `/api/replies` | List replies (filter by messageId) |
| POST | `/api/replies/webhook` | Inbound reply → Tracking Agent |
| GET/POST/DELETE | `/api/knowledge-base` | Manage KB entries |
| GET | `/api/agent-logs` | Agent logs (filter by agent name) |
| GET | `/api/dashboard/stats` | Aggregate stats for dashboard UI |

### Email configuration

```bash
# .env
EMAIL_PROVIDER=simulated   # simulated (default) | resend
RESEND_API_KEY=            # only needed for EMAIL_PROVIDER=resend
EMAIL_FROM=outreach@meridianrealty.test
```

### Running the send + tracking test

```bash
# Prerequisites: Chroma running, GEMINI_API_KEY set, DB seeded + ingested
npm run test:send
```

---

## Milestone 6: Demo Polish

### What's in Milestone 6

- **Enriched seed data** — 14 leads (all pipeline stages), 12 KB entries, 5 pre-built messages, 3 replies, 8 agent logs — every screen has real data from the first login
- **Demo walkthrough script** — see [`DEMO_WALKTHROUGH.md`](../DEMO_WALKTHROUGH.md) at the repo root
- **README case-study writeup** (this section)
- **Architecture diagram** (below)

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Next.js 16 Dashboard  (dashboard/)                         │
│                                                             │
│  /login ──────────────────────────────────────────────────► │
│  /dashboard   /leads   /messages   /replies   /knowledge-base│
│  /agent-logs                                                │
│                                                             │
│  Auth: httpOnly cookie JWT  ·  API: Next.js rewrites        │
└──────────────────────────┬──────────────────────────────────┘
                           │  /api/*  (proxied)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  Express Backend  (b2b-outreach-agent/)                     │
│                                                             │
│  POST /api/auth/*          JWT + bcrypt                     │
│  GET  /api/leads           Repository layer (tenantId-gated)│
│  POST /api/pipeline/run  ──► Orchestrator                   │
│                              │                              │
│                              ├─► Research Agent             │
│                              │     └─► Gemini Flash         │
│                              │                              │
│                              ├─► RAG Agent                  │
│                              │     ├─► Gemini Embedding 001 │
│                              │     └─► Chroma (per-tenant)  │
│                              │                              │
│                              └─► Drafting Agent             │
│                                    └─► Gemini Flash         │
│                                                             │
│  POST /api/pipeline/send ──► Send Agent                     │
│                              └─► Email Service (simulated / │
│                                  Resend opt-in)             │
│                                                             │
│  POST /api/replies/webhook ► Tracking Agent                 │
│                              └─► Gemini Flash (JSON schema) │
│                                                             │
│  GET  /api/dashboard/stats  SQLite aggregate queries        │
│  GET  /api/agent-logs       Full audit trail                │
└──────────────────────────┬──────────────────────────────────┘
                           │
          ┌────────────────┴──────────────────┐
          ▼                                   ▼
   SQLite (node:sqlite)                Chroma (Docker)
   8 tenant-scoped tables              Per-tenant collections
   zero native deps                    Gemini embeddings (dim 768)
```

### Demo data summary (after `npm run seed`)

| Entity | Count | Details |
|---|---|---|
| Leads | 14 | All 7 statuses (new → closed), 4 lead types |
| Companies | 3 | Harborview Title, Cascade Mortgage, Clearview Inspections |
| KB entries | 12 | Case studies, testimonials, objection handling, market data |
| Messages | 5 | 1 draft, 1 approved+sent, 3 sent+replied |
| Replies | 3 | 2 hot leads, 1 positive/not-hot |
| Agent logs | 8 | Full pipeline trace for Chris Delgado + Taylor Nguyen |

### Case-study metrics (fictional, illustrative)

These are the numbers you'd reference in a portfolio or pitch context.
All figures use the seed/demo data as baseline; real deployments would track these via the `/api/dashboard/stats` endpoint.

| Metric | Value | Notes |
|---|---|---|
| Time: lead created → draft ready | ~15 sec | 3 Gemini calls in sequence |
| Time: draft → sent (with approval) | Human-gated | Review Gate is intentional |
| Reply rate (demo data) | 60% | 3/5 sent messages have replies |
| Hot-lead detection rate | 100% | 2/2 qualifying replies correctly flagged |
| Tenant isolation | Proven | 6-test automated suite, 0 leaks |
| Total API endpoints | 18 | Full CRUD for leads, messages, KB, replies, logs |
| Test coverage | 28 tests | M1 (6) + M2 (5) + M3 (7) + M4 (10) |

### Running the full demo

See [`DEMO_WALKTHROUGH.md`](../DEMO_WALKTHROUGH.md) for the 12-minute live presentation script including a multi-tenancy proof you can run live in a terminal.

---

## Data model


Eight tables, all tenant-scoped (see `src/db/schema.sql` for the full DDL
with column types, defaults, and indexes):

```
tenants
  └─ users               (tenant_id, unique email *within* a tenant)
  └─ companies           (tenant_id)
  │     └─ leads         (tenant_id, company_id nullable)
  │           └─ messages (tenant_id, lead_id)
  │                 └─ replies (tenant_id, message_id)
  └─ knowledge_base_entries (tenant_id)
  └─ agent_logs          (tenant_id)
```

A few deliberate calls worth flagging:

- **`companies` is optional on `leads`.** The original schema sketch in
  the requirements doc is B2B-shaped (companies have domains), but the
  demo scenario is real estate — most leads are individual homeowners
  with no company at all. `companyId` is only populated for
  `referral_partner` leads (title companies, mortgage brokers, etc).
- **`replies.tenant_id` is denormalized** from `messages` rather than
  requiring a join to look it up. The requirements doc's own schema sketch
  (section 6) doesn't list it, but section 4's isolation principle
  ("every table needs a `tenant_id`; enforce it at the query layer") reads
  as intentionally strict, so every table gets one directly — cheap to
  store, and it means the query layer never has to trust a nested relation
  for isolation.
- **`embedding` on `knowledge_base_entries` is a placeholder.** It's a
  nullable text column for now. Once Milestone 2 wires up Chroma, this
  most likely becomes a pointer to the vector-store record rather than the
  raw vector itself — actual similarity search happens in Chroma, not
  SQLite/Postgres.

---

## Multi-tenancy: how isolation is actually enforced

This is the part of the requirements doc's risk section (9) worth being
explicit about, since "we added a `tenant_id` column" and "isolation is
actually enforced" are two different claims.

1. **Every repository function takes `tenantId` as an explicit, required
   argument** (`src/db/repositories/*.js`). There is no `getLeadById(id)`
   that skips the tenant filter — only `getLeadById(tenantId, id)`, which
   puts `tenant_id = ?` in the `WHERE` clause of every single query.
2. **`tenantId` never comes from the request body, query string, or URL
   params.** It comes from `req.user.tenantId`, which the `authenticate`
   middleware (`src/middleware/auth.js`) sets by verifying the JWT — never
   by trusting anything the client sent. A client cannot ask for a
   different tenant's data by editing a request, because there's no field
   anywhere that would let it.
3. **The isolation test** (`tests/tenant-isolation.test.js`) asserts this
   against the real HTTP API, not just the repository layer directly —
   registering two tenants, creating a lead under one, and asserting the
   other cannot read it by ID or see it in a list, plus a couple of
   auth-adjacent checks (missing token, tampered token).

What Milestone 1 does *not* yet do: Postgres row-level security (moot on
SQLite, but worth setting up as defense-in-depth once you migrate — see
below), per-tenant rate limiting, and namespaced vector DB isolation
(that's Milestone 2, once there's a vector DB to namespace).

---

## API reference

All request/response bodies are JSON. Protected routes require
`Authorization: Bearer <token>`.

| Method | Path | Auth? | Purpose |
|---|---|---|---|
| GET | `/health` | no | Liveness check |
| POST | `/api/auth/register-tenant` | no | Create a new tenant + its first admin user |
| POST | `/api/auth/register-user` | no | Add a user to an existing tenant (`tenantId` required) |
| POST | `/api/auth/login` | no | Log in, get a JWT |
| GET | `/api/me` | yes | Current user + their tenant |
| GET | `/api/tenant/users` | yes | List users in the caller's own tenant |
| GET | `/api/leads` | yes | List leads for the caller's tenant (`?status=` optional filter) |
| GET | `/api/leads/:id` | yes | Get one lead (404 if it belongs to another tenant) |
| POST | `/api/leads` | yes | Create a lead under the caller's tenant |
| PATCH | `/api/leads/:id/status` | yes | Update a lead's status |

`register-user`, `me`, `tenant/users`, and the `leads` routes are
intentionally minimal — the full REST surface the dashboard will consume
is Milestone 4's job. This is just enough to prove the schema and auth
work correctly end to end.

### Example: register a new tenant

```bash
curl -X POST http://localhost:4000/api/auth/register-tenant \
  -H "Content-Type: application/json" \
  -d '{
    "tenantName": "Sunrise Realty",
    "adminName": "Jamie Fox",
    "adminEmail": "jamie@sunriserealty.test",
    "adminPassword": "a-strong-password"
  }'
```

### Example: create a lead

```bash
curl -X POST http://localhost:4000/api/leads \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Alex Rivera", "leadType": "seller", "title": "Homeowner"}'
```

---

## Demo login (after `npm run seed`)

| Email | Password | Role |
|---|---|---|
| admin@meridianrealty.test | demo-password-123 | admin |
| agent@meridianrealty.test | demo-password-123 | member |

The seed script is idempotent — re-running `npm run seed` wipes and
recreates the Meridian Realty Group tenant (and only that tenant) rather
than duplicating rows.

---

## Project structure

```
src/
  app.js                  Express app assembly (separated from server.listen for testability)
  index.js                Server entry point
  db/
    schema.sql             All table definitions
    client.js              Opens the sqlite connection, applies schema.sql
    repositories/          One file per table — every function takes tenantId explicitly
  middleware/
    auth.js                 JWT verification + req.user, role-check helper
    errorHandler.js
  controllers/
  routes/
  utils/
    jwt.js
scripts/
  seed.js                  Builds the Meridian Realty Group demo tenant
tests/
  tenant-isolation.test.js
data/
  app.db                   Created on first run/seed (gitignored)
```

---

## Design decisions worth flagging

### Why Node's built-in SQLite instead of Prisma or better-sqlite3

The requirements doc lists Postgres/SQLite as the option for this
milestone and Prisma wasn't mandated for the backend layer specifically
(the doc's ORM-adjacent mentions are all Next.js/NextAuth, which is
Milestone 5's concern). Both Prisma and `better-sqlite3` need a
platform-specific native binary downloaded at install time — Prisma from
its own CDN, `better-sqlite3` from GitHub releases. On a network that
blocks either of those (a locked-down corporate proxy, some CI runners, or
— concretely — the sandboxed environment this milestone was built and
tested in), `npm install` fails outright before you ever get to write
code.

Node's built-in `node:sqlite` module (stable enough for this use case,
ships with Node ≥ 22.5) has **zero external dependencies** — no
postinstall download, no native compilation step, so `npm install` is
guaranteed to be enough on any machine with a recent enough Node. The
trade-off is losing Prisma's typed client and `prisma studio` GUI. If you
have unrestricted network access and want those back, see below.

### Switching to Postgres

The schema (`src/db/schema.sql`) is written in close-to-portable SQL on
purpose. Moving to Postgres later mainly means:

1. Swap `src/db/client.js` for a `pg` (or `pg-promise`) connection pool.
2. In `schema.sql`: change `TEXT PRIMARY KEY` id columns to
   `UUID PRIMARY KEY DEFAULT gen_random_uuid()` (or keep generating UUIDs
   in JS with `crypto.randomUUID()`, which already works as-is), and swap
   `datetime('now')` defaults for `now()`.
3. Add row-level security policies keyed on `tenant_id` — this is the one
   genuinely new piece of defense-in-depth Postgres buys you that SQLite
   can't (SQLite has no concept of per-row security policies), and it's
   worth doing given how much the requirements doc emphasizes isolation.
4. The repository layer (`src/db/repositories/*.js`) is the only other
   code that touches SQL directly — everything above it (controllers,
   routes) is unaffected.

### Swapping in an ORM later

If you want Prisma's DX back once you have full network access: `npx
prisma init`, point the `datasource` block at Postgres, translate
`schema.sql` into `schema.prisma` (straightforward — same tables, same
columns), and replace the contents of each file in
`src/db/repositories/` with the equivalent Prisma Client calls while
keeping the same exported function names. Nothing above the repository
layer needs to change.

---

## Known limitations (intentional, for this milestone)

- No refresh tokens — access tokens are long-lived (12h default) for demo
  simplicity. A real product would add short-lived access tokens + refresh
  tokens.
- No per-tenant rate limiting yet (requirements doc section 4) — there's
  no external API usage to rate-limit until Milestone 2/3 add Gemini calls.
- No password reset flow, email verification, or invite-token system for
  `register-user` — anyone who knows a `tenantId` can currently add
  themselves as a member of that tenant. Fine for a single-operator demo,
  not fine for production multi-tenant SaaS — flagging it explicitly so it
  doesn't get forgotten.
- `node:sqlite` is still marked experimental by Node.js upstream. It's
  solid for local dev and this demo; the Postgres migration path above
  is the intended route to production hardening, not a hard requirement
  to fix something broken.
