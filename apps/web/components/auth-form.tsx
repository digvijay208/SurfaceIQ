"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function AuthForm({ mode, nextPath }: { mode: "login" | "signup"; nextPath?: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const showcaseMode = process.env.NEXT_PUBLIC_SURFACEIQ_SHOWCASE_MODE === "1";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(() => {
      void (async () => {
        const response = await fetch(`/api/auth/${mode}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            name,
            email,
            password
          })
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          setError(payload?.error ?? `Unable to ${mode}.`);
          return;
        }

        router.push(nextPath || "/");
        router.refresh();
      })();
    });
  }

  return (
    <div className="auth-shell">
      <div className="auth-panel">
        <div className="auth-brand">
          <span className="workspace-brand-mark">S</span>
          <div>
            <strong>SurfaceIQ</strong>
            <div className="muted">Authorized browser security workspace</div>
          </div>
        </div>
        <h1>{mode === "login" ? "Sign in to your workspace" : "Create your SurfaceIQ account"}</h1>
        <p className="muted">
          {mode === "login"
            ? "Each account only sees its own scans, artifacts, and run evidence."
            : "Your scans, credentials, artifacts, and results stay scoped to your account."}
        </p>

        {showcaseMode ? (
          <div className="auth-cta-stack">
            <p className="muted">
              This Vercel deployment is currently running in showcase mode while the global backend is
              being migrated. Account creation and live scans will be enabled in the production pass.
            </p>
            <Link className="primary-button" href="/">
              Back to homepage
            </Link>
          </div>
        ) : (
          <form className="scan-form" onSubmit={handleSubmit}>
            {mode === "signup" ? (
              <label>
                Name
                <input
                  required
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
            ) : null}

            <label>
              Email
              <input
                required
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>

            <label>
              Password
              <input
                required
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>

            <button className="primary-button" disabled={isPending} type="submit">
              {isPending
                ? mode === "login"
                  ? "Signing in..."
                  : "Creating account..."
                : mode === "login"
                  ? "Sign in"
                  : "Create account"}
            </button>
          </form>
        )}

        {error ? <div className="status-pill failed">{error}</div> : null}

        <div className="auth-footer-link">
          {mode === "login" ? (
            <>
              Need an account? <Link href={nextPath ? `/signup?next=${encodeURIComponent(nextPath)}` : "/signup"}>Sign up</Link>
            </>
          ) : (
            <>
              Already have an account? <Link href={nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login"}>Sign in</Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
