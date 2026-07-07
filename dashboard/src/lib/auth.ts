// Cookie-based auth helpers for Next.js server components and route handlers
// The JWT from the backend is stored as an httpOnly cookie.

import { cookies } from "next/headers";

const COOKIE_NAME = "auth-token";

export async function getToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_NAME)?.value ?? null;
}

export async function setToken(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 12, // 12 hours (matches JWT_EXPIRES_IN)
    path: "/",
  });
}

export async function clearToken(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
