// ============================================================================
// Drafting Agent (Milestone 3)
// ----------------------------------------------------------------------------
// Writes a short (<125 word), personalized outreach message using:
//   - The research profile (who the lead is, their pain points)
//   - The top knowledge snippet(s) (case study / testimonial to reference)
//   - The lead type (seller / buyer / expired / referral partner)
//
// The draft is saved to the messages table with status "draft" and the
// lead's status is updated to "drafted". The tenant user then reviews and
// approves (or edits) the draft via the Review Gate before it's sent.
// ============================================================================

"use strict";

const { generateJSON } = require("./geminiClient");
const { createMessage } = require("../db/repositories/messages");
const { updateLeadStatus } = require("../db/repositories/leads");
const { logAgentRun } = require("../db/repositories/agentLogs");

const SYSTEM_INSTRUCTION = `You are an outreach copywriter for a real estate agency. Your job is to write a short, personalized email to a lead based on a research profile and relevant proof points from the agency's knowledge base.

RULES:
1. The message body MUST be under 125 words. Busy professionals (especially loan officers, escrow staff, homeowners) read on mobile. Shorter is better.
2. Reference SPECIFIC details from the research profile — the lead's name, their situation, their likely pain point. Do NOT be generic.
3. If a knowledge snippet (case study, testimonial, or tip) is provided, weave its insight into the message naturally. Do NOT copy-paste it verbatim or make it feel like a block quote.
4. Tone: professional but warm. Confident, not pushy. You are offering help, not begging for business.
5. For referral partners (title companies, mortgage brokers): lead with mutual benefit, not "please send us leads."
6. End with a low-commitment call to action — "happy to share more", "worth a quick call?", etc. NOT "book a meeting" or "schedule a demo."
7. Include a short, compelling subject line.

You MUST respond with a JSON object:
{
  "subject": "Short email subject line",
  "body": "The email body text (under 125 words)",
  "channel": "email"
}`;

/**
 * Run the Drafting Agent on a pipeline context.
 *
 * @param {object} context Pipeline context with researchProfile and knowledgeSnippets
 * @param {string} context.tenantId
 * @param {string} context.leadId
 * @param {object} context.lead
 * @param {object} context.researchProfile
 * @param {Array} context.knowledgeSnippets
 * @returns {Promise<object>} Updated context with draftMessage added
 */
async function runDraftingAgent(context) {
  const { tenantId, lead, researchProfile, knowledgeSnippets } = context;

  // Build the prompt with all context the drafter needs
  const promptData = {
    lead: {
      name: lead.name,
      title: lead.title,
      leadType: lead.lead_type,
      notes: lead.notes,
    },
    researchProfile: {
      summary: researchProfile.summary,
      painPoints: researchProfile.painPoints,
      opportunities: researchProfile.opportunities,
      talkingPointSuggestions: researchProfile.talkingPointSuggestions,
    },
    knowledgeSnippets: knowledgeSnippets.map((s) => ({
      content: s.content,
      tags: s.tags,
    })),
  };

  const prompt = `Write a personalized outreach email for this lead using the research profile and knowledge base snippets below.\n\n${JSON.stringify(promptData, null, 2)}`;

  let draftResult;
  try {
    draftResult = await generateJSON({
      systemInstruction: SYSTEM_INSTRUCTION,
      prompt,
    });

    // Validate required fields
    if (!draftResult.body) {
      throw new Error("Draft result missing 'body' field");
    }
    if (!draftResult.subject) {
      draftResult.subject = `Quick note for ${lead.name}`;
    }
    if (!draftResult.channel) {
      draftResult.channel = "email";
    }
  } catch (err) {
    logAgentRun({
      tenantId,
      agentName: "drafting",
      input: { leadId: lead.id },
      output: { error: err.message },
      status: "error",
    });
    throw err;
  }

  // Compose the full draft text (subject + body) for the messages table.
  // The subject is stored separately in the draft for the UI to use,
  // but draft_text gets the full content for the Review Gate.
  const draftText = `Subject: ${draftResult.subject}\n\n${draftResult.body}`;

  // Save to messages table
  const message = createMessage({
    tenantId,
    leadId: lead.id,
    draftText,
    channel: draftResult.channel,
    status: "draft",
  });

  // Update lead status
  updateLeadStatus(tenantId, lead.id, "drafted");

  // Log successful run
  logAgentRun({
    tenantId,
    agentName: "drafting",
    input: { leadId: lead.id },
    output: {
      messageId: message.id,
      subject: draftResult.subject,
      wordCount: draftResult.body.split(/\s+/).length,
      channel: draftResult.channel,
    },
    status: "success",
  });

  return {
    ...context,
    draftMessage: {
      messageId: message.id,
      subject: draftResult.subject,
      body: draftResult.body,
      channel: draftResult.channel,
      wordCount: draftResult.body.split(/\s+/).length,
    },
  };
}

module.exports = { runDraftingAgent };
