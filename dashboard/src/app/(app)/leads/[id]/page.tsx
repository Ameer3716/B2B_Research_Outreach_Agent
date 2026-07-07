"use client";

import { useState, useEffect, use } from "react";
import { getLead, listMessages, runPipeline, sendMessage, type Lead, type Message, type PipelineResult } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Play, Send, Loader2, CheckCircle, Clock, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { useToken } from "@/lib/token-provider";

const STATUS_COLORS: Record<string, string> = {
  new: "bg-zinc-100 text-zinc-700",
  researching: "bg-blue-50 text-blue-700",
  drafted: "bg-yellow-50 text-yellow-700",
  sent: "bg-teal-50 text-teal-700",
  replied: "bg-green-50 text-green-700",
  hot: "bg-red-50 text-red-700",
  closed: "bg-zinc-50 text-zinc-400",
};

const PIPELINE_STATUS = ["new", "researching", "drafted", "sent", "replied", "hot"];

export default function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const token = useToken();
  const [lead, setLead] = useState<Lead | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [sending, setSending] = useState(false);
  const [pipelineResult, setPipelineResult] = useState<PipelineResult | null>(null);

  async function loadData() {
    try {
      const [{ lead }, { messages }] = await Promise.all([
        getLead(token, id),
        listMessages(token, undefined, id),
      ]);
      setLead(lead);
      setMessages(messages);
    } catch {
      toast.error("Failed to load lead");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, [id, token]);

  async function handleRunPipeline() {
    setRunning(true);
    setPipelineResult(null);
    try {
      const { pipeline } = await runPipeline(token, id);
      setPipelineResult(pipeline);
      toast.success("Pipeline complete — draft ready for review");
      loadData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Pipeline failed");
    } finally {
      setRunning(false);
    }
  }

  async function handleSend(messageId: string) {
    setSending(true);
    try {
      await sendMessage(token, messageId);
      toast.success("Message sent!");
      loadData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-16 text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin mr-3" /> Loading…
    </div>
  );

  if (!lead) return <div className="py-16 text-center text-muted-foreground">Lead not found.</div>;

  const statusIndex = PIPELINE_STATUS.indexOf(lead.status);
  const draftMessage = messages.find(m => m.status === "draft" || m.status === "approved");
  const sentMessage = messages.find(m => m.status === "sent");
  const canRunPipeline = ["new", "researching"].includes(lead.status);
  const canSend = draftMessage?.status === "approved";

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push("/leads")} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">{lead.name}</h1>
          <p className="text-sm text-muted-foreground">{lead.title ?? "—"} · {lead.lead_type?.replace("_"," ")}</p>
        </div>
        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold capitalize ${STATUS_COLORS[lead.status] ?? ""}`}>
          {lead.status}
        </span>
      </div>

      {/* Pipeline progress */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Pipeline Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-0">
            {PIPELINE_STATUS.map((s, i) => (
              <div key={s} className="flex items-center flex-1">
                <div className={`flex items-center justify-center h-7 w-7 rounded-full text-xs font-bold border-2 transition-colors ${
                  i < statusIndex ? "bg-zinc-800 border-zinc-800 text-white" :
                  i === statusIndex ? "border-zinc-800 text-zinc-800" :
                  "border-zinc-200 text-zinc-300"
                }`}>
                  {i < statusIndex ? <CheckCircle className="h-4 w-4" /> : i + 1}
                </div>
                <div className="text-[10px] text-muted-foreground capitalize ml-1 hidden md:block">{s}</div>
                {i < PIPELINE_STATUS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-1 ${i < statusIndex ? "bg-zinc-800" : "bg-zinc-100"}`} />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Lead info */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3"><CardTitle className="text-sm">Lead Details</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 text-sm">
          {[
            ["Email", lead.email ?? "—"],
            ["Phone", lead.phone ?? "—"],
            ["Source", lead.source ?? "—"],
            ["Created", new Date(lead.created_at).toLocaleDateString()],
          ].map(([k, v]) => (
            <div key={k}>
              <p className="text-muted-foreground text-xs">{k}</p>
              <p className="font-medium mt-0.5">{v}</p>
            </div>
          ))}
          {lead.notes && (
            <div className="col-span-2">
              <p className="text-muted-foreground text-xs">Notes</p>
              <p className="mt-0.5">{lead.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        {canRunPipeline && (
          <Button onClick={handleRunPipeline} disabled={running} className="gap-2">
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {running ? "Running pipeline…" : "Run Pipeline"}
          </Button>
        )}
        {draftMessage && draftMessage.status === "draft" && (
          <Link
            href={`/messages/${draftMessage.id}`}
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            Review Draft →
          </Link>
        )}
        {canSend && draftMessage && (
          <Button onClick={() => handleSend(draftMessage.id)} disabled={sending} className="gap-2 bg-teal-700 hover:bg-teal-800">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send Message
          </Button>
        )}
        {sentMessage && (
          <div className="flex items-center gap-2 text-sm text-teal-700 font-medium">
            <CheckCircle className="h-4 w-4" /> Sent {sentMessage.sent_at ? `on ${new Date(sentMessage.sent_at).toLocaleDateString()}` : ""}
          </div>
        )}
      </div>

      {/* Pipeline result */}
      {pipelineResult && (
        <Card className="shadow-sm border-green-200 bg-green-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-green-800">Pipeline Result</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs text-green-700 font-medium">Research Profile</p>
              <p className="text-sm mt-1">{String(pipelineResult.researchProfile?.summary ?? "")}</p>
            </div>
            <Separator className="bg-green-200" />
            <div>
              <p className="text-xs text-green-700 font-medium">Draft Message</p>
              <p className="text-sm font-medium mt-1">{pipelineResult.draftMessage?.subject}</p>
              <p className="text-sm mt-1 text-muted-foreground">{pipelineResult.draftMessage?.body}</p>
            </div>
            <div className="flex gap-4 text-xs text-green-700">
              {pipelineResult.stages?.map(s => (
                <span key={s.name}>{s.name}: {s.durationMs}ms</span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
