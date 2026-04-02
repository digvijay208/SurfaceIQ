import { NextResponse } from "next/server";

import { isShowcaseMode } from "../../../../lib/app-mode";
import { setSessionCookie } from "../../../../lib/auth";
import { scanRepository } from "../../../../lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (isShowcaseMode()) {
    return NextResponse.json(
      { error: "Hosted showcase mode does not allow account creation yet." },
      { status: 503 }
    );
  }

  const payload = (await request.json().catch(() => null)) as
    | { email?: string; password?: string; name?: string }
    | null;

  if (!payload?.email || !payload.password || !payload.name) {
    return NextResponse.json({ error: "Name, email, and password are required." }, { status: 400 });
  }

  try {
    const user = await scanRepository.createUser({
      email: payload.email,
      password: payload.password,
      name: payload.name
    });
    const session = await scanRepository.createSession(user.id);
    await setSessionCookie(session.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create account." },
      { status: 400 }
    );
  }
}
