import postgres, { type Sql } from "postgres";

import type {
  ArtifactRecord,
  CreateScanInput,
  FindingRecord,
  PageRecord,
  RunStepRecord,
  ScanAuthConfig,
  ScanDetail,
  ScanPolicy,
  ScanRecord,
  ScanSummary,
  SessionRecord,
  UserRecord
} from "../types";
import type { ScanRepository } from "./contracts";
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

type JsonValue = Record<string, unknown> | unknown[];

interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  created_at: string;
}

interface SessionRow {
  id: string;
  user_id: string;
  created_at: string;
  expires_at: string;
}

interface SessionWithUserRow {
  session_id: string;
  user_id: string;
  session_created_at: string;
  expires_at: string;
  id: string;
  email: string;
  name: string;
  password_hash: string;
  created_at: string;
}

interface ScanRow {
  id: string;
  user_id: string;
  start_url: string;
  normalized_origin: string;
  state: ScanRecord["state"];
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  requested_by: string | null;
  authorization_confirmed: boolean;
  policy: ScanPolicy;
  pages_discovered: number;
  findings_count: number;
  last_message: string;
  error_message: string | null;
  auth: ScanAuthConfig;
}

interface PageRow {
  id: string;
  scan_id: string;
  url: string;
  depth: number;
  title: string;
  status_code: number;
  content_type: string;
  headers: Record<string, string>;
  cookies: PageRecord["cookies"];
  links: string[];
  forms: PageRecord["forms"];
  scripts: PageRecord["scripts"];
  console_messages: PageRecord["consoleMessages"];
  network_requests: PageRecord["networkRequests"];
  html_artifact_id: string | null;
  screenshot_artifact_id: string | null;
  fetched_at: string;
}

interface ArtifactRow {
  id: string;
  scan_id: string;
  page_id: string | null;
  kind: ArtifactRecord["kind"];
  label: string;
  mime_type: string;
  relative_path: string;
  created_at: string;
}

interface FindingRow {
  id: string;
  scan_id: string;
  page_id: string | null;
  rule_id: string;
  title: string;
  severity: FindingRecord["severity"];
  confidence: number;
  kind: FindingRecord["kind"];
  url: string;
  summary: string;
  evidence: string[];
  remediation: string;
  created_at: string;
}

interface RunStepRow {
  id: string;
  scan_id: string;
  user_id: string;
  sequence: number;
  title: string;
  detail: string;
  status: RunStepRecord["status"];
  created_at: string;
  screenshot_artifact_id: string | null;
  url: string | null;
}

export class PostgresScanRepository implements ScanRepository {
  private readonly sql: Sql;

  private readonly ready: Promise<void>;

  constructor(databaseUrl: string) {
    this.sql = postgres(databaseUrl, {
      prepare: false
    });
    this.ready = this.ensureSchema();
  }

