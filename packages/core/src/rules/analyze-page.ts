import type { AnalyzablePage, FindingDraft, FindingSeverity } from "../types";
import { buildSnippet } from "../utils";

const SECRET_PATTERNS: Array<{ label: string; regex: RegExp }> = [
  { label: "Stripe live key", regex: /sk_live_[0-9a-zA-Z]{16,}/g },
  { label: "GitHub token", regex: /ghp_[0-9A-Za-z]{20,}/g },
  { label: "Google API key", regex: /AIza[0-9A-Za-z\-_]{20,}/g },
  { label: "JWT-like token", regex: /eyJ[A-Za-z0-9_\-]+=*\.[A-Za-z0-9_\-]+=*\.?[A-Za-z0-9_\-=]*/g }
];

const DANGEROUS_SINKS = [
  "innerHTML",
  "outerHTML",
  "document.write",
  "insertAdjacentHTML",
  "eval(",
  "new Function",
  "setTimeout(",
  "setInterval("
];

const USER_CONTROLLED_SOURCES = ["location.search", "location.hash", "document.URL", "window.name"];

export function analyzePage(input: AnalyzablePage): FindingDraft[] {
  return [
    ...analyzeSecurityHeaders(input),
    ...analyzeCookies(input),
    ...analyzeMixedContent(input),
    ...analyzeForms(input),
    ...analyzeClientExposure(input),
    ...analyzeCors(input),
    ...analyzeReflection(input),
    ...analyzeDomXssHeuristics(input)
  ];
}

function analyzeSecurityHeaders(input: AnalyzablePage): FindingDraft[] {
  const findings: FindingDraft[] = [];
  const headers = lowerCaseKeys(input.page.headers);
  const missingHeaders: Array<{ name: string; severity: FindingSeverity }> = [];

  if (!headers["content-security-policy"]) {
    missingHeaders.push({ name: "Content-Security-Policy", severity: "medium" });
  }
  if (input.page.url.startsWith("https://") && !headers["strict-transport-security"]) {
    missingHeaders.push({ name: "Strict-Transport-Security", severity: "medium" });
  }
  if (!headers["x-content-type-options"]) {
    missingHeaders.push({ name: "X-Content-Type-Options", severity: "low" });
  }
  if (!headers["referrer-policy"]) {
    missingHeaders.push({ name: "Referrer-Policy", severity: "low" });
  }
  if (!headers["permissions-policy"]) {
    missingHeaders.push({ name: "Permissions-Policy", severity: "low" });
  }

  if (
    !headers["x-frame-options"] &&
    !headers["content-security-policy"]?.includes("frame-ancestors")
  ) {
    missingHeaders.push({ name: "Framing protection", severity: "medium" });
  }

  if (missingHeaders.length > 0) {
    findings.push({
      ruleId: "missing-security-headers",
      title: "Missing baseline browser security headers",
      severity: highestSeverity(missingHeaders.map((item) => item.severity)),
      confidence: 0.98,
      kind: "verified",
      url: input.page.url,
      summary:
        "The page is missing one or more recommended browser security headers that reduce XSS, clickjacking, and transport downgrade risk.",
      evidence: missingHeaders.map((item) => `${item.name} is not set on the document response.`),
      remediation:
        "Set a restrictive CSP, HSTS on HTTPS sites, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, and framing protections appropriate for the application."
    });
  }

  return findings;
}

function analyzeCookies(input: AnalyzablePage): FindingDraft[] {
  const findings: FindingDraft[] = [];

  for (const cookie of input.page.cookies) {
    const evidence: string[] = [];
    let severity: FindingSeverity = "low";

    if (!cookie.secure && input.page.url.startsWith("https://")) {
      evidence.push(`Cookie ${cookie.name} is missing the Secure flag.`);
      severity = "medium";
    }
    if (!cookie.httpOnly) {
      evidence.push(`Cookie ${cookie.name} is missing the HttpOnly flag.`);
      severity = "medium";
    }
    if (cookie.sameSite === "Unset") {
      evidence.push(`Cookie ${cookie.name} does not declare SameSite.`);
    }

    if (evidence.length > 0) {
      findings.push({
        ruleId: "cookie-flags",
        title: `Cookie ${cookie.name} has weak protection flags`,
        severity,
        confidence: 0.95,
        kind: "verified",
        url: input.page.url,
        summary: "A cookie visible on the page does not use the recommended browser protection attributes.",
        evidence,
        remediation:
          "Mark sensitive cookies as Secure and HttpOnly, and set SameSite to Lax or Strict unless cross-site use is required."
      });
    }
  }

  return findings;
}

