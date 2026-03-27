import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type {
  ArtifactRecord,
  CreateScanInput,
  FindingRecord,
  PageRecord,
  RunStepRecord,
  ScanDetail,
  ScanRecord,
  ScanSummary,
  SessionRecord,
  UserRecord
} from "../types";
import {
  createRunStepRecord,
  createScanRecord,
  createSessionRecord,
  hashPassword,
  makeId,
  nowIso,
  verifyPassword
} from "../utils";
import { buildScanReportSummary } from "../reporting/summary";
import { getDataRoot } from "./paths";

interface DatabaseShape {
  users: UserRecord[];
  sessions: SessionRecord[];
  scans: ScanRecord[];
  pages: PageRecord[];
  findings: FindingRecord[];
  artifacts: ArtifactRecord[];
  runSteps: RunStepRecord[];
}

const EMPTY_DATABASE: DatabaseShape = {
  users: [],
  sessions: [],
  scans: [],
  pages: [],
  findings: [],
  artifacts: [],
  runSteps: []
};

export class FileScanRepository {
  private readonly dataRoot = getDataRoot(import.meta.url);

  private readonly dbPath = join(this.dataRoot, "db.json");

  async createUser(input: { email: string; name: string; password: string }): Promise<UserRecord> {
    return this.mutate(async (database) => {
      const normalizedEmail = input.email.trim().toLowerCase();
      if (database.users.some((user) => user.email === normalizedEmail)) {
        throw new Error("An account with that email already exists.");
      }

      const user: UserRecord = {
        id: makeId("user"),
        email: normalizedEmail,
        name: input.name.trim() || normalizedEmail,
        passwordHash: hashPassword(input.password),
        createdAt: nowIso()
      };

      database.users.unshift(user);
      return user;
    });
  }

  async authenticateUser(email: string, password: string): Promise<UserRecord | null> {
    const database = await this.read();
    const user = database.users.find((item) => item.email === email.trim().toLowerCase());
    if (!user) {
      return null;
    }

    return verifyPassword(password, user.passwordHash) ? user : null;
  }

  async createSession(userId: string): Promise<SessionRecord> {
    return this.mutate(async (database) => {
      const session = createSessionRecord({ userId });
      database.sessions.push(session);
      return session;
    });
  }

  async getSessionWithUser(sessionId: string): Promise<{ session: SessionRecord; user: UserRecord } | null> {
    const database = await this.read();
    const session = database.sessions.find((item) => item.id === sessionId);
    if (!session) {
      return null;
    }

    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      return null;
    }

    const user = database.users.find((item) => item.id === session.userId);
    if (!user) {
      return null;
    }

