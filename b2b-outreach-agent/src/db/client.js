// ============================================================================
// Database client
// ----------------------------------------------------------------------------
// Uses Node's built-in `node:sqlite` module (stable enough for this project,
// ships with Node >= 22.5 — no native compilation, no postinstall binary
// download, works the same on every machine/CI runner out of the box).
//
// Why not Prisma/better-sqlite3? Both need to download a platform-specific
// native binary at install time. On a locked-down network (e.g. a
// corporate proxy or a sandboxed CI runner) that download can fail outright
// — which is exactly what happened while building this milestone. Node's
// built-in module has zero external dependencies, so `npm install` is
// guaranteed to be enough. If you have full network access and want the
// nicer Prisma DX (typed client, `prisma studio`, easy Postgres migrations),
// swapping it back in is a contained change — see README "Swapping in an
// ORM later".
// ============================================================================

const path = require("path");
const fs = require("fs");
const { DatabaseSync } = require("node:sqlite");

const DB_PATH =
  process.env.DATABASE_PATH || path.join(__dirname, "..", "..", "data", "app.db");

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA foreign_keys = ON;");

function applySchema() {
  const schemaPath = path.join(__dirname, "schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf8");
  db.exec(schema);
}

applySchema();

module.exports = db;
