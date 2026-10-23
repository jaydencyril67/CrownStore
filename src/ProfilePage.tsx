import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { QRCodeSVG } from "qrcode.react";
import {
  ArrowDownToLine, ArrowLeft, CheckCircle2, ChevronRight, Clock3, Download,
  Fingerprint, KeyRound, LogOut, PackageCheck, RefreshCw, ShieldCheck,
  Smartphone, UserRound, X
} from "lucide-react";
import type { CrownApp } from "./types";
import type { NativeInstalledApp } from "./native/nativeAppUpdate";
import { NativeProfileUsage } from "./native/nativeProfileUsage";
import { NativeAppUpdate } from "./native/nativeAppUpdate";
import "./profile.css";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "https://apicrownstore.kingshall.online").replace(/\/$/, "");
const TOKEN_KEY = "crownstore-profile-token";
const USER_KEY = "crownstore-profile-user";
const ACCOUNT_HINT_KEY = "kingshall_account_hint";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ProfileUser = {
  kingsHallId?: string;
  username?: string;
  email?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  profilePicture?: string;
  coverPhoto?: string;
  dateOfBirth?: string;
  gender?: string;
  verificationStatus?: string;
  verifiedAt?: string | null;
  verificationRequestedAt?: string | null;
};

type AuthPayload = {
  token?: string;
  user?: ProfileUser;
  message?: string;
  error?: string;
  status?: string;
  requestId?: string;
  loginCode?: string;
  qrToken?: string;
  expiresAt?: string;
  appName?: string;
};

type ExternalLoginStart = {
  requestId: string;
  loginCode: string;
  qrToken: string;
  expiresAt: string;
  appName: string;
};

type NativeKingsHallAccountPlugin = {
  hasAccounts(): Promise<{ hasAccount?: boolean }>;
  chooseAccount(): Promise<{ email?: string; cancelled?: boolean; noAccount?: boolean }>;
};
const DeviceAccount = registerPlugin<NativeKingsHallAccountPlugin>("KingsHallAccount");

type DownloadHistoryEntry = {
  packageId: string;
  appName: string;
  slug?: string;
  iconUrl?: string | null;
  versionName?: string | null;
  downloadedAt: number;
};

type UsageEntry = {
  packageId: string;
  totalTimeInForeground: number;
  lastTimeUsed: number;
};

type UsagePayload = { permissionRequired?: boolean; apps?: UsageEntry[] };

function readCachedUser(): ProfileUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ProfileUser;
    return parsed && typeof parsed.email === "string" ? parsed : null;
  } catch {
    return null;
  }
}

function readDownloadHistory(): DownloadHistoryEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem("crownstore-downloaded-apps") || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is DownloadHistoryEntry =>
      Boolean(item) && typeof item.packageId === "string" && typeof item.appName === "string" &&
      typeof item.downloadedAt === "number"
    ).slice(0, 100);
  } catch {
    return [];
  }
}

function browserAccountHint(): string {
  const cookie = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("kh_account_hint="));
  if (cookie) {
    try {
      const email = decodeURIComponent(cookie.slice("kh_account_hint=".length)).trim().toLowerCase();
      if (EMAIL_PATTERN.test(email)) {
        localStorage.setItem(ACCOUNT_HINT_KEY, email);
        return email;
      }
    } catch {}
  }
  const email = (localStorage.getItem(ACCOUNT_HINT_KEY) || "").trim().toLowerCase();
  return EMAIL_PATTERN.test(email) ? email : "";
}

function savedBrowserAccounts(): string[] {
  let accounts: string[] = [];
  let removed: string[] = [];
  const removedCookie = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("kh_removed_accounts="));
  if (removedCookie) {
    try {
      const parsed = JSON.parse(decodeURIComponent(removedCookie.slice("kh_removed_accounts=".length)));
      if (Array.isArray(parsed)) removed = parsed.filter((item): item is string => typeof item === "string").map((item) => item.trim().toLowerCase());
    } catch {}
  }
  const savedCookie = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("kh_saved_accounts="));
  if (savedCookie) {
    try {
      const parsed = JSON.parse(decodeURIComponent(savedCookie.slice("kh_saved_accounts=".length)));
      if (Array.isArray(parsed)) accounts = parsed.filter((item): item is string => typeof item === "string" && EMAIL_PATTERN.test(item.trim().toLowerCase())).map((item) => item.trim().toLowerCase());
    } catch {}
  }
  const hint = browserAccountHint();
  if (hint) accounts.push(hint);
  return [...new Set(accounts)].filter((email) => !removed.includes(email)).slice(0, 10);
}

