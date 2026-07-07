# Meridian Realty Group — Demo Walkthrough Script

> **Audience:** Technical interviewers, agency/sales-team prospects, portfolio reviewers.
> **Runtime:** ~12 minutes (live), or read-through in ~4 minutes.
> **Format:** Screen-share of the live system — backend on port 4000, dashboard on port 3000.

---

## Before you start (setup checklist)

```bash
# 1. Terminal A — backend
cd b2b-outreach-agent
npm install          # first time only
npm run seed         # reset to clean demo state
npm start            # http://localhost:4000

# 2. Terminal B — Chroma (vector DB)
docker-compose up -d

# 3. Terminal C — embed KB entries into Chroma
cd b2b-outreach-agent
npm run ingest-kb    # needs GEMINI_API_KEY in .env

# 4. Terminal D — dashboard
cd dashboard
node run-dev.js      # http://localhost:3000
```

Credentials:
- **Email:** `admin@meridianrealty.test`
- **Password:** `demo-password-123`

---

## Act 1 — Log in & orient (1 min)

1. Open `http://localhost:3000` — redirects to `/login`.
2. Enter the demo credentials and click **Sign in**.
3. Land on the **Overview** dashboard.

**Talking points:**
- "This is Meridian Realty Group's workspace. The system is fully multi-tenant — you could spin up a second tenant for a competing agency and the data would be completely isolated at the query level, not just the UI level."
- Point to the 4 metric cards: **14 leads, 3 messages sent, 2 hot leads** flagged.
- Point to the lead funnel: every pipeline stage is populated — you can see where leads cluster.

---

## Act 2 — Lead pipeline (2 min)

1. Navigate to **Leads**.
2. Show the full table — 14 leads, all different types (sellers, buyers, expired listings, referral partners) and statuses.
3. Use the **status filter** to show only `hot` — Chris Delgado and Petra Walsh appear.
4. Click **Chris Delgado** to open the lead detail.

**Talking points:**
- "Chris is a homeowner whose listing expired after 120 days. The Research Agent pulled that signal from the notes. The pipeline ran: Research → RAG → Drafting."
- Show the pipeline progress tracker — all steps filled.
- "The sent message is there — and he replied within hours asking for a same-day call. The Tracking Agent classified that as positive sentiment + hot lead. Status updated automatically."

5. Go back. Click **Alex Rivera** (status: new).
6. Click **Run Pipeline**. Wait ~15 seconds. (Needs API key + Chroma running.)
7. Show the result card: research profile summary, RAG snippets used, draft body, word count.

**Talking points:**
- "The Research Agent built a profile from the lead notes. The RAG Agent pulled the most relevant case study from the 12 KB entries — in this case the expired-listing proof point. The Drafting Agent wrote a 65-word email. All three Gemini calls, one pipeline run."

---

## Act 3 — Review, approve, send (2 min)

1. Click **Review Draft →** from the lead detail, or navigate to **Messages**.
2. Show the messages list — 1 draft (Morgan Lee), 2 approved+sent, etc.
3. Click on Morgan Lee's draft. The draft text appears in an editable textarea.
4. Make a small edit — swap a word, show it's live.
5. Click **Approve Draft**.
6. Status changes to `approved`. The **Send Now** button appears.
7. Click **Send Now**.
8. Status updates to `sent`. Lead status → `sent`.

**Talking points:**
- "This is the Review Gate. No message goes out without a human sign-off. The agent drafts, the agent sends, but the human is always in the loop for approval."
- "In the demo we use simulated sending — it logs to the console. You can flip `EMAIL_PROVIDER=resend` in `.env` and add a Resend API key to send real emails."

---

## Act 4 — Reply tracking (2 min)

1. Navigate to **Messages**, click the sent message for **Chris Delgado**.
2. The reply is already there — scroll down to the **Replies** section.
3. Show: sentiment badge (`positive`), 🔥 Hot Lead flag.
4. Go back to the detail for **Taylor Nguyen's** message. Show a positive reply without the hot flag.
5. Navigate to **Reply Inbox** — show all 3 replies, sentiment color-coded.

