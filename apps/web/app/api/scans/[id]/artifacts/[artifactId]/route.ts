import { NextResponse } from "next/server";

import { getCurrentUser } from "../../../../../../lib/auth";
import { artifactStore, scanRepository } from "../../../../../../lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; artifactId: string }> }
) {
  const { id, artifactId } = await context.params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const artifact = await scanRepository.getArtifactForUser(id, artifactId, user.id);

  if (!artifact) {
    return NextResponse.json({ error: "Artifact not found." }, { status: 404 });
  }

  const body = await artifactStore.readArtifact(artifact);

  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": artifact.mimeType,
      "Content-Disposition": `inline; filename="${artifact.id}"`
    }
  });
}
