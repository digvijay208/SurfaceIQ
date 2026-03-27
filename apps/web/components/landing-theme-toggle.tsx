"use client";

import { useEffect, useState } from "react";

type ThemeMode = "dark" | "light";

const STORAGE_KEY = "surfaceiq-landing-theme";

function applyTheme(mode: ThemeMode) {
  document.documentElement.dataset.landingTheme = mode;
}

export function LandingThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>("dark");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const nextMode = stored === "light" ? "light" : "dark";
    setMode(nextMode);
    applyTheme(nextMode);
  }, []);

  function toggleMode() {
    const nextMode = mode === "dark" ? "light" : "dark";
    setMode(nextMode);
    applyTheme(nextMode);
    window.localStorage.setItem(STORAGE_KEY, nextMode);
  }

  return (
    <button
      aria-label={`Switch to ${mode === "dark" ? "light" : "dark"} theme`}
      className="landing-theme-toggle"
      onClick={toggleMode}
      type="button"
    >
      <span className="landing-theme-toggle-track">
        <span className={`landing-theme-toggle-option${mode === "dark" ? " active" : ""}`}>
          Dark
        </span>
        <span className={`landing-theme-toggle-option${mode === "light" ? " active" : ""}`}>
          Light
        </span>
      </span>
      <span className={`landing-theme-toggle-thumb ${mode}`} />
    </button>
  );
}
