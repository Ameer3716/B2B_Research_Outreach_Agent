// ============================================================================
// RAG Retrieval Integration Test (Milestone 2)
// ----------------------------------------------------------------------------
// Tests the full Gemini → Chroma retrieval pipeline end-to-end:
//   1. Ingests 3 synthetic KB entries into a temporary tenant collection
//   2. Queries with a known-relevant phrase → asserts correct doc is top result
//   3. Queries with a known-irrelevant phrase → asserts the best-match is sane
//   4. Cleans up the temp collection after all tests
//
// HOW TO RUN:
//   npm run test:rag
//
// PREREQUISITES:
//   - GEMINI_API_KEY set in .env (real calls are made — no mocks)
//   - Chroma running: docker-compose up -d
//
// This test is intentionally excluded from the default `npm test` run
// (Milestone 1 isolation suite) because it requires external services.
// It runs only via `npm run test:rag`.
//
// The test auto-skips with a clear message if either prerequisite is missing,
// so it never causes a hard failure in CI without a key/Chroma configured.
// ============================================================================

"use strict";

require("dotenv").config();

const { ingestEntry, queryKnowledgeBase } = require("../src/rag/knowledgeBaseStore");
const { deleteTenantCollection, pingChroma } = require("../src/rag/chromaClient");
const { randomUUID } = require("crypto");

// Use a temporary tenant ID so this test never touches real data
const TEST_TENANT_ID = `test-${randomUUID()}`;

// ---- Synthetic KB entries --------------------------------------------------
// These are minimal but semantically distinct so Gemini embeddings can
// meaningfully distinguish between them.

const ENTRIES = [
  {
    id: randomUUID(),
    content:
      "Case study: Agents who follow up within 1 hour of an expired listing inquiry " +
      "see 3x higher callback rates compared to next-day outreach.",
    tags: ["case_study", "expired_listings", "speed_to_lead"],
  },
  {
    id: randomUUID(),
    content:
      "Referral partners such as title companies and mortgage brokers respond best " +
      "when outreach references a specific mutual client or recent shared transaction.",
    tags: ["objection_handling", "referral_partner"],
  },
  {
    id: randomUUID(),
    content:
      "Buyer leads who are pre-approved respond well to listings that match their " +
      "stated criteria exactly — school district, bedroom count, and commute distance.",
    tags: ["buyer", "personalization"],
  },
];

// ---- Helpers ---------------------------------------------------------------

function skipIfMissingPrereqs(chromaUp) {
  if (!process.env.GEMINI_API_KEY) {
    console.log(
      "\n[test:rag] SKIPPED — GEMINI_API_KEY is not set. " +
        "Add it to .env to run this test.\n"
    );
    return true;
  }
  if (!chromaUp) {
    console.log(
      "\n[test:rag] SKIPPED — Chroma is not reachable. " +
        "Start it with: docker-compose up -d\n"
    );
    return true;
  }
  return false;
}

// ---- Test suite ------------------------------------------------------------

