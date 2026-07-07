import { NextRequest, NextResponse } from "next/server";
import { setToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();

  const backendRes = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/api/auth/login`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }
  );

  if (!backendRes.ok) {
    const err = await backendRes.json().catch(() => ({ error: "Login failed" }));
    return NextResponse.json(err, { status: backendRes.status });
  }

  const data = await backendRes.json();
  await setToken(data.token);
  return NextResponse.json({ user: data.user });
}
