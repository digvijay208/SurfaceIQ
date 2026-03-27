import type { FindingRecord, PageRecord, ScanRecord, ScanReportSummary } from "../types";

export function countFindingsBySeverity(findings: FindingRecord[]): Record<string, number> {
  return findings.reduce<Record<string, number>>((counts, finding) => {
    counts[finding.severity] = (counts[finding.severity] ?? 0) + 1;
    return counts;
  }, {});
}

export function buildScanReportSummary(
  scan: ScanRecord,
  findings: FindingRecord[],
  pages: PageRecord[]
): ScanReportSummary {
  const counts = countFindingsBySeverity(findings);
  const weightedScore =
    (counts.critical ?? 0) * 30 +
    (counts.high ?? 0) * 18 +
    (counts.medium ?? 0) * 9 +
    (counts.low ?? 0) * 4 +
    (counts.info ?? 0) * 1;

  const overallGrade =
    weightedScore >= 45 ? "D" : weightedScore >= 28 ? "C" : weightedScore >= 14 ? "B" : "A";

  const recommendations = new Set<string>();
  const bestPracticesObserved = new Set<string>();

  if (findings.some((finding) => finding.ruleId.includes("header"))) {
    recommendations.add(
      "Implement missing response security headers, especially CSP, framing protections, and content type hardening."
    );
  }
  if (findings.some((finding) => finding.ruleId.includes("cookie"))) {
    recommendations.add(
      "Harden session cookies with Secure, HttpOnly, and SameSite attributes appropriate for the application."
    );
  }
  if (findings.some((finding) => finding.ruleId.includes("form") || finding.ruleId.includes("password"))) {
    recommendations.add(
      "Review form flows to ensure sensitive inputs avoid GET submission and use HTTPS-only endpoints with strong server-side validation."
    );
  }
  if (findings.some((finding) => finding.ruleId.includes("cors"))) {
    recommendations.add(
      "Tighten CORS rules to allow only trusted origins and avoid overly permissive browser access."
    );
  }
  if (
    findings.some(
      (finding) => finding.ruleId.includes("dom-xss") || finding.ruleId.includes("reflected")
    )
  ) {
    recommendations.add(
      "Apply context-aware output encoding and avoid unsafe DOM sinks so reflected or browser-controlled input cannot become executable content."
    );
  }
  if (recommendations.size === 0) {
    recommendations.add("Maintain the current baseline and keep monitoring new releases for regressions.");
  }

  if (pages.some((page) => page.url.startsWith("https://"))) {
    bestPracticesObserved.add("HTTPS was observed during the scan, which protects transport for visited pages.");
  }
  if (!findings.some((finding) => finding.ruleId === "mixed-content")) {
    bestPracticesObserved.add("No mixed-content requests were detected across the captured pages.");
  }
  if (!findings.some((finding) => finding.ruleId === "cookie-flags")) {
    bestPracticesObserved.add("Visited pages did not expose weak browser cookie flags in the observed session.");
  }
  if (bestPracticesObserved.size === 0) {
    bestPracticesObserved.add("No clear positive controls were observed from the current crawl sample.");
  }

  return {
    scanType: scan.auth.mode === "public" ? "External public application scan" : "Authenticated browser application scan",
    scanDate: scan.createdAt.slice(0, 10),
    overallGrade,
    recommendations: Array.from(recommendations),
    bestPracticesObserved: Array.from(bestPracticesObserved)
  };
}
