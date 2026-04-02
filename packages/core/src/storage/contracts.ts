import type {
  ArtifactKind,
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

export interface ScanRepository {
  createUser(input: { email: string; name: string; password: string }): Promise<UserRecord>;
  authenticateUser(email: string, password: string): Promise<UserRecord | null>;
  createSession(userId: string): Promise<SessionRecord>;
  getSessionWithUser(sessionId: string): Promise<{ session: SessionRecord; user: UserRecord } | null>;
  deleteSession(sessionId: string): Promise<void>;
  createScan(input: CreateScanInput): Promise<ScanRecord>;
  listScans(userId: string): Promise<ScanSummary[]>;
  getScanDetailForUser(scanId: string, userId: string): Promise<ScanDetail | null>;
  getScan(scanId: string): Promise<ScanRecord | null>;
  getArtifactForUser(scanId: string, artifactId: string, userId: string): Promise<ArtifactRecord | null>;
  getFindingsForUser(scanId: string, userId: string): Promise<FindingRecord[]>;
  claimNextPendingScan(): Promise<ScanRecord | null>;
  updateScanProgress(
    scanId: string,
    patch: Partial<
      Pick<
        ScanRecord,
        "lastMessage" | "pagesDiscovered" | "findingsCount" | "errorMessage" | "finishedAt"
      >
    >
  ): Promise<void>;
  addPage(page: PageRecord): Promise<void>;
  addArtifact(artifact: ArtifactRecord): Promise<void>;
  addFindings(findings: FindingRecord[]): Promise<void>;
  appendRunStep(input: {
    scanId: string;
    title: string;
    detail: string;
    status: RunStepRecord["status"];
    screenshotArtifactId?: string;
    url?: string;
  }): Promise<RunStepRecord>;
  completeScan(scanId: string): Promise<void>;
  failScan(scanId: string, errorMessage: string): Promise<void>;
}

export interface ArtifactStore {
  writeTextArtifact(input: {
    scanId: string;
    pageId?: string;
    kind: ArtifactKind;
    label: string;
    extension: string;
    mimeType: string;
    text: string;
  }): Promise<ArtifactRecord>;
  writeBinaryArtifact(input: {
    scanId: string;
    pageId?: string;
    kind: ArtifactKind;
    label: string;
    extension: string;
    mimeType: string;
    data: Buffer;
  }): Promise<ArtifactRecord>;
  readArtifact(record: ArtifactRecord): Promise<Buffer>;
}
