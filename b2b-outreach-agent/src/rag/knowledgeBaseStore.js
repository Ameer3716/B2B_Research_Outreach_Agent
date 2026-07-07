// ============================================================================
// Knowledge Base Store (Milestone 2)
// ----------------------------------------------------------------------------
// Higher-level operations that compose geminiEmbedder + chromaClient into
// the three operations the rest of the system needs:
//
//   ingestEntry({ tenantId, id, content, tags })
//     → Embeds the content and upserts it into the tenant's Chroma collection.
//       Returns the Chroma document ID (same as the SQLite KB entry ID).
//
//   queryKnowledgeBase({ tenantId, queryText, nResults = 3 })
//     → Embeds the query and runs ANN search in the tenant's collection.
//       Returns ranked [{id, content, tags, distance}] (most relevant first).
//
//   deleteEntry({ tenantId, id })
//     → Removes a single document from the tenant's Chroma collection.
//       Used when re-ingesting or cleaning up stale entries.
//
// The document ID used in Chroma is the same UUID as the SQLite
// knowledge_base_entries.id, so cross-referencing is trivial.
// ============================================================================

"use strict";

const { embedDocuments, embedQuery } = require("./geminiEmbedder");
const {
  getOrCreateTenantCollection,
} = require("./chromaClient");

/**
 * Embed and upsert a single KB entry into the tenant's Chroma collection.
 *
 * Uses `upsert` (not `add`) so running ingest multiple times is idempotent —
 * re-ingesting the same entry just refreshes the embedding.
 *
 * @param {{ tenantId: string, id: string, content: string, tags: string|string[] }} entry
 * @returns {Promise<string>} the Chroma document ID (same as the entry's SQLite id)
 */
async function ingestEntry({ tenantId, id, content, tags }) {
  const collection = await getOrCreateTenantCollection(tenantId);

  // Normalise tags to a comma-separated string for Chroma metadata.
  // Chroma metadata values must be strings, numbers, or booleans.
  const tagsStr = Array.isArray(tags) ? tags.join(",") : (tags || "");

  // Embed the document content using the RETRIEVAL_DOCUMENT task type.
  const [embedding] = await embedDocuments([content]);

  await collection.upsert({
    ids: [id],
    embeddings: [embedding],
    documents: [content],
    metadatas: [
      {
        tenant_id: tenantId,
        tags: tagsStr,
        entry_id: id,
      },
    ],
  });

  return id;
}

/**
 * Query the tenant's knowledge base for the most relevant entries.
 *
 * @param {{ tenantId: string, queryText: string, nResults?: number }} opts
 * @returns {Promise<Array<{ id: string, content: string, tags: string[], distance: number }>>}
 */
async function queryKnowledgeBase({ tenantId, queryText, nResults = 3 }) {
  const collection = await getOrCreateTenantCollection(tenantId);

  // Get the collection count — if it's empty, return immediately to avoid
  // a Chroma error ("Collection has no embeddings to query").
  const count = await collection.count();
  if (count === 0) {
    return [];
  }

  // Embed the query text using the RETRIEVAL_QUERY task type.
  const queryEmbedding = await embedQuery(queryText);

  // Cap nResults at actual collection size (Chroma throws if nResults > count)
  const safeNResults = Math.min(nResults, count);

  const results = await collection.query({
    queryEmbeddings: [queryEmbedding],
    nResults: safeNResults,
    include: ["documents", "metadatas", "distances"],
  });

  // results.ids[0], results.documents[0], etc. — index 0 is for our single query embedding
  const ids = results.ids[0] || [];
  const documents = results.documents[0] || [];
  const metadatas = results.metadatas[0] || [];
  const distances = results.distances[0] || [];

  return ids.map((id, i) => ({
    id,
    content: documents[i],
    tags: metadatas[i]?.tags ? metadatas[i].tags.split(",").filter(Boolean) : [],
    distance: distances[i],
  }));
}

/**
 * Remove a single entry from the tenant's Chroma collection.
 * Silently succeeds if the document doesn't exist in Chroma.
 *
 * @param {{ tenantId: string, id: string }} opts
 * @returns {Promise<void>}
 */
async function deleteEntry({ tenantId, id }) {
  const collection = await getOrCreateTenantCollection(tenantId);
  try {
    await collection.delete({ ids: [id] });
  } catch (err) {
    // Chroma throws if the ID isn't in the collection — that's fine.
    if (!err.message?.includes("not found") && !err.message?.includes("does not exist")) {
      throw err;
    }
  }
}

module.exports = { ingestEntry, queryKnowledgeBase, deleteEntry };
