const { getTenantById } = require("../db/repositories/tenants");
const { listUsersByTenant } = require("../db/repositories/users");

// GET /api/me — the currently authenticated user + their tenant
function me(req, res) {
  const tenant = getTenantById(req.user.tenantId);
  res.json({ user: req.user, tenant });
}

// GET /api/tenant/users — everyone in the caller's own tenant (never any
// other tenant's users — req.user.tenantId comes from the verified JWT,
// not from the request).
function listMyTenantUsers(req, res) {
  const users = listUsersByTenant(req.user.tenantId).map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
  }));
  res.json({ users });
}

module.exports = { me, listMyTenantUsers };
