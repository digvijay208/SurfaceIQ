import { describe, expect, it } from "vitest";

import {
  analyzePage,
  createScanRecord,
  decryptSecret,
  encryptSecret,
  type AnalyzablePage,
  type PageRecord
} from "@surfaceiq/core";

function makePage(overrides: Partial<PageRecord> = {}): PageRecord {
  return {
    id: "page_1",
    scanId: "scan_1",
    url: "https://example.com/login",
    depth: 0,
    title: "Example",
    statusCode: 200,
    contentType: "text/html",
    headers: {},
    cookies: [],
    links: [],
    forms: [],
    scripts: [],
    consoleMessages: [],
    networkRequests: [],
    fetchedAt: "2026-03-27T00:00:00.000Z",
    ...overrides
  };
}

function makeAnalyzablePage(overrides: Partial<AnalyzablePage> = {}): AnalyzablePage {
  return {
    page: makePage(),
    html: "<html><head></head><body>Hello</body></html>",
    scriptBodies: [],
    ...overrides
  };
}

describe("createScanRecord", () => {
  it("normalizes the target URL and applies defaults", () => {
    const scan = createScanRecord({
      userId: "user_1",
      startUrl: "https://example.com/path#fragment",
      authorizationConfirmed: true
    });

    expect(scan.startUrl).toBe("https://example.com/path");
    expect(scan.normalizedOrigin).toBe("https://example.com");
    expect(scan.userId).toBe("user_1");
    expect(scan.policy.maxPages).toBeGreaterThan(0);
  });

  it("encrypts credentialed scan passwords", () => {
    const scan = createScanRecord({
      userId: "user_1",
      startUrl: "https://example.com",
      authorizationConfirmed: true,
      auth: {
        mode: "credentials",
        username: "analyst@example.com",
        password: "super-secret"
      }
    });

    expect(scan.auth.encryptedPassword).toBeTruthy();
    expect(decryptSecret(scan.auth.encryptedPassword!)).toBe("super-secret");
  });
});

describe("secret helpers", () => {
  it("round-trips encrypted secrets", () => {
    const encrypted = encryptSecret("hello-world");
    expect(encrypted).not.toBe("hello-world");
    expect(decryptSecret(encrypted)).toBe("hello-world");
  });
});

describe("analyzePage", () => {
  it("flags missing security headers", () => {
    const findings = analyzePage(makeAnalyzablePage());
    expect(findings.some((finding) => finding.ruleId === "missing-security-headers")).toBe(true);
  });

  it("flags insecure cookies and form issues", () => {
    const findings = analyzePage(
      makeAnalyzablePage({
        page: makePage({
          cookies: [
            {
              name: "session",
              domain: "example.com",
              path: "/",
              secure: false,
              httpOnly: false,
              sameSite: "Unset"
            }
          ],
          forms: [
            {
              action: "http://example.com/login",
              method: "get",
              hasPassword: true,
              autocompleteOff: true,
              inputNames: ["email", "password"]
            }
          ]
        })
      })
    );

    expect(findings.some((finding) => finding.ruleId === "cookie-flags")).toBe(true);
    expect(findings.some((finding) => finding.ruleId === "insecure-form-action")).toBe(true);
    expect(findings.some((finding) => finding.ruleId === "password-in-get-form")).toBe(true);
  });

  it("flags reflection and DOM-XSS heuristics", () => {
    const findings = analyzePage(
      makeAnalyzablePage({
        reflectionProbe: {
          canary: "surfaceiq_test",
          reflected: true,
          reflectedInHtmlSnippet: "<div>surfaceiq_test</div>"
        },
        scriptBodies: [
          {
            sourceUrl: "https://example.com/app.js",
            body: "const value = location.search; document.body.innerHTML = value;"
          }
        ]
      })
    );

    expect(findings.some((finding) => finding.ruleId === "reflected-input")).toBe(true);
    expect(findings.some((finding) => finding.ruleId === "dom-xss-heuristic")).toBe(true);
  });
});
