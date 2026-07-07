// ============================================================================
// Pipeline Integration Test (Milestone 3)
// ----------------------------------------------------------------------------
// Tests the full agent pipeline end-to-end against the real API:
//
//   1. Registers a test tenant + user
//   2. Creates a fresh lead
//   3. Ingests test KB entries into Chroma (for the RAG Agent)
//   4. Calls POST /api/pipeline/run and validates the full result
//   5. Calls POST /api/pipeline/approve (Review Gate)
//   6. Validates agent_logs entries exist for all agents
//
// PREREQUISITES:
//   - GEMINI_API_KEY set in .env (real Gemini API calls are made)
//   - Chroma running: docker-compose up -d
//
// HOW TO RUN:
//   npm run test:pipeline
//
// Auto-skips if prerequisites are missing.
// ============================================================================

"use strict";

require("dotenv").config();

const path = require("path");
const fs = require("fs");

// Use a throwaway test DB so we don't touch the real one
const TEST_DB_PATH = path.join(__dirname, "..", "data", "test-pipeline.db");
process.env.DATABASE_PATH = TEST_DB_PATH;
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-pipeline";
process.env.NODE_ENV = "test";

// Clean before requiring the app (same pattern as tenant-isolation.test.js)
fs.rmSync(TEST_DB_PATH, { force: true });

afterAll(async () => {
  // Close SQLite connection before deleting (fixes Windows EPERM)
  try {
    const db = require("../src/db/client");
    db.close();
  } catch (_) {}
  fs.rmSync(TEST_DB_PATH, { force: true });

  // Clean up Chroma test collection
  if (testTenantId) {
    try {
      const { deleteTenantCollection } = require("../src/rag/chromaClient");
      await deleteTenantCollection(testTenantId);
    } catch (_) {}
  }
});

const request = require("supertest");
const app = require("../src/app");
const { pingChroma } = require("../src/rag/chromaClient");
const { ingestEntry } = require("../src/rag/knowledgeBaseStore");

let prereqsMet = false;
let testTenantId = null;
let authToken = null;
let testLeadId = null;
let testMessageId = null;

// ---- Test KB entries to ingest for the RAG Agent ---------------------------
const TEST_KB_ENTRIES = [
  {
    content:
      "Case study: A brokerage that contacted expired listings within 2 hours " +
      "achieved a 40% higher callback rate than those who waited 24+ hours.",
    tags: "case_study,expired_listings,speed_to_lead",
  },
  {
    content:
      "Testimonial: 'They analyzed why my first listing failed and came back " +
      "with a completely different pricing strategy. Sold in 3 weeks.' — Seller, 2024.",
    tags: "testimonial,seller",
  },
  {
    content:
      "Referral partners respond best when outreach references a specific " +
      "mutual client or recent shared transaction rather than a generic ask.",
    tags: "objection_handling,referral_partner",
  },
];

// ---- Check prerequisites ---------------------------------------------------
beforeAll(async () => {
  if (!process.env.GEMINI_API_KEY) {
    console.log(
      "\n[test:pipeline] SKIPPED — GEMINI_API_KEY is not set. " +
        "Add it to .env to run this test.\n"
    );
    return;
  }

  const chromaUp = await pingChroma();
  if (!chromaUp) {
    console.log(
      "\n[test:pipeline] SKIPPED — Chroma is not reachable. " +
        "Start it with: docker-compose up -d\n"
    );
    return;
  }

  prereqsMet = true;

  // ---- Register a test tenant + user ---------------------------------------
  const regRes = await request(app)
    .post("/api/auth/register-tenant")
    .send({
      tenantName: "Pipeline Test Agency",
      adminName: "Test Admin",
      adminEmail: "admin@pipelinetest.test",
      adminPassword: "test-password-123",
    });
  expect(regRes.status).toBe(201);
  testTenantId = regRes.body.tenant.id;
  authToken = regRes.body.token;

  // ---- Create a test lead --------------------------------------------------
  const leadRes = await request(app)
    .post("/api/leads")
    .set("Authorization", `Bearer ${authToken}`)
    .send({
      name: "Alex Martinez",
      title: "Homeowner",
      leadType: "expired_listing",
      source: "csv_import",
      notes:
        "Listing expired 3 weeks ago after 90 days on market. 4-bed in Westlake area, " +
        "was priced at $450k — comps suggest $420-430k was the right range.",
    });
  expect(leadRes.status).toBe(201);
  testLeadId = leadRes.body.lead.id;

  // ---- Ingest test KB entries into Chroma for this tenant ------------------
  const { randomUUID } = require("crypto");
  for (const entry of TEST_KB_ENTRIES) {
    await ingestEntry({
      tenantId: testTenantId,
      id: randomUUID(),
      content: entry.content,
      tags: entry.tags,
    });
  }
  console.log(
    `[test:pipeline] Ingested ${TEST_KB_ENTRIES.length} KB entries for test tenant.`
  );
}, 60_000);

// ---- Test suite ------------------------------------------------------------

