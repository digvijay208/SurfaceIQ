import Link from "next/link";

import type { ScanSummary } from "@surfaceiq/core";

import { SidebarToggleButton } from "../../components/sidebar-toggle-button";
import { requireUser } from "../../lib/auth";
import { scanRepository } from "../../lib/server";

export const dynamic = "force-dynamic";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard", active: true },
  { label: "Playground", href: "/playground" },
  { label: "Docs", href: "#" },
  { label: "Examples", href: "#" },
  { label: "API Keys", href: "#" },
  { label: "Projects", href: "#" }
];

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function formatDuration(seconds: number | null) {
  if (seconds === null) {
    return "-";
  }

  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${remainder.toFixed(1)}s`;
}

function getDurationSeconds(scan: Pick<ScanSummary, "startedAt" | "finishedAt">) {
  if (!scan.startedAt || !scan.finishedAt) {
    return null;
  }

  const durationMs = new Date(scan.finishedAt).getTime() - new Date(scan.startedAt).getTime();
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    return null;
  }

  return durationMs / 1000;
}

function buildDashboard(scans: ScanSummary[]) {
  const now = new Date();
  const today = startOfDay(now);
  const days = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(today);
    day.setDate(today.getDate() - (6 - index));
    return day;
  });

  const lastSevenStart = days[0] ?? today;
  const recentScans = scans.filter((scan) => new Date(scan.createdAt) >= lastSevenStart);
  const finishedScans = recentScans.filter(
    (scan) => scan.state === "completed" || scan.state === "failed"
  );
  const successfulScans = recentScans.filter((scan) => scan.state === "completed");
  const runningScans = scans.filter((scan) => scan.state === "running").length;
  const durations = finishedScans
    .map(getDurationSeconds)
    .filter((value): value is number => value !== null);
  const totalFindings = recentScans.reduce((sum, scan) => sum + scan.findingsCount, 0);
  const totalPages = recentScans.reduce((sum, scan) => sum + scan.pagesDiscovered, 0);

  const chart = days.map((day) => {
    const nextDay = new Date(day);
    nextDay.setDate(day.getDate() + 1);
    const runs = recentScans.filter((scan) => {
      const created = new Date(scan.createdAt);
      return created >= day && created < nextDay;
    });

    return {
      key: day.toISOString(),
      label: day.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      count: runs.length
    };
  });

  const maxChartCount = Math.max(...chart.map((entry) => entry.count), 1);
  const peakDay = [...chart].sort((left, right) => right.count - left.count)[0] ?? null;

  return {
    recentScans,
    runningScans,
    totalRuns: recentScans.length,
    successRate:
      finishedScans.length > 0 ? (successfulScans.length / finishedScans.length) * 100 : null,
    averageDuration:
      durations.length > 0 ? durations.reduce((sum, value) => sum + value, 0) / durations.length : null,
    fastestDuration: durations.length > 0 ? Math.min(...durations) : null,
    slowestDuration: durations.length > 0 ? Math.max(...durations) : null,
    totalFindings,
    totalPages,
    peakDay: peakDay && peakDay.count > 0 ? peakDay : null,
    chart,
    maxChartCount
  };
}

export default async function DashboardPage() {
  const user = await requireUser();
  const scans = await scanRepository.listScans(user.id);
  const dashboard = buildDashboard(scans);
  const completedCount = dashboard.recentScans.filter((scan) => scan.state === "completed").length;
  const failedCount = dashboard.recentScans.filter((scan) => scan.state === "failed").length;

  return (
    <main className="scan-workspace">
      <aside className="workspace-sidebar">
        <div className="workspace-brand">
          <div className="workspace-brand-lockup">
            <span className="workspace-brand-mark">S</span>
            <span>SurfaceIQ</span>
          </div>
          <SidebarToggleButton />
        </div>

        <nav className="workspace-nav">
          {NAV_ITEMS.map((item) => (
            <Link
              className={`workspace-nav-item${item.active ? " active" : ""}`}
              href={item.href}
              key={item.label}
            >
              <span className="workspace-nav-dot" />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="workspace-sidebar-footer">
          <div className="workspace-usage-label">Workspace owner</div>
          <div className="workspace-user">
            <span className="workspace-user-badge">{user.name.slice(0, 1).toUpperCase()}</span>
            <div>
              <strong>{user.name}</strong>
              <div className="muted">{user.email}</div>
            </div>
          </div>
          <div className="workspace-usage-row">
            <span>{scans.length} total runs</span>
            <span>{dashboard.runningScans} running</span>
          </div>
          <div className="workspace-progress">
            <span
              style={{
                width: `${Math.min(100, Math.max(10, scans.length === 0 ? 10 : (completedCount / scans.length) * 100))}%`
              }}
            />
          </div>
        </div>
      </aside>

      <section className="workspace-main">
        <header className="workspace-topbar">
          <div className="workspace-command">
            <div className="workspace-command-actions">
              <SidebarToggleButton />
              <Link className="workspace-back-link" href="/">
                {"<-"}
              </Link>
            </div>
            <div className="workspace-command-body">
              <div className="workspace-command-title">Real dashboard metrics from stored scan runs</div>
              <div className="workspace-command-meta">
                <span>{scans.length} total runs</span>
                <span>{dashboard.runningScans} running</span>
                <span>{dashboard.totalFindings} findings in the last 7 days</span>
              </div>
            </div>
          </div>
          <div className="workspace-top-actions">
            <Link className="workspace-top-link" href="/playground">
              New run
            </Link>
            <span className="workspace-top-link ghost">Dashboard</span>
          </div>
        </header>

        <div className="workspace-scroll">
          <div className="dashboard-shell dashboard-shell-embedded">
            <section className="dashboard-header">
              <div>
                <div className="dashboard-kicker">Workspace Overview</div>
                <h1>Dashboard</h1>
                <p>
                  This page only uses real scan records from your workspace. Every metric, chart bar,
                  and run row is backed by stored scan data.
                </p>
              </div>
              <div className="dashboard-header-actions">
                <div className="dashboard-user-pill">{user.name}</div>
                <Link className="ghost-button" href="/playground">
                  Open playground
                </Link>
              </div>
            </section>

            <section className="dashboard-metric-grid">
              <article className="dashboard-metric-card runs">
                <span className="dashboard-metric-label">Runs (7 days)</span>
                <strong className="dashboard-metric-value">{dashboard.totalRuns}</strong>
                <p className="dashboard-metric-note">
                  {dashboard.peakDay
                    ? `Peak on ${dashboard.peakDay.label} with ${dashboard.peakDay.count} run${dashboard.peakDay.count === 1 ? "" : "s"}.`
                    : "No runs recorded in the last 7 days."}
                </p>
              </article>

              <article className="dashboard-metric-card success">
                <span className="dashboard-metric-label">Success Rate</span>
                <strong className="dashboard-metric-value">
                  {dashboard.successRate === null ? "-" : `${dashboard.successRate.toFixed(1)}%`}
                </strong>
                <p className="dashboard-metric-note">
                  {completedCount} completed / {failedCount} failed
                </p>
              </article>

              <article className="dashboard-metric-card duration">
                <span className="dashboard-metric-label">Avg Duration</span>
                <strong className="dashboard-metric-value">
                  {formatDuration(dashboard.averageDuration)}
                </strong>
                <p className="dashboard-metric-note">
                  Fastest: {formatDuration(dashboard.fastestDuration)} / Slowest:{" "}
                  {formatDuration(dashboard.slowestDuration)}
                </p>
              </article>

              <article className="dashboard-metric-card findings">
                <span className="dashboard-metric-label">Findings Captured</span>
                <strong className="dashboard-metric-value">{dashboard.totalFindings}</strong>
                <p className="dashboard-metric-note">
                  {dashboard.totalPages} pages captured across the same 7 day window.
                </p>
              </article>
            </section>

            <section className="dashboard-chart-card">
              <div className="dashboard-section-head">
                <div>
                  <h2>Run Volume</h2>
                  <p>
                    {dashboard.totalRuns} total runs in the last 7 days
                    {dashboard.peakDay ? ` / Peak on ${dashboard.peakDay.label}` : ""}.
                  </p>
                </div>
              </div>

              <div className="dashboard-chart">
                {dashboard.chart.map((entry) => (
                  <div className="dashboard-chart-column" key={entry.key}>
                    <div className="dashboard-chart-value">{entry.count}</div>
                    <div className="dashboard-chart-bar-wrap">
                      <div
                        className="dashboard-chart-bar"
                        style={{
                          height: `${Math.max((entry.count / dashboard.maxChartCount) * 180, entry.count > 0 ? 24 : 4)}px`
                        }}
                      />
                    </div>
                    <div className="dashboard-chart-label">{entry.label}</div>
                  </div>
                ))}
              </div>
            </section>

            <section className="dashboard-table-card">
              <div className="dashboard-section-head">
                <div>
                  <h2>Runs</h2>
                  <p>Each row below maps to a real scan in your workspace.</p>
                </div>
                <div className="dashboard-table-count">{scans.length}</div>
              </div>

              {scans.length > 0 ? (
                <div className="dashboard-table">
                  <div className="dashboard-table-row dashboard-table-head">
                    <span>Run ID</span>
                    <span>Target</span>
                    <span>Mode</span>
                    <span>Status</span>
                    <span>Duration</span>
                    <span>Created</span>
                  </div>
                  {scans.map((scan) => (
                    <Link className="dashboard-table-row" href={`/scans/${scan.id}`} key={scan.id}>
                      <span className="dashboard-run-id">{scan.id.slice(0, 12)}...</span>
                      <span className="dashboard-run-target">
                        <strong>{scan.startUrl}</strong>
                        <small>
                          {scan.findingsCount} findings / {scan.pagesDiscovered} pages
                        </small>
                      </span>
                      <span className="dashboard-mode-pill">{scan.authMode}</span>
                      <span className={`status-pill ${scan.state}`}>{scan.state}</span>
                      <span>{formatDuration(getDurationSeconds(scan))}</span>
                      <span>{new Date(scan.createdAt).toLocaleString()}</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="panel empty-state">
                  No runs recorded yet. Start a scan from the playground and this dashboard will fill
                  from those real results.
                </div>
              )}
            </section>
          </div>
        </div>
      </section>
    </main>
  );
}
