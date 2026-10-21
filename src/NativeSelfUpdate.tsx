import { useEffect, useState } from "react";
import { Download, RefreshCw, Smartphone } from "lucide-react";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import type { CrownApp } from "./types";
import { API_BASE } from "./native/deviceBridge";
import { NativeAppUpdate } from "./native/nativeAppUpdate";

type Props = {
  apps: CrownApp[];
  onRequestUpdate: (app: CrownApp) => Promise<void>;
};

type UpdateCheck = {
  updateAvailable?: boolean;
  release?: { versionName?: string; versionCode?: number };
  error?: string;
};

export default function NativeSelfUpdate({ apps, onRequestUpdate }: Props) {
  const [latestVersion, setLatestVersion] = useState("");
  const [checking, setChecking] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let stopped = false;
    let inFlight = false;

    const check = async () => {
      if (stopped || inFlight) return;
      inFlight = true;
      setChecking(true);
      try {
        const installed = await NativeAppUpdate.getAppInfo();
        const response = await fetch(API_BASE + "/api/apps/crownstore/update-check?versionCode=" + encodeURIComponent(String(installed.versionCode)));
        if (response.status === 404) {
          if (!stopped) setLatestVersion("");
          return;
        }
        const data = await response.json() as UpdateCheck;
        if (!response.ok) throw new Error(data.error || "CrownStore could not check for its own update.");
        if (!stopped) {
          setLatestVersion(data.updateAvailable ? String(data.release?.versionName || "new version") : "");
          setError("");
        }
      } catch (caught) {
        if (!stopped) setError(caught instanceof Error ? caught.message : "CrownStore update check failed.");
      } finally {
        inFlight = false;
        if (!stopped) setChecking(false);
      }
    };

    void check();
    const timer = window.setInterval(() => void check(), 15 * 60 * 1000);
    const stateHandle = CapacitorApp.addListener("appStateChange", (state) => {
      if (state.isActive) void check();
    });

    return () => {
      stopped = true;
      window.clearInterval(timer);
      void stateHandle.then((handle) => handle.remove()).catch(() => {});
    };
  }, []);

  const app = apps.find((item) => item.slug === "crownstore" && Boolean(item.releaseId));
  if (!Capacitor.isNativePlatform() || !app || !latestVersion) return null;

  return <section className="native-self-update glass-panel" aria-live="polite">
    <span className="native-self-update-icon"><Smartphone size={19} /></span>
    <div className="native-self-update-copy">
      <span className="eyebrow">CROWNSTORE UPDATE AVAILABLE</span>
      <strong>CrownStore {latestVersion}</strong>
      <p>A newer verified CrownStore APK is published. Download it and Android will ask you to approve the installation.</p>
      {error && <small>{error}</small>}
    </div>
    <button className="button button-primary" type="button" disabled={requesting || checking} onClick={() => {
      setRequesting(true);
      void onRequestUpdate(app).finally(() => setRequesting(false));
    }}>
      {requesting ? <><RefreshCw size={15} className="device-spin" /> Starting…</> : <><Download size={15} /> Update CrownStore</>}
    </button>
  </section>;
}
