// ============================================================================
// KB Ingestion Script (Milestone 2)
// ----------------------------------------------------------------------------
// Reads all knowledge_base_entries from SQLite, embeds each one via Gemini,
// upserts into the tenant's Chroma collection, and writes the Chroma document
// ID back to the `embedding` column in SQLite (acts as a sync pointer).
//
// Usage:
//   npm run ingest-kb                     # ingest all tenants
//   npm run ingest-kb -- --tenant <id>    # ingest a specific tenant only
//
// Safe to re-run: Chroma upsert is idempotent. Re-running refreshes the
// embedding if the content has changed and updates the SQLite pointer.
//
// Prerequisites:
//   1. GEMINI_API_KEY set in .env
//   2. Chroma running: docker-compose up -d
//   3. Database seeded: npm run seed
// ============================================================================

"use strict";

require("dotenv").config();

const db = require("../src/db/client");
const { ingestEntry } = require("../src/rag/knowledgeBaseStore");
const { pingChroma, CHROMA_URL } = require("../src/rag/chromaClient");

// ---- Argument parsing -------------------------------------------------------

const args = process.argv.slice(2);
const tenantFlagIdx = args.indexOf("--tenant");
const filterTenantId = tenantFlagIdx !== -1 ? args[tenantFlagIdx + 1] : null;

// ---- Guards -----------------------------------------------------------------

async function main() {
  // 1. Check for Gemini API key
  if (!process.env.GEMINI_API_KEY) {
    console.error(
      "\n[ingest-kb] ERROR: GEMINI_API_KEY is not set.\n" +
        "Add it to your .env file and re-run.\n"
    );
    process.exit(1);
  }

  // 2. Check Chroma connectivity
  console.log(`[ingest-kb] Checking Chroma at ${CHROMA_URL}…`);
  const chromaUp = await pingChroma();
  if (!chromaUp) {
    console.error(
      `\n[ingest-kb] ERROR: Cannot reach Chroma at ${CHROMA_URL}.\n` +
        "Start it with:  docker-compose up -d\n" +
        "Then re-run:    npm run ingest-kb\n"
    );
    process.exit(1);
  }
  console.log("[ingest-kb] Chroma is reachable. ✓\n");

  // ---- Fetch entries from SQLite --------------------------------------------

  let rows;
  if (filterTenantId) {
    // Validate the tenant exists
    const tenant = db
      .prepare("SELECT id, name FROM tenants WHERE id = ?")
      .get(filterTenantId);
    if (!tenant) {
      console.error(
        `[ingest-kb] ERROR: No tenant found with id "${filterTenantId}".`
      );
      process.exit(1);
    }
    console.log(
      `[ingest-kb] Filtering to tenant: ${tenant.name} (${tenant.id})\n`
    );
    rows = db
      .prepare(
        `SELECT kbe.id, kbe.tenant_id, kbe.content, kbe.tags, t.name AS tenant_name
         FROM knowledge_base_entries kbe
         JOIN tenants t ON t.id = kbe.tenant_id
         WHERE kbe.tenant_id = ?
         ORDER BY kbe.created_at ASC`
      )
      .all(filterTenantId);
  } else {
    rows = db
      .prepare(
        `SELECT kbe.id, kbe.tenant_id, kbe.content, kbe.tags, t.name AS tenant_name
         FROM knowledge_base_entries kbe
         JOIN tenants t ON t.id = kbe.tenant_id
         ORDER BY kbe.tenant_id, kbe.created_at ASC`
      )
      .all();
  }

  if (rows.length === 0) {
    console.log(
      "[ingest-kb] No knowledge base entries found. Run `npm run seed` first."
    );
    process.exit(0);
  }

  console.log(`[ingest-kb] Found ${rows.length} entry/entries to ingest.\n`);

  // ---- Ingest each entry ---------------------------------------------------

  const updateEmbeddingStmt = db.prepare(
    `UPDATE knowledge_base_entries SET embedding = ?, updated_at = datetime('now') WHERE id = ?`
  );

  let successCount = 0;
  let errorCount = 0;

  for (const row of rows) {
    const label = `[${row.tenant_name}] entry ${row.id}`;
    try {
      process.stdout.write(`  Ingesting ${label}… `);

      const chromaId = await ingestEntry({
        tenantId: row.tenant_id,
        id: row.id,
        content: row.content,
        tags: row.tags,
      });

      // Write the Chroma doc ID back to SQLite as the embedding pointer.
      // We store `chroma:<id>` to make it clear what the value represents.
      updateEmbeddingStmt.run(`chroma:${chromaId}`, row.id);

      console.log("✓");
      successCount++;
    } catch (err) {
      console.log(`✗\n    ERROR: ${err.message}`);
      errorCount++;
    }
  }

  // ---- Summary -------------------------------------------------------------

  console.log(`\n[ingest-kb] Done.`);
  console.log(`  ✓ ${successCount} ingested successfully`);
  if (errorCount > 0) {
    console.log(`  ✗ ${errorCount} failed (see errors above)`);
  }

  if (successCount > 0) {
    console.log(`\nYou can now run the retrieval test:`);
    console.log(`  npm run test:rag\n`);
  }
}

main().catch((err) => {
  console.error("\n[ingest-kb] Unexpected error:", err);
  process.exit(1);
});
