"use client";

import { useState, useEffect } from "react";
import { listReplies, type Reply } from "@/lib/api";
import { Flame, Loader2 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { useToken } from "@/lib/token-provider";

const SENTIMENT_COLORS: Record<string, { dot: string; badge: string }> = {
  positive: { dot: "bg-green-500", badge: "bg-green-50 text-green-700" },
  neutral: { dot: "bg-zinc-400", badge: "bg-zinc-100 text-zinc-600" },
  negative: { dot: "bg-red-500", badge: "bg-red-50 text-red-700" },
};

export default function RepliesPage() {
  const token = useToken();
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listReplies(token).then(({ replies }) => setReplies(replies)).catch(() => toast.error("Failed to load replies")).finally(() => setLoading(false));
  }, [token]);

  if (loading) return (
    <div className="flex items-center justify-center py-16 text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin mr-3" /> Loading…
    </div>
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reply Inbox</h1>
        <p className="text-sm text-muted-foreground mt-1">{replies.length} replies</p>
      </div>

      {replies.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          No replies yet. Use the message detail page to simulate an inbound reply.
        </div>
      ) : (
        <div className="space-y-3">
          {replies.map((reply) => {
            const s = reply.sentiment ?? "neutral";
            const cfg = SENTIMENT_COLORS[s] ?? SENTIMENT_COLORS.neutral;
            return (
              <div key={reply.id} className="rounded-lg border bg-white shadow-sm p-4">
                <div className="flex items-start gap-3">
                  <span className={`mt-1.5 h-2.5 w-2.5 rounded-full shrink-0 ${cfg.dot}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${cfg.badge}`}>{s}</span>
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
                    <Link href={`/messages/${reply.message_id}`} className="text-xs text-muted-foreground hover:underline mt-1 block">
                      View message →
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
