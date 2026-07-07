const { randomUUID } = require("crypto");
const db = require("../client");

function logAgentRun({ tenantId, agentName, input = null, output = null, status = "success" }) {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO agent_logs (id, tenant_id, agent_name, input, output, status)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    tenantId,
    agentName,
    input ? JSON.stringify(input) : null,
    output ? JSON.stringify(output) : null,
    status
  );
  return db.prepare(`SELECT * FROM agent_logs WHERE id = ?`).get(id);
}

function listLogsByTenant(tenantId, { agentName } = {}) {
  if (agentName) {
    return db
      .prepare(
        `SELECT * FROM agent_logs WHERE tenant_id = ? AND agent_name = ? ORDER BY created_at DESC`
      )
      .all(tenantId, agentName);
  }
  return db
    .prepare(`SELECT * FROM agent_logs WHERE tenant_id = ? ORDER BY created_at DESC`)
    .all(tenantId);
}

module.exports = { logAgentRun, listLogsByTenant };
