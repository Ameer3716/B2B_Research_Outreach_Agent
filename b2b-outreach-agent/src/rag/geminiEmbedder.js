// ============================================================================
// Gemini Embedding Service (Milestone 2)
// ----------------------------------------------------------------------------
// Wraps @google/generative-ai embedContent calls with:
//   - Correct task types: RETRIEVAL_DOCUMENT (ingestion) / RETRIEVAL_QUERY (search)
//   - Simple exponential-backoff retry for free-tier rate limits (3 attempts)
//   - Batch support for ingestion (one call per document — Gemini embedding
//     API does not support batching multiple documents in one request, so we
//     call sequentially with a short delay to stay within free-tier limits)
//
// Exports:
//   embedDocuments(texts: string[]) → Promise<number[][]>
//   embedQuery(text: string)        → Promise<number[]>
// ============================================================================

"use strict";

const { GoogleGenerativeAI } = require("@google/generative-ai");

if (!process.env.GEMINI_API_KEY) {
  // Not a hard crash at module load time — the ingestion script and test both
  // check for the key themselves and give a friendly message. But we warn here
  // so it's obvious if someone calls embed functions without setting the key.
  console.warn(
    "[geminiEmbedder] WARNING: GEMINI_API_KEY is not set. " +
      "Embedding calls will fail. Add it to your .env file."
  );
}

const EMBEDDING_MODEL = "gemini-embedding-001";
const TASK_TYPE_DOCUMENT = "RETRIEVAL_DOCUMENT";
const TASK_TYPE_QUERY = "RETRIEVAL_QUERY";

// Delay between sequential document embeds (ms) — keeps us within the
// free-tier requests-per-minute limit. Adjust if you're on a paid plan.
const INTER_REQUEST_DELAY_MS = 200;

// Retry config for 429 / 503 transient errors
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;

let _client = null;

function getClient() {
  if (!_client) {
    _client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return _client;
}

/**
 * Sleep helper.
 * @param {number} ms
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Embed a single piece of text with retry logic.
 * @param {string} text
 * @param {string} taskType - RETRIEVAL_DOCUMENT or RETRIEVAL_QUERY
 * @returns {Promise<number[]>} embedding vector
 */
async function embedSingle(text, taskType) {
  const model = getClient().getGenerativeModel({ model: EMBEDDING_MODEL });

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await model.embedContent({
        content: { parts: [{ text }], role: "user" },
        taskType,
      });
      return result.embedding.values;
    } catch (err) {
      const isRetryable =
        err.status === 429 ||
        err.status === 503 ||
        (err.message && err.message.includes("Resource has been exhausted"));

      if (isRetryable && attempt < MAX_RETRIES) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
        console.warn(
          `[geminiEmbedder] Rate limit hit (attempt ${attempt}/${MAX_RETRIES}). ` +
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
 * Embed an array of documents for ingestion into the knowledge base.
 * Uses RETRIEVAL_DOCUMENT task type (optimised for indexed corpus).
 * Calls are sequential with a small delay to respect free-tier rate limits.
 *
 * @param {string[]} texts
 * @returns {Promise<number[][]>} one embedding vector per input text
 */
async function embedDocuments(texts) {
  const embeddings = [];
  for (let i = 0; i < texts.length; i++) {
    const vec = await embedSingle(texts[i], TASK_TYPE_DOCUMENT);
    embeddings.push(vec);
    // Small inter-request pause between documents (not needed for last item)
    if (i < texts.length - 1) {
      await sleep(INTER_REQUEST_DELAY_MS);
    }
  }
  return embeddings;
}

/**
 * Embed a single query string for similarity search.
 * Uses RETRIEVAL_QUERY task type (optimised for matching against the corpus).
 *
 * @param {string} text
 * @returns {Promise<number[]>} embedding vector
 */
async function embedQuery(text) {
  return embedSingle(text, TASK_TYPE_QUERY);
}

module.exports = { embedDocuments, embedQuery, EMBEDDING_MODEL };