**Talking points:**
- "Every inbound reply goes through the Tracking Agent — a Gemini Flash call with a structured JSON output spec. It classifies sentiment, decides if the lead qualifies as hot, and updates the CRM status. No manual tagging."
- "Positive replies that explicitly request a call or meeting get flagged as hot leads. Neutral replies don't. Negative replies would trigger a different follow-up path."

---

## Act 5 — Knowledge base (1 min)

1. Navigate to **Knowledge Base**.
2. Show the 12 entries — case studies, testimonials, objection handling, market data.
3. Add a new entry live: paste in a testimonial, add tags `testimonial,buyer`.
4. Click **Add Entry**. Entry appears in the list immediately.

**Talking points:**
- "This is the tenant's own RAG corpus. The more you add, the more specific the drafts get. Case studies from past deals, testimonials, objection scripts — whatever the agent uses in real conversations."
- "After adding new entries you'd run `npm run ingest-kb` to embed them into Chroma. The API endpoint exists for a future automated ingestion flow."

---

## Act 6 — Agent logs (1 min)

1. Navigate to **Agent Logs**.
2. Show the full log — 8 entries from the Chris and Taylor pipeline runs.
3. Click a row to expand — show the raw input/output JSON.
4. Use the filter to show only `tracking` agent logs.

**Talking points:**
- "Every agent run is logged. This is the full audit trail — what went in, what came out, how long it took. In a production deployment you'd hook this into an alerting system."
- "The send agent logged `durationMs: 687` for the RAG retrieval — that's a Chroma vector search over 12 embedded entries. Scales to thousands without changing the architecture."

---

## Act 7 — Multi-tenancy proof (1 min)

> Skip this in a sales demo. Show it to technical interviewers.

```bash
# In a new terminal — register a second tenant via the API
curl -s -X POST http://localhost:4000/api/auth/register-tenant \
  -H "Content-Type: application/json" \
  -d '{"tenantName":"Apex Realty","adminName":"Test","adminEmail":"admin@apex.test","adminPassword":"test-pass"}' \
  | jq .

# Get token for Apex
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@apex.test","password":"test-pass"}' \
  | jq -r .token)

# Try to access Meridian's leads — expect 200 but empty list
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/leads | jq .leads
```

**Talking point:** "Returns an empty array, not a 403. The tenant filter is baked into every repository query — there's no code path that accidentally leaks cross-tenant data. The isolation test suite covers this."

---

## Closing — Architecture recap (1 min)

```
Frontend (Next.js 16)          Backend (Node/Express)         Services
─────────────────────          ──────────────────────         ────────
Login → cookie JWT  ──────►  /api/auth/login               JWT + bcrypt
Dashboard stats      ──────►  /api/dashboard/stats          SQLite
Lead table           ──────►  /api/leads                    node:sqlite
Run pipeline         ──────►  /api/pipeline/run    ──────►  Gemini Flash (Research)
                               │                   ──────►  Chroma + Gemini Embed (RAG)
                               │                   ──────►  Gemini Flash (Drafting)
Approve + send       ──────►  /api/pipeline/approve
                     ──────►  /api/pipeline/send   ──────►  Resend / Simulated
Reply webhook        ──────►  /api/replies/webhook ──────►  Gemini Flash (Tracking)
KB manager           ──────►  /api/knowledge-base  ──────►  Chroma (embed + upsert)
Agent logs           ──────►  /api/agent-logs               SQLite
```

**Five things to highlight for a CV/interview:**
1. **Multi-tenant isolation** — every query enforces `tenantId`; automated test proves it
2. **RAG pipeline** — per-tenant Chroma namespaces, Gemini embeddings, similarity search
3. **Agent orchestration** — linear state machine, each agent a pure async function
4. **Full REST API** — 18 endpoints, JWT auth, standardised error handling
5. **Production-ready structure** — repository pattern, dependency injection via env vars, pluggable email provider

---

*Meridian Realty Group is a fictional company created for this demo. All lead names, emails, and case-study figures are invented.*
