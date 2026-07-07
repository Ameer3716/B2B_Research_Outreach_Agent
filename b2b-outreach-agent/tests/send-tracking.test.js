// ============================================================================
// Send + Tracking Integration Test (Milestone 4)
// ----------------------------------------------------------------------------
// Tests the full operational loop end-to-end:
//
//   1. Registers a test tenant
//   2. Creates a lead with an email address
//   3. Ingests KB entries for RAG
//   4. Runs the full pipeline (Research → RAG → Drafting)
//   5. Approves the draft
//   6. Sends the message via the Send Agent
//   7. Simulates an inbound reply via the webhook
//   8. Validates sentiment classification + hot-lead detection
//   9. Checks full lead status progression: new → ... → sent → replied/hot
//  10. Tests the dashboard stats endpoint
//
// PREREQUISITES:
//   - GEMINI_API_KEY set in .env (real Gemini API calls for pipeline + tracking)
//   - Chroma running: docker-compose up -d
//   - EMAIL_PROVIDER=simulated (default, no real emails sent)
//
// HOW TO RUN:
//   npm run test:send
// ============================================================================

"use strict";

require("dotenv").config();

const path = require("path");
const fs = require("fs");

const TEST_DB_PATH = path.join(__dirname, "..", "data", "test-send.db");
process.env.DATABASE_PATH = TEST_DB_PATH;
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-send";
process.env.NODE_ENV = "test";
process.env.EMAIL_PROVIDER = "simulated"; // Never send real emails in tests

fs.rmSync(TEST_DB_PATH, { force: true });

