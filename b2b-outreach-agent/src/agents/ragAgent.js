// ============================================================================
// RAG Agent (Milestone 3)
// ----------------------------------------------------------------------------
// Queries the tenant's Chroma knowledge base for the most relevant proof
// points given the research profile. This agent does NOT call Gemini for
// generation — it calls the Milestone 2 queryKnowledgeBase() function,
// which handles embedding the query and running ANN search internally.
//
// The query string is constructed from the research profile's summary and
// pain points, giving the embedding model enough semantic signal to surface
// the right case study / testimonial / objection-handling tip.
// ============================================================================

"use strict";

const { queryKnowledgeBase } = require("../rag/knowledgeBaseStore");
const { logAgentRun } = require("../db/repositories/agentLogs");

/**
 * Run the RAG Agent on a pipeline context.
 *
 * @param {object} context Pipeline context with researchProfile
 * @param {string} context.tenantId
 * @param {string} context.leadId
 * @param {object} context.researchProfile
 * @returns {Promise<object>} Updated context with knowledgeSnippets added
 */
async function runRagAgent(context) {
  const { tenantId, leadId, researchProfile } = context;

  // Build a semantic query from the research profile.
  // Combining summary + pain points + talking point suggestions gives the
  // embedding model a rich signal to match against the KB documents.
  const queryParts = [
    researchProfile.summary,
    ...(researchProfile.painPoints || []),
    ...(researchProfile.talkingPointSuggestions || []),
  ];
  const queryText = queryParts.filter(Boolean).join(" ");

  let knowledgeSnippets;
  try {
    knowledgeSnippets = await queryKnowledgeBase({
      tenantId,
      queryText,
      nResults: 3,
    });
  } catch (err) {
    logAgentRun({
      tenantId,
      agentName: "rag",
      input: { leadId, queryText: queryText.slice(0, 200) },
      output: { error: err.message },
      status: "error",
    });
    throw err;
  }

  // Log successful run
  logAgentRun({
    tenantId,
    agentName: "rag",
    input: { leadId, queryText: queryText.slice(0, 200) },
    output: {
      resultCount: knowledgeSnippets.length,
      topResultId: knowledgeSnippets[0]?.id || null,
      topResultDistance: knowledgeSnippets[0]?.distance ?? null,
    },
    status: "success",
  });

  return {
    ...context,
    knowledgeSnippets,
  };
}

module.exports = { runRagAgent };
