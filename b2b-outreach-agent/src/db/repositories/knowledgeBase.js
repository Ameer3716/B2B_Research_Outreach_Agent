const { randomUUID } = require("crypto");
const db = require("../client");

function createEntry({ tenantId, content, tags = [] }) {
  const id = randomUUID();
  const tagsStr = Array.isArray(tags) ? tags.join(",") : tags;
  db.prepare(
    `INSERT INTO knowledge_base_entries (id, tenant_id, content, tags)
     VALUES (?, ?, ?, ?)`
  ).run(id, tenantId, content, tagsStr);
  return getEntryById(tenantId, id);
}

function getEntryById(tenantId, id) {
  return (
    db
      .prepare(`SELECT * FROM knowledge_base_entries WHERE tenant_id = ? AND id = ?`)
      .get(tenantId, id) || null
  );
}

function listEntriesByTenant(tenantId) {
  return db
    .prepare(
      `SELECT * FROM knowledge_base_entries WHERE tenant_id = ? ORDER BY created_at ASC`
    )
    .all(tenantId);
}

function deleteEntry(tenantId, id) {
  const result = db
    .prepare(`DELETE FROM knowledge_base_entries WHERE tenant_id = ? AND id = ?`)
    .run(tenantId, id);
  return result.changes > 0;
}

module.exports = { createEntry, getEntryById, listEntriesByTenant, deleteEntry };

