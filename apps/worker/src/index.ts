import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, type BrowserContext, type Page } from "playwright";

import {
  analyzePage,
  createArtifactStoreFromEnv,
  createFindingRecord,
  createScanRepositoryFromEnv,
  decryptSecret,
  makeId,
  normalizeUrl,
  nowIso,
  type ArtifactRecord,
  type BrowserCookie,
  type NetworkRecord,
  type PageRecord,
  type ReflectionProbeResult,
  type ScanRecord
} from "@surfaceiq/core";

function loadRepoEnvFiles() {
  const workerDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(workerDir, "../../../.env.local"),
    resolve(workerDir, "../../../.env")
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);
    }
  }
}

loadRepoEnvFiles();

const repository = createScanRepositoryFromEnv();
const artifactStore = createArtifactStoreFromEnv();
const POLL_INTERVAL_MS = 2_000;

async function workerLoop() {
  for (;;) {
    const scan = await repository.claimNextPendingScan();
    if (!scan) {
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    try {
      await runScan(scan);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown scan error";
      await repository.appendRunStep({
        scanId: scan.id,
        title: "Run failed",
        detail: message,
        status: "failed"
      });
      await repository.failScan(scan.id, message);
    }
  }
}

async function runScan(scan: ScanRecord) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true
  });
  const visited = new Set<string>();
  const captureErrors: string[] = [];
  let successfulPages = 0;

  try {
    const initialTargets = await prepareAuthenticatedContext(context, scan);
    const frontier: Array<{ url: string; depth: number }> = initialTargets.map((url) => ({
      url,
      depth: 0
    }));

    while (frontier.length > 0 && visited.size < scan.policy.maxPages) {
      const target = frontier.shift();
      if (!target) {
        break;
      }

      const normalized = safeNormalizeWithinOrigin(target.url, scan.normalizedOrigin);
      if (!normalized || visited.has(normalized)) {
        continue;
      }

      visited.add(normalized);
      await repository.updateScanProgress(scan.id, {
        lastMessage: `Scanning ${normalized}`
      });

      try {
        const result = await capturePage({
          context,
          scan,
          url: normalized,
          depth: target.depth
        });

        await repository.addPage(result.page);
        for (const artifact of result.artifacts) {
          await repository.addArtifact(artifact);
        }
        await repository.addFindings(result.findings);
        await repository.appendRunStep({
          scanId: scan.id,
          title: `Captured ${hostnameFromUrl(normalized)}`,
          detail: `Observed ${normalized} with status ${result.page.statusCode}.`,
          status: "completed",
          ...(result.page.screenshotArtifactId
            ? { screenshotArtifactId: result.page.screenshotArtifactId }
            : {}),
          url: normalized
        });

        if (target.depth < scan.policy.maxDepth) {
          for (const link of result.discoveredLinks) {
            if (!visited.has(link)) {
              frontier.push({ url: link, depth: target.depth + 1 });
            }
          }
        }

        successfulPages += 1;
        await repository.updateScanProgress(scan.id, {
          lastMessage: `Captured ${normalized}`
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        captureErrors.push(`${normalized}: ${message}`);
        await repository.appendRunStep({
          scanId: scan.id,
          title: `Skipped ${hostnameFromUrl(normalized)}`,
          detail: message,
          status: "failed",
          url: normalized
        });
        await repository.updateScanProgress(scan.id, {
          lastMessage: `Skipped ${normalized}: ${message}`
        });
      }

      await sleep(scan.policy.requestDelayMs);
    }

    if (successfulPages === 0) {
      const message = captureErrors[0] ?? "No pages were successfully captured for this target.";
      await repository.failScan(scan.id, message);
      return;
    }

    await repository.appendRunStep({
      scanId: scan.id,
      title: "Compile final report",
      detail: `SurfaceIQ summarized ${successfulPages} captured pages and ${scan.findingsCount} findings.`,
      status: "completed"
    });
    await repository.completeScan(scan.id);
  } finally {
    await context.close();
    await browser.close();
  }
}

async function prepareAuthenticatedContext(
  context: BrowserContext,
  scan: ScanRecord
): Promise<string[]> {
  await repository.appendRunStep({
    scanId: scan.id,
    title: "Initialize run",
    detail:
      scan.auth.mode === "public"
        ? "Starting public same-origin crawl."
        : "Preparing authenticated browser session.",
    status: "info"
  });

  if (scan.auth.mode === "session") {
    const encryptedCookies = scan.auth.encryptedSessionCookiesJson;
    if (!encryptedCookies) {
      throw new Error("Session mode requires imported session cookies JSON.");
    }

    const rawCookies = decryptSecret(encryptedCookies);
    const cookies = JSON.parse(rawCookies) as Array<{
      name: string;
      value: string;
      domain: string;
      path?: string;
      expires?: number;
      httpOnly?: boolean;
      secure?: boolean;
      sameSite?: "Strict" | "Lax" | "None";
    }>;
    await context.addCookies(
      cookies.map((cookie) => ({
        path: "/",
        secure: true,
        httpOnly: true,
        ...cookie
      }))
    );

    await repository.appendRunStep({
      scanId: scan.id,
      title: "Import stored session",
      detail: `Loaded ${cookies.length} cookies into the browser context.`,
      status: "completed"
    });

    return [scan.startUrl];
  }

  if (scan.auth.mode === "credentials") {
    const postLoginUrl = await performCredentialLogin(context, scan);
    return [postLoginUrl, scan.startUrl];
  }

  return [scan.startUrl];
}

async function performCredentialLogin(context: BrowserContext, scan: ScanRecord): Promise<string> {
  const loginUrl = scan.auth.loginUrl ?? scan.startUrl;
  const username = scan.auth.username;
  const encryptedPassword = scan.auth.encryptedPassword;
  if (!username || !encryptedPassword) {
    throw new Error("Credential mode requires both a username and password.");
  }

  const password = decryptSecret(encryptedPassword);
  const page = await context.newPage();

  try {
    await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await stabilizePage(page);
    const openArtifact = await captureStepScreenshot(scan, page, "Open login page");
    await repository.addArtifact(openArtifact);
    await repository.appendRunStep({
      scanId: scan.id,
      title: "Open login page",
      detail: `Opened ${loginUrl}.`,
      status: "completed",
      screenshotArtifactId: openArtifact.id,
      url: loginUrl
    });

    const usernameSelector = await resolveSelector(page, [
      scan.auth.usernameSelector,
      'input[type="email"]',
      'input[name*="email" i]',
      'input[autocomplete="username"]',
      'input[name*="user" i]',
      'input[type="text"]'
    ]);
    const passwordSelector = await resolveSelector(page, [
      scan.auth.passwordSelector,
      'input[type="password"]'
    ]);

    if (!usernameSelector || !passwordSelector) {
      throw new Error("Could not find the login form fields. Provide explicit selectors.");
    }

    await page.locator(usernameSelector).first().fill(username);
    const userArtifact = await captureStepScreenshot(scan, page, "Fill username");
    await repository.addArtifact(userArtifact);
    await repository.appendRunStep({
      scanId: scan.id,
      title: "Fill username",
      detail: `Filled ${maskIdentity(username)} into ${usernameSelector}.`,
      status: "completed",
      screenshotArtifactId: userArtifact.id,
      url: loginUrl
    });

    await page.locator(passwordSelector).first().fill(password);
    await repository.appendRunStep({
      scanId: scan.id,
      title: "Fill password",
      detail: `Filled the password field ${passwordSelector}.`,
      status: "completed",
      url: loginUrl
    });

    const submitSelector = await resolveSelector(page, [
      scan.auth.submitSelector,
      'button[type="submit"]',
      'input[type="submit"]',
      'form button'
    ]);

    if (submitSelector) {
      await page.locator(submitSelector).first().click();
    } else {
      await page.locator(passwordSelector).first().press("Enter");
    }

    await stabilizePage(page);
    const submitArtifact = await captureStepScreenshot(scan, page, "Submit login form");
    await repository.addArtifact(submitArtifact);
    await repository.appendRunStep({
      scanId: scan.id,
      title: "Submit login form",
      detail: submitSelector
        ? `Submitted the form using ${submitSelector}.`
        : "Submitted the form with Enter on the password field.",
      status: "completed",
      screenshotArtifactId: submitArtifact.id,
      url: page.url()
    });

    const verified = await verifyLoginSuccess(page, scan);
    const verifyArtifact = await captureStepScreenshot(scan, page, "Verify authenticated session");
    await repository.addArtifact(verifyArtifact);
    await repository.appendRunStep({
      scanId: scan.id,
      title: "Verify authenticated session",
      detail: verified
        ? `Reached ${page.url()} and confirmed an authenticated state.`
        : `Reached ${page.url()} but could not prove the authenticated state with the provided hints.`,
      status: verified ? "completed" : "info",
      screenshotArtifactId: verifyArtifact.id,
      url: page.url()
    });

    return page.url();
  } finally {
    await page.close();
  }
}

async function capturePage(input: {
  context: BrowserContext;
  scan: ScanRecord;
  url: string;
  depth: number;
}): Promise<{
  page: PageRecord;
  artifacts: ArtifactRecord[];
  findings: ReturnType<typeof createFindingRecord>[];
  discoveredLinks: string[];
}> {
  const { context, scan, url, depth } = input;
  const page = await context.newPage();
  const consoleMessages: PageRecord["consoleMessages"] = [];
  const networkRequests: NetworkRecord[] = [];

  page.on("console", (message) => {
    consoleMessages.push({
      type: message.type(),
      text: message.text()
    });
  });

  page.on("response", async (response) => {
    const request = response.request();
    networkRequests.push({
      url: response.url(),
      method: request.method(),
      resourceType: request.resourceType(),
      status: response.status(),
      mixedContent: url.startsWith("https://") && response.url().startsWith("http://"),
      responseHeaders: await response.allHeaders().catch(() => ({}))
    });
  });

  try {
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    if (!response) {
      throw new Error("No response received.");
    }

    await stabilizePage(page);

    const html = await page.content();
    const title = await page.title();
    const headers = await response.allHeaders();
    const cookies = await context.cookies([url]);
    const screenshotBuffer = await page.screenshot({ fullPage: true });

    const snapshot = await page.evaluate(() => {
      return {
        links: Array.from(document.querySelectorAll("a[href]")).map((anchor) => {
          if (!(anchor instanceof HTMLAnchorElement)) {
            return "";
          }

          return anchor.href;
        }),
        forms: Array.from(document.forms).map((form) => {
          const controls = Array.from(form.querySelectorAll("input, textarea"));

          return {
            action: form.action && form.action.length > 0 ? form.action : null,
            method: (form.method || "get").toLowerCase(),
            hasPassword: controls.some(
              (element) => element instanceof HTMLInputElement && element.type === "password"
            ),
            autocompleteOff:
              (form.getAttribute("autocomplete") || "").toLowerCase() === "off" ||
              controls.some(
                (element) => (element.getAttribute("autocomplete") || "").toLowerCase() === "off"
              ),
            inputNames: controls.map((element) => {
              if (element instanceof HTMLInputElement) {
                return element.name || element.id || element.type || "unnamed";
              }

              if (element instanceof HTMLTextAreaElement) {
                return element.name || element.id || "textarea";
              }

              return "unnamed";
            })
          };
        }),
        scripts: Array.from(document.scripts).map((script) => ({
          src: script.src || null,
          inlineSnippet: script.src ? null : (script.textContent || "").slice(0, 500),
          containsSourceMapComment: (script.textContent || "").includes("sourceMappingURL=")
        }))
      };
    });

    const pageId = makeId("page");
    const htmlArtifact = await artifactStore.writeTextArtifact({
      scanId: scan.id,
      pageId,
      kind: "html",
      label: "HTML snapshot",
      extension: "html",
      mimeType: "text/html; charset=utf-8",
      text: html
    });
    const screenshotArtifact = await artifactStore.writeBinaryArtifact({
      scanId: scan.id,
      pageId,
      kind: "screenshot",
      label: "Full-page screenshot",
      extension: "png",
      mimeType: "image/png",
      data: Buffer.from(screenshotBuffer)
    });

    const scriptBodies = await fetchSameOriginScripts({
      origin: scan.normalizedOrigin,
      scriptUrls: snapshot.scripts
        .map((script) => script.src)
        .filter((value): value is string => Boolean(value))
        .slice(0, scan.policy.maxScriptsPerPage)
    });

    const reflectionProbe = scan.policy.reflectionProbeEnabled
      ? await probeReflection(url)
      : undefined;

    const pageRecord: PageRecord = {
      id: pageId,
      scanId: scan.id,
      url,
      depth,
      title,
      statusCode: response.status(),
      contentType: headers["content-type"] ?? "unknown",
      headers,
      cookies: mapCookies(cookies),
      links: snapshot.links,
      forms: snapshot.forms,
      scripts: snapshot.scripts,
      consoleMessages,
      networkRequests,
      htmlArtifactId: htmlArtifact.id,
      screenshotArtifactId: screenshotArtifact.id,
      fetchedAt: nowIso()
    };

    const findings = analyzePage({
      page: pageRecord,
      html,
      scriptBodies,
      ...(reflectionProbe ? { reflectionProbe } : {})
    }).map((draft) => createFindingRecord(scan.id, pageId, draft));

    const discoveredLinks = snapshot.links
      .map((candidate) => safeNormalizeWithinOrigin(candidate, scan.normalizedOrigin))
      .filter((candidate): candidate is string => Boolean(candidate));

    return {
      page: pageRecord,
      artifacts: [htmlArtifact, screenshotArtifact],
      findings,
      discoveredLinks
    };
  } finally {
    await page.close();
  }
}

async function fetchSameOriginScripts(input: { origin: string; scriptUrls: string[] }) {
  const bodies: Array<{ sourceUrl: string; body: string }> = [];

  for (const url of input.scriptUrls) {
    if (!url.startsWith(input.origin)) {
      continue;
    }

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "SurfaceIQ/0.1"
        }
      });

      const contentType = response.headers.get("content-type") ?? "";
      if (!response.ok || (!contentType.includes("javascript") && !contentType.includes("text/plain"))) {
        continue;
      }

      const body = await response.text();
      bodies.push({
        sourceUrl: url,
        body: body.slice(0, 200_000)
      });
    } catch {
      continue;
    }
  }

  return bodies;
}

