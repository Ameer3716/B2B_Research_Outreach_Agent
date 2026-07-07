import { getToken } from "@/lib/auth";
import { getDashboardStats } from "@/lib/api";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, MessageSquare, TrendingUp, Flame } from "lucide-react";

const LEAD_STATUSES = ["new", "researching", "drafted", "sent", "replied", "hot", "closed"];

export const metadata = { title: "Overview — Meridian Outreach Agent" };

export default async function DashboardPage() {
  const token = await getToken();
  if (!token) redirect("/login");

  const { stats } = await getDashboardStats(token);

  const statCards = [
    {
      title: "Total Leads",
      value: stats.leads.total,
      icon: Users,
      description: `${stats.leads.byStatus?.new ?? 0} new`,
    },
    {
      title: "Messages Sent",
      value: stats.messages.byStatus?.sent ?? 0,
      icon: MessageSquare,
      description: `${stats.messages.byStatus?.draft ?? 0} drafts pending`,
    },
    {
      title: "Reply Rate",
      value: `${stats.replies.replyRatePercent}%`,
      icon: TrendingUp,
      description: `${stats.replies.total} total replies`,
    },
    {
      title: "Hot Leads",
      value: stats.replies.hotLeads,
      icon: Flame,
      description: `${stats.replies.positiveReplies} positive replies`,
    },
  ];

  const maxFunnelCount = Math.max(
    ...LEAD_STATUSES.map((s) => stats.leads.byStatus?.[s] ?? 0),
    1
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Live metrics from the Meridian Outreach Agent pipeline.
        </p>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(({ title, value, icon: Icon, description }) => (
          <Card key={title} className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{value}</div>
              <p className="text-xs text-muted-foreground mt-1">{description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Lead Funnel */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Lead Pipeline Funnel</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {LEAD_STATUSES.map((status) => {
              const count = stats.leads.byStatus?.[status] ?? 0;
              const pct = Math.round((count / maxFunnelCount) * 100);
              return (
                <div key={status} className="flex items-center gap-3">
                  <span className="w-24 text-sm text-muted-foreground capitalize shrink-0">
                    {status}
                  </span>
                  <div className="flex-1 bg-zinc-100 rounded-full h-2">
                    <div
                      className="h-2 rounded-full bg-zinc-800 transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-6 text-right text-sm font-medium tabular-nums">{count}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* KB + Agent summary */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Knowledge Base</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.knowledgeBase.entryCount}</div>
            <p className="text-xs text-muted-foreground mt-1">entries available for RAG</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Sentiment</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-4 text-sm">
            <div>
              <span className="text-green-600 font-semibold">{stats.replies.positiveReplies}</span>
              <span className="text-muted-foreground ml-1">positive</span>
            </div>
            <div>
              <span className="text-red-500 font-semibold">{stats.replies.negativeReplies}</span>
              <span className="text-muted-foreground ml-1">negative</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