describe("RAG retrieval pipeline (integration)", () => {
  let prereqsMet = false;

  beforeAll(async () => {
    const chromaUp = await pingChroma();
    if (skipIfMissingPrereqs(chromaUp)) {
      return; // tests will be skipped inside each `it` via `prereqsMet`
    }

    prereqsMet = true;

    // Ingest synthetic entries into the temp tenant collection
    console.log(
      `[test:rag] Ingesting ${ENTRIES.length} test entries for temp tenant ${TEST_TENANT_ID}…`
    );

    for (const entry of ENTRIES) {
      await ingestEntry({
        tenantId: TEST_TENANT_ID,
        id: entry.id,
        content: entry.content,
        tags: entry.tags,
      });
      console.log(`  ✓ ingested: ${entry.id}`);
    }

    console.log("[test:rag] Ingestion complete.\n");
  }, 60_000); // Gemini embed calls take a few seconds; 60 s is plenty

  afterAll(async () => {
    if (prereqsMet) {
      await deleteTenantCollection(TEST_TENANT_ID);
      console.log(
        `\n[test:rag] Cleaned up temp tenant collection for ${TEST_TENANT_ID}`
      );
    }
  });

  // ---- Test 1: relevant query surfaces the correct document ----------------

  it(
    "returns the expired-listings case study as the top result for an expired-listing query",
    async () => {
      if (!prereqsMet) return;

      const results = await queryKnowledgeBase({
        tenantId: TEST_TENANT_ID,
        queryText:
          "What's the best strategy for reaching out to homeowners whose listings expired?",
        nResults: 3,
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(3);

      // The top result should be the expired-listings entry
      const topId = results[0].id;
      const expiredEntry = ENTRIES[0];
      expect(topId).toBe(expiredEntry.id);

      // Distance should be relatively small (semantically close)
      expect(results[0].distance).toBeLessThan(1.0);

      // Tags should be preserved correctly
      expect(results[0].tags).toContain("expired_listings");

      console.log(`  Top result distance: ${results[0].distance.toFixed(4)}`);
    },
    30_000
  );

  // ---- Test 2: referral partner query surfaces the correct document ---------

  it(
    "returns the referral partner tip as the top result for a partner outreach query",
    async () => {
      if (!prereqsMet) return;

      const results = await queryKnowledgeBase({
        tenantId: TEST_TENANT_ID,
        queryText:
          "How should I approach a title company or mortgage broker for a referral partnership?",
        nResults: 3,
      });

      expect(results.length).toBeGreaterThan(0);

      // The top result should be the referral partner entry
      const topId = results[0].id;
      const referralEntry = ENTRIES[1];
      expect(topId).toBe(referralEntry.id);

      expect(results[0].tags).toContain("referral_partner");
      console.log(`  Top result distance: ${results[0].distance.toFixed(4)}`);
    },
    30_000
  );

  // ---- Test 3: buyer query surfaces the correct document -------------------

  it(
    "returns the buyer personalization entry as the top result for a buyer-focused query",
    async () => {
      if (!prereqsMet) return;

      const results = await queryKnowledgeBase({
        tenantId: TEST_TENANT_ID,
        queryText:
          "How do I personalise outreach to a pre-approved buyer looking for a home near good schools?",
        nResults: 3,
      });

      expect(results.length).toBeGreaterThan(0);

      const topId = results[0].id;
      const buyerEntry = ENTRIES[2];
      expect(topId).toBe(buyerEntry.id);

      expect(results[0].tags).toContain("buyer");
      console.log(`  Top result distance: ${results[0].distance.toFixed(4)}`);
    },
    30_000
  );

  // ---- Test 4: result shape is correct -------------------------------------

  it("returns results with the expected shape (id, content, tags, distance)", async () => {
    if (!prereqsMet) return;

    const results = await queryKnowledgeBase({
      tenantId: TEST_TENANT_ID,
      queryText: "real estate agent outreach",
      nResults: 2,
    });

    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(typeof r.id).toBe("string");
      expect(typeof r.content).toBe("string");
      expect(Array.isArray(r.tags)).toBe(true);
      expect(typeof r.distance).toBe("number");
      // Content should be non-empty
      expect(r.content.length).toBeGreaterThan(0);
    }
  }, 30_000);

  // ---- Test 5: empty collection returns [] --------------------------------

  it("returns an empty array when the collection has no documents", async () => {
    if (!prereqsMet) return;

    // Use a brand-new tenant ID that has never been ingested
    const emptyTenantId = `test-empty-${randomUUID()}`;
    try {
      const results = await queryKnowledgeBase({
        tenantId: emptyTenantId,
        queryText: "anything",
        nResults: 3,
      });
      expect(results).toEqual([]);
    } finally {
      await deleteTenantCollection(emptyTenantId);
    }
  }, 30_000);
});
