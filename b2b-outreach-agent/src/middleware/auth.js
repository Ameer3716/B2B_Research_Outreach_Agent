const { verifyToken } = require("../utils/jwt");
const { getUserById } = require("../db/repositories/users");

// ----------------------------------------------------------------------------
// authenticate — verifies the JWT and attaches req.user = { id, tenantId, role }
//
// This is the single choke point tenant isolation flows through: every
// controller downstream trusts req.user.tenantId and nothing else. Routes
// never accept a tenantId from the request body/query/params for read or
// write operations — accepting a client-supplied tenantId would let any
// authenticated user simply ask for a different tenant's data.
// ----------------------------------------------------------------------------
function authenticate(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Missing or malformed Authorization header" });
  }

  let payload;
  try {
    payload = verifyToken(token);
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  // Re-fetch the user (scoped to the tenant embedded in their own token)
  // rather than trusting the token's claims blindly — this catches the
  // case where a user was deleted or moved after the token was issued.
  const user = getUserById(payload.tenantId, payload.sub);
  if (!user) {
    return res.status(401).json({ error: "User no longer exists" });
  }

  req.user = { id: user.id, tenantId: user.tenant_id, role: user.role, email: user.email };
  next();
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}

module.exports = { authenticate, requireRole };