function selectBrowserAccount(email: string) {
  const selected = email.trim().toLowerCase();
  localStorage.setItem(ACCOUNT_HINT_KEY, selected);
  document.cookie = "kh_account_hint=" + encodeURIComponent(selected) + "; Domain=.kingshall.online; Path=/; Max-Age=31536000; Secure; SameSite=Lax";
}

function humanDuration(milliseconds: number): string {
  const minutes = Math.max(0, Math.floor(milliseconds / 60000));
  if (minutes < 60) return minutes + " min";
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) return hours + " hr" + (remainingMinutes ? " " + remainingMinutes + " min" : "");
  const days = Math.floor(hours / 24);
  return days + " d " + (hours % 24) + " hr";
}

function dateLabel(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "Not recorded";
  return new Date(timestamp).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function displayName(user: ProfileUser): string {
  return user.name?.trim() || [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.username || user.email || "KingsHall member";
}

function ProfileAppRow({ app, detail, trailing, onClick }: {
  app: CrownApp;
  detail: string;
  trailing?: string;
  onClick: () => void;
}) {
  return <button className="profile-app-row" type="button" onClick={onClick}>
    <span className="profile-app-icon">{app.iconUrl ? <img src={app.iconUrl} alt="" loading="lazy" /> : <Smartphone size={20} />}</span>
    <span className="profile-app-row-copy"><strong>{app.name}</strong><span>{detail}</span></span>
    <span className="profile-app-row-trailing">{trailing || <ChevronRight size={16} />}</span>
  </button>;
}

function DownloadedAppRow({ entry, catalogueApp, onClick }: {
  entry: DownloadHistoryEntry;
  catalogueApp?: CrownApp;
  onClick: () => void;
}) {
  const icon = catalogueApp?.iconUrl || entry.iconUrl;
  return <button className="profile-app-row" type="button" onClick={onClick}>
    <span className="profile-app-icon">{icon ? <img src={icon} alt="" loading="lazy" /> : <Download size={19} />}</span>
    <span className="profile-app-row-copy"><strong>{entry.appName}</strong><span>{entry.versionName ? "Version " + entry.versionName + " · " : ""}Downloaded {dateLabel(entry.downloadedAt)}</span></span>
    <span className="profile-app-row-trailing"><ChevronRight size={16} /></span>
  </button>;
}

export default function ProfilePage({
  apps,
  isAndroidApp,
  installedApps,
  installedScanStatus,
  installedScanError,
  onRefreshInstalledApps,
  onOpenApp,
  onOpenCrownStoreDetails,
  onBack
}: {
  apps: CrownApp[];
  isAndroidApp: boolean;
  installedApps: Record<string, NativeInstalledApp>;
  installedScanStatus: "checking" | "ready" | "error" | "unsupported";
  installedScanError: string;
  onRefreshInstalledApps: () => void;
  onOpenApp: (app: CrownApp) => void;
  onOpenCrownStoreDetails: () => void;
  onBack: () => void;
}) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || "");
  const [user, setUser] = useState<ProfileUser | null>(() => readCachedUser());
  const [checkingSession, setCheckingSession] = useState(() => Boolean(localStorage.getItem(TOKEN_KEY)));
  const [identity, setIdentity] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showNoAccountModal, setShowNoAccountModal] = useState(false);
  const [browserAccounts, setBrowserAccounts] = useState<string[]>([]);
  const [externalLogin, setExternalLogin] = useState<ExternalLoginStart | null>(null);
  const [externalBusy, setExternalBusy] = useState(false);
  const [externalError, setExternalError] = useState("");
  const [externalNotice, setExternalNotice] = useState("");
  const [downloadHistory, setDownloadHistory] = useState<DownloadHistoryEntry[]>(() => readDownloadHistory());
  const [usage, setUsage] = useState<UsageEntry[]>([]);
  const [usagePermissionRequired, setUsagePermissionRequired] = useState(true);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const returnedEmail = (params.get("kingshall_account") || hashParams.get("kingshall_account") || "").trim().toLowerCase();
    if (EMAIL_PATTERN.test(returnedEmail)) {
      localStorage.setItem(ACCOUNT_HINT_KEY, returnedEmail);
      setIdentity(returnedEmail);
      setNotice("KingsHall account received. Enter its bound Access Code to continue.");
      const cleaned = new URL(window.location.href);
      cleaned.searchParams.delete("kingshall_account");
      if (cleaned.hash.includes("kingshall_account=")) cleaned.hash = "";
      window.history.replaceState({}, "", cleaned.pathname + cleaned.search + cleaned.hash);
    }
  }, []);

  useEffect(() => {
    const refreshHistory = () => setDownloadHistory(readDownloadHistory());
    window.addEventListener("crownstore-download-history-changed", refreshHistory);
    window.addEventListener("storage", refreshHistory);
    return () => {
      window.removeEventListener("crownstore-download-history-changed", refreshHistory);
      window.removeEventListener("storage", refreshHistory);
    };
  }, []);

  useEffect(() => {
    if (!token) {
      setCheckingSession(false);
      setUser(null);
      return;
    }
    let active = true;
    setCheckingSession(true);
    fetch(API_BASE + "/api/auth/profile", {
      method: "GET",
      cache: "no-store",
      headers: { Accept: "application/json", Authorization: "Bearer " + token }
    }).then(async (response) => {
      const data = await response.json().catch(() => ({})) as { user?: ProfileUser; message?: string; error?: string };
      if (!response.ok || !data.user?.email) throw new Error(data.message || data.error || "Your CrownStore session expired. Please sign in again.");
      if (!active) return;
      setUser(data.user);
      try { localStorage.setItem(USER_KEY, JSON.stringify(data.user)); } catch {}
      setError("");
    }).catch((caught: unknown) => {
      if (!active) return;
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      setToken("");
      setUser(null);
      if (caught instanceof Error && !/sign in to crownstore/i.test(caught.message)) setError(caught.message);
    }).finally(() => {
      if (active) setCheckingSession(false);
    });
    return () => { active = false; };
  }, [token]);

  useEffect(() => {
    if (!user || !isAndroidApp) return;
    let active = true;
    let subscription: { remove: () => Promise<void> } | null = null;
    const loadUsage = async () => {
      setUsageLoading(true);
      setUsageError("");
      try {
        if (!Capacitor.isPluginAvailable("NativeProfileUsage")) {
          throw new Error("Usage insights are unavailable in this APK build.");
        }
        const packageIds = [...new Set(apps.map((app) => app.packageId).filter((item) => /^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+$/.test(item)))].slice(0, 250);
        const result: UsagePayload = await NativeProfileUsage.getUsageStats({ packageIds });
        if (!active) return;
        setUsage(Array.isArray(result.apps) ? result.apps : []);
        setUsagePermissionRequired(result.permissionRequired === true);
      } catch (caught) {
        if (active) setUsageError(caught instanceof Error ? caught.message : "Unable to read app usage on this device.");
      } finally {
        if (active) setUsageLoading(false);
      }
    };
    void loadUsage();
    void CapacitorApp.addListener("appStateChange", (state) => {
      if (state.isActive) void loadUsage();
    }).then((handle) => {
      if (active) subscription = handle;
      else void handle.remove();
    }).catch(() => {});
    return () => {
      active = false;
      if (subscription) void subscription.remove();
    };
  }, [user?.kingsHallId, isAndroidApp, apps]);

  const installedCatalogueApps = useMemo(
    () => apps.filter((app) => Boolean(installedApps[app.packageId])),
    [apps, installedApps]
  );
  const updatesNeeded = useMemo(
    () => apps.filter((app) => {
      const installed = installedApps[app.packageId];
      const latest = Number(app.versionCode);
      return Boolean(installed && app.releaseId && app.versionCode != null && Number.isFinite(latest) && latest > installed.versionCode);
    }).sort((a, b) => Number(b.versionCode || 0) - Number(a.versionCode || 0)),
    [apps, installedApps]
  );
  const usageByPackage = useMemo(() => new Map(usage.map((item) => [item.packageId, item])), [usage]);
  const mostUsed = useMemo(
    () => usage.filter((item) => item.totalTimeInForeground > 0)
      .sort((a, b) => b.totalTimeInForeground - a.totalTimeInForeground)
      .map((item) => ({ item, app: apps.find((app) => app.packageId === item.packageId) }))
      .filter((entry): entry is { item: UsageEntry; app: CrownApp } => Boolean(entry.app))
      .slice(0, 6),
    [usage, apps]
  );
  const recentlyUsed = useMemo(
    () => usage.filter((item) => item.lastTimeUsed > 0)
      .sort((a, b) => b.lastTimeUsed - a.lastTimeUsed)
      .map((item) => ({ item, app: apps.find((app) => app.packageId === item.packageId) }))
      .filter((entry): entry is { item: UsageEntry; app: CrownApp } => Boolean(entry.app))
      .slice(0, 6),
    [usage, apps]
  );
  const catalogueCrownStore = apps.find((app) => app.packageId === "online.kingshall.crownstore" || app.slug.toLowerCase() === "crownstore");

  function saveSession(data: AuthPayload) {
    if (!data.token || !data.user?.email || !data.user.kingsHallId) {
      throw new Error("KingsHall did not return a valid CrownStore profile session.");
    }
    localStorage.setItem(TOKEN_KEY, data.token);
    try { localStorage.setItem(USER_KEY, JSON.stringify(data.user)); } catch {}
    setUser(data.user);
    setToken(data.token);
    setIdentity("");
    setAccessCode("");
    setBrowserAccounts([]);
    setExternalLogin(null);
    setError("");
    setNotice("");
  }

  function responseMessage(data: AuthPayload, fallback: string) {
    return data.message || data.error || fallback;
  }

  function redirectToKingsHall() {
    const returnTo = window.location.origin + window.location.pathname + "?profile=1";
    const url = new URL("https://kingshall.online/signin");
    url.searchParams.set("app", "crownstore");
    url.searchParams.set("returnTo", returnTo);
    window.location.assign(url.toString());
  }

  async function startSignin() {
    if (busy) return;
    const startedAt = Date.now();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 150));
      if (Capacitor.isNativePlatform()) {
        if (!Capacitor.isPluginAvailable("KingsHallAccount")) throw new Error("This CrownStore APK needs an update to use the KingsHall account manager.");
        const availability = await DeviceAccount.hasAccounts();
        const remaining = 5000 - (Date.now() - startedAt);
        if (remaining > 0) await new Promise((resolve) => window.setTimeout(resolve, remaining));
        if (!availability.hasAccount) {
          setShowNoAccountModal(true);
          return;
        }
        const selected = await DeviceAccount.chooseAccount();
        if (selected.noAccount) {
          setShowNoAccountModal(true);
          return;
        }
        if (selected.cancelled) {
          setNotice("Account selection was cancelled.");
          return;
        }
        const email = (selected.email || "").trim().toLowerCase();
        if (!EMAIL_PATTERN.test(email)) {
          setShowNoAccountModal(true);
          return;
        }
        setIdentity(email);
        setNotice("KingsHall account detected. Enter its bound Access Code to continue.");
        return;
      }
      const accounts = savedBrowserAccounts();
      const remaining = 5000 - (Date.now() - startedAt);
      if (remaining > 0) await new Promise((resolve) => window.setTimeout(resolve, remaining));
      if (accounts.length) {
        setBrowserAccounts(accounts);
        return;
      }
      setShowNoAccountModal(true);
    } catch (caught) {
      const remaining = 5000 - (Date.now() - startedAt);
      if (remaining > 0) await new Promise((resolve) => window.setTimeout(resolve, remaining));
      setError(caught instanceof Error ? caught.message : "Unable to select a KingsHall account.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyAccessCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !identity || accessCode.length !== 6) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(API_BASE + "/api/auth/kingshall/access-code", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ identity, accessCode })
      });
      const data = await response.json().catch(() => ({})) as AuthPayload;
      if (!response.ok) throw new Error(responseMessage(data, "KingsHall could not verify this Access Code."));
      saveSession(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to sign in. Please try again.");
    } finally {
      setBusy(false);
      setAccessCode("");
    }
  }

  async function startExternalLogin() {
    if (externalBusy || busy) return;
    setExternalBusy(true);
    setExternalError("");
    setExternalNotice("");
    try {
      const agent = navigator.userAgent;
      const deviceLabel = /Windows/i.test(agent) ? "Windows browser"
        : /Macintosh|Mac OS/i.test(agent) ? "Mac browser"
        : /Android/i.test(agent) ? "Android browser"
        : /iPhone|iPad/i.test(agent) ? "Apple mobile browser" : "External browser";
      const response = await fetch(API_BASE + "/api/auth/kingshall/external/request", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ deviceLabel })
      });
      const data = await response.json().catch(() => ({})) as AuthPayload;
      if (!response.ok || !data.requestId || !data.loginCode || !data.qrToken || !data.expiresAt) {
        throw new Error(responseMessage(data, "Unable to start external-device sign-in."));
      }
      setExternalLogin({
        requestId: data.requestId,
        loginCode: data.loginCode,
        qrToken: data.qrToken,
        expiresAt: data.expiresAt,
        appName: "CrownStore"
      });
    } catch (caught) {
      setExternalError(caught instanceof Error ? caught.message : "Unable to start external-device sign-in.");
    } finally {
      setExternalBusy(false);
    }
  }

  async function cancelExternalLogin() {
    if (!externalLogin) return;
    const request = externalLogin;
    setExternalLogin(null);
    setExternalBusy(true);
    setExternalError("");
    try {
      const response = await fetch(API_BASE + "/api/auth/kingshall/external/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ requestId: request.requestId })
      });
      const data = await response.json().catch(() => ({})) as AuthPayload;
      if (!response.ok) throw new Error(responseMessage(data, "Unable to cancel external sign-in."));
      setExternalNotice("External sign-in cancelled.");
    } catch (caught) {
      setExternalError(caught instanceof Error ? caught.message : "Unable to cancel external sign-in.");
    } finally {
      setExternalBusy(false);
    }
  }

  useEffect(() => {
    if (!externalLogin?.requestId) return;
    let stopped = false;
    let timer: number | undefined;
    let expiryTimer: number | undefined;
    const requestId = externalLogin.requestId;
    const expire = () => {
      if (stopped) return;
      stopped = true;
      if (timer !== undefined) window.clearTimeout(timer);
      setExternalLogin(null);
      setExternalNotice("");
      setExternalError("This external sign-in request expired. Start again.");
    };
    const expiresAt = new Date(externalLogin.expiresAt).getTime();
    if (Number.isFinite(expiresAt)) expiryTimer = window.setTimeout(expire, Math.max(0, expiresAt - Date.now()));
    const poll = async () => {
      try {
        const response = await fetch(API_BASE + "/api/auth/kingshall/external/status", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ requestId })
        });
        const data = await response.json().catch(() => ({})) as AuthPayload;
        if (stopped) return;
        if (!response.ok) {
          if ([400, 401, 404, 409, 410, 423].includes(response.status)) {
            setExternalLogin(null);
            setExternalError(responseMessage(data, "This external sign-in request is no longer valid."));
            return;
          }
        } else if (data.status === "authenticated") {
          setExternalLogin(null);
          try { saveSession(data); }
          catch (caught) { setExternalError(caught instanceof Error ? caught.message : "Could not complete the approved sign-in."); }
          return;
        } else if (["denied", "expired", "consumed"].includes(String(data.status || ""))) {
          setExternalLogin(null);
          setExternalError(data.status === "denied" ? "The external sign-in request was denied." : "This external sign-in request expired. Start again.");
          return;
        }
      } catch {
        // Keep checking through temporary network failures until the request expires.
      }
      if (!stopped) timer = window.setTimeout(() => { void poll(); }, 1800);
    };
    timer = window.setTimeout(() => { void poll(); }, 1200);
    return () => {
      stopped = true;
      if (timer !== undefined) window.clearTimeout(timer);
      if (expiryTimer !== undefined) window.clearTimeout(expiryTimer);
    };
  }, [externalLogin?.requestId]);

  function signOut() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken("");
    setUser(null);
    setIdentity("");
    setAccessCode("");
    setError("");
    setNotice("");
    setExternalLogin(null);
    setBrowserAccounts([]);
  }

  async function openUsageSettings() {
    try {
      if (!Capacitor.isPluginAvailable("NativeProfileUsage")) throw new Error("Usage access settings are unavailable in this APK build.");
      await NativeProfileUsage.openUsageAccessSettings();
    } catch (caught) {
      setUsageError(caught instanceof Error ? caught.message : "Could not open Android usage access settings.");
    }
  }

  async function refreshUsage() {
    setUsageLoading(true);
    setUsageError("");
    try {
      const packageIds = [...new Set(apps.map((app) => app.packageId).filter((item) => /^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+$/.test(item)))].slice(0, 250);
      const result = await NativeProfileUsage.getUsageStats({ packageIds });
      setUsage(Array.isArray(result.apps) ? result.apps : []);
      setUsagePermissionRequired(result.permissionRequired === true);
    } catch (caught) {
      setUsageError(caught instanceof Error ? caught.message : "Unable to refresh usage insights.");
    } finally {
      setUsageLoading(false);
    }
  }

  const glassTitle = user ? displayName(user) : "Sign in to CrownStore";
  const profilePhoto = user?.profilePicture || "";
  const safePhoto = profilePhoto.startsWith("https://") || profilePhoto.startsWith("data:image/") ? profilePhoto : "";
  const downloadedEntries = downloadHistory.slice(0, 8);
  const initials = displayName(user || {}).split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "K";

  return <section className="profile-page" aria-labelledby="profile-page-title">
    <div className="profile-page-topbar">
      <button className="profile-back" type="button" onClick={onBack} aria-label="Back to CrownStore"><ArrowLeft size={18} /></button>
      <span>PROFILE</span>
      {user && <button className="profile-signout" type="button" onClick={signOut}><LogOut size={15} /> Sign out</button>}
    </div>

    {!user ? <div className="profile-auth-layout">
      <section className="profile-auth-panel" aria-labelledby="profile-page-title">
        <span className="profile-auth-emblem"><ShieldCheck size={26} /></span>
        <h1 id="profile-page-title">{identity ? "Confirm your KingsHall account" : "Sign in to CrownStore"}</h1>
        <p className="profile-auth-description">{identity || "Continue with your KingsHall account to view your profile."}</p>

        {!identity && browserAccounts.length > 0 && <div className="profile-saved-accounts">
          <strong>Saved KingsHall accounts</strong>
          {browserAccounts.map((email) => <button type="button" key={email} onClick={() => {
            selectBrowserAccount(email);
            setIdentity(email);
            setError("");
            setNotice("KingsHall account selected. Enter its bound Access Code to continue.");
          }}>{email}<KeyRound size={16} /></button>)}
        </div>}

        {!identity && browserAccounts.length === 0 && <div className="profile-key-action">
          <button type="button" className="profile-key-button" onClick={() => void startSignin()} disabled={busy} aria-label="Sign in with KingsHall">
            {busy ? <span className="profile-spinner" /> : <KeyRound size={28} />}
          </button>
          <strong>{busy ? "Checking accounts…" : "Sign in with KingsHall"}</strong>
        </div>}

        {identity && <form className="profile-access-form" onSubmit={verifyAccessCode}>
          <label htmlFor="crownstore-access-code">Bound six-digit Access Code</label>
          <input id="crownstore-access-code" value={accessCode} onChange={(event) => setAccessCode(event.target.value.replace(/\D/g, "").slice(0, 6))} type="password" inputMode="numeric" autoComplete="off" placeholder="••••••" minLength={6} maxLength={6} pattern="[0-9]{6}" required />
          <button className="profile-primary-button" type="submit" disabled={busy || accessCode.length !== 6}>{busy ? <span className="profile-spinner" /> : "Verify and continue"}</button>
          <button className="profile-text-button" type="button" onClick={() => { setIdentity(""); setAccessCode(""); setError(""); setNotice(""); }}>Cancel request</button>
        </form>}

        {checkingSession && <p className="profile-notice" role="status">Restoring your CrownStore session…</p>}
        {notice && <p className="profile-notice" role="status">{notice}</p>}
        {error && <p className="profile-error" role="alert">{error}</p>}
        <p className="profile-auth-footnote">Your KingsHall Access Code is verified securely. CrownStore does not store it.</p>
        <p className="profile-kingshall-link">Need an account? <button className="profile-text-button" type="button" onClick={redirectToKingsHall}>Open KingsHall</button></p>
      </section>

      <section className="profile-external-panel">
        <div className="profile-external-heading"><span><Fingerprint size={18} /></span><div><h2>Signing in on another device?</h2><p>Approve CrownStore from your signed-in KingsHall account.</p></div></div>
        {!externalLogin && <button className="profile-secondary-button" type="button" disabled={busy || externalBusy} onClick={() => void startExternalLogin()}>{externalBusy ? <span className="profile-spinner" /> : <KeyRound size={16} />} Use external-device sign-in</button>}
        {externalNotice && <p className="profile-notice" role="status">{externalNotice}</p>}
        {externalError && <p className="profile-error" role="alert">{externalError}</p>}
        {externalLogin && <>
          <p className="profile-external-help">Scan this QR code in KingsHall, or enter the code in External Login. It expires in five minutes.</p>
          <div className="profile-qr"><QRCodeSVG value={JSON.stringify({ type: "kingshall-external-login-v1", requestId: externalLogin.requestId, qrToken: externalLogin.qrToken, appName: "CrownStore" })} size={174} level="M" includeMargin /></div>
          <span className="profile-one-time-label">ONE-TIME LOGIN CODE</span>
          <strong className="profile-one-time-code">{externalLogin.loginCode}</strong>
          <p className="profile-external-help">Waiting for approval from KingsHall…</p>
          <button className="profile-text-button" type="button" disabled={externalBusy} onClick={() => void cancelExternalLogin()}>Cancel external sign-in</button>
        </>}
      </section>
    </div> : <div className="profile-content">
      <section className="profile-identity">
        <div className="profile-avatar">{safePhoto ? <img src={safePhoto} alt="" /> : <span>{initials}</span>}</div>
        <div className="profile-identity-copy">
          <span className="profile-eyebrow">KINGSHALL ACCOUNT</span>
          <h1 id="profile-page-title">{glassTitle}</h1>
          {user.username && <p className="profile-username">@{user.username}</p>}
          <p className="profile-email">{user.email}</p>
          <span className={"profile-verification " + (user.verificationStatus === "verified" ? "is-verified" : "")}>
            {user.verificationStatus === "verified" ? <><CheckCircle2 size={14} /> KingsHall verified</> : <><ShieldCheck size={14} /> {user.verificationStatus === "pending" ? "Verification pending" : "KingsHall account"}</>}
          </span>
        </div>
      </section>

      <section className="profile-section profile-account-details">
        <div className="profile-section-heading"><h2>Account details</h2><span>Synced with KingsHall</span></div>
        <div className="profile-detail-list">
          <div><span>Full name</span><strong>{displayName(user)}</strong></div>
          <div><span>Email</span><strong>{user.email || "Not provided"}</strong></div>
          <div><span>Username</span><strong>{user.username ? "@" + user.username : "Not set"}</strong></div>
          <div><span>Verification</span><strong>{user.verificationStatus === "verified" ? "Verified" : user.verificationStatus === "pending" ? "Pending review" : "Not verified"}</strong></div>
        </div>
      </section>

      {!isAndroidApp ? <section className="profile-manage-apps">
        <span className="profile-manage-icon"><Smartphone size={24} /></span>
        <div className="profile-manage-copy"><h2>Manage your apps on the CrownStore app</h2><p>Check installed apps, available updates and Android app activity on your device.</p></div>
        <button className="profile-primary-button profile-manage-button" type="button" onClick={onOpenCrownStoreDetails}><ArrowDownToLine size={17} /> View CrownStore app <ChevronRight size={16} /></button>
      </section> : <>
        <section className="profile-stat-grid" aria-label="CrownStore summary">
          <div><span>Installed</span><strong>{installedScanStatus === "ready" ? installedCatalogueApps.length : "—"}</strong></div>
          <div><span>Updates</span><strong>{installedScanStatus === "ready" ? updatesNeeded.length : "—"}</strong></div>
          <div><span>Downloads</span><strong>{downloadHistory.length}</strong></div>
          <div><span>Listed apps</span><strong>{apps.length}</strong></div>
        </section>

        <section className="profile-section">
          <div className="profile-section-heading"><h2>Apps needing updates</h2><span>{updatesNeeded.length}</span></div>
          {installedScanStatus === "checking" ? <p className="profile-empty">Checking installed apps…</p>
            : installedScanStatus === "error" ? <div className="profile-inline-error"><span>{installedScanError || "Installed apps could not be checked."}</span><button type="button" onClick={onRefreshInstalledApps}>Retry</button></div>
            : updatesNeeded.length ? <div className="profile-app-list">{updatesNeeded.map((app) => <ProfileAppRow key={app.packageId} app={app} detail={"Installed " + (installedApps[app.packageId]?.versionName || "version unknown") + " · Latest " + (app.versionName || "new release")} trailing="Update" onClick={() => onOpenApp(app)} />)}</div>
            : <p className="profile-empty">You're up to date. No installed CrownStore apps need an update.</p>}
        </section>

        <section className="profile-section">
          <div className="profile-section-heading"><h2>Installed KingsHall apps</h2><span>{installedCatalogueApps.length}</span></div>
          {installedScanStatus === "checking" ? <p className="profile-empty">Checking installed apps…</p>
            : installedScanStatus === "error" ? <p className="profile-empty">Installed app details are temporarily unavailable.</p>
            : installedCatalogueApps.length ? <div className="profile-app-list">{installedCatalogueApps.map((app) => <ProfileAppRow key={app.packageId} app={app} detail={"Version " + (installedApps[app.packageId]?.versionName || "unknown")} trailing={updatesNeeded.some((item) => item.packageId === app.packageId) ? "Update" : "Installed"} onClick={() => onOpenApp(app)} />)}</div>
            : <p className="profile-empty">No listed KingsHall apps are installed on this device yet.</p>}
        </section>

        <section className="profile-section">
          <div className="profile-section-heading"><h2>Downloaded in CrownStore</h2><span>{downloadHistory.length}</span></div>
          {downloadedEntries.length ? <div className="profile-app-list">{downloadedEntries.map((entry) => {
            const app = apps.find((item) => item.packageId === entry.packageId || item.slug === entry.slug);
            return <DownloadedAppRow key={entry.packageId} entry={entry} catalogueApp={app} onClick={() => app ? onOpenApp(app) : undefined} />;
          })}</div> : <p className="profile-empty">Apps you download through CrownStore will appear here.</p>}
        </section>

        <section className="profile-section">
          <div className="profile-section-heading"><h2>Most used apps</h2><span>Last 30 days</span></div>
          {usagePermissionRequired ? <div className="profile-permission-prompt"><div><strong>Enable app usage access</strong><p>Android keeps this private until you allow usage access in system settings.</p></div><button className="profile-secondary-button" type="button" onClick={() => void openUsageSettings()}><Smartphone size={16} /> Enable access</button></div>
            : usageLoading ? <p className="profile-empty">Loading app activity…</p>
            : usageError ? <div className="profile-inline-error"><span>{usageError}</span><button type="button" onClick={() => void refreshUsage()}>Retry</button></div>
            : mostUsed.length ? <div className="profile-app-list">{mostUsed.map(({ item, app }) => <ProfileAppRow key={item.packageId} app={app} detail={humanDuration(item.totalTimeInForeground) + " in foreground"} onClick={() => onOpenApp(app)} />)}</div>
            : <p className="profile-empty">There isn't enough usage history to rank your apps yet.</p>}
          {!usagePermissionRequired && <button className="profile-refresh-usage" type="button" onClick={() => void refreshUsage()} disabled={usageLoading}><RefreshCw size={14} /> {usageLoading ? "Refreshing…" : "Refresh usage"}</button>}
        </section>

        <section className="profile-section">
          <div className="profile-section-heading"><h2>Recently used</h2><span>Last 30 days</span></div>
          {usagePermissionRequired ? <p className="profile-empty">Enable app usage access to see your recent app activity.</p>
            : recentlyUsed.length ? <div className="profile-app-list">{recentlyUsed.map(({ item, app }) => <ProfileAppRow key={item.packageId} app={app} detail={"Last used " + dateLabel(item.lastTimeUsed)} trailing={<Clock3 size={15} />} onClick={() => onOpenApp(app)} />)}</div>
            : <p className="profile-empty">Recent app activity will appear here when Android has usage history.</p>}
        </section>
      </>}
      <div className="profile-signout-bottom"><button className="profile-text-button" type="button" onClick={signOut}><LogOut size={15} /> Sign out of CrownStore</button></div>
    </div>}

    {showNoAccountModal && <div className="profile-modal-backdrop" role="presentation" onClick={() => setShowNoAccountModal(false)}>
      <section className="profile-no-account-modal" role="alertdialog" aria-modal="true" aria-labelledby="profile-no-account-title" onClick={(event) => event.stopPropagation()}>
        <span className="profile-auth-emblem"><KeyRound size={23} /></span>
        <h2 id="profile-no-account-title">No KingsHall account found</h2>
        <p>Sign in to KingsHall first, then return to CrownStore.</p>
        <button className="profile-primary-button" type="button" onClick={redirectToKingsHall}>Sign in to KingsHall</button>
        <button className="profile-text-button" type="button" onClick={() => setShowNoAccountModal(false)}><X size={15} /> Cancel</button>
      </section>
    </div>}
    {checkingSession && user && <span className="profile-session-refreshing" role="status">Refreshing profile…</span>}
  </section>;
}
