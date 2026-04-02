import { NextResponse } from "next/server";

import { isShowcaseMode } from "../../../../lib/app-mode";
import { clearSessionCookie, getSessionId } from "../../../../lib/auth";
import { scanRepository } from "../../../../lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  if (isShowcaseMode()) {
    return NextResponse.json({ ok: true });
  }

  const sessionId = await getSessionId();
  if (sessionId) {
    await scanRepository.deleteSession(sessionId);
  }

  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
