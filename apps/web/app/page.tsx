import Link from "next/link";

import { PromptLauncher } from "../components/prompt-launcher";
import { ScanStatusCard } from "../components/scan-status-card";
import { LogoutButton } from "../components/logout-button";
import { LandingThemeToggle } from "../components/landing-theme-toggle";
import { getCurrentUser } from "../lib/auth";
import { scanRepository } from "../lib/server";

export const dynamic = "force-dynamic";

const workflowCards = [
  {
    step: "01",
    title: "Start with a live objective",
    body: "Launch from a prompt-driven entry point instead of a raw settings form. SurfaceIQ translates intent into an executable browser run."
  },
  {
    step: "02",
    title: "Authenticate only when needed",
    body: "Move from public review to credentialed or session-based inspection without breaking the run flow or exposing one workspace to another."
  },
  {
    step: "03",
    title: "Watch the browser capture evidence",
    body: "Each run records steps, screenshots, and page-level artifacts so the final report is grounded in what the worker actually observed."
  }
];

const capabilityCards = [
  {
    eyebrow: "Private Workspaces",
    title: "Every scan, artifact, and report stays account-scoped.",
    body: "User isolation is built in, so each operator sees only their own evidence, findings, and authenticated sessions.",
    tone: "wide"
  },
  {
    eyebrow: "Authenticated Reviews",
    title: "Move through real login flows.",
    body: "SurfaceIQ can fill forms or import session cookies to reach protected content before running the analysis pass.",
    tone: "tall"
  },
  {
    eyebrow: "Evidence-Backed Output",
    title: "Reports stay tied to the browser trail.",
    body: "The final result links findings back to run steps, captured pages, screenshots, and artifacts instead of generic summaries.",
    tone: "standard"
  },
  {
    eyebrow: "Safe Analysis",
    title: "Built for non-destructive scanning.",
    body: "The current product focuses on browser-visible risk signals, reflection probes, weak forms, headers, and client exposure without aggressive exploit payloads.",
    tone: "standard"
  }
];

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact" }).format(value);
}

