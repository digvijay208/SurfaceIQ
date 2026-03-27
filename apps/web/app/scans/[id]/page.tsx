import Link from "next/link";
import { notFound } from "next/navigation";

import { countFindingsBySeverity } from "@surfaceiq/core";

import { ScanLiveRefresh } from "../../../components/scan-live-refresh";
import { SidebarToggleButton } from "../../../components/sidebar-toggle-button";
import { requireUser } from "../../../lib/auth";
import { getSortedScanDetail } from "../../../lib/server";

export const dynamic = "force-dynamic";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Playground", href: "/playground", active: true },
  { label: "Docs", href: "#" },
  { label: "Examples", href: "#" },
  { label: "API Keys", href: "#" },
  { label: "Projects", href: "#" }
];

export default async function ScanDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await requireUser();
  const detail = await getSortedScanDetail(params.id, user.id);

  if (!detail) {
    notFound();
  }

  const counts = countFindingsBySeverity(detail.findings);
  const reportView = buildAssessmentReport(detail);
  const stepCards = detail.steps.slice(0, 6).map((step) => {
    const screenshot = step.screenshotArtifactId
      ? detail.artifacts.find((artifact) => artifact.id === step.screenshotArtifactId)
      : null;

    return {
      step,
      screenshotUrl: screenshot ? `/api/scans/${detail.scan.id}/artifacts/${screenshot.id}` : null,
      screenshotLabel: screenshot?.label ?? null
    };
  });

  return (
    <main className="scan-workspace">
      <ScanLiveRefresh active={detail.scan.state === "pending" || detail.scan.state === "running"} />

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
            <span>{detail.scan.auth.mode} mode</span>
            <span>{detail.steps.length} steps</span>
          </div>
          <div className="workspace-progress">
            <span
              style={{
                width: `${Math.min(
                  100,
                  Math.max(12, (detail.scan.pagesDiscovered / Math.max(detail.scan.policy.maxPages, 1)) * 100)
                )}%`
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
              <Link className="workspace-back-link" href="/dashboard">
                {"<-"}
              </Link>
            </div>
            <div className="workspace-command-body">
              <div className="workspace-command-title">{buildCommandTitle(detail.scan.startUrl, detail.scan.auth.mode)}</div>
              <div className="workspace-command-meta">
                <span className={`workspace-run-state ${detail.scan.state}`}>
                  <span className="workspace-run-dot" />
                  {labelForState(detail.scan.state)}
                </span>
                <span>{detail.scan.pagesDiscovered} pages</span>
                <span>{detail.scan.findingsCount} findings</span>
              </div>
            </div>
          </div>
          <div className="workspace-top-actions">
            <Link className="workspace-top-link" href="/dashboard">
              Dashboard
            </Link>
            <span className="workspace-top-link ghost">{detail.scan.auth.mode === "public" ? "Public run" : "Authenticated run"}</span>
          </div>
        </header>

        <div className="workspace-scroll">
          <div className="workspace-rail">
            <section className="workspace-section">
              <div className="workspace-section-marker" />
              <div className="workspace-section-content">
                <div className="workspace-section-label">Goal</div>
                <div className="workspace-panel prompt-panel">
                  <p>{buildGoalText(detail.scan.startUrl, detail.scan.auth.mode)}</p>
                </div>
              </div>
            </section>

            <section className="workspace-section">
              <div className="workspace-section-marker" />
              <div className="workspace-section-content">
                <div className="workspace-section-label">
                  Agent Runs <span>{detail.steps.length > 0 ? `${detail.steps.length} recorded` : "waiting"}</span>
                </div>
                <div className="agent-run-grid">
                  {stepCards.length > 0 ? (
                    stepCards.map((entry) => (
                      <article className={`agent-run-card ${entry.step.status}`} key={entry.step.id}>
                        <div className="agent-run-header">
                          <strong>{entry.step.title}</strong>
                          <span className={`workspace-run-state ${mapStepStatus(entry.step.status)}`}>
                            <span className="workspace-run-dot" />
                            {labelForState(mapStepStatus(entry.step.status))}
                          </span>
                        </div>
                        <div className="agent-run-preview">
                          {entry.screenshotUrl ? (
                            <img
                              alt={entry.screenshotLabel ?? entry.step.title}
                              src={entry.screenshotUrl}
                            />
                          ) : (
                            <div className="agent-run-placeholder">{entry.step.detail}</div>
                          )}
                        </div>
                        <div className="agent-run-footer">
                          <div>
                            <strong>{entry.step.title}</strong>
                            <div className="muted">{entry.step.detail}</div>
                          </div>
                          {entry.screenshotUrl ? (
                            <a className="workspace-inline-link" href={entry.screenshotUrl} target="_blank">
                              Open evidence
                            </a>
                          ) : null}
                        </div>
                      </article>
                    ))
                  ) : (
                    <article className="agent-run-card pending">
                      <div className="agent-run-header">
                        <strong>Run 1</strong>
                        <span className={`workspace-run-state ${detail.scan.state}`}>
                          <span className="workspace-run-dot" />
                          {labelForState(detail.scan.state)}
                        </span>
                      </div>
                      <div className="agent-run-preview">
                        <div className="agent-run-placeholder">
                          {detail.scan.state === "failed"
                            ? "No run steps were captured before the scan failed."
                            : "SurfaceIQ is preparing the browser session."}
                        </div>
                      </div>
                    </article>
                  )}
                </div>
              </div>
            </section>

            <section className="workspace-section">
              <div className="workspace-section-marker" />
              <div className="workspace-section-content">
                <div className="workspace-section-label">
                  Results <span>{detail.findings.length}</span>
                </div>
                <div className="workspace-panel results-panel">
                  <div className="results-header">
                    <div>
                      <h2>Security Assessment Report</h2>
                      <p className="muted">Target URL: {detail.scan.startUrl}</p>
                    </div>
                    <div className="results-summary-pills">
                      <span className="results-summary-pill">High {(counts.high ?? 0) + (counts.critical ?? 0)}</span>
                      <span className="results-summary-pill">Medium {counts.medium ?? 0}</span>
                      <span className="results-summary-pill">Low {(counts.low ?? 0) + (counts.info ?? 0)}</span>
                    </div>
                  </div>

                  {detail.scan.errorMessage ? (
                    <div className="workspace-error-box">
                      <strong>Execution error</strong>
                      <p>{detail.scan.errorMessage}</p>
                    </div>
                  ) : null}

                  <article className="assessment-report-card">
                    <div className="assessment-report-label">Security Assessment Report</div>
                    <h3>Security Assessment Report</h3>

                    <section className="assessment-section">
                      <h4>Assessment Summary</h4>
                      <p>{reportView.summary}</p>
                    </section>

                    <section className="assessment-section">
                      <h4>Target</h4>
                      <a className="assessment-link" href={detail.scan.startUrl} target="_blank">
                        {detail.scan.startUrl}
                      </a>
                    </section>

                    <section className="assessment-section">
                      <h4>Security Indicators</h4>
                      <ul>
                        {reportView.indicators.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </section>

                    <section className="assessment-section">
                      <h4>Red Flags</h4>
                      <ul>
                        {reportView.redFlags.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </section>

                    <section className="assessment-section">
                      <h4>Conclusion</h4>
                      <p>{reportView.conclusion}</p>
                    </section>

                    <section className="assessment-section">
                      <h4>Recommendations</h4>
                      <ol>
                        {reportView.recommendations.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ol>
                    </section>
                  </article>
                </div>
              </div>
            </section>
          </div>
        </div>
      </section>
    </main>
  );
}

function buildCommandTitle(url: string, authMode: string) {
  return authMode === "public"
    ? `Navigate to ${hostnameFromUrl(url)}, inspect browser-visible security signals, and compile the results.`
    : `Authenticate into ${hostnameFromUrl(url)}, inspect protected browser content, and compile the results.`;
}

function buildGoalText(url: string, authMode: string) {
  return authMode === "public"
    ? `Navigate to the target web application URL (${url}), retrieve browser-visible headers, cookies, forms, linked scripts, and network behavior, then analyze them for missing security headers, weak cookie attributes, unsafe form patterns, reflected input, client-side exposure, and other safe-to-check issues. Compile the findings into a structured report with severity, evidence, and remediation guidance.`
    : `Authenticate into the target web application (${url}) using the supplied credentials or imported session cookies, verify access to protected content, continue crawling reachable authenticated pages, and analyze browser-visible headers, forms, scripts, cookies, navigation paths, and network behavior. Compile the findings, recommendations, and best-practice observations into a structured report.`;
}

function hostnameFromUrl(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function labelForState(state: string) {
  if (state === "running") return "Running";
  if (state === "completed") return "Complete";
  if (state === "failed") return "Failed";
  return "Queued";
}

function categoryForRule(ruleId: string) {
  if (ruleId.includes("header")) return "Missing Security Header";
  if (ruleId.includes("cookie")) return "Cookie Security";
  if (ruleId.includes("cors")) return "Access Control";
  if (ruleId.includes("form") || ruleId.includes("password")) return "Input Handling";
  if (ruleId.includes("source-map") || ruleId.includes("secret")) return "Information Disclosure";
  if (ruleId.includes("dom-xss") || ruleId.includes("reflected")) return "Client-side Risk";
  if (ruleId.includes("mixed")) return "Transport Security";
  return "Security Hygiene";
}

function mapStepStatus(status: string) {
  if (status === "failed") return "failed";
  if (status === "completed") return "completed";
  if (status === "running") return "running";
  return "pending";
}

function buildAssessmentReport(detail: NonNullable<Awaited<ReturnType<typeof getSortedScanDetail>>>) {
  const firstPage = detail.pages[0];
  const serverHeader =
    firstPage?.headers["server"] ??
    firstPage?.headers["x-powered-by"] ??
    detectHosting(detail.scan.startUrl, firstPage?.headers);

  const indicators = [
    detail.scan.startUrl.startsWith("https://") ? "HTTPS: Enabled" : "HTTPS: Not detected",
    `Scan Type: ${detail.report.scanType}`,
    `Overall Grade: ${detail.report.overallGrade}`,
    serverHeader ? `Hosting/Platform: ${serverHeader}` : null,
    detail.report.bestPracticesObserved[0] ?? null
  ].filter((value): value is string => Boolean(value));

  const redFlags =
    detail.findings.length > 0
      ? detail.findings.slice(0, 4).map((finding) => `${finding.title}: ${finding.summary}`)
      : detail.scan.errorMessage
        ? [detail.scan.errorMessage]
        : ["No major red flags were detected from the captured pages in this run."];

  const summary =
    detail.findings.length > 0
      ? `Security assessment based on visible browser indicators and captured application behavior. SurfaceIQ reviewed ${detail.scan.pagesDiscovered} pages and identified ${detail.scan.findingsCount} findings.`
      : `Security assessment based on visible browser indicators and site transparency. SurfaceIQ reviewed ${detail.scan.pagesDiscovered} pages and did not record explicit findings in this run.`;

  const highImpact = (countFindingsBySeverity(detail.findings).critical ?? 0) + (countFindingsBySeverity(detail.findings).high ?? 0);
  const conclusion =
    highImpact > 0
      ? `The site shows meaningful security weaknesses that should be addressed promptly, especially around browser hardening, data handling, or exposed application behavior.`
      : detail.findings.length > 0
        ? `The site shows lower-severity issues and security hygiene gaps that should be improved to strengthen trust and reduce future risk.`
        : `The observed surface looks relatively clean from this browser-based pass, though deeper authenticated and server-side testing may still uncover additional issues.`;

  return {
    summary,
    indicators,
    redFlags,
    conclusion,
    recommendations: detail.report.recommendations
  };
}

function detectHosting(url: string, headers?: Record<string, string>) {
  if (headers?.server) {
    return headers.server;
  }

  if (url.includes("vercel.app")) {
    return "Vercel";
  }

  return null;
}
