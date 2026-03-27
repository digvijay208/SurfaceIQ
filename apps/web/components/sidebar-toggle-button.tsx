"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "surfaceiq_sidebar_collapsed";
const ROOT_ATTR = "data-workspace-sidebar";

function applyCollapsedState(collapsed: boolean) {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.setAttribute(ROOT_ATTR, collapsed ? "collapsed" : "expanded");
}

export function SidebarToggleButton() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY) === "1";
    setCollapsed(saved);
    applyCollapsedState(saved);

    return () => {
      document.documentElement.removeAttribute(ROOT_ATTR);
    };
  }, []);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    applyCollapsedState(next);
    window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  }

  return (
    <button
      aria-expanded={!collapsed}
      aria-label={collapsed ? "Show sidebar" : "Hide sidebar"}
      className="sidebar-toggle-button"
      onClick={toggle}
      type="button"
    >
      <span className="sidebar-toggle-lines" />
    </button>
  );
}
