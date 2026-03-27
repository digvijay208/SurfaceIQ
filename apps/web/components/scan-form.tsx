"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type AuthMode = "public" | "credentials" | "session";

export function ScanForm({ requestedBy }: { requestedBy: string }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [authorized, setAuthorized] = useState(true);
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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const queueScan = async () => {
      const response = await fetch("/api/scans", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          startUrl: url,
          requestedBy,
          authorizationConfirmed: authorized,
          auth:
            authMode === "public"
              ? {
                  mode: "public"
                }
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
      setUrl("");
      router.push(`/scans/${payload.id}`);
      router.refresh();
    };

    startTransition(() => {
      void queueScan();
    });
  }

  return (
    <form className="scan-form" onSubmit={handleSubmit}>
      <label>
        Target website
        <input
          required
          type="url"
          inputMode="url"
          placeholder="https://example.com"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
        />
      </label>

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
          Login with credentials
        </button>
        <button
          className={`mode-pill${authMode === "session" ? " active" : ""}`}
          onClick={() => setAuthMode("session")}
          type="button"
        >
          Import session cookies
        </button>
      </div>

      {authMode !== "public" ? (
        <div className="auth-scan-panel">
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
                <input
                  required
                  type="text"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                />
              </label>
              <label>
                Password
                <input
                  required
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              <div className="scan-auth-hint">
                SurfaceIQ will auto-detect common login fields first. Optional selectors help on custom forms.
              </div>
              <label>
                Username selector
                <input
                  type="text"
                  placeholder='input[type="email"]'
                  value={usernameSelector}
                  onChange={(event) => setUsernameSelector(event.target.value)}
                />
              </label>
              <label>
                Password selector
                <input
                  type="text"
                  placeholder='input[type="password"]'
                  value={passwordSelector}
                  onChange={(event) => setPasswordSelector(event.target.value)}
                />
              </label>
              <label>
                Submit selector
                <input
                  type="text"
                  placeholder='button[type="submit"]'
                  value={submitSelector}
                  onChange={(event) => setSubmitSelector(event.target.value)}
                />
              </label>
              <label>
                Success selector
                <input
                  type="text"
                  placeholder=".dashboard, nav [aria-label='Account']"
                  value={successSelector}
                  onChange={(event) => setSuccessSelector(event.target.value)}
                />
              </label>
              <label>
                Success URL contains
                <input
                  type="text"
                  placeholder="/dashboard"
                  value={successUrlContains}
                  onChange={(event) => setSuccessUrlContains(event.target.value)}
                />
              </label>
            </>
          ) : (
            <label>
              Session cookies JSON
              <textarea
                required
                className="scan-textarea"
                placeholder='[{"name":"session","value":"...","domain":"example.com","path":"/"}]'
                value={sessionCookiesJson}
                onChange={(event) => setSessionCookiesJson(event.target.value)}
              />
            </label>
          )}
        </div>
      ) : null}

      <label className="checkbox-row">
        <input
          checked={authorized}
          onChange={(event) => setAuthorized(event.target.checked)}
          type="checkbox"
        />
        <span>I confirm I own this target or have explicit authorization to perform security testing.</span>
      </label>

      <div className="button-row">
        <button className="primary-button" disabled={isPending} type="submit">
          {isPending ? "Queueing scan..." : "Launch browser scan"}
        </button>
        <span className="muted">
          {authMode === "public"
            ? "Public pages only unless you enable authenticated scanning."
            : "Credentials and imported session cookies are encrypted before they are persisted."}
        </span>
      </div>

      {error ? <div className="status-pill failed">{error}</div> : null}
    </form>
  );
}
