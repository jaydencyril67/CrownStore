import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Download, RefreshCw, Smartphone, Wifi } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import type { CrownApp } from "./types";
import type { BridgeSessionRef, BridgeSnapshot, InstalledCatalogueApp } from "./native/deviceBridgeTypes";
import { bridgeFetch, createBridgeSession, readBridgeSnapshot } from "./native/deviceBridge";

type Props = {
  apps: CrownApp[];
  launchSession: BridgeSessionRef | null;
  onConnect: (session: BridgeSessionRef) => void;
  onDownloadApp: (app: CrownApp) => Promise<void>;
};

function version(value: string | number | null | undefined) {
  return value == null || value === "" ? "Unknown" : String(value);
}

export default function DeviceUpdatesPanel({ apps, launchSession, onConnect, onDownloadApp }: Props) {
  const [session, setSession] = useState<BridgeSessionRef | null>(launchSession);
  const [snapshot, setSnapshot] = useState<BridgeSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [working, setWorking] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const autoAttempted = useRef(false);

  useEffect(() => { setSession(launchSession); }, [launchSession?.sessionId, launchSession?.secret]);

  useEffect(() => {
    if (Capacitor.isNativePlatform() || launchSession || autoAttempted.current) return;
    autoAttempted.current = true;
    let cancelled = false;
    const start = async () => {
      try {
        const created = await createBridgeSession();
        if (cancelled) return;
        setSession(created);
        onConnect(created);
        window.location.assign(created.deepLink);
      } catch {
        if (!cancelled) setError("Couldn’t connect automatically.");
      }
    };
    void start();
    return () => { cancelled = true; };
  }, [launchSession?.sessionId, onConnect]);

  useEffect(() => {
    if (!session) { setSnapshot(null); return; }
    let stopped = false;
    let inFlight = false;
    const poll = async () => {
      if (stopped || inFlight) return;
      inFlight = true;
      try {
        const next = await readBridgeSnapshot(session);
        if (!stopped) { setSnapshot(next); setError(""); }
      } catch (caught) {
        if (!stopped) setError("Connection interrupted.");
      } finally { inFlight = false; }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 2200);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [session?.sessionId, session?.secret]);

  async function connect() {
    setBusy(true); setError(""); setMessage("");
    try {
      const created = await createBridgeSession();
      setSession(created);
      onConnect(created);
      if (!Capacitor.isNativePlatform()) {
        window.location.assign(created.deepLink);
      } else {
        setMessage("Scanning…");
      }
    } catch (caught) {
      setError("Couldn’t connect. Please try again.");
    } finally { setBusy(false); }
  }

  async function requestUpdate(item: InstalledCatalogueApp) {
    if (!session || working) return;
    setWorking(item.slug); setError(""); setMessage("");
    try {
      await bridgeFetch(session, "/api/device-bridge/sessions/" + encodeURIComponent(session.sessionId) + "/commands", {
        method: "POST", body: JSON.stringify({ slug: item.slug }),
      });
      setMessage("Update requested.");
      setSnapshot(await readBridgeSnapshot(session));
    } catch (caught) {
      setError("Couldn’t start the update. Please try again.");
    } finally { setWorking(""); }
  }

  const installed = snapshot?.installedApps ?? [];
  const pending = snapshot?.commandStatus === "pending" || snapshot?.commandStatus === "downloading";
  const storeApp = apps.find((app) => app.slug === "crownstore" && app.releaseId);

  return <section id="device-updates" className="device-update-panel glass-panel" aria-labelledby="device-update-title">
    <div className="device-update-heading">
      <span className="device-update-icon"><Smartphone size={20} /></span>
      <div><h2 id="device-update-title">Installed apps &amp; updates</h2></div>
    </div>
    <div className="device-bridge-actions">
      <button className="button button-primary" type="button" onClick={() => void connect()} disabled={busy}>
        {busy ? <><RefreshCw size={16} className="device-spin" /> Connecting…</> :
          <><Wifi size={16} /> {snapshot?.session.status === "connected" ? "Scan again" : "Reconnect"}</>}
      </button>
      {snapshot?.session.status === "connected" && <span className="device-connected"><CheckCircle2 size={15} /> Connected</span>}
    </div>
    {message && <p className="device-feedback" role="status">{message}</p>}
    {error && <p className="device-feedback is-error" role="alert"><AlertCircle size={15} /> {error}</p>}
    {snapshot?.commandStatus && snapshot.commandStatus !== "none" && <p className={"device-command-status " + (snapshot.commandStatus === "failed" ? "is-error" : "")} role="status">
      {snapshot.commandStatus === "pending" ? "Starting update…" :
        snapshot.commandStatus === "downloading" ? "Downloading…" :
        snapshot.commandStatus === "permission-required" ? "Allow installation in Android settings, then try again." :
        snapshot.commandStatus === "install-ready" ? "Confirm installation on your phone." :
        snapshot.commandStatus === "failed" ? "Update failed. Please try again." : "Update complete."}
    </p>}
    {session && snapshot?.session.status === "waiting" && <div className="device-waiting"><span className="loader-ring" /><span>Connecting…</span></div>}
    {session && snapshot?.session.status === "connected" && <div className="device-installed-list">
      <div className="device-list-title"><strong>Recognised installed apps</strong><span>{installed.length}</span></div>
      {installed.length === 0 ? <p className="device-empty">No installed apps on this phone match a listed CrownStore package.</p> :
        installed.map((item) => <div className="device-installed-app" key={item.packageId}>
          <div className="device-installed-icon">{item.iconUrl ? <img src={item.iconUrl} alt="" loading="lazy" /> : <Smartphone size={19} />}</div>
          <div className="device-installed-copy"><strong>{item.name}</strong>
            <small>Installed v{version(item.installedVersionName)} · Latest {item.latestVersionName ? "v" + item.latestVersionName : "—"}</small></div>
          <div className="device-installed-action">
            {item.updateAvailable ? <button className="button button-primary device-update-button" type="button" disabled={Boolean(working) || pending} onClick={() => void requestUpdate(item)}>
              {working === item.slug ? "Sending…" : <><Download size={15} /> Update</>}
            </button> : <span className="device-up-to-date"><CheckCircle2 size={15} /> {item.latestVersionName ? "Up to date" : "No release"}</span>}
          </div>
        </div>)}
    </div>}
    {session && !Capacitor.isNativePlatform() && storeApp && snapshot?.session.status !== "connected" && <button className="button button-outline" type="button" onClick={() => void onDownloadApp(storeApp)}><Download size={16} /> Download CrownStore Android APK</button>}
  </section>;
}
