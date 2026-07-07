"use strict";

const db = require("../db/client");

// GET /api/dashboard/stats
// Returns aggregate stats the dashboard UI needs in a single call.
function stats(req, res) {
  const tenantId = req.user.tenantId;

  // Lead counts by status
  const leadsByStatus = db
    .prepare(
      `SELECT status, COUNT(*) as count FROM leads WHERE tenant_id = ? GROUP BY status`
    )
    .all(tenantId);

  const leadStatusMap = {};
  let totalLeads = 0;
  for (const row of leadsByStatus) {
    leadStatusMap[row.status] = row.count;
    totalLeads += row.count;
  }

  // Message counts by status
  const messagesByStatus = db
    .prepare(
      `SELECT status, COUNT(*) as count FROM messages WHERE tenant_id = ? GROUP BY status`
    )
    .all(tenantId);

  const messageStatusMap = {};
  let totalMessages = 0;
  for (const row of messagesByStatus) {
    messageStatusMap[row.status] = row.count;
    totalMessages += row.count;
  }

  // Reply stats
  const replyStats = db
    .prepare(
      `SELECT
         COUNT(*) as totalReplies,
         SUM(CASE WHEN is_hot_lead = 1 THEN 1 ELSE 0 END) as hotLeads,
         SUM(CASE WHEN sentiment = 'positive' THEN 1 ELSE 0 END) as positiveReplies,
         SUM(CASE WHEN sentiment = 'negative' THEN 1 ELSE 0 END) as negativeReplies
       FROM replies WHERE tenant_id = ?`
    )
    .get(tenantId);

  // Reply rate: replies / sent messages
  const sentCount = messageStatusMap.sent || 0;
  const replyRate =
    sentCount > 0
      ? ((replyStats.totalReplies || 0) / sentCount * 100).toFixed(1)
      : "0.0";

  // KB entry count
  const kbCount = db
    .prepare(
      `SELECT COUNT(*) as count FROM knowledge_base_entries WHERE tenant_id = ?`
    )
    .get(tenantId).count;

  res.json({
    stats: {
      leads: {
        total: totalLeads,
        byStatus: leadStatusMap,
      },
      messages: {
        total: totalMessages,
        byStatus: messageStatusMap,
      },
      replies: {
        total: replyStats.totalReplies || 0,
        hotLeads: replyStats.hotLeads || 0,
        positiveReplies: replyStats.positiveReplies || 0,
        negativeReplies: replyStats.negativeReplies || 0,
        replyRatePercent: parseFloat(replyRate),
      },
      knowledgeBase: {
        entryCount: kbCount,
      },
    },
  });
}

module.exports = { stats };
