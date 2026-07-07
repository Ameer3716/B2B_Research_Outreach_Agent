"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  MessageSquare,
  Inbox,
  BookOpen,
  ScrollText,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/leads", label: "Leads", icon: Users },
  { href: "/messages", label: "Messages", icon: MessageSquare },
  { href: "/replies", label: "Replies", icon: Inbox },
  { href: "/knowledge-base", label: "Knowledge Base", icon: BookOpen },
  { href: "/agent-logs", label: "Agent Logs", icon: ScrollText },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-56 flex-col border-r border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar-background))] text-[hsl(var(--sidebar-foreground))]">
      {/* Brand */}
      <div className="flex items-center gap-2 px-5 py-5 border-b border-[hsl(var(--sidebar-border))]">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-white/10">
          <Zap className="h-4 w-4 text-white" />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold text-white">Meridian</p>
          <p className="text-[10px] text-zinc-400">Outreach Agent</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-white/10 text-white font-medium"
                  : "text-zinc-400 hover:bg-white/5 hover:text-white"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
