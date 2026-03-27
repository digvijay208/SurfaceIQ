import { NextResponse } from "next/server";

import { getCurrentUser } from "../../../../lib/auth";
import { scanRepository } from "../../../../lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const detail = await scanRepository.getScanDetailForUser(id, user.id);

  if (!detail) {
    return NextResponse.json({ error: "Scan not found." }, { status: 404 });
  }

  return NextResponse.json(detail);
}
