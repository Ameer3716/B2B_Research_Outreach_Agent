const {
  createLead,
  getLeadById,
  listLeadsByTenant,
  updateLeadStatus,
  updateLead,
  deleteLead,
} = require("../db/repositories/leads");

// Every handler below scopes to req.user.tenantId (set by the `authenticate`
// middleware from the verified JWT) — never to anything the client passed
// in the URL or body. This is what makes leads from Tenant A structurally
// unreachable from a Tenant B session, not just unreachable "by convention".

// GET /api/leads?status=new
function list(req, res) {
  const { status } = req.query;
  const leads = listLeadsByTenant(req.user.tenantId, { status });
  res.json({ leads });
}

// GET /api/leads/:id
function getOne(req, res) {
  const lead = getLeadById(req.user.tenantId, req.params.id);
  if (!lead) return res.status(404).json({ error: "Lead not found" });
  res.json({ lead });
}

// POST /api/leads
function create(req, res) {
  const { name, email, phone, title, companyId, leadType, source, notes } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });

  const lead = createLead({
    tenantId: req.user.tenantId,
    name,
    email,
    phone,
    title,
    companyId,
    leadType,
    source,
    notes,
  });
  res.status(201).json({ lead });
}

// PUT /api/leads/:id
function update(req, res) {
  const lead = updateLead(req.user.tenantId, req.params.id, req.body);
  if (!lead) return res.status(404).json({ error: "Lead not found" });
  res.json({ lead });
}

// DELETE /api/leads/:id
function remove(req, res) {
  const deleted = deleteLead(req.user.tenantId, req.params.id);
  if (!deleted) return res.status(404).json({ error: "Lead not found" });
  res.json({ deleted: true });
}

// PATCH /api/leads/:id/status
function updateStatus(req, res) {
  const { status } = req.body;
  const allowed = ["new", "researching", "drafted", "sent", "replied", "hot", "closed"];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${allowed.join(", ")}` });
  }

  const lead = updateLeadStatus(req.user.tenantId, req.params.id, status);
  if (!lead) return res.status(404).json({ error: "Lead not found" });
  res.json({ lead });
}

module.exports = { list, getOne, create, update, remove, updateStatus };

