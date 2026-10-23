import { useEffect, useState } from "react";
import {
  Bell, Check, Palette, Radio, Settings2, ShieldCheck,
  Smartphone, Sparkles, Zap, Mail
} from "lucide-react";
import {
  BUTTON_COLOR_ENABLED_KEY, BUTTON_COLOR_KEY, DEFAULT_ACCENT,
  EDGE_LIGHT_KEY, EDGE_LIGHT_ENABLED_KEY, EDGE_LIGHT_COLOR_KEY, EDGE_LIGHT_MODE_KEY, EXPAND_MODE_KEY, readNotificationPreferences,
  saveNotificationPreferences, SWIPE_NAVIGATION_KEY,
  type NotificationKind, type NotificationPreferences
} from "./notifications";
import { disableCrownStorePush, enableCrownStorePush, syncCrownStorePushPreferences } from "./pushNotifications";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "https://apicrownstore.kingshall.online").replace(/\/$/, "");

type EdgeMode = "stable-light" | "stable" | "blink-light" | "blink" | "pulse-light" | "pulse" | "color-light" | "color";
type EdgeSettings = { enabled: boolean; color: string; mode: EdgeMode };
const EDGE_MODES: { value: EdgeMode; label: string; detail: string }[] = [
  { value: "stable-light", label: "Steady light", detail: "A clean, still edge" },
  { value: "stable", label: "Steady glow", detail: "A constant colored glow" },
  { value: "blink-light", label: "Blink light", detail: "A soft blinking edge" },
  { value: "blink", label: "Blink glow", detail: "A blinking colored glow" },
  { value: "pulse-light", label: "Pulse light", detail: "A breathing edge light" },
  { value: "pulse", label: "Pulse glow", detail: "A breathing colored glow" },
  { value: "color-light", label: "Rainbow light", detail: "Cycles through edge colors" },
  { value: "color", label: "Rainbow glow", detail: "Cycles through glowing colors" }
];

const NOTIFICATION_GROUPS: { title: string; items: { key: NotificationKind; label: string; detail: string }[] }[] = [
  { title: "Store activity", items: [
    { key: "appUpdates", label: "App releases and updates", detail: "A new stable app release is published to CrownStore." },
    { key: "downloads", label: "Download activity", detail: "A download finishes or needs your attention." }
  ] },
  { title: "Account and service", items: [
    { key: "security", label: "Security notices", detail: "Important sign-in and account-security notices." },
    { key: "storeNotices", label: "CrownStore announcements", detail: "Service changes and important store notices." }
  ] }
];

function hasCrownStoreSession(): boolean {
  try { return Boolean(window.localStorage.getItem("crownstore-profile-token")); } catch { return false; }
}

function getBoolean(key: string, fallback = true): boolean {
  try {
    const stored = window.localStorage.getItem(key);
    return stored === null ? fallback : stored === "true";
  } catch { return fallback; }
}
function readEdge(): EdgeSettings {
  try {
    const saved = JSON.parse(window.localStorage.getItem(EDGE_LIGHT_KEY) || "{}") as Partial<EdgeSettings>;
    const dedicatedMode = window.localStorage.getItem(EDGE_LIGHT_MODE_KEY);
    const validMode = (value: unknown): value is EdgeSettings["mode"] =>
      typeof value === "string" && EDGE_MODES.some((item) => item.value === value);
    const storedMode = validMode(dedicatedMode) ? dedicatedMode : saved.mode;
    const storedColor = window.localStorage.getItem(EDGE_LIGHT_COLOR_KEY) ?? saved.color;
    const storedEnabled = window.localStorage.getItem(EDGE_LIGHT_ENABLED_KEY);
    const mode = validMode(storedMode) ? storedMode : "stable";
    return {
      enabled: storedEnabled === null ? saved.enabled === true : storedEnabled === "true",
      color: typeof storedColor === "string" && /^#[0-9a-f]{6}$/i.test(storedColor) ? storedColor : DEFAULT_ACCENT,
      mode
    };
  } catch { return { enabled: false, color: DEFAULT_ACCENT, mode: "stable" }; }
}
function writeEdge(value: EdgeSettings) {
  try {
    window.localStorage.setItem(EDGE_LIGHT_KEY, JSON.stringify(value));
    window.localStorage.setItem(EDGE_LIGHT_ENABLED_KEY, String(value.enabled));
    window.localStorage.setItem(EDGE_LIGHT_COLOR_KEY, value.color);
    window.localStorage.setItem(EDGE_LIGHT_MODE_KEY, value.mode);
  } catch {}
  window.dispatchEvent(new CustomEvent("crownstore:nowbar-settings-changed", { detail: value }));
}
function writeBoolean(key: string, value: boolean, event = "crownstore:nowbar-settings-changed") {
  try { window.localStorage.setItem(key, String(value)); } catch {}
  window.dispatchEvent(new CustomEvent(event, { detail: { key, value } }));
}

