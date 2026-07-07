"use client";

// ============================================================================
// Token context
// ----------------------------------------------------------------------------
// The JWT lives in an httpOnly cookie, so it can only be read server-side
// (see lib/auth.ts's getToken()). Server Components (dashboard/page.tsx,
// (app)/layout.tsx) can call getToken() directly. Client Components can't —
// httpOnly cookies aren't readable from client JS, and Client Components
// can't call next/headers' cookies() either.
//
// (app)/layout.tsx is a Server Component that already reads the token once
// per request. It wraps its children in <TokenProvider> so every Client
// Component page underneath can grab that same token via useToken() instead
// of passing "" to the API helpers (which silently drops the Authorization
// header and makes every request come back 401).
// ============================================================================

import { createContext, useContext } from "react";

const TokenContext = createContext<string>("");

export function TokenProvider({
  token,
  children,
}: {
  token: string;
  children: React.ReactNode;
}) {
  return <TokenContext.Provider value={token}>{children}</TokenContext.Provider>;
}

export function useToken(): string {
  return useContext(TokenContext);
}
