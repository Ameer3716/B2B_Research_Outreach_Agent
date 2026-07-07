// ============================================================================
// Email Service Abstraction (Milestone 4)
// ----------------------------------------------------------------------------
// Pluggable email sending with two implementations:
//
//   SimulatedEmailService  (default, EMAIL_PROVIDER=simulated or unset)
//     Logs the send to console and returns a fake message ID.
//     No API key needed. Ideal for demos with .test addresses.
//
//   ResendEmailService     (EMAIL_PROVIDER=resend + RESEND_API_KEY)
//     Calls the Resend API for real delivery.
//     Only use with a verified sending domain + real recipient addresses.
//
// The Send Agent calls getEmailService().send() — it never knows or cares
// which provider is active.
// ============================================================================

"use strict";

const { randomUUID } = require("crypto");

// ---------------------------------------------------------------------------
// Simulated provider (default)
// ---------------------------------------------------------------------------

class SimulatedEmailService {
  async send({ to, subject, body, from }) {
    const messageId = `sim_${randomUUID().slice(0, 8)}`;
    console.log(
      `[email:simulated] SEND\n` +
        `  From:    ${from}\n` +
        `  To:      ${to}\n` +
        `  Subject: ${subject}\n` +
        `  Body:    ${body.slice(0, 100)}${body.length > 100 ? "…" : ""}\n` +
        `  ID:      ${messageId}\n`
    );
    return { success: true, messageId, provider: "simulated" };
  }
}

// ---------------------------------------------------------------------------
// Resend provider (opt-in)
// ---------------------------------------------------------------------------

class ResendEmailService {
  constructor(apiKey) {
    if (!apiKey) {
      throw new Error(
        "RESEND_API_KEY is required when EMAIL_PROVIDER=resend. " +
          "Set it in your .env file."
      );
    }
    this.apiKey = apiKey;
  }

  async send({ to, subject, body, from }) {
    // Dynamic import so the resend package is only loaded when actually used
    let Resend;
    try {
      Resend = require("resend").Resend;
    } catch {
      throw new Error(
        'The "resend" package is not installed. Run: npm install resend'
      );
    }

    const resend = new Resend(this.apiKey);
    const result = await resend.emails.send({
      from,
      to,
      subject,
      text: body,
    });

    if (result.error) {
      return {
        success: false,
        error: result.error.message || "Resend API error",
        provider: "resend",
      };
    }

    return {
      success: true,
      messageId: result.data?.id || "unknown",
      provider: "resend",
    };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

let _instance = null;

/**
 * Get the active email service instance (singleton).
 * Controlled by EMAIL_PROVIDER env var:
 *   - "simulated" (default): logs to console, no real emails
 *   - "resend": calls the Resend API
 *
 * @returns {SimulatedEmailService | ResendEmailService}
 */
function getEmailService() {
  if (!_instance) {
    const provider = (process.env.EMAIL_PROVIDER || "simulated").toLowerCase();
    switch (provider) {
      case "resend":
        _instance = new ResendEmailService(process.env.RESEND_API_KEY);
        break;
      case "simulated":
      default:
        _instance = new SimulatedEmailService();
        break;
    }
    console.log(`[emailService] Using provider: ${provider}`);
  }
  return _instance;
}

module.exports = { getEmailService, SimulatedEmailService, ResendEmailService };