function SettingSwitch({ checked, label, onChange, disabled = false }: {
  checked: boolean; label: string; onChange: (next: boolean) => void; disabled?: boolean;
}) {
  return <button className={"menu-switch" + (checked ? " is-on" : "")} type="button" role="switch"
    aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}>
    <span />
  </button>;
}

function SettingRow({ title, detail, trailing }: { title: string; detail: string; trailing: React.ReactNode }) {
  return <div className="menu-setting-row"><div className="menu-setting-copy"><strong>{title}</strong><span>{detail}</span></div><div className="menu-setting-control">{trailing}</div></div>;
}

export default function MenuPage({ onBack }: { onBack: () => void }) {
  void onBack;
  const [edge, setEdge] = useState<EdgeSettings>(() => readEdge());
  const [buttonColor, setButtonColor] = useState(() => {
    try { const c = window.localStorage.getItem(BUTTON_COLOR_KEY); return c && /^#[0-9a-f]{6}$/i.test(c) ? c : DEFAULT_ACCENT; } catch { return DEFAULT_ACCENT; }
  });
  const [buttonColorEnabled, setButtonColorEnabled] = useState(() => getBoolean(BUTTON_COLOR_ENABLED_KEY, false));
  const [swipeEnabled, setSwipeEnabled] = useState(() => getBoolean(SWIPE_NAVIGATION_KEY, true));
  const [expandEnabled, setExpandEnabled] = useState(() => getBoolean(EXPAND_MODE_KEY, true));
  const [preferences, setPreferences] = useState<NotificationPreferences>(() => readNotificationPreferences());
  const [loggedIn, setLoggedIn] = useState(() => hasCrownStoreSession());
  const [emailDeliveryReady, setEmailDeliveryReady] = useState<boolean | null>(null);
  const [pushDeliveryReady, setPushDeliveryReady] = useState<boolean | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    void fetch(API_BASE + "/api/notifications/capabilities", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to read notification delivery readiness.");
        return await response.json() as { emailConfigured?: boolean; firebaseConfigured?: boolean; webPushConfigured?: boolean };
      })
      .then((data) => {
        if (!active) return;
        setEmailDeliveryReady(data.emailConfigured === true);
        setPushDeliveryReady(data.firebaseConfigured === true || data.webPushConfigured === true);
      })
      .catch(() => {
        if (active) { setEmailDeliveryReady(null); setPushDeliveryReady(null); }
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const refresh = () => {
      setEdge(readEdge());
      setPreferences(readNotificationPreferences());
      setLoggedIn(hasCrownStoreSession());
      try {
        const savedColor = window.localStorage.getItem(BUTTON_COLOR_KEY);
        if (savedColor && /^#[0-9a-f]{6}$/i.test(savedColor)) setButtonColor(savedColor);
        setButtonColorEnabled(getBoolean(BUTTON_COLOR_ENABLED_KEY, false));
        setSwipeEnabled(getBoolean(SWIPE_NAVIGATION_KEY, true));
        setExpandEnabled(getBoolean(EXPAND_MODE_KEY, true));
      } catch {}
    };
    window.addEventListener("storage", refresh);
    window.addEventListener("crownstore:nowbar-settings-changed", refresh);
    window.addEventListener("crownstore:notification-preferences-changed", refresh);
    window.addEventListener("crownstore:profile-session-changed", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("crownstore:nowbar-settings-changed", refresh);
      window.removeEventListener("crownstore:notification-preferences-changed", refresh);
      window.removeEventListener("crownstore:profile-session-changed", refresh);
    };
  }, []);

  const savePreferences = (next: NotificationPreferences) => {
    setPreferences(next);
    saveNotificationPreferences(next);
    setNotice("Your preferences have been saved on this device.");
  };

  const toggleChannel = async (channel: "inApp" | "device" | "email", enabled: boolean) => {
    const token = (() => { try { return window.localStorage.getItem("crownstore-profile-token") || ""; } catch { return ""; } })();
    if (channel === "email" && !token) {
      setNotice("Sign in to CrownStore before enabling email notifications.");
      setLoggedIn(false);
      return;
    }
    if (channel === "device") {
      try {
        if (enabled) await enableCrownStorePush();
        else await disableCrownStorePush(token);
      } catch (caught) {
        setNotice(caught instanceof Error ? caught.message : "CrownStore could not update push notification settings.");
        return;
      }
    }
    const next = { ...preferences, channels: { ...preferences.channels, [channel]: enabled } };
    savePreferences(next);
    if ((channel === "inApp" || channel === "email") && token) {
      try {
        await syncCrownStorePushPreferences(token, undefined, {
          inApp: next.channels.inApp,
          email: next.channels.email
        });
      } catch (caught) {
        setNotice(caught instanceof Error
          ? "Saved on this device, but CrownStore could not sync your account notification channels: " + caught.message
          : "Saved on this device, but account notification channels could not be synced.");
        return;
      }
    }
    if (channel === "device") setNotice(enabled
      ? "Push notifications are enabled for this signed-in KingsHall account."
      : "Push notifications are disabled on this device.");
    else if (channel === "email") setNotice(enabled
      ? "Email notifications are enabled for your signed-in KingsHall account."
      : "Email notifications are disabled for your account.");
  };

  return <section className="menu-page" aria-label="CrownStore menu and preferences">
    <div className="menu-page-heading">
      <div className="app-detail-topbar">
        <span className="app-detail-top-label">MENU</span>
      </div>
      <span className="eyebrow"><Settings2 size={14} /> CROWNSTORE CONTROL CENTER</span>
      <h1>Menu</h1>
      <p>Personalize navigation, lighting and the alerts you receive from CrownStore.</p>
    </div>


    <section className="menu-section">
      <div className="menu-section-heading"><span className="menu-section-icon"><Zap size={18} /></span><div><h2>NowBar lighting</h2><p>Style the edge and navigation buttons.</p></div></div>
      <SettingRow title="Edge lighting" detail="Show a colored light or glow around the NowBar." trailing={<SettingSwitch checked={edge.enabled} label="Enable NowBar edge lighting" onChange={(enabled) => { const next = { ...edge, enabled }; setEdge(next); writeEdge(next); }} />} />
      <SettingRow title="Edge-light color" detail="Choose the accent used by the NowBar edge." trailing={<label className="menu-color-control"><span style={{ background: edge.color }} /><input aria-label="NowBar edge color" type="color" value={edge.color} onChange={(event) => { const next = { ...edge, color: event.target.value }; setEdge(next); writeEdge(next); }} /></label>} />
      <div className="menu-subheading">Lighting behavior</div>
      <div className="menu-mode-list">{EDGE_MODES.map((mode) => <button key={mode.value} type="button" className={"menu-mode-row" + (edge.mode === mode.value ? " is-selected" : "")} aria-pressed={edge.mode === mode.value} onClick={() => { const next = { ...edge, mode: mode.value }; setEdge(next); writeEdge(next); }}><span><strong>{mode.label}</strong><small>{mode.detail}</small></span><span className="menu-radio">{edge.mode === mode.value ? <Check size={12} /> : null}</span></button>)}</div>
      <SettingRow title="NowBar button lighting" detail="Apply the chosen accent color to navigation buttons." trailing={<SettingSwitch checked={buttonColorEnabled} label="Enable NowBar button lighting" onChange={(enabled) => { setButtonColorEnabled(enabled); writeBoolean(BUTTON_COLOR_ENABLED_KEY, enabled, "crownstore:nowbar-settings-changed"); }} />} />
      <SettingRow title="Button-light color" detail="Choose the color used by navigation buttons." trailing={<label className="menu-color-control"><span style={{ background: buttonColor }} /><input aria-label="NowBar button color" type="color" value={buttonColor} onChange={(event) => { setButtonColor(event.target.value); try { window.localStorage.setItem(BUTTON_COLOR_KEY, event.target.value); } catch {} window.dispatchEvent(new CustomEvent("crownstore:nowbar-settings-changed")); }} /></label>} />
    </section>

    <section className="menu-section">
      <div className="menu-section-heading"><span className="menu-section-icon"><Palette size={18} /></span><div><h2>App header lighting</h2><p>Control the light around the CrownStore header.</p></div></div>
      <SettingRow title="Header lighting" detail="Add a subtle colored glow around the app header." trailing={<SettingSwitch checked={preferences.headerLightingEnabled} label="Enable app header lighting" onChange={(enabled) => savePreferences({ ...preferences, headerLightingEnabled: enabled })} />} />
      <SettingRow title="Header-light color" detail="Shared accent for the header glow and notification count." trailing={<label className="menu-color-control"><span style={{ background: preferences.headerLightingColor }} /><input aria-label="Header and notification accent color" type="color" value={preferences.headerLightingColor} onChange={(event) => savePreferences({ ...preferences, headerLightingColor: event.target.value })} /></label>} />
    </section>

    <section className="menu-section">
      <div className="menu-section-heading"><span className="menu-section-icon"><Radio size={18} /></span><div><h2>Navigation behavior</h2><p>Choose how the NowBar responds to touch.</p></div></div>
      <SettingRow title="Expand mode" detail="Allow holding the NowBar to expand its navigation buttons." trailing={<SettingSwitch checked={expandEnabled} label="Enable NowBar expand mode" onChange={(enabled) => { setExpandEnabled(enabled); writeBoolean(EXPAND_MODE_KEY, enabled); }} />} />
      <SettingRow title="Swipe navigation" detail="Swipe left or right on the NowBar title to change pages." trailing={<SettingSwitch checked={swipeEnabled} label="Enable NowBar swipe navigation" onChange={(enabled) => { setSwipeEnabled(enabled); writeBoolean(SWIPE_NAVIGATION_KEY, enabled); }} />} />
    </section>

    <section className="menu-section">
      <div className="menu-section-heading"><span className="menu-section-icon"><Bell size={18} /></span><div><h2>Notification channels</h2><p>Choose where CrownStore alerts may appear.</p></div></div>
      <SettingRow title="In-app notifications" detail="Keep alerts in the CrownStore Notifications page." trailing={<SettingSwitch checked={preferences.channels.inApp} label="Enable in-app notifications" onChange={(enabled) => void toggleChannel("inApp", enabled)} />} />
      <SettingRow title="Device notifications" detail="Receive app releases and CrownStore alerts even when the app or browser is in the background. Sign-in and notification permission are required." trailing={<SettingSwitch checked={preferences.channels.device} label="Enable device notifications" onChange={(enabled) => void toggleChannel("device", enabled)} />} />
      {loggedIn && <SettingRow title="Email notifications" detail="Send enabled CrownStore alert types to the email address on your signed-in KingsHall account." trailing={<SettingSwitch checked={preferences.channels.email} label="Enable email notifications" onChange={(enabled) => void toggleChannel("email", enabled)} />} />}
      <p className="menu-inline-note"><Smartphone size={14} /> Uses Firebase Cloud Messaging in the Android app and Web Push in supported browsers/PWAs. {pushDeliveryReady === false ? "Push delivery is not configured on the CrownStore API yet." : "Push delivery requires the matching Firebase or VAPID setup and device permission."}</p>
      {loggedIn && emailDeliveryReady === false && <p className="menu-inline-note" role="status"><Mail size={14} /> Email notifications are available here, but Resend is not configured on the CrownStore API. Add RESEND_API_KEY and RESEND_FROM_EMAIL to the ApiCrownStore service to deliver email alerts.</p>}
      {loggedIn && emailDeliveryReady === null && <p className="menu-inline-note" role="status"><Mail size={14} /> Email delivery readiness could not be checked. Your signed-in account can still save its email notification preference.</p>}
    </section>

    <section className="menu-section">
      <div className="menu-section-heading"><span className="menu-section-icon"><ShieldCheck size={18} /></span><div><h2>Notification types</h2><p>Turn specific CrownStore alerts on or off.</p></div></div>
      {NOTIFICATION_GROUPS.map((group) => <div key={group.title} className="menu-notification-group"><h3>{group.title}</h3>{group.items.map((item) => <SettingRow key={item.key} title={item.label} detail={item.detail} trailing={<SettingSwitch checked={preferences.types[item.key]} label={"Enable " + item.label} onChange={(enabled) => savePreferences({ ...preferences, types: { ...preferences.types, [item.key]: enabled } })} />} />)}</div>)}
    </section>
    <div className="menu-page-footer"><Sparkles size={14} /> Preferences are saved locally and synced to your signed-in CrownStore account when available.</div>
    {notice && <p className="menu-status" role="status">{notice}<button type="button" onClick={() => setNotice("")} aria-label="Dismiss message">Dismiss</button></p>}
  </section>;
}
