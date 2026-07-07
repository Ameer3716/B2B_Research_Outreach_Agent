"use client";

import { useState, useEffect, use } from "react";
import { getMessage, approveDraft, sendMessage, listReplies, submitReply, type Message, type Reply } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, CheckCircle, Send, Loader2, Flame } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useToken } from "@/lib/token-provider";

const SENTIMENT_COLORS: Record<string, string> = {
  positive: "text-green-600 bg-green-50",
  neutral: "text-zinc-600 bg-zinc-100",
  negative: "text-red-600 bg-red-50",
};

export default function MessageDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const token = useToken();
  const [message, setMessage] = useState<Message | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(true);
  const [approveText, setApproveText] = useState("");
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [replyContent, setReplyContent] = useState("");
  const [submittingReply, setSubmittingReply] = useState(false);

  async function loadData() {
    try {
      const [{ message }, { replies }] = await Promise.all([
        getMessage(token, id),
        listReplies(token, id),
      ]);
      setMessage(message);
      setApproveText(message.approved_text ?? message.draft_text ?? "");
      setReplies(replies);
    } catch {
      toast.error("Failed to load message");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, [id, token]);

  async function handleApprove() {
    setSaving(true);
    try {
      await approveDraft(token, id, approveText);
      toast.success("Draft approved!");
      loadData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Approval failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleSend() {
    setSending(true);
    try {
      await sendMessage(token, id);
      toast.success("Message sent!");
      loadData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  async function handleSubmitReply() {
    if (!replyContent.trim()) return;
    setSubmittingReply(true);
    try {
      const { reply } = await submitReply(token, id, replyContent);
      toast.success(`Reply recorded — ${reply.sentiment} sentiment${reply.isHotLead ? " 🔥 Hot Lead!" : ""}`);
      setReplyContent("");
      loadData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to submit reply");
    } finally {
      setSubmittingReply(false);
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-16 text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin mr-3" /> Loading…
    </div>
  );
  if (!message) return <div className="py-16 text-center text-muted-foreground">Message not found.</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push("/messages")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-bold">Message Detail</h1>
        <span className="ml-auto text-sm text-muted-foreground capitalize">{message.status}</span>
      </div>

      {/* Draft text */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">
            {message.status === "draft" ? "Draft — review and edit before approving" :
             message.status === "approved" ? "Approved — ready to send" :
             message.status === "sent" ? "Sent message" : "Message content"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {message.status === "draft" ? (
            <>
              <Textarea value={approveText} onChange={e => setApproveText(e.target.value)} className="min-h-40 font-mono text-sm" />
              <div className="flex gap-3">
                <Button onClick={handleApprove} disabled={saving} className="gap-2">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                  Approve Draft
                </Button>
              </div>
            </>
          ) : (
            <>
              <pre className="whitespace-pre-wrap text-sm p-3 bg-zinc-50 rounded-md">
                {message.approved_text ?? message.draft_text}
              </pre>
              {message.status === "approved" && (
                <Button onClick={handleSend} disabled={sending} className="gap-2 bg-teal-700 hover:bg-teal-800">
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Send Now
                </Button>
              )}
              {message.status === "sent" && message.sent_at && (
                <p className="text-sm text-teal-600 flex items-center gap-2">
                  <CheckCircle className="h-4 w-4" /> Sent {new Date(message.sent_at).toLocaleString()}
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Simulate reply (only for sent messages) */}
      {message.status === "sent" && (
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Simulate Inbound Reply</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">Paste a reply to trigger the Tracking Agent (sentiment analysis + hot-lead detection).</p>
            <Textarea
              placeholder="Yes, I'd love to hear more — can we schedule a call?"
              value={replyContent}
              onChange={e => setReplyContent(e.target.value)}
              className="min-h-24"
            />
            <Button onClick={handleSubmitReply} disabled={submittingReply || !replyContent.trim()} className="gap-2">
              {submittingReply ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Submit Reply
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Replies */}
      {replies.length > 0 && (
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Replies ({replies.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {replies.map((reply) => (
              <div key={reply.id} className="space-y-2">
                <div className="flex items-center gap-2">
                  {reply.sentiment && (
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${SENTIMENT_COLORS[reply.sentiment] ?? ""}`}>
                      {reply.sentiment}
                    </span>
                  )}
                  {reply.is_hot_lead && (
                    <span className="flex items-center gap-1 text-xs font-medium text-red-600">
                      <Flame className="h-3 w-3" /> Hot Lead
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground ml-auto">
                    {new Date(reply.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm">{reply.content}</p>
                <Separator />
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
