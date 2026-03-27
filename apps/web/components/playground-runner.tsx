"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

interface PlaygroundRunnerProps {
  prompt: string;
  generatedGoal: string;
  references: string[];
  initialTargetUrl: string;
  isAuthenticated: boolean;
  autoRun: boolean;
}

type AuthMode = "public" | "credentials" | "session";

export function PlaygroundRunner({
  prompt,
  generatedGoal,
  references,
  initialTargetUrl,
  isAuthenticated,
  autoRun
}: PlaygroundRunnerProps) {
  const router = useRouter();
  const [editablePrompt, setEditablePrompt] = useState(prompt);
  const [targetUrl, setTargetUrl] = useState(initialTargetUrl);
  const [authMode, setAuthMode] = useState<AuthMode>("public");
  const [loginUrl, setLoginUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [usernameSelector, setUsernameSelector] = useState("");
  const [passwordSelector, setPasswordSelector] = useState("");
  const [submitSelector, setSubmitSelector] = useState("");
  const [successSelector, setSuccessSelector] = useState("");
  const [successUrlContains, setSuccessUrlContains] = useState("");
  const [sessionCookiesJson, setSessionCookiesJson] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const nextUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set("prompt", editablePrompt.trim() || "security check");
    if (targetUrl.trim()) {
      params.set("target", targetUrl.trim());
    }
    params.set("autorun", "1");
    return `/playground?${params.toString()}`;
  }, [editablePrompt, targetUrl]);

  async function executeRun() {
    if (!targetUrl.trim()) {
      setError("Target URL is required.");
      return;
    }

    if (!isAuthenticated) {
      router.push(`/login?next=${encodeURIComponent(nextUrl)}`);
      return;
    }

    setError(null);

    const response = await fetch("/api/scans", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        startUrl: targetUrl,
        authorizationConfirmed: true,
        auth:
          authMode === "public"
            ? { mode: "public" }
            : authMode === "credentials"
              ? {
                  mode: "credentials",
                  loginUrl: loginUrl || undefined,
                  username,
                  password,
                  usernameSelector: usernameSelector || undefined,
                  passwordSelector: passwordSelector || undefined,
                  submitSelector: submitSelector || undefined,
                  successSelector: successSelector || undefined,
                  successUrlContains: successUrlContains || undefined
                }
              : {
                  mode: "session",
                  loginUrl: loginUrl || undefined,
                  sessionCookiesJson
                }
      })
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(payload?.error ?? "Unable to start scan.");
      return;
    }

    const payload = (await response.json()) as { id: string };
    router.push(`/scans/${payload.id}`);
    router.refresh();
  }

  useEffect(() => {
    if (!autoRun || !isAuthenticated || !targetUrl.trim()) {
      return;
    }

    startTransition(() => {
      void executeRun();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun, isAuthenticated]);

  return (
    <div className="playground-shell">
      <div className="playground-thread">
        <div className="playground-message-label">You</div>
        <div className="playground-user-message">{editablePrompt}</div>

        <div className="playground-message-label">SurfaceIQ</div>
        <div className="playground-response-card">
          <p>{generatedGoal}</p>

          <div className="playground-ref-list">
            {references.map((reference, index) => (
              <div className="playground-ref-item" key={reference}>
                <span className="playground-ref-index">{index + 1}</span>
                <span>{reference}</span>
              </div>
            ))}
          </div>

          <div className="playground-config">
            <label>
              Edit prompt
              <textarea
                className="scan-textarea"
                value={editablePrompt}
                onChange={(event) => setEditablePrompt(event.target.value)}
              />
            </label>

            <label>
              Target URL
              <input
                required
                type="url"
                placeholder="https://example.com"
                value={targetUrl}
                onChange={(event) => setTargetUrl(event.target.value)}
              />
            </label>

            {isAuthenticated ? (
              <div className="auth-scan-panel">
                <div className="scan-mode-grid">
                  <button
                    className={`mode-pill${authMode === "public" ? " active" : ""}`}
                    onClick={() => setAuthMode("public")}
                    type="button"
                  >
                    Public scan
                  </button>
                  <button
                    className={`mode-pill${authMode === "credentials" ? " active" : ""}`}
                    onClick={() => setAuthMode("credentials")}
                    type="button"
                  >
                    Credentials
                  </button>
                  <button
                    className={`mode-pill${authMode === "session" ? " active" : ""}`}
                    onClick={() => setAuthMode("session")}
                    type="button"
                  >
                    Session cookies
                  </button>
                </div>

                {authMode !== "public" ? (
                  <>
                    <label>
                      Login URL
                      <input
                        type="url"
                        placeholder="https://example.com/login"
                        value={loginUrl}
                        onChange={(event) => setLoginUrl(event.target.value)}
                      />
                    </label>

                    {authMode === "credentials" ? (
                      <>
                        <label>
                          Username or email
                          <input value={username} onChange={(event) => setUsername(event.target.value)} />
                        </label>
                        <label>
                          Password
                          <input
                            type="password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                          />
                        </label>
                        <label>
                          Username selector
                          <input
                            value={usernameSelector}
                            onChange={(event) => setUsernameSelector(event.target.value)}
                          />
                        </label>
                        <label>
                          Password selector
                          <input
                            value={passwordSelector}
                            onChange={(event) => setPasswordSelector(event.target.value)}
                          />
                        </label>
                        <label>
                          Submit selector
                          <input
                            value={submitSelector}
                            onChange={(event) => setSubmitSelector(event.target.value)}
                          />
                        </label>
                        <label>
                          Success selector
                          <input
                            value={successSelector}
                            onChange={(event) => setSuccessSelector(event.target.value)}
                          />
                        </label>
                        <label>
                          Success URL contains
                          <input
                            value={successUrlContains}
                            onChange={(event) => setSuccessUrlContains(event.target.value)}
                          />
                        </label>
                      </>
                    ) : (
                      <label>
                        Session cookies JSON
                        <textarea
                          className="scan-textarea"
                          value={sessionCookiesJson}
                          onChange={(event) => setSessionCookiesJson(event.target.value)}
                        />
                      </label>
                    )}
                  </>
                ) : null}
              </div>
            ) : (
              <div className="playground-auth-hint">
                Sign in when you are ready to run. Your prompt and target URL will be preserved.
              </div>
            )}
          </div>

          <div className="playground-actions">
            <button
              className="playground-primary"
              disabled={isPending}
              onClick={() =>
                startTransition(() => {
                  void executeRun();
                })
              }
              type="button"
            >
              {isPending ? "Launching..." : "Run"}
            </button>
            <button
              className="playground-secondary"
              onClick={() => {
                document.querySelector<HTMLTextAreaElement>(".scan-textarea")?.focus();
              }}
              type="button"
            >
              Edit
            </button>
          </div>

          {error ? <div className="status-pill failed">{error}</div> : null}
        </div>
      </div>
    </div>
  );
}
