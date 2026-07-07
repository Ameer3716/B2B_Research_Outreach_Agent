"use client";

import { useState, useEffect, useCallback } from "react";
import { listAgentLogs, type AgentLog } from "@/lib/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { useToken } from "@/lib/token-provider";

const AGENTS = ["orchestrator", "research", "rag", "drafting", "send", "tracking"];

export default function AgentLogsPage() {
  const token = useToken();
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAgent, setFilterAgent] = useState<string>("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { logs } = await listAgentLogs(token, filterAgent || undefined);
      setLogs(logs);
    } catch {
      toast.error("Failed to load agent logs");
    } finally {
      setLoading(false);
    }
  }, [token, filterAgent]);

  useEffect(() => { load(); }, [load]);

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Agent Logs</h1>
          <p className="text-sm text-muted-foreground mt-1">{logs.length} log entries</p>
        </div>
        <Select value={filterAgent} onValueChange={(v) => setFilterAgent(v ?? "")}>
          <SelectTrigger className="w-40 h-9">
            <SelectValue placeholder="All agents" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All agents</SelectItem>
            {AGENTS.map(a => (
              <SelectItem key={a} value={a} className="capitalize">{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-3" /> Loading…
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">No logs yet. Run the pipeline to generate agent activity.</div>
      ) : (
        <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b bg-zinc-50">
              <tr>
                {["Agent", "Status", "Timestamp", "Details"].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {logs.map((log) => {
                const isExpanded = expanded.has(log.id);
                return [
                  <tr key={log.id} className="hover:bg-zinc-50 cursor-pointer" onClick={() => toggleExpand(log.id)}>
                    <td className="px-4 py-3 font-medium capitalize flex items-center gap-2">
                      {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                      {log.agent_name}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${log.status === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{new Date(log.created_at).toLocaleString()}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs truncate max-w-xs">
                      {log.output ? JSON.stringify(log.output).slice(0, 80) + "…" : "—"}
                    </td>
                  </tr>,
                  isExpanded && (
                    <tr key={`${log.id}-expanded`} className="bg-zinc-50">
                      <td colSpan={4} className="px-4 py-3">
                        <div className="grid grid-cols-2 gap-4 text-xs">
                          <div>
                            <p className="font-medium text-muted-foreground mb-1">Input</p>
                            <pre className="whitespace-pre-wrap bg-white rounded border p-2 overflow-x-auto max-h-48">
                              {JSON.stringify(log.input, null, 2)}
                            </pre>
                          </div>
                          <div>
                            <p className="font-medium text-muted-foreground mb-1">Output</p>
                            <pre className="whitespace-pre-wrap bg-white rounded border p-2 overflow-x-auto max-h-48">
                              {JSON.stringify(log.output, null, 2)}
                            </pre>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ),
                ].filter(Boolean);
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