function analyzeMixedContent(input: AnalyzablePage): FindingDraft[] {
  if (!input.page.url.startsWith("https://")) {
    return [];
  }

  const mixedRequests = input.page.networkRequests.filter((record) => record.mixedContent);
  if (mixedRequests.length === 0) {
    return [];
  }

  return [
    {
      ruleId: "mixed-content",
      title: "HTTPS page requests insecure HTTP resources",
      severity: "high",
      confidence: 0.97,
      kind: "verified",
      url: input.page.url,
      summary:
        "The page loaded one or more insecure HTTP resources from an HTTPS context, weakening transport guarantees.",
      evidence: mixedRequests.slice(0, 5).map((record) => `${record.resourceType}: ${record.url}`),
      remediation:
        "Serve every subresource over HTTPS and add CSP upgrade-insecure-requests if appropriate."
    }
  ];
}

function analyzeForms(input: AnalyzablePage): FindingDraft[] {
  const findings: FindingDraft[] = [];

  for (const form of input.page.forms) {
    if (form.action?.startsWith("http://") && input.page.url.startsWith("https://")) {
      findings.push({
        ruleId: "insecure-form-action",
        title: "Form submits to an insecure HTTP endpoint",
        severity: "high",
        confidence: 0.96,
        kind: "verified",
        url: input.page.url,
        summary: "A form on an HTTPS page targets an HTTP action URL.",
        evidence: [`Form action ${form.action} downgrades transport security.`],
        remediation: "Update the form action to HTTPS and ensure the receiving endpoint is HTTPS-only."
      });
    }

    if (form.hasPassword && form.method.toLowerCase() === "get") {
      findings.push({
        ruleId: "password-in-get-form",
        title: "Password field is present in a GET form",
        severity: "high",
        confidence: 0.94,
        kind: "verified",
        url: input.page.url,
        summary: "A password-bearing form uses GET, which can expose secrets in URLs, logs, and browser history.",
        evidence: ["A form containing a password input declares method=GET."],
        remediation: "Submit password-bearing forms with POST and disable any route patterns that serialize credentials into URLs."
      });
    }

    if (form.hasPassword && form.autocompleteOff) {
      findings.push({
        ruleId: "password-autocomplete-off",
        title: "Password form disables browser autocomplete",
        severity: "low",
        confidence: 0.76,
        kind: "heuristic",
        url: input.page.url,
        summary:
          "The password form disables autocomplete, which is often unnecessary and can discourage password-manager usage.",
        evidence: ["Password form or input sets autocomplete=off."],
        remediation:
          "Use appropriate autocomplete values such as current-password or new-password instead of blanket autocomplete=off."
      });
    }
  }

  return findings;
}

