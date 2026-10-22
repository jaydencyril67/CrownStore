import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

function GlobalInteractionRules() {
  useEffect(() => {
    const preventBrowserContextMenu = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('input, textarea, select, option, [contenteditable="true"], [data-allow-context-menu="true"]')) return;
      event.preventDefault();
    };

    document.addEventListener("contextmenu", preventBrowserContextMenu);
    return () => document.removeEventListener("contextmenu", preventBrowserContextMenu);
  }, []);

  return null;
}

function PwaServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // CrownStore remains usable in the browser if service-worker registration is unavailable.
      });
    }
  }, []);

  return null;
}

declare global {
  interface Window {
    __crownStoreRefreshSplash?: boolean;
  }
}

function RefreshSplashCleanup() {
  useEffect(() => {
    const splash = document.getElementById("crownstore-refresh-splash");
    if (!splash || window.__crownStoreRefreshSplash !== true) {
      splash?.remove();
      return;
    }

    let firstFrame = 0;
    let secondFrame = 0;
    let timeout = 0;
    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        timeout = window.setTimeout(() => splash.remove(), 3000);
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      window.clearTimeout(timeout);
    };
  }, []);

  return null;
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <GlobalInteractionRules />
    <PwaServiceWorker />
    <RefreshSplashCleanup />
    <App />
  </React.StrictMode>
);
