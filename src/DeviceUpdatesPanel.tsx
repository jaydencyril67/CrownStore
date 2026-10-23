import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Download, RefreshCw, Smartphone, Wifi } from "lucide-react";
import type { BridgeSessionRef, BridgeSnapshot, InstalledCatalogueApp } from "./native/deviceBridgeTypes";
import { bridgeFetch, readBridgeSnapshot } from "./native/deviceBridge";

type Props = {
  launchSession: BridgeSessionRef | null;
  onConnect: (session: BridgeSessionRef) => void;
};

function version(value: string | number | null | undefined) {
  return value == null || value === "" ? "Unknown" : String(value);
}

export default function DeviceUpdatesPanel({ launchSession, onConnect }: Props) {
  const [session, setSession] = useState<BridgeSessionRef | null>(launchSession);
  const [snapshot, setSnapshot] = useState<BridgeSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [working, setWorking] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { setSession(launchSession); }, [launchSession?.sessionId, launchSession?.secret]);

  // One click starts a live scan request; the API responds only after Android reports fresh data.
  async function refreshStatus(activeSession: BridgeSessionRef) {
    const next = await bridgeFetch<BridgeSnapshot>(activeSession, "/api/device-bridge/sessions/" + encodeURIComponent(activeSession.sessionId) + "/scan", {
      method: "POST", body: JSON.stringify({}),
    });
    setSnapshot(next);
    setError("");
  }


  async function connect() {
    setBusy(true); setError(""); setMessage("");
    try {
      if (!session) {
        setError("Connect this PWA to CrownStore Android once before scanning.");
        return;
      }
      await refreshStatus(session);
      setMessage("Status refreshed.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn’t fetch device status. Keep CrownStore Android open and try again.");
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

  return <section id="device-updates" className="device-update-panel glass-panel" aria-labelledby="device-update-title">
    <div className="device-update-heading">
      <span className="device-update-icon"><Smartphone size={20} /></span>
      <div><h2 id="device-update-title">Installed apps &amp; updates</h2></div>
    </div>
    <div className="device-bridge-actions">
      <button className="button button-primary" type="button" onClick={() => void connect()} disabled={busy}>
        {busy ? <><RefreshCw size={16} className="device-spin" /> Scanning…</> :
          <><Wifi size={16} /> Scan apps</> }
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
  </section>;
}
