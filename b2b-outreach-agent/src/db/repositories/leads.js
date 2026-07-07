const { randomUUID } = require("crypto");
const db = require("../client");

function createLead({
  tenantId,
  name,
  email = null,
  phone = null,
  title = null,
  companyId = null,
  leadType = "buyer",
  source = "manual",
  status = "new",
  notes = null,
}) {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO leads
      (id, tenant_id, company_id, name, email, phone, title, lead_type, source, status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, tenantId, companyId, name, email, phone, title, leadType, source, status, notes);
  return getLeadById(tenantId, id);
}

// Every read is scoped by tenant_id in the WHERE clause — this is the
// enforcement point called out in the requirements doc ("enforce it at the
// query layer"). A lead from another tenant simply cannot be returned by
// this function, no matter what `id` is passed in.
function getLeadById(tenantId, id) {
  return (
    db.prepare(`SELECT * FROM leads WHERE tenant_id = ? AND id = ?`).get(tenantId, id) ||
    null
  );
}

function listLeadsByTenant(tenantId, { status } = {}) {
  if (status) {
    return db
      .prepare(
        `SELECT * FROM leads WHERE tenant_id = ? AND status = ? ORDER BY created_at DESC`
      )
      .all(tenantId, status);
  }
  return db
    .prepare(`SELECT * FROM leads WHERE tenant_id = ? ORDER BY created_at DESC`)
    .all(tenantId);
}

function updateLeadStatus(tenantId, id, status) {
  const result = db
    .prepare(
      `UPDATE leads SET status = ?, updated_at = datetime('now')
       WHERE tenant_id = ? AND id = ?`
    )
    .run(status, tenantId, id);
  if (result.changes === 0) return null;
  return getLeadById(tenantId, id);
}

function updateLead(tenantId, id, fields) {
  const lead = getLeadById(tenantId, id);
  if (!lead) return null;

  const name = fields.name ?? lead.name;
  const email = fields.email ?? lead.email;
  const phone = fields.phone ?? lead.phone;
  const title = fields.title ?? lead.title;
  const leadType = fields.leadType ?? lead.lead_type;
  const status = fields.status ?? lead.status;
  const notes = fields.notes ?? lead.notes;
  const companyId = fields.companyId ?? lead.company_id;

  db.prepare(
    `UPDATE leads SET name = ?, email = ?, phone = ?, title = ?, lead_type = ?,
     status = ?, notes = ?, company_id = ?, updated_at = datetime('now')
     WHERE tenant_id = ? AND id = ?`
  ).run(name, email, phone, title, leadType, status, notes, companyId, tenantId, id);
  return getLeadById(tenantId, id);
}

function deleteLead(tenantId, id) {
  const result = db
    .prepare(`DELETE FROM leads WHERE tenant_id = ? AND id = ?`)
    .run(tenantId, id);
  return result.changes > 0;
}

module.exports = { createLead, getLeadById, listLeadsByTenant, updateLeadStatus, updateLead, deleteLead };

