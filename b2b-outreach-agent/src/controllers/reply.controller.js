"use strict";

const { listRepliesByTenant, listRepliesByMessage } = require("../db/repositories/replies");
const { runTrackingAgent } = require("../agents/trackingAgent");

// GET /api/replies?messageId=xxx
function list(req, res) {
  const { messageId } = req.query;
  let replies;
  if (messageId) {
    replies = listRepliesByMessage(req.user.tenantId, messageId);
  } else {
    replies = listRepliesByTenant(req.user.tenantId);
  }
  res.json({ replies });
}

// POST /api/replies/webhook
// Body: { messageId, content }
// Simulates an inbound reply arriving via webhook (or manual entry).
// Triggers the Tracking Agent for sentiment analysis + hot-lead flagging.
async function webhook(req, res, next) {
  const { messageId, content } = req.body;
  if (!messageId || !content) {
    return res.status(400).json({ error: "messageId and content are required" });
  }

  try {
    const result = await runTrackingAgent({
      tenantId: req.user.tenantId,
      messageId,
      replyContent: content,
    });

    res.json({ reply: result });
  } catch (err) {
    if (err.status && err.status < 500) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
}

module.exports = { list, webhook };
