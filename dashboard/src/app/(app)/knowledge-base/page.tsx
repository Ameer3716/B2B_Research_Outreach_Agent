"use client";

import { useState, useEffect } from "react";
import { listKb, createKbEntry, deleteKbEntry, type KbEntry } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Plus, Trash2, Loader2, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { useToken } from "@/lib/token-provider";

export default function KnowledgeBasePage() {
  const token = useToken();
  const [entries, setEntries] = useState<KbEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const { entries } = await listKb(token);
      setEntries(entries);
    } catch {
      toast.error("Failed to load KB");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [token]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setSaving(true);
    try {
      await createKbEntry(token, { content, tags });
      toast.success("KB entry added");
      setContent("");
      setTags("");
      load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to add entry");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await deleteKbEntry(token, id);
      toast.success("Entry deleted");
      load();
    } catch {
      toast.error("Failed to delete entry");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Knowledge Base</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Case studies, testimonials, and proof points the RAG Agent pulls from when drafting outreach.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Entry list */}
        <div className="lg:col-span-3 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-3" /> Loading…
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground border rounded-lg bg-white">
              <BookOpen className="h-8 w-8 mx-auto mb-3 opacity-30" />
              <p>No KB entries yet. Add your first case study or testimonial.</p>
            </div>
          ) : (
            entries.map((entry) => (
              <div key={entry.id} className="rounded-lg border bg-white shadow-sm p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-sm">{entry.content}</p>
                    {entry.tags && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {entry.tags.split(",").map(t => t.trim()).filter(Boolean).map(tag => (
                          <span key={tag} className="inline-flex items-center rounded-md bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">{new Date(entry.created_at).toLocaleDateString()}</p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(entry.id)}
                    disabled={deletingId === entry.id}
                  >
                    {deletingId === entry.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Add form */}
        <div className="lg:col-span-2">
          <Card className="shadow-sm sticky top-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Plus className="h-4 w-4" /> Add Entry
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Content *</Label>
                  <Textarea
                    required
                    value={content}
                    onChange={e => setContent(e.target.value)}
                    placeholder="Case study, testimonial, product fact, or talking point..."
                    className="min-h-32 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Tags</Label>
                  <Input
                    value={tags}
                    onChange={e => setTags(e.target.value)}
                    placeholder="case_study,expired_listings,pricing"
                  />
                  <p className="text-xs text-muted-foreground">Comma-separated. Used for retrieval filtering.</p>
                </div>
                <Button type="submit" className="w-full gap-2" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Add Entry
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
