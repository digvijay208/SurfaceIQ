"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const SUGGESTIONS = [
  "security check",
  "authenticated app review",
  "login flow validation",
  "public attack surface scan"
];

export function PromptLauncher() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("security check");
  const [isFocused, setIsFocused] = useState(false);

  function openPlayground() {
    router.push(`/playground?prompt=${encodeURIComponent(prompt.trim() || "security check")}`);
  }

  return (
    <div className={`launcher-shell${isFocused ? " focused" : ""}`}>
      <div className="launcher-header">
        <div>
          <div className="launcher-label">Agent instructions</div>
          <div className="launcher-subtitle">Describe the review you want SurfaceIQ to run.</div>
        </div>
        <span className="launcher-status">Ready</span>
      </div>
      <textarea
        className="launcher-textarea"
        onBlur={() => setIsFocused(false)}
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        onFocus={() => setIsFocused(true)}
      />
      <div className="launcher-footer">
        <div className="launcher-suggestions">
          <span className="muted">Try:</span>
          {SUGGESTIONS.map((suggestion) => (
            <button
              className="launcher-chip"
              key={suggestion}
              onClick={() => setPrompt(suggestion)}
              type="button"
            >
              {suggestion}
            </button>
          ))}
        </div>
        <button className="launcher-run" onClick={openPlayground} type="button">
          Run review
        </button>
      </div>
    </div>
  );
}
