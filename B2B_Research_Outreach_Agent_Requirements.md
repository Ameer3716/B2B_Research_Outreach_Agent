# B2B Research & Outreach Agent — Requirements & Tech Stack
*(v3 — Milestone 1 complete, build environment moved to Antigravity)*

**Product type:** Multi-tenant, multi-agent RAG system for automated lead research, personalized outreach, and reply tracking
**Purpose:** Portfolio/CV differentiator + sellable product for agencies, recruiters, and sales teams
**Owner:** Sultan

---

## 1. Goal

Build a system where AI agents research a prospect, pull relevant proof points from a knowledge base (case studies, past results, product info), draft a personalized outreach message, send it, and track replies.

Two payoffs at once:
- **CV/LinkedIn:** demonstrates multi-agent orchestration + RAG + vector DB + multi-tenant SaaS architecture
- **Business use:** built multi-tenant from day one, so it's demo-ready to pitch directly to agencies/sales teams as a product

---

## 2. Confirmed Decisions

| Question | Decision |
|---|---|
| Single-tenant or multi-tenant? | Multi-tenant from day one |
| Demo data source | Fictional niche: real estate agencies — tenant = a real estate agency, leads = prospective buyers/sellers/referral partners |
| LLM/embedding providers | Gemini only (no Anthropic/OpenAI/Grok) |
| Frontend | Next.js |
| **Build environment (updated)** | **Google Antigravity IDE.** Working directly in a persistent local project folder — no more zip hand-offs between sessions. Milestone 1 was the last one delivered as a zip. |
| **Milestone 1 model used** | Claude Sonnet, xhigh effort — built outside Antigravity, before the environment switch |

---

## 3. Agent Breakdown (Functional Requirements)

| Agent | Job | Inputs | Outputs |
|---|---|---|---|
| **Orchestrator** | Coordinates the pipeline per tenant, decides next step, handles retries/failures | New lead record + tenant context | Routes to next agent |
| **Research Agent** | Enriches a raw lead into a usable profile — company size, industry, recent signals | Lead's company domain/name | Structured company profile |
| **RAG Agent** | Retrieves the most relevant case study/talking point from *that tenant's* knowledge base | Company profile + query | 1-3 relevant knowledge snippets |
| **Drafting Agent** | Writes a short, personalized outreach message | Company profile + snippets | Draft message (email/LinkedIn) |
| **Review Gate** (human, recommended) | Tenant user approves/edits before sending | Draft message | Approved message |
| **Send Agent** | Sends the approved message via the chosen channel | Approved message | Sent status |
| **Tracking Agent** | Monitors replies/opens, updates lead status, flags hot leads | Inbox/webhook events | Updated CRM record, alerts |

Demo tenant: **Meridian Realty Group** (fictional). Leads = homeowners (sellers), buyers, and referral partners (title companies, mortgage brokers). This is now live in the seed data from Milestone 1.

---

## 4. Multi-Tenancy — Status: Implemented in Milestone 1

What was planned here is now built and tested, not just designed:

- **Data isolation:** every repository function requires `tenantId` as an explicit argument — there's no query path that can skip the tenant filter. `tenantId` is derived from the verified JWT (`req.user.tenantId`), never from the request body/params, so a client can't request another tenant's data by editing a request.
- **Automated isolation test** — `tests/tenant-isolation.test.js` registers two tenants against the real HTTP API and asserts one can never read the other's data (by ID or in a list), plus auth-adjacent checks (missing/tampered token).
- **Vector DB namespacing** — still pending, arrives in Milestone 2 once Chroma is wired in.
- **Not yet done (flagged as known limitations, not blockers):** Postgres row-level security (moot until the Postgres migration), per-tenant API rate limiting (nothing to rate-limit yet until Milestone 2/3 add Gemini calls), and an invite-token system for adding users to a tenant (currently anyone who knows a `tenantId` can self-register into it — fine for a solo demo, needs fixing before any real client uses this).

---

## 5. Tech Stack

| Layer | Recommendation | Notes |
|---|---|---|
| Backend | Node.js/Express | Built in Milestone 1 |
| Database | **Node's built-in `node:sqlite`** (Node ≥ 22.5) | Deviates from the original "Postgres or SQLite" line — chosen because it has zero external/native dependencies (no postinstall download like Prisma or `better-sqlite3` need), so `npm install` works on any restricted network. Schema is written in close-to-portable SQL; migrating to Postgres later is a documented, contained change (see Milestone 1 README) |
| Orchestration | LangGraph.js or a custom lightweight state machine | Milestone 3 |
| Vector DB | Chroma, self-hosted, per-tenant namespaces | Milestone 2 |
| Embeddings | Gemini `gemini-embedding-001` | Free tier | 
| LLM — drafting, research & reasoning | Gemini 3 Flash / Flash-Lite | Free tier |
| Lead/company enrichment | Data provider API (Clearbit, Apollo.io free tier) rather than scraping LinkedIn directly | LinkedIn scraping violates their ToS |
| Email sending | SendGrid or Resend | Milestone 4 |
| Frontend/dashboard | Next.js + shadcn/ui (monochrome theme) | Milestone 5 |
| Auth | JWT (implemented in Milestone 1) | NextAuth.js integration happens on the frontend side in Milestone 5 |
| Hosting | Railway or Render | For eventual deployment |

