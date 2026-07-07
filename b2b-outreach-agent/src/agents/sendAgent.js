// ============================================================================
// Send Agent (Milestone 4)
// ----------------------------------------------------------------------------
// Picks up an approved message, sends it via the configured email provider,
// and updates the message + lead status accordingly.
//
// Preconditions: message must exist, must be "approved", lead must have email.
// ============================================================================

"use strict";

const { getMessageById } = require("../db/repositories/messages");
const { getLeadById, updateLeadStatus } = require("../db/repositories/leads");
const { logAgentRun } = require("../db/repositories/agentLogs");
const { getEmailService } = require("../services/emailService");
const db = require("../db/client");

const DEFAULT_FROM = process.env.EMAIL_FROM || "outreach@meridianrealty.test";

/**
 * Mark a message as sent in the DB.
 */
function markMessageSent(tenantId, messageId, externalId) {
  db.prepare(
    `UPDATE messages SET status = 'sent', sent_at = datetime('now'), updated_at = datetime('now')
     WHERE tenant_id = ? AND id = ?`
  ).run(tenantId, messageId);
  return getMessageById(tenantId, messageId);
}

/**
 * Mark a message as failed in the DB.
 */
function markMessageFailed(tenantId, messageId) {
  db.prepare(
    `UPDATE messages SET status = 'failed', updated_at = datetime('now')
     WHERE tenant_id = ? AND id = ?`
  ).run(tenantId, messageId);
  return getMessageById(tenantId, messageId);
}

/**
 * Run the Send Agent for a single approved message.
 *
 * @param {object} opts
 * @param {string} opts.tenantId
 * @param {string} opts.messageId
 * @returns {Promise<object>} Send result
 */
async function runSendAgent({ tenantId, messageId }) {
  // 1. Load and validate message
  const message = getMessageById(tenantId, messageId);
  if (!message) {
    const err = new Error(`Message not found: ${messageId}`);
    err.status = 404;
    throw err;
  }
  if (message.status !== "approved") {
    const err = new Error(
      `Message is in status "${message.status}" — only "approved" messages can be sent`
    );
    err.status = 409;
    throw err;
  }

  // 2. Load lead for recipient email
  const lead = getLeadById(tenantId, message.lead_id);
  if (!lead) {
    const err = new Error(`Lead not found for message: ${message.lead_id}`);
    err.status = 404;
    throw err;
  }
  if (!lead.email) {
    const err = new Error(
      `Lead "${lead.name}" has no email address — cannot send`
    );
    err.status = 422;
    throw err;
  }

  // 3. Parse subject + body from approved_text
  const approvedText = message.approved_text || message.draft_text || "";
  let subject = "Outreach from our team";
  let body = approvedText;
  const subjectMatch = approvedText.match(/^Subject:\s*(.+)\n\n([\s\S]*)$/);
  if (subjectMatch) {
    subject = subjectMatch[1].trim();
    body = subjectMatch[2].trim();
  }

  // 4. Send via email service
  const emailService = getEmailService();
  let sendResult;
  try {
    sendResult = await emailService.send({
      to: lead.email,
      subject,
      body,
      from: DEFAULT_FROM,
    });
  } catch (err) {
    markMessageFailed(tenantId, messageId);
    logAgentRun({
      tenantId,
      agentName: "send",
      input: { messageId, leadId: lead.id },
      output: { error: err.message },
      status: "error",
    });
    throw err;
  }

  if (!sendResult.success) {
    markMessageFailed(tenantId, messageId);
    logAgentRun({
      tenantId,
      agentName: "send",
      input: { messageId, leadId: lead.id },
      output: { error: sendResult.error, provider: sendResult.provider },
      status: "error",
    });
    const err = new Error(`Email send failed: ${sendResult.error}`);
    err.status = 502;
    throw err;
  }

  // 5. Update message + lead status
  markMessageSent(tenantId, messageId, sendResult.messageId);
  updateLeadStatus(tenantId, lead.id, "sent");

  // 6. Log success
  logAgentRun({
    tenantId,
    agentName: "send",
    input: { messageId, leadId: lead.id },
    output: {
      externalMessageId: sendResult.messageId,
      provider: sendResult.provider,
      recipientEmail: lead.email,
    },
    status: "success",
  });

  return {
    messageId,
    leadId: lead.id,
    externalMessageId: sendResult.messageId,
    provider: sendResult.provider,
    status: "sent",
  };
}

module.exports = { runSendAgent };