  async createUser(input: { email: string; name: string; password: string }): Promise<UserRecord> {
    await this.ready;
    const normalizedEmail = input.email.trim().toLowerCase();
    const passwordHash = hashPassword(input.password);

    try {
      const [row] = await this.sql<UserRow[]>`
        insert into users (id, email, name, password_hash, created_at)
        values (
          ${makeId("user")},
          ${normalizedEmail},
          ${input.name.trim() || normalizedEmail},
          ${passwordHash},
          ${nowIso()}
        )
        returning *
      `;

      return this.mapUser(this.requireRow(row, "Unable to create user record."));
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        typeof error.code === "string" &&
        error.code === "23505"
      ) {
        throw new Error("An account with that email already exists.");
      }

      throw error;
    }
  }

  async authenticateUser(email: string, password: string): Promise<UserRecord | null> {
    await this.ready;
    const [row] = await this.sql<UserRow[]>`
      select *
      from users
      where email = ${email.trim().toLowerCase()}
      limit 1
    `;

    if (!row) {
      return null;
    }

    return verifyPassword(password, row.password_hash) ? this.mapUser(row) : null;
  }

  async createSession(userId: string): Promise<SessionRecord> {
    await this.ready;
    const session = createSessionRecord({ userId });

    const [row] = await this.sql<SessionRow[]>`
      insert into sessions (id, user_id, created_at, expires_at)
      values (${session.id}, ${session.userId}, ${session.createdAt}, ${session.expiresAt})
      returning *
    `;

    return this.mapSession(this.requireRow(row, "Unable to create session record."));
  }

  async getSessionWithUser(sessionId: string): Promise<{ session: SessionRecord; user: UserRecord } | null> {
    await this.ready;
    const rows = await this.sql<SessionWithUserRow[]>`
      select
        s.id as session_id,
        s.user_id,
        s.created_at as session_created_at,
        s.expires_at,
        u.id,
        u.email,
        u.name,
        u.password_hash,
        u.created_at
      from sessions s
      join users u on u.id = s.user_id
      where s.id = ${sessionId}
        and s.expires_at > now()
      limit 1
    `;

    const row = rows[0];
    if (!row) {
      return null;
    }

    return {
      session: {
        id: row.session_id,
        userId: row.user_id,
        createdAt: this.toIsoString(row.session_created_at),
        expiresAt: this.toIsoString(row.expires_at)
      },
      user: {
        id: row.id,
        email: row.email,
        name: row.name,
        passwordHash: row.password_hash,
        createdAt: this.toIsoString(row.created_at)
      }
    };
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.ready;
    await this.sql`
      delete from sessions
      where id = ${sessionId}
    `;
  }

  async createScan(input: CreateScanInput): Promise<ScanRecord> {
    await this.ready;
    if (!input.authorizationConfirmed) {
      throw new Error("Authorization confirmation is required.");
    }

    const scan = createScanRecord(input);

    const [row] = await this.sql<ScanRow[]>`
      insert into scans (
        id,
        user_id,
        start_url,
        normalized_origin,
        state,
        created_at,
        started_at,
        finished_at,
        requested_by,
        authorization_confirmed,
        policy,
        pages_discovered,
        findings_count,
        last_message,
        error_message,
        auth
      )
      values (
        ${scan.id},
        ${scan.userId},
        ${scan.startUrl},
        ${scan.normalizedOrigin},
        ${scan.state},
        ${scan.createdAt},
        ${scan.startedAt ?? null},
        ${scan.finishedAt ?? null},
        ${scan.requestedBy ?? null},
        ${scan.authorizationConfirmed},
        ${this.sql.json(scan.policy as any)},
        ${scan.pagesDiscovered},
        ${scan.findingsCount},
        ${scan.lastMessage},
        ${scan.errorMessage ?? null},
        ${this.sql.json(scan.auth as any)}
      )
      returning *
    `;

    return this.mapScan(this.requireRow(row, "Unable to create scan record."));
  }

  async listScans(userId: string): Promise<ScanSummary[]> {
    await this.ready;
    const rows = await this.sql<ScanRow[]>`
      select *
      from scans
      where user_id = ${userId}
      order by created_at desc
    `;

    return rows.map((scan) => ({
      id: scan.id,
      startUrl: scan.start_url,
      state: scan.state,
      createdAt: this.toIsoString(scan.created_at),
      ...(scan.started_at ? { startedAt: this.toIsoString(scan.started_at) } : {}),
      ...(scan.finished_at ? { finishedAt: this.toIsoString(scan.finished_at) } : {}),
      pagesDiscovered: scan.pages_discovered,
      findingsCount: scan.findings_count,
      lastMessage: scan.last_message,
      authMode: scan.auth.mode
    }));
  }

  async getScanDetailForUser(scanId: string, userId: string): Promise<ScanDetail | null> {
    await this.ready;
    const [scanRow] = await this.sql<ScanRow[]>`
      select *
      from scans
      where id = ${scanId}
        and user_id = ${userId}
      limit 1
    `;

    if (!scanRow) {
      return null;
    }

    const [pages, findings, artifacts, steps] = await Promise.all([
      this.sql<PageRow[]>`select * from pages where scan_id = ${scanId} order by fetched_at asc`,
      this.sql<FindingRow[]>`select * from findings where scan_id = ${scanId} order by created_at asc`,
      this.sql<ArtifactRow[]>`select * from artifacts where scan_id = ${scanId} order by created_at asc`,
      this.sql<RunStepRow[]>`
        select *
        from run_steps
        where scan_id = ${scanId}
        order by sequence asc
      `
    ]);

    const scan = this.mapScan(scanRow);
    const mappedPages = pages.map((row) => this.mapPage(row));
    const mappedFindings = findings.map((row) => this.mapFinding(row));

    return {
      scan,
      pages: mappedPages,
      findings: mappedFindings,
      artifacts: artifacts.map((row) => this.mapArtifact(row)),
      steps: steps.map((row) => this.mapRunStep(row)),
      report: buildScanReportSummary(scan, mappedFindings, mappedPages)
    };
  }

  async getScan(scanId: string): Promise<ScanRecord | null> {
    await this.ready;
    const [row] = await this.sql<ScanRow[]>`
      select *
      from scans
      where id = ${scanId}
      limit 1
    `;

    return row ? this.mapScan(row) : null;
  }

  async getArtifactForUser(scanId: string, artifactId: string, userId: string): Promise<ArtifactRecord | null> {
    await this.ready;
    const rows = await this.sql<ArtifactRow[]>`
      select a.*
      from artifacts a
      join scans s on s.id = a.scan_id
      where a.scan_id = ${scanId}
        and a.id = ${artifactId}
        and s.user_id = ${userId}
      limit 1
    `;

    return rows[0] ? this.mapArtifact(rows[0]) : null;
  }

  async getFindingsForUser(scanId: string, userId: string): Promise<FindingRecord[]> {
    await this.ready;
    const rows = await this.sql<FindingRow[]>`
      select f.*
      from findings f
      join scans s on s.id = f.scan_id
      where f.scan_id = ${scanId}
        and s.user_id = ${userId}
      order by f.created_at asc
    `;

    return rows.map((row) => this.mapFinding(row));
  }

  async claimNextPendingScan(): Promise<ScanRecord | null> {
    await this.ready;
    return this.sql.begin(async (sqlClient) => {
      const sql = sqlClient as unknown as typeof this.sql;
      const [row] = await sql<ScanRow[]>`
        select *
        from scans
        where state = 'pending'
        order by created_at asc
        limit 1
        for update skip locked
      `;

      if (!row) {
        return null;
      }

      const startedAt = nowIso();
      const [updated] = await sql<ScanRow[]>`
        update scans
        set state = 'running',
            started_at = ${startedAt},
            last_message = 'Launching browser analysis'
        where id = ${row.id}
        returning *
      `;

      return this.mapScan(this.requireRow(updated, "Unable to claim the next pending scan."));
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
    await this.ready;
    const assignments: string[] = [];
    const values: Array<string | number | null> = [];

    if (patch.lastMessage !== undefined) {
      values.push(patch.lastMessage);
      assignments.push(`last_message = $${values.length}`);
    }

    if (patch.pagesDiscovered !== undefined) {
      values.push(patch.pagesDiscovered);
      assignments.push(`pages_discovered = $${values.length}`);
    }

    if (patch.findingsCount !== undefined) {
      values.push(patch.findingsCount);
      assignments.push(`findings_count = $${values.length}`);
    }

    if (patch.errorMessage !== undefined) {
      values.push(patch.errorMessage ?? null);
      assignments.push(`error_message = $${values.length}`);
    }

    if (patch.finishedAt !== undefined) {
      values.push(patch.finishedAt ?? null);
      assignments.push(`finished_at = $${values.length}`);
    }

    if (assignments.length === 0) {
      return;
    }

    values.push(scanId);
    await this.sql.unsafe(
      `update scans set ${assignments.join(", ")} where id = $${values.length}`,
      values
    );
  }

  async addPage(page: PageRecord): Promise<void> {
    await this.ready;
    await this.sql.begin(async (sqlClient) => {
      const sql = sqlClient as unknown as typeof this.sql;
      await sql`
        insert into pages (
          id,
          scan_id,
          url,
          depth,
          title,
          status_code,
          content_type,
          headers,
          cookies,
          links,
          forms,
          scripts,
          console_messages,
          network_requests,
          html_artifact_id,
          screenshot_artifact_id,
          fetched_at
        )
        values (
          ${page.id},
          ${page.scanId},
          ${page.url},
          ${page.depth},
          ${page.title},
          ${page.statusCode},
          ${page.contentType},
          ${sql.json(page.headers as any)},
          ${sql.json(page.cookies as any)},
          ${sql.json(page.links as any)},
          ${sql.json(page.forms as any)},
          ${sql.json(page.scripts as any)},
          ${sql.json(page.consoleMessages as any)},
          ${sql.json(page.networkRequests as any)},
          ${page.htmlArtifactId ?? null},
          ${page.screenshotArtifactId ?? null},
          ${page.fetchedAt}
        )
        on conflict (id) do update
        set
          url = excluded.url,
          depth = excluded.depth,
          title = excluded.title,
          status_code = excluded.status_code,
          content_type = excluded.content_type,
          headers = excluded.headers,
          cookies = excluded.cookies,
          links = excluded.links,
          forms = excluded.forms,
          scripts = excluded.scripts,
          console_messages = excluded.console_messages,
          network_requests = excluded.network_requests,
          html_artifact_id = excluded.html_artifact_id,
          screenshot_artifact_id = excluded.screenshot_artifact_id,
          fetched_at = excluded.fetched_at
      `;

      const countRow = this.requireRow(
        (
          await sql<Array<{ count: string }>>`
        select count(*)::text as count
        from pages
        where scan_id = ${page.scanId}
      `
        )[0],
        `Unable to count captured pages for scan ${page.scanId}.`
      );

      await sql`
        update scans
        set pages_discovered = ${Number(countRow.count)}
        where id = ${page.scanId}
      `;
    });
  }

  async addArtifact(artifact: ArtifactRecord): Promise<void> {
    await this.ready;
    await this.sql`
      insert into artifacts (id, scan_id, page_id, kind, label, mime_type, relative_path, created_at)
      values (
        ${artifact.id},
        ${artifact.scanId},
        ${artifact.pageId ?? null},
        ${artifact.kind},
        ${artifact.label},
        ${artifact.mimeType},
        ${artifact.relativePath},
        ${artifact.createdAt}
      )
      on conflict (id) do nothing
    `;
  }

  async addFindings(findings: FindingRecord[]): Promise<void> {
    await this.ready;
    if (findings.length === 0) {
      return;
    }

    await this.sql.begin(async (sqlClient) => {
      const sql = sqlClient as unknown as typeof this.sql;
      for (const finding of findings) {
        await sql`
          insert into findings (
            id,
            scan_id,
            page_id,
            rule_id,
            title,
            severity,
            confidence,
            kind,
            url,
            summary,
            evidence,
            remediation,
            created_at
          )
          values (
            ${finding.id},
            ${finding.scanId},
            ${finding.pageId ?? null},
            ${finding.ruleId},
            ${finding.title},
            ${finding.severity},
            ${finding.confidence},
            ${finding.kind},
            ${finding.url},
            ${finding.summary},
            ${sql.json(finding.evidence as any)},
            ${finding.remediation},
            ${finding.createdAt}
          )
          on conflict (id) do nothing
        `;
      }

      const scanId = findings[0]?.scanId;
      if (!scanId) {
        return;
      }

      const countRow = this.requireRow(
        (
          await sql<Array<{ count: string }>>`
        select count(*)::text as count
        from findings
        where scan_id = ${scanId}
      `
        )[0],
        `Unable to count findings for scan ${scanId}.`
      );

      await sql`
        update scans
        set findings_count = ${Number(countRow.count)}
        where id = ${scanId}
      `;
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
    await this.ready;
    return this.sql.begin(async (sqlClient) => {
      const sql = sqlClient as unknown as typeof this.sql;
      const [scan] = await sql<ScanRow[]>`
        select *
        from scans
        where id = ${input.scanId}
        limit 1
      `;

      if (!scan) {
        throw new Error(`Scan ${input.scanId} not found.`);
      }

      const countRow = this.requireRow(
        (
          await sql<Array<{ count: string }>>`
        select count(*)::text as count
        from run_steps
        where scan_id = ${input.scanId}
      `
        )[0],
        `Unable to count run steps for scan ${input.scanId}.`
      );

      const step = createRunStepRecord({
        scanId: input.scanId,
        userId: scan.user_id,
        sequence: Number(countRow.count) + 1,
        title: input.title,
        detail: input.detail,
        status: input.status,
        ...(input.screenshotArtifactId ? { screenshotArtifactId: input.screenshotArtifactId } : {}),
        ...(input.url ? { url: input.url } : {})
      });

      const [row] = await sql<RunStepRow[]>`
        insert into run_steps (
          id,
          scan_id,
          user_id,
          sequence,
          title,
          detail,
          status,
          created_at,
          screenshot_artifact_id,
          url
        )
        values (
          ${step.id},
          ${step.scanId},
          ${step.userId},
          ${step.sequence},
          ${step.title},
          ${step.detail},
          ${step.status},
          ${step.createdAt},
          ${step.screenshotArtifactId ?? null},
          ${step.url ?? null}
        )
        returning *
      `;

      return this.mapRunStep(this.requireRow(row, "Unable to append run step."));
    });
  }

  async completeScan(scanId: string): Promise<void> {
    await this.ready;
    await this.sql`
      update scans
      set state = 'completed',
          finished_at = ${nowIso()},
          last_message = 'Scan completed'
      where id = ${scanId}
    `;
  }

  async failScan(scanId: string, errorMessage: string): Promise<void> {
    await this.ready;
    await this.sql`
      update scans
      set state = 'failed',
          finished_at = ${nowIso()},
          error_message = ${errorMessage},
          last_message = 'Scan failed'
      where id = ${scanId}
    `;
  }

  private async ensureSchema() {
    await this.sql`
      create table if not exists users (
        id text primary key,
        email text not null unique,
        name text not null,
        password_hash text not null,
        created_at timestamptz not null
      )
    `;

    await this.sql`
      create table if not exists sessions (
        id text primary key,
        user_id text not null references users(id) on delete cascade,
        created_at timestamptz not null,
        expires_at timestamptz not null
      )
    `;

    await this.sql`
      create table if not exists scans (
        id text primary key,
        user_id text not null references users(id) on delete cascade,
        start_url text not null,
        normalized_origin text not null,
        state text not null,
        created_at timestamptz not null,
        started_at timestamptz,
        finished_at timestamptz,
        requested_by text,
        authorization_confirmed boolean not null,
        policy jsonb not null,
        pages_discovered integer not null default 0,
        findings_count integer not null default 0,
        last_message text not null,
        error_message text,
        auth jsonb not null
      )
    `;

    await this.sql`
      create table if not exists pages (
        id text primary key,
        scan_id text not null references scans(id) on delete cascade,
        url text not null,
        depth integer not null,
        title text not null,
        status_code integer not null,
        content_type text not null,
        headers jsonb not null,
        cookies jsonb not null,
        links jsonb not null,
        forms jsonb not null,
        scripts jsonb not null,
        console_messages jsonb not null,
        network_requests jsonb not null,
        html_artifact_id text,
        screenshot_artifact_id text,
        fetched_at timestamptz not null
      )
    `;

    await this.sql`
      create table if not exists artifacts (
        id text primary key,
        scan_id text not null references scans(id) on delete cascade,
        page_id text,
        kind text not null,
        label text not null,
        mime_type text not null,
        relative_path text not null,
        created_at timestamptz not null
      )
    `;

    await this.sql`
      create table if not exists findings (
        id text primary key,
        scan_id text not null references scans(id) on delete cascade,
        page_id text,
        rule_id text not null,
        title text not null,
        severity text not null,
        confidence double precision not null,
        kind text not null,
        url text not null,
        summary text not null,
        evidence jsonb not null,
        remediation text not null,
        created_at timestamptz not null
      )
    `;

    await this.sql`
      create table if not exists run_steps (
        id text primary key,
        scan_id text not null references scans(id) on delete cascade,
        user_id text not null references users(id) on delete cascade,
        sequence integer not null,
        title text not null,
        detail text not null,
        status text not null,
        created_at timestamptz not null,
        screenshot_artifact_id text,
        url text
      )
    `;

    await this.sql`
      create index if not exists scans_user_created_at_idx on scans(user_id, created_at desc)
    `;

    await this.sql`
      create index if not exists scans_state_created_at_idx on scans(state, created_at asc)
    `;

    await this.sql`
      create index if not exists pages_scan_id_idx on pages(scan_id)
    `;

    await this.sql`
      create index if not exists findings_scan_id_idx on findings(scan_id)
    `;

    await this.sql`
      create index if not exists artifacts_scan_id_idx on artifacts(scan_id)
    `;

    await this.sql`
      create index if not exists run_steps_scan_id_sequence_idx on run_steps(scan_id, sequence asc)
    `;
  }

  private mapUser(row: UserRow): UserRecord {
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      passwordHash: row.password_hash,
      createdAt: this.toIsoString(row.created_at)
    };
  }

  private mapSession(row: SessionRow): SessionRecord {
    return {
      id: row.id,
      userId: row.user_id,
      createdAt: this.toIsoString(row.created_at),
      expiresAt: this.toIsoString(row.expires_at)
    };
  }

  private mapScan(row: ScanRow): ScanRecord {
    return {
      id: row.id,
      userId: row.user_id,
      startUrl: row.start_url,
      normalizedOrigin: row.normalized_origin,
      state: row.state,
      createdAt: this.toIsoString(row.created_at),
      ...(row.started_at ? { startedAt: this.toIsoString(row.started_at) } : {}),
      ...(row.finished_at ? { finishedAt: this.toIsoString(row.finished_at) } : {}),
      ...(row.requested_by ? { requestedBy: row.requested_by } : {}),
      authorizationConfirmed: row.authorization_confirmed,
      policy: row.policy,
      pagesDiscovered: row.pages_discovered,
      findingsCount: row.findings_count,
      lastMessage: row.last_message,
      ...(row.error_message ? { errorMessage: row.error_message } : {}),
      auth: row.auth
    };
  }

  private mapPage(row: PageRow): PageRecord {
    return {
      id: row.id,
      scanId: row.scan_id,
      url: row.url,
      depth: row.depth,
      title: row.title,
      statusCode: row.status_code,
      contentType: row.content_type,
      headers: row.headers,
      cookies: row.cookies,
      links: row.links,
      forms: row.forms,
      scripts: row.scripts,
      consoleMessages: row.console_messages,
      networkRequests: row.network_requests,
      ...(row.html_artifact_id ? { htmlArtifactId: row.html_artifact_id } : {}),
      ...(row.screenshot_artifact_id ? { screenshotArtifactId: row.screenshot_artifact_id } : {}),
      fetchedAt: this.toIsoString(row.fetched_at)
    };
  }

  private mapArtifact(row: ArtifactRow): ArtifactRecord {
    return {
      id: row.id,
      scanId: row.scan_id,
      kind: row.kind,
      label: row.label,
      mimeType: row.mime_type,
      relativePath: row.relative_path,
      createdAt: this.toIsoString(row.created_at),
      ...(row.page_id ? { pageId: row.page_id } : {})
    };
  }

  private mapFinding(row: FindingRow): FindingRecord {
    return {
      id: row.id,
      scanId: row.scan_id,
      ruleId: row.rule_id,
      title: row.title,
      severity: row.severity,
      confidence: row.confidence,
      kind: row.kind,
      url: row.url,
      summary: row.summary,
      evidence: row.evidence,
      remediation: row.remediation,
      createdAt: this.toIsoString(row.created_at),
      ...(row.page_id ? { pageId: row.page_id } : {})
    };
  }

  private mapRunStep(row: RunStepRow): RunStepRecord {
    return {
      id: row.id,
      scanId: row.scan_id,
      userId: row.user_id,
      sequence: row.sequence,
      title: row.title,
      detail: row.detail,
      status: row.status,
      createdAt: this.toIsoString(row.created_at),
      ...(row.screenshot_artifact_id ? { screenshotArtifactId: row.screenshot_artifact_id } : {}),
      ...(row.url ? { url: row.url } : {})
    };
  }

  private toIsoString(value: string | Date): string {
    return value instanceof Date ? value.toISOString() : value;
  }

  private requireRow<T>(row: T | undefined, message: string): T {
    if (!row) {
      throw new Error(message);
    }

    return row;
  }
}


