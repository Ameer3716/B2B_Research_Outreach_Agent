// ============================================================================
// Gemini Text Generation Client (Milestone 3)
// ----------------------------------------------------------------------------
// Thin wrapper around @google/generative-ai for text generation — separate
// from the embedding wrapper in src/rag/geminiEmbedder.js because the
// concerns are different (models, task types, response parsing).
//
// Exports:
//   generateJSON({ model, systemInstruction, prompt }) → Promise<object>
//   generateText({ model, systemInstruction, prompt }) → Promise<string>
//
// Both include exponential-backoff retry for free-tier rate limits (429/503).
// ============================================================================

"use strict";

const { GoogleGenerativeAI } = require("@google/generative-ai");

// Default model for agents — can be overridden per-call.
const DEFAULT_MODEL = "gemini-2.0-flash";

// Retry config (same pattern as geminiEmbedder.js)
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1500;

let _client = null;

function getClient() {
  if (!_client) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error(
        "GEMINI_API_KEY is not set. Add it to your .env file."
      );
    }
    _client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return _client;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check whether an error is transient (rate limit / server overload).
 */
function isRetryable(err) {
  return (
    err.status === 429 ||
    err.status === 503 ||
    (err.message && err.message.includes("Resource has been exhausted"))
  );
}

/**
 * Generate content with retry logic.
 *
 * @param {object} opts
 * @param {string} [opts.model]              Gemini model name
 * @param {string} [opts.systemInstruction]  System prompt (role, rules)
 * @param {string} opts.prompt               User prompt
 * @param {string} [opts.responseMimeType]   "application/json" for structured output
 * @returns {Promise<import("@google/generative-ai").GenerateContentResult>}
 */
async function callGemini({
  model = DEFAULT_MODEL,
  systemInstruction,
  prompt,
  responseMimeType,
}) {
  const genModel = getClient().getGenerativeModel({
    model,
    ...(systemInstruction ? { systemInstruction } : {}),
    ...(responseMimeType
      ? { generationConfig: { responseMimeType } }
      : {}),
  });

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await genModel.generateContent(prompt);
      return result;
    } catch (err) {
      if (isRetryable(err) && attempt < MAX_RETRIES) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
        console.warn(
          `[geminiClient] Rate limit hit (attempt ${attempt}/${MAX_RETRIES}). ` +
            `Retrying in ${delay}ms…`
        );
        await sleep(delay);
      } else {
        throw err;
      }
    }
  }
}

/**
 * Generate a JSON object from Gemini.
 *
 * Uses responseMimeType: "application/json" so the model is constrained to
 * emit valid JSON. The response is parsed and returned as a JS object.
 *
 * @param {object} opts
 * @param {string} [opts.model]
 * @param {string} [opts.systemInstruction]
 * @param {string} opts.prompt
 * @returns {Promise<object>}
 */
async function generateJSON({ model, systemInstruction, prompt }) {
  const result = await callGemini({
    model,
    systemInstruction,
    prompt,
    responseMimeType: "application/json",
  });

  const text = result.response.text();

  try {
    return JSON.parse(text);
  } catch (parseErr) {
    // If the model returned something that isn't valid JSON despite the
    // mime-type constraint, wrap the error with the raw text for debugging.
    const err = new Error(
      `Gemini returned invalid JSON: ${parseErr.message}\nRaw response: ${text.slice(0, 500)}`
    );
    err.rawResponse = text;
    throw err;
  }
}

/**
 * Generate plain text from Gemini.
 *
 * @param {object} opts
 * @param {string} [opts.model]
 * @param {string} [opts.systemInstruction]
 * @param {string} opts.prompt
 * @returns {Promise<string>}
 */
async function generateText({ model, systemInstruction, prompt }) {
  const result = await callGemini({ model, systemInstruction, prompt });
  return result.response.text();
}

module.exports = { generateJSON, generateText, DEFAULT_MODEL };
