import { getToken } from "@/lib/auth";
import { getMe } from "@/lib/api";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { TokenProvider } from "@/lib/token-provider";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const token = await getToken();
  if (!token) redirect("/login");

  let tenantName: string | undefined;
  let userName: string | undefined;
  try {
    const { user, tenant } = await getMe(token);
    tenantName = tenant?.name;
    userName = user?.name;
  } catch {
    redirect("/login");
  }

  return (
    <TokenProvider token={token}>
      <div className="flex h-screen overflow-hidden bg-zinc-50">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header tenantName={tenantName} userName={userName} />
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        </div>
      </div>
    </TokenProvider>
  );
}