export default async function HomePage() {
  const user = await getCurrentUser();
  const scans = user ? await scanRepository.listScans(user.id) : [];
  const totalFindings = scans.reduce((sum, scan) => sum + scan.findingsCount, 0);
  const runningCount = scans.filter((scan) => scan.state === "running").length;
  const completedCount = scans.filter((scan) => scan.state === "completed").length;
  const authenticatedCount = scans.filter((scan) => scan.authMode !== "public").length;
  const coverageRate =
    scans.length > 0 ? Math.round((completedCount / Math.max(scans.length, 1)) * 100) : 0;

  const signalCards = [
    {
      label: "Completed runs",
      value: formatCompactNumber(completedCount),
      note: "Actual runs that produced a finished report."
    },
    {
      label: "Authenticated reviews",
      value: formatCompactNumber(authenticatedCount),
      note: "Runs that moved beyond public pages."
    },
    {
      label: "Captured findings",
      value: formatCompactNumber(totalFindings),
      note: "Evidence-backed findings recorded in this workspace."
    },
    {
      label: "Active coverage",
      value: `${coverageRate}%`,
      note: runningCount > 0 ? `${runningCount} runs are in progress now.` : "No active runs right now."
    }
  ];

  return (
    <main className="landing-shell">
      <div className="landing-orb landing-orb-one" />
      <div className="landing-orb landing-orb-two" />
      <div className="landing-grid" />

      <section className="landing-frame">
        <header className="landing-topbar landing-animate">
          <Link className="landing-brand" href="/">
            <span className="landing-brand-mark">S</span>
            <span>SurfaceIQ</span>
          </Link>

          <nav className="landing-nav">
            <a href="#signals">Signals</a>
            <a href="#capabilities">Capabilities</a>
            <a href="#workflow">Workflow</a>
          </nav>

          <div className="landing-actions">
            <LandingThemeToggle />
            {user ? (
              <>
                <Link className="landing-inline-link" href="/dashboard">
                  Dashboard
                </Link>
                <LogoutButton />
              </>
            ) : (
              <>
                <Link className="landing-inline-link" href="/login">
                  Sign in
                </Link>
                <Link className="landing-primary-button" href="/signup">
                  Create account
                </Link>
              </>
            )}
          </div>
        </header>

        <section className="landing-hero">
          <div className="landing-hero-copy landing-animate" style={{ animationDelay: "80ms" }}>
            <span className="landing-kicker">Authorized Browser Security Reviews</span>
            <h1>Security analysis that feels like a guided operation, not a cold scan form.</h1>
            <p>
              SurfaceIQ turns a simple prompt into a live browser run, captures evidence as it moves,
              and delivers a report grounded in what the agent actually reached across public and
              authenticated routes.
            </p>

            <div className="landing-hero-actions">
              <a className="landing-primary-button" href="#launcher">
                Launch a review
              </a>
              {user ? (
                <Link className="landing-secondary-button" href="/dashboard">
                  Open workspace dashboard
                </Link>
              ) : (
                <Link className="landing-secondary-button" href="/signup">
                  Start your workspace
                </Link>
              )}
            </div>

            <div className="landing-editorial-note">
              <span className="landing-editorial-line" />
              <p>
                Built entirely with Codex, designed for teams that want a more credible, evidence-first
                way to review web surfaces.
              </p>
            </div>
          </div>

          <div className="landing-hero-stage landing-animate" id="launcher" style={{ animationDelay: "160ms" }}>
            <div className="landing-stage-card landing-stage-card-top">
              <div className="landing-stage-heading">
                <span className="landing-stage-label">Live Run Entry</span>
                <span className="landing-stage-badge">Dark by default</span>
              </div>
              <PromptLauncher />
            </div>

            <div className="landing-stage-stack">
              <article className="landing-mini-panel">
                <span className="landing-mini-label">Run Pattern</span>
                <strong>Prompt {"->"} Review {"->"} Auth {"->"} Workspace</strong>
                <p>Preserves the guided TinyFish-style flow while keeping SurfaceIQ product-specific.</p>
              </article>

              <article className="landing-mini-panel accent">
                <span className="landing-mini-label">Observation Layer</span>
                <strong>Steps, screenshots, artifacts, findings</strong>
                <p>The browser trail remains visible from launch through the final report.</p>
              </article>
            </div>
          </div>
        </section>
      </section>

      <section className="landing-signals landing-animate" id="signals" style={{ animationDelay: "240ms" }}>
        {signalCards.map((card) => (
          <article className="landing-signal-card" key={card.label}>
            <span className="landing-signal-label">{card.label}</span>
            <strong className="landing-signal-value">{card.value}</strong>
            <p>{card.note}</p>
          </article>
        ))}
      </section>

      <section className="landing-section landing-animate" id="capabilities" style={{ animationDelay: "320ms" }}>
        <div className="landing-section-head">
          <span className="landing-kicker">Capability Bento</span>
          <h2>Made for security teams that want credibility in the motion, not just in the report.</h2>
          <p>
            The product combines private workspaces, authenticated reviews, live browser evidence, and
            structured outputs without collapsing into a generic scanner UI.
          </p>
        </div>

        <div className="landing-bento">
          {capabilityCards.map((card, index) => (
            <article
              className={`landing-bento-card ${card.tone}`}
              key={card.title}
              style={{ animationDelay: `${400 + index * 80}ms` }}
            >
              <span className="landing-bento-eyebrow">{card.eyebrow}</span>
              <h3>{card.title}</h3>
              <p>{card.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section landing-animate" id="workflow" style={{ animationDelay: "420ms" }}>
        <div className="landing-section-head split">
          <div>
            <span className="landing-kicker">Workflow</span>
            <h2>The main page now tells a product story before the user ever reaches the scanner.</h2>
          </div>
          <p>
            Instead of forcing configuration first, the landing flow introduces the interaction model,
            then moves the user into the live review experience at the moment they are ready.
          </p>
        </div>

        <div className="landing-workflow-grid">
          {workflowCards.map((item, index) => (
            <article className="landing-workflow-card" key={item.step} style={{ animationDelay: `${500 + index * 90}ms` }}>
              <span className="landing-workflow-step">{item.step}</span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      {user ? (
        <section className="landing-section landing-animate" style={{ animationDelay: "520ms" }}>
          <div className="landing-section-head split">
            <div>
              <span className="landing-kicker">Recent Runs</span>
              <h2>Your latest workspace activity stays visible without leaving the homepage.</h2>
            </div>
            <p>These cards are pulled from the same user-scoped records that power the dashboard and workspace views.</p>
          </div>

          {scans.length > 0 ? (
            <div className="landing-scan-grid">
              {scans.slice(0, 3).map((scan) => (
                <ScanStatusCard key={scan.id} scan={scan} />
              ))}
            </div>
          ) : (
            <div className="landing-empty-panel">
              No runs yet. Start with a site you own or are authorized to test.
            </div>
          )}
        </section>
      ) : null}

      <section className="landing-cta landing-animate" style={{ animationDelay: "620ms" }}>
        <div>
          <span className="landing-kicker">Ready To Launch</span>
          <h2>Bring a real site, run the browser, and let the evidence shape the report.</h2>
        </div>
        <div className="landing-cta-actions">
          <Link className="landing-primary-button" href="/playground?prompt=security%20check">
            Open playground
          </Link>
          {user ? (
            <Link className="landing-secondary-button" href="/dashboard">
              View dashboard
            </Link>
          ) : (
            <Link className="landing-secondary-button" href="/signup">
              Create account
            </Link>
          )}
        </div>
      </section>
    </main>
  );
}
