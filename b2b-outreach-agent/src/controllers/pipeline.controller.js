// ============================================================================
// Pipeline Controller (Milestone 3 + 4)
// ----------------------------------------------------------------------------
// REST endpoints for the agent pipeline:
//
//   POST /api/pipeline/run       — Run the full pipeline for a lead
//   POST /api/pipeline/approve   — Approve a drafted message (Review Gate)
//   POST /api/pipeline/send      — Send an approved message (Send Agent)
//
// All are protected by the `authenticate` middleware, so tenantId comes
// from the verified JWT, never from the request body.
// ============================================================================

"use strict";

const { runPipeline } = require("../agents/orchestrator");
const { runSendAgent } = require("../agents/sendAgent");
const { approveMessage, getMessageById } = require("../db/repositories/messages");

/**
 * POST /api/pipeline/run
 * Body: { leadId: string }
 *
 * Runs the full agent pipeline (Research → RAG → Drafting) for a single lead.
 * Returns the pipeline result including research profile, knowledge snippets,
 * and the generated draft message.
 */
async function run(req, res, next) {
  const { leadId } = req.body;
  if (!leadId) {
    return res.status(400).json({ error: "leadId is required" });
  }

  try {
    const result = await runPipeline({
      tenantId: req.user.tenantId,
      leadId,
    });

    res.json({
      pipeline: {
        leadId: result.leadId,
        lead: {
          name: result.lead.name,
          title: result.lead.title,
          leadType: result.lead.lead_type,
        },
        researchProfile: result.researchProfile,
        knowledgeSnippets: result.knowledgeSnippets.map((s) => ({
          id: s.id,
          content: s.content,
          tags: s.tags,
          distance: s.distance,
        })),
        draftMessage: result.draftMessage,
        stages: result.pipelineStages,
        totalDurationMs: result.totalDurationMs,
      },
    });
  } catch (err) {
    // Pipeline errors carry a .status from the orchestrator
    if (err.status && err.status < 500) {
      return res.status(err.status).json({
        error: err.message,
        stage: err.stage || null,
      });
    }
    next(err);
  }
}

/**
 * POST /api/pipeline/approve
 * Body: { messageId: string, approvedText?: string }
 *
 * Approves a drafted message (the Review Gate step). If approvedText is
 * provided, the user's edited version is saved. If omitted, the original
 * draft is approved as-is.
 */
function approve(req, res) {
  const { messageId, approvedText } = req.body;
  if (!messageId) {
    return res.status(400).json({ error: "messageId is required" });
  }

  const tenantId = req.user.tenantId;

  // Fetch the message to get the draft text (for approve-as-is case)
  const existing = getMessageById(tenantId, messageId);
  if (!existing) {
    return res.status(404).json({ error: "Message not found" });
  }

  if (existing.status !== "draft") {
    return res.status(409).json({
      error: `Message is in status "${existing.status}" — only "draft" messages can be approved`,
    });
  }

  const textToApprove = approvedText || existing.draft_text;
  const message = approveMessage(tenantId, messageId, textToApprove);

  if (!message) {
    return res.status(404).json({ error: "Message not found" });
  }

  res.json({ message });
}

/**
 * POST /api/pipeline/send
 * Body: { messageId: string }
 *
 * Sends an approved message via the configured email provider (Send Agent).
 */
async function send(req, res, next) {
  const { messageId } = req.body;
  if (!messageId) {
    return res.status(400).json({ error: "messageId is required" });
  }

  try {
    const result = await runSendAgent({
      tenantId: req.user.tenantId,
      messageId,
    });
    res.json({ send: result });
  } catch (err) {
    if (err.status && err.status < 500) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
}

module.exports = { run, approve, send };

