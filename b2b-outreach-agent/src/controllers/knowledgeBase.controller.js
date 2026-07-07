"use strict";

const {
  createEntry,
  getEntryById,
  listEntriesByTenant,
  deleteEntry,
} = require("../db/repositories/knowledgeBase");

// GET /api/knowledge-base
function list(req, res) {
  const entries = listEntriesByTenant(req.user.tenantId);
  res.json({ entries });
}

// GET /api/knowledge-base/:id
function getOne(req, res) {
  const entry = getEntryById(req.user.tenantId, req.params.id);
  if (!entry) return res.status(404).json({ error: "KB entry not found" });
  res.json({ entry });
}

// POST /api/knowledge-base
// Body: { content, tags, entryType }
function create(req, res) {
  const { content, tags, entryType } = req.body;
  if (!content) {
    return res.status(400).json({ error: "content is required" });
  }

  const entry = createEntry({
    tenantId: req.user.tenantId,
    content,
    tags: tags || "",
    entryType: entryType || "general",
  });
  res.status(201).json({ entry });
}

// DELETE /api/knowledge-base/:id
function remove(req, res) {
  const deleted = deleteEntry(req.user.tenantId, req.params.id);
  if (!deleted) return res.status(404).json({ error: "KB entry not found" });
  res.json({ deleted: true });
}

module.exports = { list, getOne, create, remove };
