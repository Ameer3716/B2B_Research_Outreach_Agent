// ============================================================================
// API fetch wrapper
// All calls go through /api/* which Next.js rewrites to the backend.
// The token is read from the auth-token cookie on the server side,
// or passed explicitly for client components.
// ============================================================================

function getBaseUrl() {
  if (typeof window !== "undefined") return "/api";
  return `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:4000"}/api`;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  options: RequestInit & { token?: string } = {}
): Promise<T> {
  const { token, ...fetchOpts } = options;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(fetchOpts.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${getBaseUrl()}${path}`, {
    ...fetchOpts,
    headers,
    cache: "no-store",
  });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      message = body.error || message;
    } catch {}
    throw new ApiError(res.status, message);
  }

  return res.json() as Promise<T>;
}

// ---- Auth ------------------------------------------------------------------

export function login(email: string, password: string) {
  return request<{ token: string; user: User }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

// ---- Me --------------------------------------------------------------------

export function getMe(token: string) {
  return request<{ user: User; tenant: Tenant }>("/me", { token });
}

// ---- Leads -----------------------------------------------------------------

export function listLeads(token: string, status?: string) {
  const qs = status ? `?status=${status}` : "";
  return request<{ leads: Lead[] }>(`/leads${qs}`, { token });
}

export function getLead(token: string, id: string) {
  return request<{ lead: Lead }>(`/leads/${id}`, { token });
}

export function createLead(token: string, data: Partial<Lead>) {
  return request<{ lead: Lead }>("/leads", {
    method: "POST",
    body: JSON.stringify(data),
    token,
  });
}

export function updateLead(token: string, id: string, data: Partial<Lead>) {
  return request<{ lead: Lead }>(`/leads/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
    token,
  });
}

export function deleteLead(token: string, id: string) {
  return request<{ deleted: boolean }>(`/leads/${id}`, {
    method: "DELETE",
    token,
  });
}

// ---- Pipeline --------------------------------------------------------------

export function runPipeline(token: string, leadId: string) {
  return request<{ pipeline: PipelineResult }>("/pipeline/run", {
    method: "POST",
    body: JSON.stringify({ leadId }),
    token,
  });
}

export function approveDraft(
  token: string,
  messageId: string,
  approvedText?: string
) {
  return request<{ message: Message }>("/pipeline/approve", {
    method: "POST",
    body: JSON.stringify({ messageId, approvedText }),
    token,
  });
}

export function sendMessage(token: string, messageId: string) {
  return request<{ send: SendResult }>("/pipeline/send", {
    method: "POST",
    body: JSON.stringify({ messageId }),
    token,
  });
}

// ---- Messages --------------------------------------------------------------

export function listMessages(token: string, status?: string, leadId?: string) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (leadId) params.set("leadId", leadId);
  const qs = params.toString() ? `?${params.toString()}` : "";
  return request<{ messages: Message[] }>(`/messages${qs}`, { token });
}

export function getMessage(token: string, id: string) {
  return request<{ message: Message }>(`/messages/${id}`, { token });
}

// ---- Replies ---------------------------------------------------------------

export function listReplies(token: string, messageId?: string) {
  const qs = messageId ? `?messageId=${messageId}` : "";
  return request<{ replies: Reply[] }>(`/replies${qs}`, { token });
}

export function submitReply(token: string, messageId: string, content: string) {
  return request<{ reply: TrackingResult }>("/replies/webhook", {
    method: "POST",
    body: JSON.stringify({ messageId, content }),
    token,
  });
}

// ---- Knowledge Base --------------------------------------------------------

export function listKb(token: string) {
  return request<{ entries: KbEntry[] }>("/knowledge-base", { token });
}

export function createKbEntry(
  token: string,
  data: { content: string; tags?: string; entryType?: string }
) {
  return request<{ entry: KbEntry }>("/knowledge-base", {
    method: "POST",
    body: JSON.stringify(data),
    token,
  });
}

export function deleteKbEntry(token: string, id: string) {
  return request<{ deleted: boolean }>(`/knowledge-base/${id}`, {
    method: "DELETE",
    token,
  });
}

// ---- Agent Logs ------------------------------------------------------------

export function listAgentLogs(token: string, agent?: string) {
  const qs = agent ? `?agent=${agent}` : "";
  return request<{ logs: AgentLog[] }>(`/agent-logs${qs}`, { token });
}

// ---- Dashboard -------------------------------------------------------------

export function getDashboardStats(token: string) {
  return request<{ stats: DashboardStats }>("/dashboard/stats", { token });
}

// ============================================================================
// Types
// ============================================================================

export interface User {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  role: string;
}

export interface Tenant {
  id: string;
  name: string;
  industry: string | null;
}

export interface Lead {
  id: string;
  tenant_id: string;
  company_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  lead_type: string;
  status: string;
  source: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  tenant_id: string;
  lead_id: string;
  draft_text: string | null;
  approved_text: string | null;
  channel: string;
  status: string;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Reply {
  id: string;
  tenant_id: string;
  message_id: string;
  content: string;
  sentiment: string | null;
  is_hot_lead: boolean;
  created_at: string;
}

export interface KbEntry {
  id: string;
  tenant_id: string;
  content: string;
  tags: string | null;
  entry_type: string;
  created_at: string;
}

export interface AgentLog {
  id: string;
  tenant_id: string;
  agent_name: string;
  input: unknown;
  output: unknown;
  status: string;
  created_at: string;
}

export interface DashboardStats {
  leads: { total: number; byStatus: Record<string, number> };
  messages: { total: number; byStatus: Record<string, number> };
  replies: {
    total: number;
    hotLeads: number;
    positiveReplies: number;
    negativeReplies: number;
    replyRatePercent: number;
  };
  knowledgeBase: { entryCount: number };
}

export interface PipelineResult {
  leadId: string;
  lead: { name: string; title: string; leadType: string };
  researchProfile: Record<string, unknown>;
  knowledgeSnippets: Array<{ id: string; content: string; tags: string }>;
  draftMessage: { messageId: string; subject: string; body: string; wordCount: number };
  stages: Array<{ name: string; status: string; durationMs: number }>;
  totalDurationMs: number;
}

export interface SendResult {
  messageId: string;
  leadId: string;
  externalMessageId: string;
  provider: string;
  status: string;
}

export interface TrackingResult {
  replyId: string;
  messageId: string;
  leadId: string;
  sentiment: string;
  isHotLead: boolean;
  reason: string;
  newLeadStatus: string;
}
