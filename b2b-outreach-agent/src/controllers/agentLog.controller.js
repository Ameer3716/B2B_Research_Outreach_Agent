"use strict";

const { listLogsByTenant } = require("../db/repositories/agentLogs");

// GET /api/agent-logs?agent=research
function list(req, res) {
  const { agent } = req.query;
  const logs = listLogsByTenant(req.user.tenantId, {
    agentName: agent || undefined,
  });

  // Parse JSON fields for the API response
  const parsed = logs.map((log) => ({
    ...log,
    input: log.input ? JSON.parse(log.input) : null,
    output: log.output ? JSON.parse(log.output) : null,
  }));

  res.json({ logs: parsed });
}

module.exports = { list };
