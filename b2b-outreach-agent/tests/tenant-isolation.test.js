// ============================================================================
// Tenant isolation test
// ----------------------------------------------------------------------------
// Section 9 of the requirements doc calls this out directly: "A bug that
// leaks Tenant A's knowledge base into Tenant B's RAG results is a serious
// flaw — worth writing a basic isolation test early." This is that test,
// written against the real HTTP layer (not just the repository functions)
// so it exercises the actual auth middleware + controllers a real client
// would hit.
//
// Run with: npm test
// ============================================================================

const path = require("path");
const fs = require("fs");

// Use a throwaway on-disk DB file for the test run so it never touches the
// real dev/demo database, and delete it before requiring the app so each
// test run starts from a clean schema.
const TEST_DB_PATH = path.join(__dirname, "..", "data", "test.db");
process.env.DATABASE_PATH = TEST_DB_PATH;
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-only";
process.env.NODE_ENV = "test";

// IMPORTANT: this cleanup must happen *before* `require("../src/app")` below,
// because requiring the app opens the sqlite connection and applies the
// schema immediately (see src/db/client.js). Doing this in a beforeAll hook
// instead would run too late — Jest resolves all top-level requires first —
// and deleting the file out from under an already-open connection is what
// produced a confusing "readonly database" error while writing this test.
fs.rmSync(TEST_DB_PATH, { force: true });

afterAll(() => {
  // On Windows, the SQLite connection must be explicitly closed before the
  // database file can be deleted. Without this, Node keeps a file handle open
  // and fs.rmSync throws EPERM. The `db` module is a singleton, so closing
  // it here is safe — no other code runs after afterAll.
  try {
    const db = require("../src/db/client");
    db.close();
  } catch (_) {
    // If the db was never opened (e.g. test setup failed), ignore.
  }
  fs.rmSync(TEST_DB_PATH, { force: true });
});

const request = require("supertest");
const app = require("../src/app");

async function registerTenant(tenantName, adminEmail) {
  const res = await request(app).post("/api/auth/register-tenant").send({
    tenantName,
    adminName: "Test Admin",
    adminEmail,
    adminPassword: "correcthorsebattery",
  });
  expect(res.status).toBe(201);
  return res.body; // { token, tenant, user }
}

describe("Tenant isolation", () => {
  let tenantA, tenantB, leadIdA;

  beforeAll(async () => {
    tenantA = await registerTenant("Tenant A Realty", "admin@tenant-a.test");
    tenantB = await registerTenant("Tenant B Realty", "admin@tenant-b.test");

    const leadRes = await request(app)
      .post("/api/leads")
      .set("Authorization", `Bearer ${tenantA.token}`)
      .send({ name: "Tenant A's Lead", leadType: "buyer" });
    expect(leadRes.status).toBe(201);
    leadIdA = leadRes.body.lead.id;
  });

  test("Tenant B cannot fetch Tenant A's lead by ID", async () => {
    const res = await request(app)
      .get(`/api/leads/${leadIdA}`)
      .set("Authorization", `Bearer ${tenantB.token}`);
    expect(res.status).toBe(404);
  });

  test("Tenant B's lead list never contains Tenant A's leads", async () => {
    await request(app)
      .post("/api/leads")
      .set("Authorization", `Bearer ${tenantB.token}`)
      .send({ name: "Tenant B's Lead", leadType: "seller" });

    const res = await request(app)
      .get("/api/leads")
      .set("Authorization", `Bearer ${tenantB.token}`);

    expect(res.status).toBe(200);
    expect(res.body.leads.length).toBeGreaterThan(0);
    expect(res.body.leads.every((lead) => lead.tenant_id === tenantB.tenant.id)).toBe(true);
    expect(res.body.leads.some((lead) => lead.id === leadIdA)).toBe(false);
  });

  test("Tenant A can fetch its own lead by ID", async () => {
    const res = await request(app)
      .get(`/api/leads/${leadIdA}`)
      .set("Authorization", `Bearer ${tenantA.token}`);
    expect(res.status).toBe(200);
    expect(res.body.lead.id).toBe(leadIdA);
  });

  test("A request with no token is rejected", async () => {
    const res = await request(app).get("/api/leads");
    expect(res.status).toBe(401);
  });

  test("A tampered token (wrong signature) is rejected", async () => {
    const res = await request(app)
      .get("/api/leads")
      .set("Authorization", `Bearer ${tenantA.token}x`);
    expect(res.status).toBe(401);
  });

  test("/api/me reflects the caller's own tenant only", async () => {
    const resA = await request(app).get("/api/me").set("Authorization", `Bearer ${tenantA.token}`);
    const resB = await request(app).get("/api/me").set("Authorization", `Bearer ${tenantB.token}`);
    expect(resA.body.tenant.id).toBe(tenantA.tenant.id);
    expect(resB.body.tenant.id).toBe(tenantB.tenant.id);
    expect(resA.body.tenant.id).not.toBe(resB.body.tenant.id);
  });
});
