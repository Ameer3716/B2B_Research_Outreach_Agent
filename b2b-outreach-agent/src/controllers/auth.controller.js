const bcrypt = require("bcryptjs");
const { createTenant, getTenantById } = require("../db/repositories/tenants");
const {
  createUser,
  findUserByEmail,
  findAllUsersByEmailAcrossTenants,
} = require("../db/repositories/users");
const { signToken } = require("../utils/jwt");

const SALT_ROUNDS = 10;

function toPublicUser(user) {
  return { id: user.id, tenantId: user.tenant_id, email: user.email, name: user.name, role: user.role };
}

// POST /api/auth/register-tenant
// Onboards a brand-new tenant + its first admin user in one step. This is
// the "sign up my agency" flow. Inviting *additional* users into an
// existing tenant is a separate, smaller flow (registerUser below) and
// would normally be gated behind an admin-only invite in a real product.
function registerTenant(req, res, next) {
  try {
    const { tenantName, industry, adminName, adminEmail, adminPassword } = req.body;

    if (!tenantName || !adminName || !adminEmail || !adminPassword) {
      return res
        .status(400)
        .json({ error: "tenantName, adminName, adminEmail, adminPassword are required" });
    }
    if (adminPassword.length < 8) {
      return res.status(400).json({ error: "adminPassword must be at least 8 characters" });
    }

    const tenant = createTenant({ name: tenantName, industry });

    const passwordHash = bcrypt.hashSync(adminPassword, SALT_ROUNDS);
    const user = createUser({
      tenantId: tenant.id,
      email: adminEmail,
      passwordHash,
      name: adminName,
      role: "admin",
    });

    const token = signToken({ userId: user.id, tenantId: tenant.id, role: user.role });
    res.status(201).json({ token, tenant, user: toPublicUser(user) });
  } catch (err) {
    if (String(err.message).includes("UNIQUE")) {
      return res.status(409).json({ error: "That email is already registered for this tenant" });
    }
    next(err);
  }
}

// POST /api/auth/register-user
// Adds an additional user to an *existing* tenant. In a real product this
// would require an admin-issued invite token; for Milestone 1 scaffolding
// it just requires knowing the tenantId, which is enough to demonstrate
// the multi-user-per-tenant shape without building a full invite system yet.
function registerUser(req, res, next) {
  try {
    const { tenantId, name, email, password, role } = req.body;
    if (!tenantId || !name || !email || !password) {
      return res.status(400).json({ error: "tenantId, name, email, password are required" });
    }

    const tenant = getTenantById(tenantId);
    if (!tenant) return res.status(404).json({ error: "Tenant not found" });

    const passwordHash = bcrypt.hashSync(password, SALT_ROUNDS);
    const user = createUser({
      tenantId,
      email,
      passwordHash,
      name,
      role: role === "admin" ? "admin" : "member",
    });

    const token = signToken({ userId: user.id, tenantId, role: user.role });
    res.status(201).json({ token, user: toPublicUser(user) });
  } catch (err) {
    if (String(err.message).includes("UNIQUE")) {
      return res.status(409).json({ error: "That email is already registered for this tenant" });
    }
    next(err);
  }
}

// POST /api/auth/login
// Body: { email, password, tenantId? }
//
// tenantId is optional because most people log in with just email +
// password. But because emails are only unique *within* a tenant (see
// schema.sql), the same email could exist under more than one agency. If
// that happens we ask the client to disambiguate with tenantId rather than
// guessing — silently picking one would be a tenant-isolation bug hiding
// as a convenience feature.
function login(req, res, next) {
  try {
    const { email, password, tenantId } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required" });
    }

    let user;
    if (tenantId) {
      user = findUserByEmail(tenantId, email);
    } else {
      const matches = findAllUsersByEmailAcrossTenants(email);
      if (matches.length > 1) {
        return res.status(409).json({
          error: "This email exists in more than one organization. Include tenantId to log in.",
        });
      }
      user = matches[0] || null;
    }

    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = signToken({ userId: user.id, tenantId: user.tenant_id, role: user.role });
    res.json({ token, user: toPublicUser(user) });
  } catch (err) {
    next(err);
  }
}

module.exports = { registerTenant, registerUser, login };
