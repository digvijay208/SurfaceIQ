import { NextResponse } from "next/server";

import { isShowcaseMode } from "../../../lib/app-mode";
import { getCurrentUser } from "../../../lib/auth";
import { scanRepository } from "../../../lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const scans = await scanRepository.listScans(user.id);
  return NextResponse.json({ scans });
}

export async function POST(request: Request) {
  if (isShowcaseMode()) {
    return NextResponse.json(
      {
        error: "Hosted showcase mode is read-only while the global scanning backend is being connected."
      },
      { status: 503 }
    );
  }

  const payload = (await request.json().catch(() => null)) as
    | {
        startUrl?: string;
        requestedBy?: string;
        authorizationConfirmed?: boolean;
        auth?: {
          mode?: "public" | "credentials" | "session";
          loginUrl?: string;
          username?: string;
          password?: string;
          usernameSelector?: string;
          passwordSelector?: string;
          submitSelector?: string;
          successSelector?: string;
          successUrlContains?: string;
          sessionCookiesJson?: string;
        };
      }
    | null;

  if (!payload?.startUrl) {
    return NextResponse.json({ error: "startUrl is required." }, { status: 400 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const scan = await scanRepository.createScan({
      userId: user.id,
      startUrl: payload.startUrl,
      authorizationConfirmed: Boolean(payload.authorizationConfirmed),
      ...(payload.requestedBy ? { requestedBy: payload.requestedBy } : {}),
      ...(payload.auth ? { auth: payload.auth } : {})
    });

    return NextResponse.json(
      {
        id: scan.id,
        state: scan.state
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to create scan."
      },
      { status: 400 }
    );
  }
}
