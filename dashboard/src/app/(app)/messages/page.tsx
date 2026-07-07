"use client";

import { useState, useEffect, useCallback } from "react";
import { listMessages, approveDraft, type Message } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, CheckCircle, Send, Eye } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useToken } from "@/lib/token-provider";

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-yellow-50 text-yellow-700" },
  approved: { label: "Approved", cls: "bg-blue-50 text-blue-700" },
  sent: { label: "Sent", cls: "bg-teal-50 text-teal-700" },
  failed: { label: "Failed", cls: "bg-red-50 text-red-700" },
};

export default function MessagesPage() {
  const router = useRouter();
  const token = useToken();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [approvingMsg, setApprovingMsg] = useState<Message | null>(null);
  const [approveText, setApproveText] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { messages } = await listMessages(token, filterStatus || undefined);
      setMessages(messages);
    } catch {
      toast.error("Failed to load messages");
    } finally {
      setLoading(false);
    }
  }, [token, filterStatus]);

  useEffect(() => { load(); }, [load]);

  function openApprove(msg: Message) {
    setApprovingMsg(msg);
    setApproveText(msg.draft_text ?? "");
  }

  async function handleApprove() {
    if (!approvingMsg) return;
    setSaving(true);
    try {
      await approveDraft(token, approvingMsg.id, approveText);
      toast.success("Draft approved!");
      setApprovingMsg(null);
      load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Approval failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Messages</h1>
          <p className="text-sm text-muted-foreground mt-1">{messages.length} messages</p>
        </div>
        <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v ?? "")}>
          <SelectTrigger className="w-36 h-9">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All statuses</SelectItem>
            {["draft","approved","sent","failed"].map(s => (
              <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-3" /> Loading…
        </div>
      ) : messages.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">No messages yet. Run the pipeline on a lead to generate drafts.</div>
      ) : (
        <div className="space-y-3">
          {messages.map((msg) => {
            const cfg = STATUS_CONFIG[msg.status] ?? { label: msg.status, cls: "bg-zinc-100 text-zinc-600" };
            const text = msg.approved_text ?? msg.draft_text ?? "";
            return (
              <div key={msg.id} className="rounded-lg border bg-white shadow-sm p-4 flex gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.cls}`}>
                      {cfg.label}
                    </span>
                    <span className="text-xs text-muted-foreground">{msg.channel}</span>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {new Date(msg.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm line-clamp-2 text-muted-foreground">{text}</p>
                  {msg.sent_at && (
                    <p className="text-xs text-teal-600 mt-1 flex items-center gap-1">
                      <CheckCircle className="h-3 w-3" /> Sent {new Date(msg.sent_at).toLocaleString()}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <Button size="sm" variant="outline" className="gap-1.5 h-8"
                    onClick={() => router.push(`/messages/${msg.id}`)}>
                    <Eye className="h-3.5 w-3.5" /> View
                  </Button>
                  {msg.status === "draft" && (
                    <Button size="sm" className="gap-1.5 h-8" onClick={() => openApprove(msg)}>
                      <CheckCircle className="h-3.5 w-3.5" /> Approve
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Approve dialog */}
      <Dialog open={!!approvingMsg} onOpenChange={open => { if (!open) setApprovingMsg(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Review & Approve Draft</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <p className="text-sm text-muted-foreground">Edit the draft below, then click Approve to mark it ready for sending.</p>
            <Textarea
              value={approveText}
              onChange={e => setApproveText(e.target.value)}
              className="min-h-48 font-mono text-sm"
            />
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setApprovingMsg(null)}>Cancel</Button>
              <Button onClick={handleApprove} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                Approve
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