async function probeReflection(url: string): Promise<ReflectionProbeResult> {
  const canary = `surfaceiq_${Math.random().toString(36).slice(2, 10)}`;
  const target = new URL(url);
  target.searchParams.set("surfaceiq_canary", canary);

  try {
    const response = await fetch(target, {
      headers: {
        "User-Agent": "SurfaceIQ/0.1"
      }
    });

    const body = await response.text();
    const reflected = body.includes(canary);

    return {
      canary,
      reflected,
      ...(reflected ? { reflectedInHtmlSnippet: extractSnippet(body, canary) } : {})
    };
  } catch {
    return {
      canary,
      reflected: false
    };
  }
}

async function stabilizePage(page: Page) {
  await page.waitForLoadState("load", { timeout: 12_000 }).catch(() => undefined);
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
  await page.waitForTimeout(800);
}

async function resolveSelector(page: Page, candidates: Array<string | undefined>) {
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    try {
      const locator = page.locator(candidate).first();
      const count = await locator.count();
      if (count > 0) {
        return candidate;
      }
    } catch {
      continue;
    }
  }

  return null;
}

async function verifyLoginSuccess(page: Page, scan: ScanRecord) {
  if (scan.auth.successSelector) {
    const visible = await page
      .locator(scan.auth.successSelector)
      .first()
      .isVisible()
      .catch(() => false);
    if (visible) {
      return true;
    }
  }

  if (scan.auth.successUrlContains && page.url().includes(scan.auth.successUrlContains)) {
    return true;
  }

  if (scan.auth.loginUrl && page.url() !== scan.auth.loginUrl) {
    return true;
  }

  return page.url() !== scan.startUrl;
}

