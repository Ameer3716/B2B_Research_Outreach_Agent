const { randomUUID } = require("crypto");
const db = require("../client");

function createReply({ tenantId, messageId, content, sentiment = null, isHotLead = false }) {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO replies (id, tenant_id, message_id, content, sentiment, is_hot_lead)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, tenantId, messageId, content, sentiment, isHotLead ? 1 : 0);
  return getReplyById(tenantId, id);
}

function getReplyById(tenantId, id) {
  const row = db
    .prepare(`SELECT * FROM replies WHERE tenant_id = ? AND id = ?`)
    .get(tenantId, id);
  return row ? { ...row, is_hot_lead: !!row.is_hot_lead } : null;
}

function listRepliesByTenant(tenantId) {
  return db
    .prepare(`SELECT * FROM replies WHERE tenant_id = ? ORDER BY created_at DESC`)
    .all(tenantId)
    .map((row) => ({ ...row, is_hot_lead: !!row.is_hot_lead }));
}

function listRepliesByMessage(tenantId, messageId) {
  return db
    .prepare(
      `SELECT * FROM replies WHERE tenant_id = ? AND message_id = ? ORDER BY created_at DESC`
    )
    .all(tenantId, messageId)
    .map((row) => ({ ...row, is_hot_lead: !!row.is_hot_lead }));
}

module.exports = { createReply, getReplyById, listRepliesByTenant, listRepliesByMessage };

