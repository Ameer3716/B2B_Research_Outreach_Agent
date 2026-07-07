const { randomUUID } = require("crypto");
const db = require("../client");

function createTenant({ name, industry = "real_estate", plan = "free" }) {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO tenants (id, name, industry, plan) VALUES (?, ?, ?, ?)`
  ).run(id, name, industry, plan);
  return getTenantById(id);
}

function getTenantById(id) {
  return db.prepare(`SELECT * FROM tenants WHERE id = ?`).get(id) || null;
}

function listTenants() {
  return db.prepare(`SELECT * FROM tenants ORDER BY created_at ASC`).all();
}

module.exports = { createTenant, getTenantById, listTenants };
