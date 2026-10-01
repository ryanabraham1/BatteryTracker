"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "3256-tools-theme";
const CHANGE_EVENT = "tools-theme-change";

function applyTheme(theme: "light" | "dark") {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#101015" : "#f5f6fa");
}

function subscribe(onChange: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const sync = () => {
    let saved: string | null = null;
    try { saved = localStorage.getItem(STORAGE_KEY); } catch { /* Storage can be unavailable. */ }
    applyTheme(saved === "light" || saved === "dark" ? saved : media.matches ? "dark" : "light");
    onChange();
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) sync();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  media.addEventListener("change", sync);
  sync();
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
    media.removeEventListener("change", sync);
  };
}

export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, () => document.documentElement.dataset.theme === "dark", () => false);
  const label = dark ? "Switch to light mode" : "Switch to dark mode";
  return (
    <button type="button" className="theme-toggle" title={label} aria-label={label} aria-pressed={dark}
      onClick={() => {
        const theme = dark ? "light" : "dark";
        applyTheme(theme);
        try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* Keep the session preference. */ }
        window.dispatchEvent(new Event(CHANGE_EVENT));
      }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {dark ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5" /></> : <path d="M20.9 13.1A9 9 0 0 1 10.9 3.1a9 9 0 1 0 10 10Z" />}
      </svg>
    </button>
  );
}
