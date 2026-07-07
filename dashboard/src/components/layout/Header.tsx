"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

interface HeaderProps {
  tenantName?: string;
  userName?: string;
}

export function Header({ tenantName, userName }: HeaderProps) {
  const router = useRouter();

  async function logout() {
    await fetch("/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="flex h-14 items-center justify-between border-b px-6 bg-white">
      <div className="text-sm text-muted-foreground">
        {tenantName && (
          <span className="font-medium text-foreground">{tenantName}</span>
        )}
      </div>
      <div className="flex items-center gap-4">
        {userName && (
          <span className="text-sm text-muted-foreground">{userName}</span>
        )}
        <Button variant="ghost" size="sm" onClick={logout} className="gap-2">
          <LogOut className="h-4 w-4" />
          Logout
        </Button>
      </div>
    </header>
  );
}
