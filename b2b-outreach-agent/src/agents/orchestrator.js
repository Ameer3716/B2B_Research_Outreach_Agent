// ============================================================================
// Orchestrator (Milestone 3)
// ----------------------------------------------------------------------------
// Runs the full agent pipeline for a single lead:
//
//   1. Load lead (+ company) from DB
//   2. Validate: lead exists, belongs to tenant, is in actionable status
//   3. Run stages in sequence: Research → RAG → Drafting
//   4. Handle errors at each stage (log, rethrow with context)
//   5. Return the full pipeline context
//
// The orchestrator is a plain async function, not a class — easy to call
// from the REST controller, from a script, or from tests. The "state machine"
// is just a for-loop through the ordered stage array, which is the right
// abstraction for a linear pipeline with no branching.
//
// If the pipeline grows to need conditional routing (e.g. Milestone 4's
// Send Agent with channel-specific paths), the stage array can become a
// DAG — the individual agent functions don't change, only this file.
// ============================================================================

"use strict";

const { getLeadById } = require("../db/repositories/leads");
const { getCompanyById } = require("../db/repositories/companies");
const { logAgentRun } = require("../db/repositories/agentLogs");

const { runResearchAgent } = require("./researchAgent");
const { runRagAgent } = require("./ragAgent");
const { runDraftingAgent } = require("./draftingAgent");

// Ordered pipeline stages. Each is an async function that takes a context
// object and returns an updated context. The orchestrator runs them in
// sequence, passing the output of one as the input to the next.
const STAGES = [
  { name: "research", fn: runResearchAgent },
  { name: "rag", fn: runRagAgent },
  { name: "drafting", fn: runDraftingAgent },
];

// Statuses that allow a pipeline run. "new" is the normal entry point.
// "researching" is allowed so a partially-failed run can be retried.
const ACTIONABLE_STATUSES = ["new", "researching"];

/**
 * Run the full agent pipeline for a single lead.
 *
 * @param {object} opts
 * @param {string} opts.tenantId  From the verified JWT — never from req.body
 * @param {string} opts.leadId    The lead to process
 * @returns {Promise<object>} The full pipeline context
 * @throws {Error} If validation fails or any stage errors out
 */
async function runPipeline({ tenantId, leadId }) {
  // ---- Load and validate ---------------------------------------------------

  const lead = getLeadById(tenantId, leadId);
  if (!lead) {
    const err = new Error(`Lead not found: ${leadId}`);
    err.status = 404;
    throw err;
  }

  if (!ACTIONABLE_STATUSES.includes(lead.status)) {
    const err = new Error(
      `Lead "${lead.name}" is in status "${lead.status}" — ` +
        `pipeline can only run on leads in status: ${ACTIONABLE_STATUSES.join(", ")}`
    );
    err.status = 409; // Conflict — the lead is already past this point
    throw err;
  }

  // Load company if the lead has one (referral partners)
  const company = lead.company_id
    ? getCompanyById(tenantId, lead.company_id)
    : null;

  // ---- Build initial context -----------------------------------------------

  let context = {
    tenantId,
    leadId,
    lead,
    company,
    researchProfile: null,
    knowledgeSnippets: null,
    draftMessage: null,
    pipelineStages: [],
  };

  // ---- Run stages in sequence ----------------------------------------------

  const startTime = Date.now();

  for (const stage of STAGES) {
    const stageStart = Date.now();
    try {
      context = await stage.fn(context);
      context.pipelineStages.push({
        name: stage.name,
        status: "success",
        durationMs: Date.now() - stageStart,
      });
    } catch (err) {
      context.pipelineStages.push({
        name: stage.name,
        status: "error",
        error: err.message,
        durationMs: Date.now() - stageStart,
      });

      // Log the orchestrator-level failure
      logAgentRun({
        tenantId,
        agentName: "orchestrator",
        input: { leadId, failedStage: stage.name },
        output: {
          error: err.message,
          completedStages: context.pipelineStages
            .filter((s) => s.status === "success")
            .map((s) => s.name),
        },
        status: "error",
      });

      // Re-throw with additional context
      const pipelineErr = new Error(
        `Pipeline failed at stage "${stage.name}": ${err.message}`
      );
      pipelineErr.status = err.status || 500;
      pipelineErr.stage = stage.name;
      pipelineErr.pipelineContext = context;
      throw pipelineErr;
    }
  }

  // ---- Log successful completion -------------------------------------------

  const totalDurationMs = Date.now() - startTime;

  logAgentRun({
    tenantId,
    agentName: "orchestrator",
    input: { leadId },
    output: {
      stages: context.pipelineStages,
      totalDurationMs,
      messageId: context.draftMessage?.messageId || null,
    },
    status: "success",
  });

  context.totalDurationMs = totalDurationMs;

  return context;
}

module.exports = { runPipeline, ACTIONABLE_STATUSES };
