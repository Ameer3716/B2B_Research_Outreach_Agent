"use strict";

const {
  getMessageById,
  listMessagesByTenant,
  listMessagesByLead,
} = require("../db/repositories/messages");

// GET /api/messages?status=draft&leadId=xxx
function list(req, res) {
  const { status, leadId } = req.query;
  let messages;
  if (leadId) {
    messages = listMessagesByLead(req.user.tenantId, leadId);
    if (status) messages = messages.filter((m) => m.status === status);
  } else {
    messages = listMessagesByTenant(req.user.tenantId, { status });
  }
  res.json({ messages });
}

// GET /api/messages/:id
function getOne(req, res) {
  const message = getMessageById(req.user.tenantId, req.params.id);
  if (!message) return res.status(404).json({ error: "Message not found" });
  res.json({ message });
}

module.exports = { list, getOne };
