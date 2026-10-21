import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

function RefreshSplashCleanup() {
  useEffect(() => {
    const splash = document.getElementById("crownstore-refresh-splash");
    if (!splash || getComputedStyle(splash).display === "none") {
      splash?.remove();
      return;
    }

    let firstFrame = 0;
    let secondFrame = 0;
    let timeout = 0;
    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        timeout = window.setTimeout(() => splash.remove(), 1400);
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
    <RefreshSplashCleanup />
    <App />
  </React.StrictMode>
);
