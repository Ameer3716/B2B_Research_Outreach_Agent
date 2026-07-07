const { randomUUID } = require("crypto");
const db = require("../client");

function createCompany({
  tenantId,
  name,
  domain = null,
  industry = null,
  size = null,
  enrichmentData = null,
}) {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO companies (id, tenant_id, name, domain, industry, size, enrichment_data)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    tenantId,
    name,
    domain,
    industry,
    size,
    enrichmentData ? JSON.stringify(enrichmentData) : null
  );
  return getCompanyById(tenantId, id);
}

function getCompanyById(tenantId, id) {
  return (
    db
      .prepare(`SELECT * FROM companies WHERE tenant_id = ? AND id = ?`)
      .get(tenantId, id) || null
  );
}

function listCompaniesByTenant(tenantId) {
  return db
    .prepare(`SELECT * FROM companies WHERE tenant_id = ? ORDER BY created_at ASC`)
    .all(tenantId);
}

module.exports = { createCompany, getCompanyById, listCompaniesByTenant };
