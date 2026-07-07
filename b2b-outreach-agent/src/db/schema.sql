-- ============================================================================
-- B2B Research & Outreach Agent — Milestone 1 Data Model
-- ============================================================================
-- Design principles (see README "Multi-Tenancy Notes"):
--   1. Every business table carries a tenant_id column, even where it could
--      technically be derived through a join (e.g. replies -> messages ->
--      tenant). Storing it directly means every query can filter on
--      tenant_id with no join required, and the repository layer
--      (src/db/repositories/*.js) never has to "trust" a nested relation to
--      enforce isolation — every function takes tenantId as an explicit,
--      non-optional argument.
--   2. tenant_id is indexed on every table for query performance once data
--      volume grows past demo size.
--   3. Written in portable ANSI-ish SQL. The main SQLite-only bits are
--      AUTOINCREMENT-free TEXT primary keys (UUIDs) and `datetime('now')`
--      defaults — both translate directly to Postgres. See README
--      "Switching to Postgres" for the two lines that actually differ.
-- ============================================================================

PRAGMA foreign_keys = ON;

-- ----------------------------------------------------------------------------
-- Tenants — one row per customer organization (e.g. a real-estate agency)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenants (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  industry   TEXT NOT NULL DEFAULT 'real_estate',
  plan       TEXT NOT NULL DEFAULT 'free',                 -- free | pro | enterprise
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ----------------------------------------------------------------------------
-- Users — belongs to exactly one tenant (single-org membership for Milestone 1)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'member',            -- admin | member
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  -- Email only needs to be unique *within* a tenant, not globally — two
  -- different agencies are allowed to both have a "jane@..." user.
  UNIQUE (tenant_id, email)
);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);

-- ----------------------------------------------------------------------------
-- Companies — the org behind a lead (a referral-partner brokerage, mortgage
-- broker, etc). Leads may have no company (individual homeowner leads).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS companies (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  domain          TEXT,
  name            TEXT NOT NULL,
  industry        TEXT,
  size            TEXT,                                    -- free text, e.g. "1-10"
  enrichment_data TEXT,                                     -- JSON blob (Research Agent, Milestone 3)
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_companies_tenant ON companies(tenant_id);

-- ----------------------------------------------------------------------------
-- Leads — a prospective buyer/seller/referral partner for the demo tenant
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS leads (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
  name       TEXT NOT NULL,
  email      TEXT,
  phone      TEXT,
  title      TEXT,                                         -- e.g. "Homeowner", "Loan Officer"
  lead_type  TEXT NOT NULL DEFAULT 'buyer',                 -- buyer | seller | expired_listing | referral_partner
  source     TEXT NOT NULL DEFAULT 'manual',                -- manual | csv_import | form
  status     TEXT NOT NULL DEFAULT 'new',                   -- new | researching | drafted | sent | replied | hot | closed
  notes      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_leads_tenant ON leads(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leads_tenant_status ON leads(tenant_id, status);

-- ----------------------------------------------------------------------------
-- Knowledge base entries — case studies / testimonials / objection handling
-- per tenant. `embedding` is a placeholder in Milestone 1; Milestone 2 wires
-- this up to Gemini embeddings + a Chroma vector store namespaced per
-- tenant, at which point this column most likely becomes a pointer to the
-- Chroma record rather than the raw vector itself.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS knowledge_base_entries (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  tags       TEXT NOT NULL DEFAULT '',                      -- comma-separated, e.g. "case_study,follow_up"
  embedding  TEXT,                                          -- reserved for Milestone 2
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_kb_tenant ON knowledge_base_entries(tenant_id);

-- ----------------------------------------------------------------------------
-- Messages — outreach drafts and sent messages
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS messages (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id       TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  draft_text    TEXT,
  approved_text TEXT,
  channel       TEXT NOT NULL DEFAULT 'email',              -- email | linkedin
  status        TEXT NOT NULL DEFAULT 'draft',               -- draft | approved | sent | failed
  sent_at       TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_tenant ON messages(tenant_id);

-- ----------------------------------------------------------------------------
-- Replies — inbound replies to a sent message
-- (tenant_id is denormalized from messages for direct tenant-scoped queries)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS replies (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  message_id  TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  sentiment   TEXT,                                         -- positive | neutral | negative (Milestone 4)
  is_hot_lead INTEGER NOT NULL DEFAULT 0,                    -- boolean as 0/1
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_replies_tenant ON replies(tenant_id);

-- ----------------------------------------------------------------------------
-- Agent logs — every agent invocation, for debugging + the demo walkthrough
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_logs (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_name TEXT NOT NULL,                                 -- orchestrator | research | rag | drafting | send | tracking
  input      TEXT,                                          -- JSON-stringified
  output     TEXT,                                          -- JSON-stringified
  status     TEXT NOT NULL DEFAULT 'success',                -- success | error
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_agent_logs_tenant ON agent_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_agent_logs_tenant_agent ON agent_logs(tenant_id, agent_name);
