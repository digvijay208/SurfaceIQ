export type ScanState = "pending" | "running" | "completed" | "failed";

export type FindingSeverity = "critical" | "high" | "medium" | "low" | "info";

export type FindingKind = "verified" | "heuristic";

export type ArtifactKind = "html" | "screenshot" | "script" | "json";

export type AuthMode = "public" | "credentials" | "session";

export type RunStepStatus = "info" | "running" | "completed" | "failed";

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: string;
}

export interface SessionRecord {
  id: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

export interface ScanPolicy {
  maxPages: number;
  maxDepth: number;
  maxScriptsPerPage: number;
  requestDelayMs: number;
  reflectionProbeEnabled: boolean;
}

export interface CreateSessionInput {
  userId: string;
  ttlDays?: number;
}

export interface CreateScanAuthInput {
  mode?: AuthMode;
  loginUrl?: string;
  username?: string;
  password?: string;
  usernameSelector?: string;
  passwordSelector?: string;
  submitSelector?: string;
  successSelector?: string;
  successUrlContains?: string;
  sessionCookiesJson?: string;
}

export interface ScanAuthConfig {
  mode: AuthMode;
  loginUrl?: string;
  username?: string;
  encryptedPassword?: string;
  usernameSelector?: string;
  passwordSelector?: string;
  submitSelector?: string;
  successSelector?: string;
  successUrlContains?: string;
  encryptedSessionCookiesJson?: string;
}

export interface CreateScanInput {
  userId: string;
  startUrl: string;
  authorizationConfirmed: boolean;
  requestedBy?: string;
  policy?: Partial<ScanPolicy>;
  auth?: CreateScanAuthInput;
}

export interface ScanRecord {
  id: string;
  userId: string;
  startUrl: string;
  normalizedOrigin: string;
  state: ScanState;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  requestedBy?: string;
  authorizationConfirmed: boolean;
  policy: ScanPolicy;
  pagesDiscovered: number;
  findingsCount: number;
  lastMessage: string;
  errorMessage?: string;
  auth: ScanAuthConfig;
}

export interface CrawlForm {
  action: string | null;
  method: string;
  hasPassword: boolean;
  autocompleteOff: boolean;
  inputNames: string[];
}

export interface ScriptReference {
  src: string | null;
  inlineSnippet: string | null;
  containsSourceMapComment: boolean;
}

export interface ConsoleRecord {
  type: string;
  text: string;
}

export interface NetworkRecord {
  url: string;
  method: string;
  resourceType: string;
  status?: number;
  mixedContent: boolean;
  responseHeaders?: Record<string, string>;
}

export interface ReflectionProbeResult {
  canary: string;
  reflected: boolean;
  reflectedInHtmlSnippet?: string;
}

export interface PageRecord {
  id: string;
  scanId: string;
  url: string;
  depth: number;
  title: string;
  statusCode: number;
  contentType: string;
  headers: Record<string, string>;
  cookies: BrowserCookie[];
  links: string[];
  forms: CrawlForm[];
  scripts: ScriptReference[];
  consoleMessages: ConsoleRecord[];
  networkRequests: NetworkRecord[];
  htmlArtifactId?: string;
  screenshotArtifactId?: string;
  fetchedAt: string;
}

export interface BrowserCookie {
  name: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: "Strict" | "Lax" | "None" | "Unset";
}

export interface ArtifactRecord {
  id: string;
  scanId: string;
  pageId?: string;
  kind: ArtifactKind;
  label: string;
  mimeType: string;
  relativePath: string;
  createdAt: string;
}

export interface FindingRecord {
  id: string;
  scanId: string;
  pageId?: string;
  ruleId: string;
  title: string;
  severity: FindingSeverity;
  confidence: number;
  kind: FindingKind;
  url: string;
  summary: string;
  evidence: string[];
  remediation: string;
  createdAt: string;
}

export interface RunStepRecord {
  id: string;
  scanId: string;
  userId: string;
  sequence: number;
  title: string;
  detail: string;
  status: RunStepStatus;
  createdAt: string;
  screenshotArtifactId?: string;
  url?: string;
}

export interface ScanReportSummary {
  scanType: string;
  scanDate: string;
  overallGrade: string;
  recommendations: string[];
  bestPracticesObserved: string[];
}

export interface ScanDetail {
  scan: ScanRecord;
  pages: PageRecord[];
  findings: FindingRecord[];
  artifacts: ArtifactRecord[];
  steps: RunStepRecord[];
  report: ScanReportSummary;
}

export interface ScanSummary {
  id: string;
  startUrl: string;
  state: ScanState;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  pagesDiscovered: number;
  findingsCount: number;
  lastMessage: string;
  authMode: AuthMode;
}

export interface AnalyzablePage {
  page: PageRecord;
  html: string;
  scriptBodies: Array<{
    sourceUrl: string;
    body: string;
  }>;
  reflectionProbe?: ReflectionProbeResult;
}

export interface FindingDraft {
  ruleId: string;
  title: string;
  severity: FindingSeverity;
  confidence: number;
  kind: FindingKind;
  url: string;
  summary: string;
  evidence: string[];
  remediation: string;
}

export const DEFAULT_SCAN_POLICY: ScanPolicy = {
  maxPages: 12,
  maxDepth: 2,
  maxScriptsPerPage: 4,
  requestDelayMs: 250,
  reflectionProbeEnabled: true
};
