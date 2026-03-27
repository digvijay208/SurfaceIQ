import { NextResponse } from "next/server";

import { sortFindingsBySeverity } from "@surfaceiq/core";

import { getCurrentUser } from "../../../../../lib/auth";
import { scanRepository } from "../../../../../lib/server";

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

  const findings = await scanRepository.getFindingsForUser(id, user.id);
  return NextResponse.json({ findings: sortFindingsBySeverity(findings) });
}