afterAll(async () => {
  try {
    const db = require("../src/db/client");
    db.close();
  } catch (_) {}
  fs.rmSync(TEST_DB_PATH, { force: true });

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

beforeAll(async () => {
  if (!process.env.GEMINI_API_KEY) {
    console.log(
      "\n[test:send] SKIPPED — GEMINI_API_KEY is not set.\n"
    );
    return;
  }

  const chromaUp = await pingChroma();
  if (!chromaUp) {
    console.log(
      "\n[test:send] SKIPPED — Chroma is not reachable. Start with: docker-compose up -d\n"
    );
    return;
  }

  prereqsMet = true;

  // Register tenant + user
  const regRes = await request(app)
    .post("/api/auth/register-tenant")
    .send({
      tenantName: "Send Test Agency",
      adminName: "Test Admin",
      adminEmail: "admin@sendtest.test",
      adminPassword: "test-password-456",
    });
  expect(regRes.status).toBe(201);
  testTenantId = regRes.body.tenant.id;
  authToken = regRes.body.token;

  // Create a lead WITH an email address (required for sending)
  const leadRes = await request(app)
    .post("/api/leads")
    .set("Authorization", `Bearer ${authToken}`)
    .send({
      name: "Jordan Rivera",
      email: "jordan.rivera@example.test",
      title: "Homeowner",
      leadType: "expired_listing",
      source: "mls_import",
      notes:
        "Listing expired 2 weeks ago after 120 days on market. 3-bed condo in Lakewood. " +
        "Previously listed at $380k — comps show $350-360k range.",
    });
  expect(leadRes.status).toBe(201);
  testLeadId = leadRes.body.lead.id;

  // Ingest KB entries
  const { randomUUID } = require("crypto");
  const entries = [
    {
      content:
        "Case study: Expired listing in Lakewood area — agent contacted within 48 hours, " +
        "suggested price adjustment of 8%, sold within 4 weeks of re-listing.",
      tags: "case_study,expired_listings,pricing",
    },
    {
      content:
        "Testimonial: 'After 4 months of nothing, they came in with a real plan — not just " +
        "'lower the price.' They staged it differently and brought in 3 offers.' — Condo seller, 2024.",
      tags: "testimonial,seller,staging",
    },
  ];
  for (const entry of entries) {
    await ingestEntry({
      tenantId: testTenantId,
      id: randomUUID(),
      content: entry.content,
      tags: entry.tags,
    });
  }
  console.log(`[test:send] Ingested ${entries.length} KB entries.`);
}, 60_000);

// ============================================================================
// Test Suite
// ============================================================================

describe("Send + Tracking (integration)", () => {
  // ---- Pipeline + Approve + Send ------------------------------------------

  it(
    "runs the full loop: pipeline → approve → send",
    async () => {
      if (!prereqsMet) return;

      // 1. Run pipeline
      const pipelineRes = await request(app)
        .post("/api/pipeline/run")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ leadId: testLeadId });
      expect(pipelineRes.status).toBe(200);
      testMessageId = pipelineRes.body.pipeline.draftMessage.messageId;
      expect(testMessageId).toBeTruthy();

      // 2. Approve
      const approveRes = await request(app)
        .post("/api/pipeline/approve")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ messageId: testMessageId });
      expect(approveRes.status).toBe(200);
      expect(approveRes.body.message.status).toBe("approved");

      // 3. Send
      const sendRes = await request(app)
        .post("/api/pipeline/send")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ messageId: testMessageId });
      expect(sendRes.status).toBe(200);
      expect(sendRes.body.send.status).toBe("sent");
      expect(sendRes.body.send.provider).toBe("simulated");

      // Verify lead status is now "sent"
      const leadRes = await request(app)
        .get(`/api/leads/${testLeadId}`)
        .set("Authorization", `Bearer ${authToken}`);
      expect(leadRes.body.lead.status).toBe("sent");

      // Verify message status is "sent"
      const msgRes = await request(app)
        .get(`/api/messages/${testMessageId}`)
        .set("Authorization", `Bearer ${authToken}`);
      expect(msgRes.body.message.status).toBe("sent");
      expect(msgRes.body.message.sent_at).toBeTruthy();
    },
    120_000
  );

  // ---- Reply + Tracking Agent (hot lead) ----------------------------------

  it(
    "processes a positive reply and flags as hot lead",
    async () => {
      if (!prereqsMet || !testMessageId) return;

      const replyRes = await request(app)
        .post("/api/replies/webhook")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          messageId: testMessageId,
          content:
            "Hi there! Yes, I've been really frustrated that it didn't sell. " +
            "I'd love to hear your approach — can we set up a call this week?",
        });

      expect(replyRes.status).toBe(200);
      expect(replyRes.body.reply.sentiment).toBeDefined();
      expect(replyRes.body.reply.replyId).toBeTruthy();

      // This reply explicitly asks for a call — should be hot
      expect(replyRes.body.reply.isHotLead).toBe(true);
      expect(replyRes.body.reply.newLeadStatus).toBe("hot");

      // Verify lead status updated
      const leadRes = await request(app)
        .get(`/api/leads/${testLeadId}`)
        .set("Authorization", `Bearer ${authToken}`);
      expect(leadRes.body.lead.status).toBe("hot");
    },
    60_000
  );

  // ---- Cannot re-send a sent message --------------------------------------

  it("rejects sending an already-sent message", async () => {
    if (!prereqsMet || !testMessageId) return;

    const res = await request(app)
      .post("/api/pipeline/send")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ messageId: testMessageId });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("sent");
  });

  // ---- Replies list endpoint -----------------------------------------------

  it("lists replies for the tenant", async () => {
    if (!prereqsMet) return;

    const res = await request(app)
      .get("/api/replies")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.replies)).toBe(true);
    expect(res.body.replies.length).toBeGreaterThan(0);
    expect(res.body.replies[0].sentiment).toBeTruthy();
  });

  // ---- Messages list endpoint -----------------------------------------------

  it("lists messages with optional status filter", async () => {
    if (!prereqsMet) return;

    const allRes = await request(app)
      .get("/api/messages")
      .set("Authorization", `Bearer ${authToken}`);
    expect(allRes.status).toBe(200);
    expect(allRes.body.messages.length).toBeGreaterThan(0);

    const sentRes = await request(app)
      .get("/api/messages?status=sent")
      .set("Authorization", `Bearer ${authToken}`);
    expect(sentRes.status).toBe(200);
    expect(sentRes.body.messages.every((m) => m.status === "sent")).toBe(true);
  });

  // ---- Dashboard stats -----------------------------------------------------

  it("returns dashboard stats", async () => {
    if (!prereqsMet) return;

    const res = await request(app)
      .get("/api/dashboard/stats")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    const { stats } = res.body;

    expect(stats.leads.total).toBeGreaterThan(0);
    expect(stats.leads.byStatus).toBeDefined();
    expect(stats.messages.total).toBeGreaterThan(0);
    expect(stats.replies.total).toBeGreaterThan(0);
    expect(stats.replies.hotLeads).toBeGreaterThan(0);
    expect(typeof stats.replies.replyRatePercent).toBe("number");
    expect(stats.knowledgeBase.entryCount).toBeGreaterThan(0);
  });

  // ---- Agent logs -----------------------------------------------------------

  it("returns agent logs with optional filter", async () => {
    if (!prereqsMet) return;

    const allRes = await request(app)
      .get("/api/agent-logs")
      .set("Authorization", `Bearer ${authToken}`);
    expect(allRes.status).toBe(200);
    expect(allRes.body.logs.length).toBeGreaterThan(0);

    // Filter by send agent
    const sendRes = await request(app)
      .get("/api/agent-logs?agent=send")
      .set("Authorization", `Bearer ${authToken}`);
    expect(sendRes.status).toBe(200);
    expect(sendRes.body.logs.every((l) => l.agent_name === "send")).toBe(true);
    expect(sendRes.body.logs.length).toBeGreaterThan(0);

    // Filter by tracking agent
    const trackRes = await request(app)
      .get("/api/agent-logs?agent=tracking")
      .set("Authorization", `Bearer ${authToken}`);
    expect(trackRes.status).toBe(200);
    expect(trackRes.body.logs.length).toBeGreaterThan(0);
  });

  // ---- Knowledge base CRUD --------------------------------------------------

  it("supports knowledge base CRUD via REST", async () => {
    if (!prereqsMet) return;

    // List
    const listRes = await request(app)
      .get("/api/knowledge-base")
      .set("Authorization", `Bearer ${authToken}`);
    expect(listRes.status).toBe(200);

    // Create
    const createRes = await request(app)
      .post("/api/knowledge-base")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ content: "Test KB entry from REST API", tags: "test", entryType: "general" });
    expect(createRes.status).toBe(201);
    const newId = createRes.body.entry.id;

    // Get by ID
    const getRes = await request(app)
      .get(`/api/knowledge-base/${newId}`)
      .set("Authorization", `Bearer ${authToken}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.entry.content).toBe("Test KB entry from REST API");

    // Delete
    const delRes = await request(app)
      .delete(`/api/knowledge-base/${newId}`)
      .set("Authorization", `Bearer ${authToken}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body.deleted).toBe(true);
  });

  // ---- Lead update/delete ---------------------------------------------------

  it("supports lead update (PUT) and delete (DELETE)", async () => {
    if (!prereqsMet) return;

    // Create a disposable lead
    const createRes = await request(app)
      .post("/api/leads")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ name: "Disposable Lead", leadType: "buyer" });
    expect(createRes.status).toBe(201);
    const dId = createRes.body.lead.id;

    // Update
    const updateRes = await request(app)
      .put(`/api/leads/${dId}`)
      .set("Authorization", `Bearer ${authToken}`)
      .send({ name: "Updated Lead", email: "updated@example.test", notes: "Updated notes" });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.lead.name).toBe("Updated Lead");
    expect(updateRes.body.lead.email).toBe("updated@example.test");

    // Delete
    const delRes = await request(app)
      .delete(`/api/leads/${dId}`)
      .set("Authorization", `Bearer ${authToken}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body.deleted).toBe(true);

    // Verify deleted
    const getRes = await request(app)
      .get(`/api/leads/${dId}`)
      .set("Authorization", `Bearer ${authToken}`);
    expect(getRes.status).toBe(404);
  });
});
