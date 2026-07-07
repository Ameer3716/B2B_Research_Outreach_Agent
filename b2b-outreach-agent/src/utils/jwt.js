const jwt = require("jsonwebtoken");

const SECRET = process.env.JWT_SECRET;
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || "12h";

if (!SECRET) {
  // Fail loudly at startup rather than silently signing tokens with
  // `undefined` as the secret.
  throw new Error("JWT_SECRET is not set. Copy .env.example to .env and set one.");
}

// The token is intentionally the *only* place tenantId travels with a
// request. Every downstream middleware/controller reads req.user.tenantId
// from the verified token — never from a request body or query param —
// so a client can't simply pass a different tenantId to read someone
// else's data.
function signToken({ userId, tenantId, role }) {
  return jwt.sign({ sub: userId, tenantId, role }, SECRET, { expiresIn: EXPIRES_IN });
}

function verifyToken(token) {
  return jwt.verify(token, SECRET); // throws if invalid/expired
}

module.exports = { signToken, verifyToken };