---

## 6. Data Schema — as actually implemented in Milestone 1

Eight tables, all tenant-scoped:

```
tenants
  └─ users               (tenant_id, unique email within a tenant)
  └─ companies           (tenant_id)
  │     └─ leads         (tenant_id, company_id NULLABLE)
  │           └─ messages (tenant_id, lead_id)
  │                 └─ replies (tenant_id, message_id — tenant_id denormalized directly)
  └─ knowledge_base_entries (tenant_id, embedding — placeholder column for now)
  └─ agent_logs          (tenant_id)
```

Deviations from the original sketch, and why:
- **`leads.company_id` is nullable.** The original schema assumed every lead has a company (B2B-shaped). The real estate demo is mostly individual homeowners with no company — `company_id` is only populated for `referral_partner` leads.
- **`replies.tenant_id` is denormalized** rather than requiring a join through `messages` — cheaper to query and means the isolation layer never has to trust a nested relation.
- **`knowledge_base_entries.embedding` is a nullable placeholder** for now. Once Milestone 2 wires up Chroma, this likely becomes a pointer to the vector-store record rather than the raw vector — actual similarity search happens in Chroma, not the relational DB.

---

## 7. Pipeline Flow

1. Lead comes in for a given tenant (manual upload, CSV import, or form)
2. Orchestrator triggers Research Agent → builds company profile
3. RAG Agent queries that tenant's vector DB namespace → pulls best-fit proof point
4. Drafting Agent writes a short (<125 word) personalized message
5. Tenant user reviews/approves
6. Send Agent delivers via email or LinkedIn
7. Tracking Agent watches for replies, updates lead status
8. Hot replies get flagged for the tenant's user to follow up personally

---

## 8. Success Metrics / KPIs

- Time from lead import to message sent
- Reply rate vs a manual baseline (this is your case-study number)
- % of messages needing edits at the Review Gate (should drop as the drafting agent improves)

---

## 9. Risks & Compliance

- **LinkedIn automation** — heavy scraping/auto-connecting risks account restriction. Use a compliant data API instead.
- **Email deliverability/spam law** — CAN-SPAM/GDPR basics apply to real contact data: include opt-out, don't over-send.
- **Multi-tenant data isolation** — largest technical risk; mitigated in Milestone 1 via required `tenantId` params + automated isolation test (see section 4).
- **Backlog items from Milestone 1** (not urgent for a solo demo, needed before any real client uses this): invite-token system for tenant user registration, per-tenant API rate limiting once Gemini calls exist, short-lived access tokens + refresh tokens instead of long-lived JWTs.

---

## 10. Open Items

None outstanding on decisions. Two implementation backlog items carried from Milestone 1 (see section 9) to address before real client use, not before continuing the build.

---

## 11. Build Milestones — now built in Antigravity, working folder instead of zip hand-offs

Milestone 1 was built and delivered as a zip (Claude Sonnet, xhigh effort), before the move to Antigravity. From Milestone 2 onward, the workflow changes: **work happens directly in the same persistent project folder inside Antigravity's IDE — no exporting or re-uploading between sessions.** Just open the folder and continue.

Model choice per milestone in Antigravity (per the earlier Opus 4.6 vs Sonnet 4.6 quota discussion — Opus for the two milestones where a design mistake is expensive, Sonnet for the higher-volume/more mechanical ones):

| # | Milestone | Scope | Model (in Antigravity) | Status |
|---|---|---|---|---|
| 1 | Backend foundation | Multi-tenant schema, JWT auth, tenant isolation test, seed data for Meridian Realty Group | Claude Sonnet, xhigh (built pre-Antigravity) | ✅ Done |
| 2 | RAG layer | Gemini embeddings, Chroma with per-tenant namespaces, KB ingestion script, standalone retrieval test | Sonnet 4.6 | Next |
| 3 | Agent pipeline | Orchestrator, Research Agent, RAG Agent, Drafting Agent, Review Gate — wired end to end | **Opus 4.6** | — |
| 4 | Send + tracking | Email sending, reply/webhook handling, Tracking Agent, full REST API | Sonnet 4.6 | — |
| 5 | Dashboard | Next.js + shadcn/ui, tenant login, lead list, KB upload, message review, reply tracking | Sonnet 4.6 | — |
| 6 | Demo polish | Realistic demo data, walkthrough script, README/case-study writeup | Sonnet 4.6 | — |

**Starting the next milestone in Antigravity:** open the existing project folder, point the agent at it, and prompt something like:

> "This is Milestone 2 of the B2B Research & Outreach Agent — multi-tenant, Gemini-only, real estate demo tenant (Meridian Realty Group). Milestone 1 (schema, auth, tenant isolation) is already in this folder — see the README for what's built. Build Milestone 2: Gemini embeddings + Chroma vector DB with per-tenant namespaces, a knowledge base ingestion script, and a standalone retrieval test."

No zip needed — the agent works against the folder directly, and each milestone's changes just accumulate in place. Worth committing to git between milestones (mentioned as a safety net in the Antigravity research) so a bad agent run can be rolled back without losing prior milestones.
