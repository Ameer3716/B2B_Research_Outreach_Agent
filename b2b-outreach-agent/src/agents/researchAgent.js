// ============================================================================
// Research Agent (Milestone 3)
// ----------------------------------------------------------------------------
// Takes a raw lead record (+ optional company data for referral partners)
// and uses Gemini to produce a structured research profile:
//
//   {
//     summary:                  short narrative about the lead
//     painPoints:               likely pain points / motivations
//     opportunities:            how the tenant's agency could help
//     talkingPointSuggestions:   angles for outreach
//     leadCategory:             seller | buyer | expired_listing | referral_partner
//   }
//
// This is the first agent in the pipeline. It updates the lead status to
// "researching" at entry and logs its run to agent_logs.
//
// Note: In this milestone, no external enrichment API (Clearbit, Apollo) is
// called. Gemini reasons about the information already present in the lead
// record — name, title, notes, lead type, company info. When an external
// enrichment provider is added later, it gets called here before the Gemini
// step, and its output is folded into the prompt. The function signature
// (input context → output context with researchProfile) stays the same.
// ============================================================================

"use strict";

const { generateJSON } = require("./geminiClient");
const { updateLeadStatus } = require("../db/repositories/leads");
const { logAgentRun } = require("../db/repositories/agentLogs");

const SYSTEM_INSTRUCTION = `You are a research analyst working for a real estate agency. Your job is to analyze a lead record and produce a structured profile that a copywriter can use to draft personalized outreach.

You will receive a JSON object describing a lead — a potential client or referral partner. Analyze the available fields (name, title, lead type, notes, company info) and reason about:
- Who this person is and what their situation likely is
- What their pain points or motivations might be
- How the agency could help them specifically
- What angles would make outreach feel relevant rather than generic

You MUST respond with a JSON object with these exact fields:
{
  "summary": "A 1-2 sentence narrative summary of this lead and their situation.",
  "painPoints": ["Array of 2-3 likely pain points or concerns"],
  "opportunities": ["Array of 2-3 ways the agency could add value"],
  "talkingPointSuggestions": ["Array of 2-3 specific talking points for outreach"],
  "leadCategory": "seller | buyer | expired_listing | referral_partner"
}

Be specific — reference details from the lead record. Do NOT make up facts that aren't implied by the data. If information is sparse, say so honestly rather than fabricating details.`;

/**
 * Run the Research Agent on a pipeline context.
 *
 * @param {object} context Pipeline context with lead and optional company
 * @param {string} context.tenantId
 * @param {string} context.leadId
 * @param {object} context.lead  The lead DB row
 * @param {object|null} context.company  The company DB row (if referral partner)
 * @returns {Promise<object>} Updated context with researchProfile added
 */
async function runResearchAgent(context) {
  const { tenantId, lead, company } = context;

  // Update lead status to "researching"
  updateLeadStatus(tenantId, lead.id, "researching");

  // Build the prompt from available lead data
  const leadData = {
    name: lead.name,
    email: lead.email,
    title: lead.title,
    leadType: lead.lead_type,
    source: lead.source,
    notes: lead.notes,
    ...(company
      ? {
          company: {
            name: company.name,
            domain: company.domain,
            industry: company.industry,
            size: company.size,
          },
        }
      : {}),
  };

  const prompt = `Analyze this lead record and produce a research profile:\n\n${JSON.stringify(leadData, null, 2)}`;

  let researchProfile;
  try {
    researchProfile = await generateJSON({
      systemInstruction: SYSTEM_INSTRUCTION,
      prompt,
    });

    // Validate the expected shape (Gemini might return slightly different keys)
    if (!researchProfile.summary) {
      throw new Error("Research profile missing 'summary' field");
    }
    if (!Array.isArray(researchProfile.painPoints)) {
      researchProfile.painPoints = [];
    }
    if (!Array.isArray(researchProfile.opportunities)) {
      researchProfile.opportunities = [];
    }
    if (!Array.isArray(researchProfile.talkingPointSuggestions)) {
      researchProfile.talkingPointSuggestions = [];
    }
    if (!researchProfile.leadCategory) {
      researchProfile.leadCategory = lead.lead_type;
    }
  } catch (err) {
    logAgentRun({
      tenantId,
      agentName: "research",
      input: { leadId: lead.id },
      output: { error: err.message },
      status: "error",
    });
    throw err;
  }

  // Log successful run
  logAgentRun({
    tenantId,
    agentName: "research",
    input: { leadId: lead.id },
    output: researchProfile,
    status: "success",
  });

  return {
    ...context,
    researchProfile,
  };
}

module.exports = { runResearchAgent };