    return { session, user };
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.mutate(async (database) => {
      database.sessions = database.sessions.filter((item) => item.id !== sessionId);
      return undefined;
    });
  }

  async createScan(input: CreateScanInput): Promise<ScanRecord> {
    if (!input.authorizationConfirmed) {
      throw new Error("Authorization confirmation is required.");
    }

    return this.mutate(async (database) => {
      const scan = createScanRecord(input);
      database.scans.unshift(scan);
      return scan;
    });
  }

  async listScans(userId: string): Promise<ScanSummary[]> {
    const database = await this.read();
    return database.scans
      .filter((scan) => scan.userId === userId)
      .map((scan) => ({
        id: scan.id,
        startUrl: scan.startUrl,
        state: scan.state,
        createdAt: scan.createdAt,
        ...(scan.startedAt ? { startedAt: scan.startedAt } : {}),
        ...(scan.finishedAt ? { finishedAt: scan.finishedAt } : {}),
        pagesDiscovered: scan.pagesDiscovered,
        findingsCount: scan.findingsCount,
        lastMessage: scan.lastMessage,
        authMode: scan.auth.mode
      }));
  }

  async getScanDetailForUser(scanId: string, userId: string): Promise<ScanDetail | null> {
    const database = await this.read();
    const scan = database.scans.find((item) => item.id === scanId && item.userId === userId);
    if (!scan) {
      return null;
    }

    const pages = database.pages.filter((item) => item.scanId === scanId);
    const findings = database.findings.filter((item) => item.scanId === scanId);
    const artifacts = database.artifacts.filter((item) => item.scanId === scanId);
    const steps = database.runSteps
      .filter((item) => item.scanId === scanId)
      .sort((left, right) => left.sequence - right.sequence);

    return {
      scan,
      pages,
      findings,
      artifacts,
      steps,
      report: buildScanReportSummary(scan, findings, pages)
    };
  }

  async getScan(scanId: string): Promise<ScanRecord | null> {
    const database = await this.read();
    return database.scans.find((item) => item.id === scanId) ?? null;
  }

  async getArtifactForUser(
    scanId: string,
    artifactId: string,
    userId: string
  ): Promise<ArtifactRecord | null> {
    const database = await this.read();
    const scan = database.scans.find((item) => item.id === scanId && item.userId === userId);
    if (!scan) {
      return null;
    }

    return (
      database.artifacts.find((item) => item.scanId === scanId && item.id === artifactId) ?? null
    );
  }

  async getFindingsForUser(scanId: string, userId: string): Promise<FindingRecord[]> {
    const database = await this.read();
    const scan = database.scans.find((item) => item.id === scanId && item.userId === userId);
    if (!scan) {
      return [];
    }

    return database.findings.filter((item) => item.scanId === scanId);
  }

  async claimNextPendingScan(): Promise<ScanRecord | null> {
    return this.mutate(async (database) => {
      const scan = database.scans.find((item) => item.state === "pending");
      if (!scan) {
        return null;
      }

      scan.state = "running";
      scan.startedAt = nowIso();
      scan.lastMessage = "Launching browser analysis";

      return scan;
    });
  }

  async updateScanProgress(
    scanId: string,
    patch: Partial<
      Pick<
        ScanRecord,
        "lastMessage" | "pagesDiscovered" | "findingsCount" | "errorMessage" | "finishedAt"
      >
    >
  ): Promise<void> {
    await this.mutate(async (database) => {
      const scan = database.scans.find((item) => item.id === scanId);
      if (!scan) {
        throw new Error(`Scan ${scanId} not found.`);
      }

      Object.assign(scan, patch);
      return undefined;
    });
  }

  async addPage(page: PageRecord): Promise<void> {
    await this.mutate(async (database) => {
      database.pages = database.pages.filter((item) => item.id !== page.id);
      database.pages.push(page);

      const scan = database.scans.find((item) => item.id === page.scanId);
      if (scan) {
        scan.pagesDiscovered = database.pages.filter((item) => item.scanId === page.scanId).length;
      }

      return undefined;
    });
  }

  async addArtifact(artifact: ArtifactRecord): Promise<void> {
    await this.mutate(async (database) => {
      database.artifacts.push(artifact);
      return undefined;
    });
  }

  async addFindings(findings: FindingRecord[]): Promise<void> {
    await this.mutate(async (database) => {
      database.findings.push(...findings);

      const scanId = findings[0]?.scanId;
      if (scanId) {
        const scan = database.scans.find((item) => item.id === scanId);
        if (scan) {
          scan.findingsCount = database.findings.filter((item) => item.scanId === scanId).length;
        }
      }

      return undefined;
    });
  }

  async appendRunStep(input: {
    scanId: string;
    title: string;
    detail: string;
    status: RunStepRecord["status"];
    screenshotArtifactId?: string;
    url?: string;
  }): Promise<RunStepRecord> {
    return this.mutate(async (database) => {
      const scan = database.scans.find((item) => item.id === input.scanId);
      if (!scan) {
        throw new Error(`Scan ${input.scanId} not found.`);
      }

      const existingSteps = database.runSteps.filter((item) => item.scanId === input.scanId);
      const step = createRunStepRecord({
        scanId: input.scanId,
        userId: scan.userId,
        sequence: existingSteps.length + 1,
        title: input.title,
        detail: input.detail,
        status: input.status,
        ...(input.screenshotArtifactId ? { screenshotArtifactId: input.screenshotArtifactId } : {}),
        ...(input.url ? { url: input.url } : {})
      });

      database.runSteps.push(step);
      return step;
    });
  }

  async completeScan(scanId: string): Promise<void> {
    await this.mutate(async (database) => {
      const scan = database.scans.find((item) => item.id === scanId);
      if (!scan) {
        throw new Error(`Scan ${scanId} not found.`);
      }

      scan.state = "completed";
      scan.finishedAt = nowIso();
      scan.lastMessage = "Scan completed";
      return undefined;
    });
  }

  async failScan(scanId: string, errorMessage: string): Promise<void> {
    await this.mutate(async (database) => {
      const scan = database.scans.find((item) => item.id === scanId);
      if (!scan) {
        throw new Error(`Scan ${scanId} not found.`);
      }

      scan.state = "failed";
      scan.finishedAt = nowIso();
      scan.errorMessage = errorMessage;
      scan.lastMessage = "Scan failed";
      return undefined;
    });
  }

  private async read(): Promise<DatabaseShape> {
    await mkdir(this.dataRoot, { recursive: true });

    try {
      const file = await readFile(this.dbPath, "utf8");
      const parsed = JSON.parse(file) as Partial<DatabaseShape>;

      return {
        users: parsed.users ?? [],
        sessions: parsed.sessions ?? [],
        scans: (parsed.scans ?? []).map((scan) => ({
          ...scan,
          userId: scan.userId ?? "legacy",
          auth: scan.auth ?? { mode: "public" }
        })),
        pages: parsed.pages ?? [],
        findings: parsed.findings ?? [],
        artifacts: parsed.artifacts ?? [],
        runSteps: parsed.runSteps ?? []
      };
    } catch {
      await writeFile(this.dbPath, JSON.stringify(EMPTY_DATABASE, null, 2), "utf8");
      return structuredClone(EMPTY_DATABASE);
    }
  }

  private async mutate<T>(mutator: (database: DatabaseShape) => Promise<T>): Promise<T> {
    const database = await this.read();
    const result = await mutator(database);
    await writeFile(this.dbPath, JSON.stringify(database, null, 2), "utf8");
    return result;
  }
}
