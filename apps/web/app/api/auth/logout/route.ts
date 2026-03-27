import { NextResponse } from "next/server";

import { clearSessionCookie, getSessionId } from "../../../../lib/auth";
import { scanRepository } from "../../../../lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const sessionId = await getSessionId();
  if (sessionId) {
    await scanRepository.deleteSession(sessionId);
  }

  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
