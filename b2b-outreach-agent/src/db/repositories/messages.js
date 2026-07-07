const { randomUUID } = require("crypto");
const db = require("../client");

function createMessage({
  tenantId,
  leadId,
  draftText = null,
  channel = "email",
  status = "draft",
}) {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO messages (id, tenant_id, lead_id, draft_text, channel, status)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, tenantId, leadId, draftText, channel, status);
  return getMessageById(tenantId, id);
}

function getMessageById(tenantId, id) {
  return (
    db
      .prepare(`SELECT * FROM messages WHERE tenant_id = ? AND id = ?`)
      .get(tenantId, id) || null
  );
}

function listMessagesByLead(tenantId, leadId) {
  return db
    .prepare(
      `SELECT * FROM messages WHERE tenant_id = ? AND lead_id = ? ORDER BY created_at DESC`
    )
    .all(tenantId, leadId);
}

function approveMessage(tenantId, id, approvedText) {
  const result = db
    .prepare(
      `UPDATE messages SET approved_text = ?, status = 'approved', updated_at = datetime('now')
       WHERE tenant_id = ? AND id = ?`
    )
    .run(approvedText, tenantId, id);
  if (result.changes === 0) return null;
  return getMessageById(tenantId, id);
}

function markMessageSent(tenantId, id, externalId) {
  const result = db
    .prepare(
      `UPDATE messages SET status = 'sent', sent_at = datetime('now'), updated_at = datetime('now')
       WHERE tenant_id = ? AND id = ?`
    )
    .run(tenantId, id);
  if (result.changes === 0) return null;
  return getMessageById(tenantId, id);
}

function markMessageFailed(tenantId, id) {
  const result = db
    .prepare(
      `UPDATE messages SET status = 'failed', updated_at = datetime('now')
       WHERE tenant_id = ? AND id = ?`
    )
    .run(tenantId, id);
  if (result.changes === 0) return null;
  return getMessageById(tenantId, id);
}

function listMessagesByTenant(tenantId, { status } = {}) {
  if (status) {
    return db
      .prepare(
        `SELECT * FROM messages WHERE tenant_id = ? AND status = ? ORDER BY created_at DESC`
      )
      .all(tenantId, status);
  }
  return db
    .prepare(`SELECT * FROM messages WHERE tenant_id = ? ORDER BY created_at DESC`)
    .all(tenantId);
}

module.exports = {
  createMessage,
  getMessageById,
  listMessagesByLead,
  listMessagesByTenant,
  approveMessage,
  markMessageSent,
  markMessageFailed,
};