function analyzeClientExposure(input: AnalyzablePage): FindingDraft[] {
  const findings: FindingDraft[] = [];
  const combinedSources = [
    input.html,
    ...input.page.scripts.flatMap((script) => [script.inlineSnippet ?? "", script.src ?? ""]),
    ...input.scriptBodies.map((script) => script.body)
  ].join("\n");

  for (const { label, regex } of SECRET_PATTERNS) {
    const match = combinedSources.match(regex)?.[0];
    if (!match) {
      continue;
    }

    findings.push({
      ruleId: "client-exposed-secret",
      title: `${label} appears in client-visible code`,
      severity: "high",
      confidence: 0.72,
      kind: "heuristic",
      url: input.page.url,
      summary: "A token-like string was found in HTML or JavaScript accessible to the browser.",
      evidence: [buildSnippet(combinedSources, match)],
      remediation:
        "Move secrets server-side, rotate exposed values, and review whether the matched token is active or production-scoped."
    });
  }

  const sourceMapSignals = [
    ...input.page.scripts
      .filter((script) => script.src?.endsWith(".map") || script.containsSourceMapComment)
      .map((script) => script.src ?? script.inlineSnippet ?? "Inline script with source map comment"),
    ...input.scriptBodies
      .filter((script) => script.body.includes("sourceMappingURL="))
      .map((script) => script.sourceUrl)
  ];

  if (sourceMapSignals.length > 0) {
    findings.push({
      ruleId: "source-map-exposure",
      title: "Client-side source maps appear to be exposed",
      severity: "low",
      confidence: 0.91,
      kind: "verified",
      url: input.page.url,
      summary:
        "The page references source maps that can reveal source structure, comments, or internal implementation details.",
      evidence: sourceMapSignals.slice(0, 5),
      remediation:
        "Disable public source map publishing in production unless intentionally exposed, or gate access to debugging artifacts."
    });
  }

  return findings;
}

function analyzeCors(input: AnalyzablePage): FindingDraft[] {
  const headers = lowerCaseKeys(input.page.headers);
  if (
    headers["access-control-allow-origin"] === "*" &&
    headers["access-control-allow-credentials"] === "true"
  ) {
    return [
      {
        ruleId: "cors-wildcard-credentials",
        title: "CORS allows credentials with a wildcard origin",
        severity: "high",
        confidence: 0.99,
        kind: "verified",
        url: input.page.url,
        summary: "The response declares Access-Control-Allow-Origin: * together with Access-Control-Allow-Credentials: true.",
        evidence: [
          "Access-Control-Allow-Origin: *",
          "Access-Control-Allow-Credentials: true"
        ],
        remediation:
          "Reflect only approved origins and never combine credentialed CORS with a wildcard allow-origin policy."
      }
    ];
  }

  return [];
}

function analyzeReflection(input: AnalyzablePage): FindingDraft[] {
  if (!input.reflectionProbe?.reflected) {
    return [];
  }

  return [
    {
      ruleId: "reflected-input",
      title: "A canary input value was reflected into the response",
      severity: "medium",
      confidence: 0.78,
      kind: "heuristic",
      url: input.page.url,
      summary:
        "A harmless canary query parameter was echoed into the returned HTML, which may indicate reflected-input risk.",
      evidence: [
        `Canary parameter ${input.reflectionProbe.canary} appeared in the response.`,
        input.reflectionProbe.reflectedInHtmlSnippet ?? input.reflectionProbe.canary
      ],
      remediation:
        "Review where request parameters are rendered into templates or DOM sinks and ensure proper context-aware escaping."
    }
  ];
}

function analyzeDomXssHeuristics(input: AnalyzablePage): FindingDraft[] {
  const combinedScript = input.scriptBodies.map((entry) => entry.body).join("\n");

  if (!combinedScript) {
    return [];
  }

  const seenSource = USER_CONTROLLED_SOURCES.find((pattern) => combinedScript.includes(pattern));
  const seenSink = DANGEROUS_SINKS.find((pattern) => combinedScript.includes(pattern));

  if (!seenSource || !seenSink) {
    return [];
  }

  return [
    {
      ruleId: "dom-xss-heuristic",
      title: "Client code combines user-controlled browser data with dangerous DOM sinks",
      severity: "medium",
      confidence: 0.62,
      kind: "heuristic",
      url: input.page.url,
      summary:
        "Downloaded script code contains both common DOM-XSS sources and dangerous HTML/script execution sinks.",
      evidence: [`Observed source: ${seenSource}`, `Observed sink: ${seenSink}`],
      remediation:
        "Audit the matching code path, avoid unsafe sinks such as innerHTML/document.write, and sanitize untrusted data before DOM insertion."
    }
  ];
}

function lowerCaseKeys(record: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key.toLowerCase(), value])
  );
}

function highestSeverity(severities: FindingSeverity[]): FindingSeverity {
  const order: FindingSeverity[] = ["critical", "high", "medium", "low", "info"];
  return (
    order.find((severity) => severities.includes(severity)) ??
    "info"
  );
}
