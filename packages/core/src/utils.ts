import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
  scryptSync
} from "node:crypto";

import type {
  CreateScanInput,
  CreateSessionInput,
  FindingDraft,
  FindingRecord,
  RunStepRecord,
  RunStepStatus,
  ScanAuthConfig,
  ScanPolicy,
  ScanRecord,
  SessionRecord
} from "./types";
import { DEFAULT_SCAN_POLICY } from "./types";

function getAppSecret() {
  const configured = process.env.SURFACEIQ_APP_SECRET;
  if (configured) {
    return configured;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("SURFACEIQ_APP_SECRET is required in production.");
  }

  return "surfaceiq-dev-only-secret";
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function makeId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 18)}`;
}

export function normalizeUrl(input: string): URL {
  const parsed = new URL(input);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only http and https URLs are supported.");
  }

  parsed.hash = "";
  return parsed;
}

export function mergePolicy(policy?: Partial<ScanPolicy>): ScanPolicy {
  return {
    ...DEFAULT_SCAN_POLICY,
    ...policy
  };
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, passwordHash: string): boolean {
  const [salt, expectedHash] = passwordHash.split(":");
  if (!salt || !expectedHash) {
    return false;
  }

  const actualHash = scryptSync(password, salt, 64).toString("hex");
  return actualHash === expectedHash;
}

export function encryptSecret(value: string): string {
  const iv = randomBytes(12);
  const key = createHash("sha256").update(getAppSecret()).digest();
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptSecret(value: string): string {
  const payload = Buffer.from(value, "base64");
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const encrypted = payload.subarray(28);
  const key = createHash("sha256").update(getAppSecret()).digest();
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export function createScanAuthConfig(input?: CreateScanInput["auth"]): ScanAuthConfig {
  const mode = input?.mode ?? "public";

  return {
    mode,
    ...(input?.loginUrl ? { loginUrl: normalizeUrl(input.loginUrl).toString() } : {}),
    ...(input?.username ? { username: input.username } : {}),
    ...(input?.password ? { encryptedPassword: encryptSecret(input.password) } : {}),
    ...(input?.usernameSelector ? { usernameSelector: input.usernameSelector } : {}),
    ...(input?.passwordSelector ? { passwordSelector: input.passwordSelector } : {}),
    ...(input?.submitSelector ? { submitSelector: input.submitSelector } : {}),
    ...(input?.successSelector ? { successSelector: input.successSelector } : {}),
    ...(input?.successUrlContains ? { successUrlContains: input.successUrlContains } : {}),
    ...(input?.sessionCookiesJson
      ? { encryptedSessionCookiesJson: encryptSecret(input.sessionCookiesJson) }
      : {})
  };
}

export function createScanRecord(input: CreateScanInput): ScanRecord {
  const normalized = normalizeUrl(input.startUrl);

  return {
    id: makeId("scan"),
    userId: input.userId,
    startUrl: normalized.toString(),
    normalizedOrigin: normalized.origin,
    state: "pending",
    createdAt: nowIso(),
    authorizationConfirmed: input.authorizationConfirmed,
    policy: mergePolicy(input.policy),
    pagesDiscovered: 0,
    findingsCount: 0,
    lastMessage: "Queued for analysis",
    auth: createScanAuthConfig(input.auth),
    ...(input.requestedBy ? { requestedBy: input.requestedBy } : {})
  };
}

export function createSessionRecord(input: CreateSessionInput): SessionRecord {
  const createdAt = new Date();
  const ttlDays = input.ttlDays ?? 14;
  const expiresAt = new Date(createdAt.getTime() + ttlDays * 24 * 60 * 60 * 1000);

  return {
    id: makeId("sess"),
    userId: input.userId,
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString()
  };
}

export function createFindingRecord(
  scanId: string,
  pageId: string | undefined,
  draft: FindingDraft
): FindingRecord {
  return {
    id: makeId("finding"),
    scanId,
    ...draft,
    createdAt: nowIso(),
    ...(pageId ? { pageId } : {})
  };
}

export function createRunStepRecord(input: {
  scanId: string;
  userId: string;
  sequence: number;
  title: string;
  detail: string;
  status: RunStepStatus;
  screenshotArtifactId?: string;
  url?: string;
}): RunStepRecord {
  return {
    id: makeId("step"),
    scanId: input.scanId,
    userId: input.userId,
    sequence: input.sequence,
    title: input.title,
    detail: input.detail,
    status: input.status,
    createdAt: nowIso(),
    ...(input.screenshotArtifactId ? { screenshotArtifactId: input.screenshotArtifactId } : {}),
    ...(input.url ? { url: input.url } : {})
  };
}

export function sortFindingsBySeverity<T extends { severity: string }>(findings: T[]): T[] {
  const order = new Map([
    ["critical", 0],
    ["high", 1],
    ["medium", 2],
    ["low", 3],
    ["info", 4]
  ]);

  return [...findings].sort((left, right) => {
    return (order.get(left.severity) ?? 99) - (order.get(right.severity) ?? 99);
  });
}

export function buildSnippet(source: string, needle: string, radius = 60): string {
  const index = source.indexOf(needle);
  if (index === -1) {
    return needle;
  }

  const start = Math.max(0, index - radius);
  const end = Math.min(source.length, index + needle.length + radius);

  return source.slice(start, end).replace(/\s+/g, " ").trim();
}