async function captureStepScreenshot(scan: ScanRecord, page: Page, label: string) {
  const screenshot = await page.screenshot({ fullPage: true });
  return artifactStore.writeBinaryArtifact({
    scanId: scan.id,
    kind: "screenshot",
    label,
    extension: "png",
    mimeType: "image/png",
    data: Buffer.from(screenshot)
  });
}

function safeNormalizeWithinOrigin(candidate: string, origin: string): string | null {
  try {
    const url = normalizeUrl(candidate);
    if (url.origin !== origin) {
      return null;
    }

    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function mapCookies(
  cookies: Array<{
    name: string;
    domain: string;
    path: string;
    secure: boolean;
    httpOnly: boolean;
    sameSite?: "Strict" | "Lax" | "None";
  }>
): BrowserCookie[] {
  return cookies.map((cookie) => ({
    name: cookie.name,
    domain: cookie.domain,
    path: cookie.path,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite ?? "Unset"
  }));
}

function extractSnippet(body: string, canary: string): string {
  const index = body.indexOf(canary);
  if (index === -1) {
    return canary;
  }

  const start = Math.max(0, index - 80);
  const end = Math.min(body.length, index + canary.length + 80);
  return body.slice(start, end).replace(/\s+/g, " ").trim();
}

function hostnameFromUrl(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function maskIdentity(value: string) {
  if (value.length <= 3) {
    return "***";
  }

  return `${value.slice(0, 2)}***${value.slice(-1)}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

workerLoop().catch((error) => {
  console.error("SurfaceIQ worker crashed", error);
  process.exitCode = 1;
});

