// ============================================================================
// Chroma Client Wrapper (Milestone 2)
// ----------------------------------------------------------------------------
// Manages a singleton ChromaClient connection and provides a clean API for
// the per-tenant collection naming convention used throughout this project.
//
// Namespace strategy: one Chroma collection per tenant, named `kb_<tenantId>`.
// This mirrors the SQLite repository pattern (every function takes tenantId
// explicitly) and gives hard isolation — one tenant's data can never appear
// in another's search results, and dropping a tenant is a single
// collection.delete() call.
//
// Exports:
//   getOrCreateTenantCollection(tenantId) → Promise<Collection>
//   deleteTenantCollection(tenantId)      → Promise<void>
//   pingChroma()                          → Promise<boolean>
// ============================================================================

"use strict";

const { ChromaClient, CloudClient } = require("chromadb");

const isCloud = !!(process.env.CHROMA_API_KEY || process.env.CHROMA_HOST);
const CHROMA_URL = isCloud
  ? `https://${process.env.CHROMA_HOST || "api.trychroma.com"}`
  : (process.env.CHROMA_URL || "http://localhost:8000");

/**
 * Collection name for a given tenant.
 * ChromaDB collection names must match [a-zA-Z0-9_-] and be 3-63 chars.
 * We strip the hyphens from the UUID to be safe, prefix with 'kb_'.
 *
 * @param {string} tenantId  UUID string
 * @returns {string}
 */
function collectionName(tenantId) {
  // Replace hyphens so the name is alphanumeric + underscores only
  return `kb_${tenantId.replace(/-/g, "_")}`;
}

let _client = null;

function getChromaClient() {
  if (!_client) {
    if (isCloud) {
      // Chroma Cloud / Hosted Chroma configuration using official CloudClient
      const hostVal = process.env.CHROMA_HOST || "api.trychroma.com";
      const cleanHost = hostVal.replace(/^https?:\/\//, "").split(":")[0];
      const portVal = hostVal.includes(":") ? Number(hostVal.split(":")[1]) : 443;

      _client = new CloudClient({
        apiKey: process.env.CHROMA_API_KEY,
        host: cleanHost,
        port: portVal,
        // Do NOT default these to "default_tenant"/"default_database" —
        // those names only mean something for local self-hosted Chroma.
        // On Chroma Cloud, leaving these undefined lets the SDK
        // auto-resolve the real tenant + database tied to the API key.
        tenant: process.env.CHROMA_TENANT || undefined,
        database: process.env.CHROMA_DATABASE || undefined,
      });
    } else {
      // Local Chroma (Docker / standalone)
      _client = new ChromaClient({ path: CHROMA_URL });
    }
  }
  return _client;
}

/**
 * Get (or create) the Chroma collection for a tenant's knowledge base.
 * The collection stores embeddings alongside the original document text and
 * tag metadata so retrieved results are self-contained (no extra SQLite fetch
 * needed to surface the content).
 *
 * We do NOT pass an embeddingFunction here — embeddings are computed
 * externally by geminiEmbedder.js and passed as raw float arrays, which is
 * the cleanest way to use a custom model with Chroma's JS client.
 *
 * @param {string} tenantId
 * @returns {Promise<import('chromadb').Collection>}
 */
async function getOrCreateTenantCollection(tenantId) {
  const client = getChromaClient();
  const name = collectionName(tenantId);

  // getOrCreateCollection is idempotent — safe to call on every ingest/query.
  const collection = await client.getOrCreateCollection({
    name,
    embeddingFunction: null,
    metadata: {
      description: `Knowledge base for tenant ${tenantId}`,
      tenant_id: tenantId,
      created_by: "b2b-outreach-agent",
    },
  });

  return collection;
}

/**
 * Delete the entire Chroma collection for a tenant (e.g. when a tenant is
 * deleted or to force a full re-ingest).
 *
 * @param {string} tenantId
 * @returns {Promise<void>}
 */
async function deleteTenantCollection(tenantId) {
  const client = getChromaClient();
  const name = collectionName(tenantId);
  try {
    await client.deleteCollection({ name });
  } catch (err) {
    // If the collection doesn't exist, that's fine — already gone.
    if (!err.message?.includes("does not exist") && !err.message?.includes("not found")) {
      throw err;
    }
  }
}

/**
 * Quick connectivity check — returns true if Chroma is reachable, false otherwise.
 * Used by scripts and tests to give a clean error when Chroma isn't running.
 *
 * @returns {Promise<boolean>}
 */
async function pingChroma() {
  try {
    const client = getChromaClient();
    await client.heartbeat();
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  getOrCreateTenantCollection,
  deleteTenantCollection,
  pingChroma,
  collectionName,
  CHROMA_URL,
};