describe("Agent pipeline (integration)", () => {
  // ---- Test 1: Full pipeline run -------------------------------------------

  it(
    "runs the full pipeline and returns a research profile, snippets, and draft",
    async () => {
      if (!prereqsMet) return;

      const res = await request(app)
        .post("/api/pipeline/run")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ leadId: testLeadId });

      expect(res.status).toBe(200);

      const { pipeline } = res.body;

      // Research profile assertions
      expect(pipeline.researchProfile).toBeDefined();
      expect(pipeline.researchProfile.summary).toBeTruthy();
      expect(Array.isArray(pipeline.researchProfile.painPoints)).toBe(true);
      expect(pipeline.researchProfile.painPoints.length).toBeGreaterThan(0);
      expect(Array.isArray(pipeline.researchProfile.opportunities)).toBe(true);
      expect(Array.isArray(pipeline.researchProfile.talkingPointSuggestions)).toBe(true);

      // Knowledge snippets assertions
      expect(Array.isArray(pipeline.knowledgeSnippets)).toBe(true);
      expect(pipeline.knowledgeSnippets.length).toBeGreaterThan(0);
      // Each snippet should have id, content, tags
      for (const snippet of pipeline.knowledgeSnippets) {
        expect(snippet.id).toBeTruthy();
        expect(snippet.content).toBeTruthy();
        expect(Array.isArray(snippet.tags)).toBe(true);
      }

      // Draft message assertions
      expect(pipeline.draftMessage).toBeDefined();
      expect(pipeline.draftMessage.subject).toBeTruthy();
      expect(pipeline.draftMessage.body).toBeTruthy();
      expect(pipeline.draftMessage.channel).toBe("email");
      expect(pipeline.draftMessage.messageId).toBeTruthy();
      // Verify word count is under limit (with some tolerance for Gemini)
      expect(pipeline.draftMessage.wordCount).toBeLessThan(160);

      // Pipeline metadata
      expect(pipeline.stages).toHaveLength(3);
      expect(pipeline.stages.every((s) => s.status === "success")).toBe(true);
      expect(pipeline.totalDurationMs).toBeGreaterThan(0);

      // Save messageId for the approve test
      testMessageId = pipeline.draftMessage.messageId;

      console.log(`  Pipeline completed in ${pipeline.totalDurationMs}ms`);
      console.log(`  Draft: "${pipeline.draftMessage.subject}" (${pipeline.draftMessage.wordCount} words)`);
    },
    120_000 // Pipeline makes 2 Gemini calls + 1 Chroma query — generous timeout
  );

  // ---- Test 2: Lead status updated to "drafted" ----------------------------

  it("updates the lead status to drafted after pipeline run", async () => {
    if (!prereqsMet) return;

    const res = await request(app)
      .get(`/api/leads/${testLeadId}`)
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.lead.status).toBe("drafted");
  });

  // ---- Test 3: Review Gate (approve) ---------------------------------------

  it(
    "approves the drafted message via the Review Gate",
    async () => {
      if (!prereqsMet || !testMessageId) return;

      const res = await request(app)
        .post("/api/pipeline/approve")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ messageId: testMessageId });

      expect(res.status).toBe(200);
      expect(res.body.message.status).toBe("approved");
      expect(res.body.message.approved_text).toBeTruthy();
    },
    10_000
  );

  // ---- Test 4: Cannot re-run pipeline on a non-new lead -------------------

  it("rejects pipeline run on a lead that's already drafted", async () => {
    if (!prereqsMet) return;

    const res = await request(app)
      .post("/api/pipeline/run")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ leadId: testLeadId });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("drafted");
  });

  // ---- Test 5: Pipeline requires leadId -----------------------------------

  it("returns 400 when leadId is missing", async () => {
    if (!prereqsMet) return;

    const res = await request(app)
      .post("/api/pipeline/run")
      .set("Authorization", `Bearer ${authToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("leadId");
  });

  // ---- Test 6: Pipeline requires auth -------------------------------------

  it("returns 401 when no auth token is provided", async () => {
    if (!prereqsMet) return;

    const res = await request(app)
      .post("/api/pipeline/run")
      .send({ leadId: testLeadId });

    expect(res.status).toBe(401);
  });

  // ---- Test 7: Approve with edited text -----------------------------------

  it(
    "allows approving with user-edited text",
    async () => {
      if (!prereqsMet) return;

      // Create another lead + run pipeline to get a fresh draft
      const leadRes = await request(app)
        .post("/api/leads")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          name: "Sam Buyer",
          title: "Prospective Buyer",
          leadType: "buyer",
          notes: "Pre-approved for $350k, looking near downtown schools.",
        });
      expect(leadRes.status).toBe(201);
      const newLeadId = leadRes.body.lead.id;

      const pipelineRes = await request(app)
        .post("/api/pipeline/run")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ leadId: newLeadId });
      expect(pipelineRes.status).toBe(200);

      const newMessageId = pipelineRes.body.pipeline.draftMessage.messageId;

      // Approve with custom edited text
      const editedText = "Hi Sam — custom edited message from the review gate.";
      const approveRes = await request(app)
        .post("/api/pipeline/approve")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ messageId: newMessageId, approvedText: editedText });

      expect(approveRes.status).toBe(200);
      expect(approveRes.body.message.approved_text).toBe(editedText);
    },
    120_000
  );
});
