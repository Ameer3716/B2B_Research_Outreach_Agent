"use client";

import { useState, useEffect, useCallback } from "react";
import { listLeads, createLead, deleteLead, type Lead } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Trash2, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
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

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_COLORS[status] ?? "bg-zinc-100 text-zinc-600"}`}>
      {status}
    </span>
  );
}

export default function LeadsPage() {
  const router = useRouter();
  const token = useToken();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", title: "", leadType: "seller", notes: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { leads } = await listLeads(token, filterStatus || undefined);
      setLeads(leads);
    } catch {
      toast.error("Failed to load leads");
    } finally {
      setLoading(false);
    }
  }, [token, filterStatus]);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await createLead(token, form);
      toast.success("Lead created");
      setDialogOpen(false);
      setForm({ name: "", email: "", title: "", leadType: "seller", notes: "" });
      load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create lead");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete lead "${name}"?`)) return;
    try {
      await deleteLead(token, id);
      toast.success("Lead deleted");
      load();
    } catch {
      toast.error("Failed to delete lead");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Leads</h1>
          <p className="text-sm text-muted-foreground mt-1">{leads.length} leads</p>
        </div>
        <div className="flex gap-3">
          <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v ?? "")}>
            <SelectTrigger className="w-36 h-9">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All statuses</SelectItem>
              {["new","researching","drafted","sent","replied","hot","closed"].map(s => (
                <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger render={<Button size="sm" className="gap-2" />}>
              <Plus className="h-4 w-4" /> New Lead
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Lead</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4 mt-2">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Name *</Label>
                    <Input required value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="Jane Smith" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Email</Label>
                    <Input type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} placeholder="jane@example.com" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Title</Label>
                    <Input value={form.title} onChange={e => setForm(f => ({...f, title: e.target.value}))} placeholder="Homeowner" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Type</Label>
                    <Select value={form.leadType} onValueChange={v => setForm(f => ({...f, leadType: v ?? f.leadType}))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["seller","buyer","expired_listing","referral_partner"].map(t => (
                          <SelectItem key={t} value={t}>{t.replace("_"," ")}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Notes</Label>
                  <Input value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} placeholder="Property details, situation, source..." />
                </div>
                <div className="flex justify-end gap-3">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={saving}>
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create Lead
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-3" /> Loading leads…
        </div>
      ) : leads.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">No leads found. Add one to get started.</div>
      ) : (
        <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b bg-zinc-50">
              <tr>
                {["Name", "Type", "Status", "Email", "Created", ""].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {leads.map((lead) => (
                <tr
                  key={lead.id}
                  className="hover:bg-zinc-50 cursor-pointer transition-colors"
                  onClick={() => router.push(`/leads/${lead.id}`)}
                >
                  <td className="px-4 py-3 font-medium">{lead.name}</td>
                  <td className="px-4 py-3 text-muted-foreground capitalize">{lead.lead_type?.replace("_"," ")}</td>
                  <td className="px-4 py-3"><StatusBadge status={lead.status} /></td>
                  <td className="px-4 py-3 text-muted-foreground">{lead.email ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{new Date(lead.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(lead.id, lead.name)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
