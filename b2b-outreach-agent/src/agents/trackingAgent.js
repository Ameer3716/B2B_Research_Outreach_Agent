// ============================================================================
// Tracking Agent (Milestone 4)
// ----------------------------------------------------------------------------
// Processes an inbound reply to a sent message:
//   1. Validates the message exists and was sent
//   2. Uses Gemini Flash to classify sentiment (positive/neutral/negative)
//   3. Determines hot-lead flag (positive + action signal)
//   4. Creates a reply row in the DB
//   5. Updates lead status to "replied" or "hot"
//   6. Logs to agent_logs
// ============================================================================

"use strict";

const { generateJSON } = require("./geminiClient");
const { getMessageById } = require("../db/repositories/messages");
const { getLeadById, updateLeadStatus } = require("../db/repositories/leads");
const { createReply } = require("../db/repositories/replies");
const { logAgentRun } = require("../db/repositories/agentLogs");

const SENTIMENT_SYSTEM_INSTRUCTION = `You are analyzing a reply to a business outreach email sent by a real estate agency. Your job is to classify the reply's sentiment and determine if the respondent is a "hot lead" (someone actively interested in taking the next step).

Analyze the reply content and respond with a JSON object:
{
  "sentiment": "positive" | "neutral" | "negative",
  "isHotLead": true | false,
  "reason": "Brief 1-sentence explanation of your classification"
}

Classification rules:
- POSITIVE: The reply expresses interest, asks for more info, wants to schedule a call, requests a meeting, shares their situation openly
- NEUTRAL: Acknowledgement without clear interest or disinterest, polite non-committal response, automated/out-of-office reply
- NEGATIVE: Declines, asks to be removed, expresses annoyance, "not interested"
- HOT LEAD (isHotLead=true): ONLY when the reply explicitly signals wanting to take action — asking for a call, requesting a meeting, sharing their timeline, asking about pricing/process. A vaguely positive reply is NOT a hot lead.`;

/**
 * Run the Tracking Agent for an inbound reply.
 *
 * @param {object} opts
 * @param {string} opts.tenantId
 * @param {string} opts.messageId   The sent message this is a reply to
 * @param {string} opts.replyContent The reply text
 * @returns {Promise<object>} Tracking result with sentiment + hot lead flag
 */
async function runTrackingAgent({ tenantId, messageId, replyContent }) {
  // 1. Validate message
  const message = getMessageById(tenantId, messageId);
  if (!message) {
    const err = new Error(`Message not found: ${messageId}`);
    err.status = 404;
    throw err;
  }
  if (message.status !== "sent") {
    const err = new Error(
      `Message is in status "${message.status}" — can only process replies to "sent" messages`
    );
    err.status = 409;
    throw err;
  }

  // 2. Load lead
  const lead = getLeadById(tenantId, message.lead_id);
  if (!lead) {
    const err = new Error(`Lead not found: ${message.lead_id}`);
    err.status = 404;
    throw err;
  }

  // 3. Classify sentiment via Gemini
  let classification;
  try {
    const prompt =
      `Original outreach message:\n${message.approved_text || message.draft_text}\n\n` +
      `Reply from ${lead.name}:\n${replyContent}`;

    classification = await generateJSON({
      systemInstruction: SENTIMENT_SYSTEM_INSTRUCTION,
      prompt,
    });

    // Validate + normalize
    const validSentiments = ["positive", "neutral", "negative"];
    if (!validSentiments.includes(classification.sentiment)) {
      classification.sentiment = "neutral";
    }
    classification.isHotLead = !!classification.isHotLead;
    if (!classification.reason) {
      classification.reason = "No reason provided by classifier";
    }
  } catch (err) {
    // If Gemini fails, fall back to neutral + not hot
    console.warn(`[trackingAgent] Gemini sentiment classification failed: ${err.message}`);
    classification = {
      sentiment: "neutral",
      isHotLead: false,
      reason: `Fallback — Gemini classification failed: ${err.message}`,
    };
  }

  // 4. Create reply row
  const reply = createReply({
    tenantId,
    messageId,
    content: replyContent,
    sentiment: classification.sentiment,
    isHotLead: classification.isHotLead,
  });

  // 5. Update lead status
  const newLeadStatus = classification.isHotLead ? "hot" : "replied";
  updateLeadStatus(tenantId, lead.id, newLeadStatus);

  // 6. Log
  logAgentRun({
    tenantId,
    agentName: "tracking",
    input: { messageId, leadId: lead.id, replyLength: replyContent.length },
    output: {
      replyId: reply.id,
      sentiment: classification.sentiment,
      isHotLead: classification.isHotLead,
      reason: classification.reason,
      newLeadStatus,
    },
    status: "success",
  });

  return {
    replyId: reply.id,
    messageId,
    leadId: lead.id,
    sentiment: classification.sentiment,
    isHotLead: classification.isHotLead,
    reason: classification.reason,
    newLeadStatus,
  };
}

module.exports = { runTrackingAgent };
