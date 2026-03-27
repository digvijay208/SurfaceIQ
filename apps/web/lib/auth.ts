import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import type { UserRecord } from "@surfaceiq/core";

import { scanRepository } from "./server";

const SESSION_COOKIE = "surfaceiq_session";

export async function getSessionId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE)?.value ?? null;
}

export async function getCurrentUser(): Promise<UserRecord | null> {
  const sessionId = await getSessionId();
  if (!sessionId) {
    return null;
  }

  const result = await scanRepository.getSessionWithUser(sessionId);
  return result?.user ?? null;
}

export async function requireUser(): Promise<UserRecord> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return user;
}

export async function setSessionCookie(sessionId: string) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 14 * 24 * 60 * 60
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 0
  });
}
