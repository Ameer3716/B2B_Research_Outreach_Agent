const { randomUUID } = require("crypto");
const db = require("../client");

function createUser({ tenantId, email, passwordHash, name, role = "member" }) {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, tenantId, email.toLowerCase(), passwordHash, name, role);
  return getUserById(tenantId, id);
}

// Scoped lookup — the normal path once a request is already authenticated
// and we know which tenant it belongs to.
function getUserById(tenantId, id) {
  return (
    db
      .prepare(`SELECT * FROM users WHERE tenant_id = ? AND id = ?`)
      .get(tenantId, id) || null
  );
}

function findUserByEmail(tenantId, email) {
  return (
    db
      .prepare(`SELECT * FROM users WHERE tenant_id = ? AND email = ?`)
      .get(tenantId, email.toLowerCase()) || null
  );
}

// Unscoped lookup — used only at login time, before we know the caller's
// tenant. Because `email` is only unique *within* a tenant (see schema.sql),
// the same address can legitimately exist in more than one tenant. The
// login controller decides how to handle 0 / 1 / many results; this
// repository function just reports what's in the database.
function findAllUsersByEmailAcrossTenants(email) {
  return db
    .prepare(`SELECT * FROM users WHERE email = ?`)
    .all(email.toLowerCase());
}

function listUsersByTenant(tenantId) {
  return db
    .prepare(`SELECT * FROM users WHERE tenant_id = ? ORDER BY created_at ASC`)
    .all(tenantId);
}

module.exports = {
  createUser,
  getUserById,
  findUserByEmail,
  findAllUsersByEmailAcrossTenants,
  listUsersByTenant,
};
