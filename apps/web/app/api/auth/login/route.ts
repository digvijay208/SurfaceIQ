import { NextResponse } from "next/server";

import { setSessionCookie } from "../../../../lib/auth";
import { scanRepository } from "../../../../lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as
    | { email?: string; password?: string }
    | null;

  if (!payload?.email || !payload.password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  const user = await scanRepository.authenticateUser(payload.email, payload.password);
  if (!user) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  const session = await scanRepository.createSession(user.id);
  await setSessionCookie(session.id);
  return NextResponse.json({ ok: true });
}
