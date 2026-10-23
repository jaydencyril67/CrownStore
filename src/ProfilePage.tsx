import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { QRCodeSVG } from "qrcode.react";
import {
  ArrowDownToLine, ArrowLeft, CheckCircle2, ChevronRight, Clock3, Download,
  Fingerprint, KeyRound, LogOut, RefreshCw, ShieldCheck,
  Smartphone, X
} from "lucide-react";
import type { CrownApp } from "./types";
import type { NativeInstalledApp } from "./native/nativeAppUpdate";
import { NativeProfileUsage } from "./native/nativeProfileUsage";
import "./profile.css";
import VerificationBadge from "./VerificationBadge";

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
  requiresExtraSecurity?: boolean;
  challengeToken?: string;
  methods?: Array<"2fa" | "biometric">;
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
type NativeWebAuthnPlugin = {
  create(options: { options: string }): Promise<{ responseJson: string }>;
  get(options: { options: string }): Promise<{ responseJson: string }>;
};
const NativeWebAuthn = registerPlugin<NativeWebAuthnPlugin>("NativeWebAuthn");

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = window.atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function bytesToBase64Url(value: ArrayBuffer): string {
  let binary = "";
  new Uint8Array(value).forEach((byte) => { binary += String.fromCharCode(byte); });
  return window.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function authenticateCrownStorePasskey(options: Record<string, any>): Promise<Record<string, any>> {
  if (Capacitor.getPlatform() === "android" && Capacitor.isPluginAvailable("NativeWebAuthn")) {
    const result = await NativeWebAuthn.get({ options: JSON.stringify(options) });
    try {
      return JSON.parse(result.responseJson) as Record<string, any>;
    } catch {
      throw new Error("Android returned an invalid passkey response.");
    }
  }

  if (!window.PublicKeyCredential || !navigator.credentials) {
    throw new Error("Passkey sign-in is not supported in this browser. Choose the authenticator code or external-device sign-in instead.");
  }
  const publicKey: PublicKeyCredentialRequestOptions = {
    ...options,
    challenge: base64UrlToBytes(String(options.challenge)).buffer as ArrayBuffer,
    allowCredentials: (Array.isArray(options.allowCredentials) ? options.allowCredentials : []).map((credential: Record<string, any>) => ({
      ...credential,
      type: "public-key" as const,
      id: base64UrlToBytes(String(credential.id)).buffer as ArrayBuffer
    }))
  };
  const credential = await navigator.credentials.get({ publicKey }) as PublicKeyCredential | null;
  if (!credential) throw new Error("Passkey authentication was cancelled.");
  const response = credential.response as AuthenticatorAssertionResponse;
  return {
    id: credential.id,
    rawId: bytesToBase64Url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: bytesToBase64Url(response.clientDataJSON),
      authenticatorData: bytesToBase64Url(response.authenticatorData),
      signature: bytesToBase64Url(response.signature),
      userHandle: response.userHandle ? bytesToBase64Url(response.userHandle) : null
    },
    clientExtensionResults: credential.getClientExtensionResults()
  };
}


async function createCrownStorePasskey(options: Record<string, any>): Promise<Record<string, any>> {
  if (Capacitor.getPlatform() === "android") {
    if (!Capacitor.isPluginAvailable("NativeWebAuthn")) {
      throw new Error("This CrownStore APK needs its native passkey registration bridge updated.");
    }
    const result = await NativeWebAuthn.create({ options: JSON.stringify(options) });
    try { return JSON.parse(result.responseJson) as Record<string, any>; }
    catch { throw new Error("Android returned an invalid passkey registration response."); }
  }
  if (!window.PublicKeyCredential || !navigator.credentials) {
    throw new Error("Passkey registration is not supported in this browser. Use a supported browser or the CrownStore APK.");
  }
  // The options are supplied by KingsHall at runtime; TS cannot infer required WebAuthn
  // members (rp and pubKeyCredParams) from a spread Record<string, any>.
  const publicKey = {
    ...options,
    rp: options.rp,
    pubKeyCredParams: options.pubKeyCredParams,
    challenge: base64UrlToBytes(String(options.challenge)).buffer as ArrayBuffer,
    user: {
      ...options.user,
      id: base64UrlToBytes(String(options.user?.id)).buffer as ArrayBuffer
    },
    excludeCredentials: (Array.isArray(options.excludeCredentials) ? options.excludeCredentials : []).map((credential: Record<string, any>) => ({
      ...credential,
      type: "public-key" as const,
      id: base64UrlToBytes(String(credential.id)).buffer as ArrayBuffer
    }))
  } as unknown as PublicKeyCredentialCreationOptions;
  if (!publicKey.rp || !Array.isArray(publicKey.pubKeyCredParams) || !publicKey.pubKeyCredParams.length) {
    throw new Error("KingsHall returned incomplete passkey registration options. Refresh and try again.");
  }
  const credential = await navigator.credentials.create({ publicKey }) as PublicKeyCredential | null;
  if (!credential) throw new Error("Passkey registration was cancelled.");
  const response = credential.response as AuthenticatorAttestationResponse;
  return {
    id: credential.id,
    rawId: bytesToBase64Url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: bytesToBase64Url(response.clientDataJSON),
      attestationObject: bytesToBase64Url(response.attestationObject),
      transports: response.getTransports?.() || []
    },
    clientExtensionResults: credential.getClientExtensionResults()
  };
}

type ProfileSecurityStatus = {
  twoFactor: { configured: boolean; enabled: boolean; pending?: boolean };
  biometric: { configured: boolean; enabled: boolean; credentialCount: number; credentials?: Array<{ id: string; createdAt?: string | null }> };
};

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
  trailing?: ReactNode;
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
  const [challengeToken, setChallengeToken] = useState("");
  const [extraMethods, setExtraMethods] = useState<Array<"2fa" | "biometric">>([]);
  const [extraMethod, setExtraMethod] = useState<"2fa" | "biometric" | "">("");
  const [extraCode, setExtraCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [checkingAccounts, setCheckingAccounts] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showNoAccountModal, setShowNoAccountModal] = useState(false);
  const [browserAccounts, setBrowserAccounts] = useState<string[]>([]);
  const [externalLogin, setExternalLogin] = useState<ExternalLoginStart | null>(null);
  const [externalBusy, setExternalBusy] = useState(false);
  const [externalError, setExternalError] = useState("");
  const [externalNotice, setExternalNotice] = useState("");
  const [externalSecondsRemaining, setExternalSecondsRemaining] = useState(300);
  const [downloadHistory, setDownloadHistory] = useState<DownloadHistoryEntry[]>(() => readDownloadHistory());
  const [usage, setUsage] = useState<UsageEntry[]>([]);
  const [usagePermissionRequired, setUsagePermissionRequired] = useState(true);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState("");
  const [securityStatus, setSecurityStatus] = useState<ProfileSecurityStatus | null>(null);
  const [securityLoading, setSecurityLoading] = useState(false);
  const [securityBusy, setSecurityBusy] = useState(false);
  const [securityError, setSecurityError] = useState("");
  const [securityNotice, setSecurityNotice] = useState("");
  const [twoFactorSetupSecret, setTwoFactorSetupSecret] = useState("");
  const [twoFactorSetupUri, setTwoFactorSetupUri] = useState("");
  const [twoFactorSetupCode, setTwoFactorSetupCode] = useState("");
  const [twoFactorRemovalCode, setTwoFactorRemovalCode] = useState("");
  const [showRemoveTwoFactorConfirm, setShowRemoveTwoFactorConfirm] = useState(false);

  useEffect(() => {
    if (!token) {
      setSecurityStatus(null);
      setSecurityLoading(false);
      return;
    }
    let active = true;
    setSecurityLoading(true);
    setSecurityError("");
    fetch(API_BASE + "/api/auth/kingshall/security", {
      method: "GET",
      cache: "no-store",
      headers: { Accept: "application/json", Authorization: "Bearer " + token }
    }).then(async (response) => {
      const data = await response.json().catch(() => ({})) as ProfileSecurityStatus & { message?: string; error?: string };
      if (!response.ok) throw new Error(data.message || data.error || "Unable to load account security settings.");
      if (active) setSecurityStatus(data);
    }).catch((caught: unknown) => {
      if (active) setSecurityError(caught instanceof Error ? caught.message : "Unable to load account security settings.");
    }).finally(() => {
      if (active) setSecurityLoading(false);
    });
    return () => { active = false; };
  }, [token]);

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
    setChallengeToken("");
    setExtraMethods([]);
    setExtraMethod("");
    setExtraCode("");
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
    setCheckingAccounts(true);
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
      setCheckingAccounts(false);
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
      if (data.requiresExtraSecurity === true) {
        const methods = Array.isArray(data.methods)
          ? data.methods.filter((method): method is "2fa" | "biometric" => method === "2fa" || method === "biometric")
          : [];
        if (!data.challengeToken || methods.length === 0) {
          throw new Error("KingsHall returned an incomplete extra-security challenge. Please start sign-in again.");
        }
        setChallengeToken(data.challengeToken);
        setExtraMethods(methods);
        setExtraMethod(methods.length === 1 ? methods[0] : "");
        setExtraCode("");
        setNotice(methods.length > 1
          ? "Access Code verified. Choose one enabled extra-security method to finish signing in."
          : "Access Code verified. Complete the enabled extra-security check to finish signing in.");
        return;
      }
      saveSession(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to sign in. Please try again.");
    } finally {
      setBusy(false);
      setAccessCode("");
    }
  }

  async function verifyExtra2fa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !challengeToken || extraCode.length !== 6) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(API_BASE + "/api/auth/kingshall/extra-security/verify-2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ challengeToken, code: extraCode })
      });
      const data = await response.json().catch(() => ({})) as AuthPayload;
      if (!response.ok || !data.token || !data.user) {
        throw new Error(responseMessage(data, "The authenticator code could not be verified."));
      }
      saveSession(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The authenticator code could not be verified.");
    } finally {
      setBusy(false);
      setExtraCode("");
    }
  }

  async function verifyExtraBiometric() {
    if (busy || !challengeToken || !extraMethods.includes("biometric")) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const optionsResponse = await fetch(API_BASE + "/api/auth/kingshall/extra-security/biometric/options", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ challengeToken })
      });
      const options = await optionsResponse.json().catch(() => ({})) as Record<string, any>;
      if (!optionsResponse.ok) throw new Error(responseMessage(options as AuthPayload, "Unable to start passkey verification."));
      const credential = await authenticateCrownStorePasskey(options);
      const verifyResponse = await fetch(API_BASE + "/api/auth/kingshall/extra-security/biometric/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ challengeToken, ...credential })
      });
      const data = await verifyResponse.json().catch(() => ({})) as AuthPayload;
      if (!verifyResponse.ok || !data.token || !data.user) {
        throw new Error(responseMessage(data, "Passkey verification failed."));
      }
      saveSession(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Passkey verification failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function cancelSecurityChallenge() {
    setChallengeToken("");
    setExtraMethods([]);
    setExtraMethod("");
    setExtraCode("");
    setAccessCode("");
    setIdentity("");
    setError("");
    setNotice("");
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
      setExternalSecondsRemaining(Math.max(0, Math.ceil((new Date(data.expiresAt).getTime() - Date.now()) / 1000)));
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
    let countdownTimer: number | undefined;
    const requestId = externalLogin.requestId;
    const expiresAt = new Date(externalLogin.expiresAt).getTime();
    const updateCountdown = () => {
      if (!Number.isFinite(expiresAt)) {
        setExternalSecondsRemaining(0);
        return;
      }
      const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setExternalSecondsRemaining(remaining);
      if (remaining === 0) expire();
    };
    const expire = () => {
      if (stopped) return;
      stopped = true;
      if (timer !== undefined) window.clearTimeout(timer);
      if (expiryTimer !== undefined) window.clearTimeout(expiryTimer);
      if (countdownTimer !== undefined) window.clearInterval(countdownTimer);
      setExternalSecondsRemaining(0);
      setExternalLogin(null);
      setExternalNotice("");
      setExternalError("This external sign-in request expired. Start again.");
    };
    updateCountdown();
    if (!stopped) {
      countdownTimer = window.setInterval(updateCountdown, 1000);
      expiryTimer = window.setTimeout(expire, Math.max(0, expiresAt - Date.now()));
    }
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
            stopped = true;
            if (expiryTimer !== undefined) window.clearTimeout(expiryTimer);
            if (countdownTimer !== undefined) window.clearInterval(countdownTimer);
            setExternalLogin(null);
            setExternalError(responseMessage(data, "This external sign-in request is no longer valid."));
            return;
          }
        } else if (data.status === "authenticated") {
          stopped = true;
          if (expiryTimer !== undefined) window.clearTimeout(expiryTimer);
          if (countdownTimer !== undefined) window.clearInterval(countdownTimer);
          setExternalLogin(null);
          try { saveSession(data); }
          catch (caught) { setExternalError(caught instanceof Error ? caught.message : "Could not complete the approved sign-in."); }
          return;
        } else if (["denied", "expired", "consumed"].includes(String(data.status || ""))) {
          stopped = true;
          if (expiryTimer !== undefined) window.clearTimeout(expiryTimer);
          if (countdownTimer !== undefined) window.clearInterval(countdownTimer);
          setExternalLogin(null);
          setExternalError(data.status === "denied" ? "The external sign-in request was denied." : "This external sign-in request expired. Start again.");
          return;
        }
      } catch {
        // Match CryBots and HallsChat: retry temporary network errors until expiry.
      }
      if (!stopped) timer = window.setTimeout(() => { void poll(); }, 1800);
    };
    if (!stopped) timer = window.setTimeout(() => { void poll(); }, 1200);
    return () => {
      stopped = true;
      if (timer !== undefined) window.clearTimeout(timer);
      if (expiryTimer !== undefined) window.clearTimeout(expiryTimer);
      if (countdownTimer !== undefined) window.clearInterval(countdownTimer);
    };
  }, [externalLogin?.requestId]);


  async function requestProfileSecurity(path: string, body?: Record<string, unknown>): Promise<Record<string, any>> {
    if (!token) throw new Error("Sign in to CrownStore before changing security settings.");
    const method = path === "/api/auth/kingshall/security" ? "GET" : "POST";
    const response = await fetch(API_BASE + path, {
      method,
      cache: "no-store",
      headers: { Accept: "application/json", Authorization: "Bearer " + token, ...(method === "POST" ? { "Content-Type": "application/json" } : {}) },
      ...(method === "POST" ? { body: JSON.stringify(body || {}) } : {})
    });
    const data = await response.json().catch(() => ({})) as Record<string, any>;
    if (!response.ok) throw new Error(String(data.message || data.error || "CrownStore could not update this security setting."));
    return data;
  }

  async function refreshProfileSecurity() {
    const data = await requestProfileSecurity("/api/auth/kingshall/security");
    setSecurityStatus(data as ProfileSecurityStatus);
  }

  async function beginTwoFactorSetup() {
    setSecurityBusy(true); setSecurityError(""); setSecurityNotice("");
    try {
      const data = await requestProfileSecurity("/api/auth/kingshall/security/2fa/setup");
      setTwoFactorSetupSecret(String(data.secret || ""));
      setTwoFactorSetupUri(String(data.otpauthUrl || ""));
      setTwoFactorSetupCode("");
      setSecurityNotice(String(data.message || "Scan the QR code, then verify the generated code."));
      await refreshProfileSecurity();
    } catch (caught) {
      setSecurityError(caught instanceof Error ? caught.message : "Unable to start authenticator setup.");
    } finally { setSecurityBusy(false); }
  }

  async function verifyTwoFactorSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d{6}$/.test(twoFactorSetupCode)) {
      setSecurityError("Enter the current six-digit authenticator code.");
      return;
    }
    setSecurityBusy(true); setSecurityError(""); setSecurityNotice("");
    try {
      const data = await requestProfileSecurity("/api/auth/kingshall/security/2fa/verify", { code: twoFactorSetupCode });
      setTwoFactorSetupSecret(""); setTwoFactorSetupUri(""); setTwoFactorSetupCode("");
      setSecurityNotice(String(data.message || "Authenticator configured."));
      await refreshProfileSecurity();
    } catch (caught) {
      setSecurityError(caught instanceof Error ? caught.message : "Authenticator verification failed.");
    } finally { setSecurityBusy(false); }
  }

  async function cancelTwoFactorSetup() {
    setSecurityBusy(true); setSecurityError(""); setSecurityNotice("");
    try {
      await requestProfileSecurity("/api/auth/kingshall/security/2fa/cancel");
      setTwoFactorSetupSecret(""); setTwoFactorSetupUri(""); setTwoFactorSetupCode("");
      setSecurityNotice("Pending authenticator setup cancelled.");
      await refreshProfileSecurity();
    } catch (caught) {
      setSecurityError(caught instanceof Error ? caught.message : "Unable to cancel authenticator setup.");
    } finally { setSecurityBusy(false); }
  }

  async function changeTwoFactorEnforcement(enabled: boolean) {
    setSecurityBusy(true); setSecurityError(""); setSecurityNotice("");
    try {
      const data = await requestProfileSecurity("/api/auth/kingshall/security/2fa/login-setting", { enabled });
      setSecurityNotice(String(data.message || "Authenticator sign-in setting updated."));
      await refreshProfileSecurity();
    } catch (caught) {
      setSecurityError(caught instanceof Error ? caught.message : "Unable to update authenticator sign-in protection.");
    } finally { setSecurityBusy(false); }
  }

  async function removeTwoFactor() {
    if (!/^\d{6}$/.test(twoFactorRemovalCode)) {
      setSecurityError("Enter the current six-digit authenticator code before removing it.");
      return;
    }
    setSecurityError("");
    setShowRemoveTwoFactorConfirm(true);
  }

  async function confirmRemoveTwoFactor() {
    setSecurityBusy(true); setSecurityError(""); setSecurityNotice("");
    try {
      const data = await requestProfileSecurity("/api/auth/kingshall/security/2fa/disable", { code: twoFactorRemovalCode });
      setTwoFactorRemovalCode("");
      setShowRemoveTwoFactorConfirm(false);
      setSecurityNotice(String(data.message || "Authenticator removed."));
      await refreshProfileSecurity();
    } catch (caught) {
      setSecurityError(caught instanceof Error ? caught.message : "Unable to remove the authenticator.");
    } finally { setSecurityBusy(false); }
  }

  async function registerBiometricPasskey() {
    setSecurityBusy(true); setSecurityError(""); setSecurityNotice("");
    try {
      const options = await requestProfileSecurity("/api/auth/kingshall/security/biometric/registration/options");
      const credential = await createCrownStorePasskey(options);
      const data = await requestProfileSecurity("/api/auth/kingshall/security/biometric/registration/verify", credential);
      setSecurityNotice(String(data.message || "Passkey configured."));
      await refreshProfileSecurity();
    } catch (caught) {
      setSecurityError(caught instanceof Error ? caught.message : "Unable to register a passkey.");
    } finally { setSecurityBusy(false); }
  }

  async function changeBiometricEnforcement(enabled: boolean) {
    setSecurityBusy(true); setSecurityError(""); setSecurityNotice("");
    try {
      const data = await requestProfileSecurity("/api/auth/kingshall/security/biometric/login-setting", { enabled });
      setSecurityNotice(String(data.message || "Biometric sign-in setting updated."));
      await refreshProfileSecurity();
    } catch (caught) {
      setSecurityError(caught instanceof Error ? caught.message : "Unable to update biometric sign-in protection.");
    } finally { setSecurityBusy(false); }
  }

  async function removeBiometricPasskey(credentialId: string) {
    setSecurityBusy(true); setSecurityError(""); setSecurityNotice("");
    try {
      const data = await requestProfileSecurity("/api/auth/kingshall/security/biometric/remove", { credentialId });
      setSecurityNotice(String(data.message || "Passkey removed."));
      await refreshProfileSecurity();
    } catch (caught) {
      setSecurityError(caught instanceof Error ? caught.message : "Unable to remove the passkey.");
    } finally { setSecurityBusy(false); }
  }

  function signOut() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken("");
    setUser(null);
    setIdentity("");
    setAccessCode("");
    setChallengeToken("");
    setExtraMethods([]);
    setExtraMethod("");
    setExtraCode("");
    setError("");
    setNotice("");
    setExternalLogin(null);
    setBrowserAccounts([]);
    setSecurityStatus(null);
    setTwoFactorSetupSecret("");
    setTwoFactorSetupUri("");
    setTwoFactorSetupCode("");
    setTwoFactorRemovalCode("");
    setSecurityError("");
    setSecurityNotice("");
    setShowRemoveTwoFactorConfirm(false);
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
        <h1 id="profile-page-title">{challengeToken ? "Complete extra security" : identity ? "Confirm your KingsHall account" : "Sign in to CrownStore"}</h1>
        <p className="profile-auth-description">{challengeToken ? "Your Access Code was accepted. Complete the required security check to finish signing in." : identity || "Continue with your KingsHall account to view your profile."}</p>

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

        {identity && !challengeToken && <form className="profile-access-form" onSubmit={verifyAccessCode}>
          <label htmlFor="crownstore-access-code">Bound six-digit Access Code</label>
          <input id="crownstore-access-code" value={accessCode} onChange={(event) => setAccessCode(event.target.value.replace(/\D/g, "").slice(0, 6))} type="password" inputMode="numeric" autoComplete="off" placeholder="••••••" minLength={6} maxLength={6} pattern="[0-9]{6}" required />
          <button className="profile-primary-button" type="submit" disabled={busy || accessCode.length !== 6}>{busy ? <span className="profile-spinner" /> : "Verify and continue"}</button>
          <button className="profile-text-button" type="button" onClick={cancelSecurityChallenge}>Cancel request</button>
        </form>}

        {challengeToken && <section className="profile-external-panel profile-extra-security" aria-label="Extra security verification">
          <div className="profile-external-heading"><span><ShieldCheck size={18} /></span><div><h2>Extra security required</h2><p>Choose one enabled security method to complete this sign-in. The challenge expires in five minutes.</p></div></div>
          {extraMethods.length > 1 && <div className="profile-extra-methods">
            {extraMethods.includes("2fa") && <button className="profile-secondary-button" type="button" disabled={busy} onClick={() => { setExtraMethod("2fa"); setError(""); }}>Authenticator app (2FA)</button>}
            {extraMethods.includes("biometric") && <button className="profile-secondary-button" type="button" disabled={busy} onClick={() => { setExtraMethod("biometric"); setError(""); }}><Fingerprint size={16} /> Passkey / biometric</button>}
          </div>}
          {extraMethod === "2fa" && <form className="profile-access-form" onSubmit={verifyExtra2fa}>
            <label htmlFor="crownstore-extra-2fa">Six-digit authenticator code</label>
            <input id="crownstore-extra-2fa" value={extraCode} onChange={(event) => setExtraCode(event.target.value.replace(/\D/g, "").slice(0, 6))} type="password" inputMode="numeric" autoComplete="one-time-code" placeholder="••••••" minLength={6} maxLength={6} pattern="[0-9]{6}" required />
            <button className="profile-primary-button" type="submit" disabled={busy || extraCode.length !== 6}>{busy ? <span className="profile-spinner" /> : "Verify authenticator code"}</button>
          </form>}
          {extraMethod === "biometric" && <div className="profile-passkey-action">
            <p className="profile-external-help">Confirm using the passkey or biometric credential linked to this KingsHall account.</p>
            <button className="profile-primary-button" type="button" onClick={() => void verifyExtraBiometric()} disabled={busy}>{busy ? <span className="profile-spinner" /> : <><Fingerprint size={16} /> Verify passkey</>}</button>
          </div>}
          {!extraMethod && <p className="profile-external-help">Select an available security method above.</p>}
          <button className="profile-text-button" type="button" disabled={busy} onClick={cancelSecurityChallenge}>Cancel sign-in</button>
        </section>}
        {checkingSession && <p className="profile-notice" role="status">Restoring your CrownStore session…</p>}
        {notice && <p className="profile-notice" role="status">{notice}</p>}
        {error && <p className="profile-error" role="alert">{error}</p>}
        <p className="profile-auth-footnote">Your KingsHall Access Code is verified securely. CrownStore does not store it.</p>
        <p className="profile-kingshall-link">Need an account? <button className="profile-text-button" type="button" onClick={redirectToKingsHall}>Open KingsHall</button></p>
      </section>

      <section className="profile-external-panel">
        <div className="profile-external-heading"><span><Fingerprint size={18} /></span><div><h2>Signing in on another device?</h2><p>Approve CrownStore from your signed-in KingsHall account.</p></div></div>
        {!externalLogin && <button className="profile-secondary-button" type="button" disabled={busy || externalBusy || Boolean(challengeToken)} onClick={() => void startExternalLogin()}>{externalBusy ? <span className="profile-spinner" /> : <KeyRound size={16} />} Use external-device sign-in</button>}
        {externalNotice && <p className="profile-notice" role="status">{externalNotice}</p>}
        {externalError && <p className="profile-error" role="alert">{externalError}</p>}
        {externalLogin && <>
          <p className="profile-external-help">Scan this QR code in KingsHall, or enter the code in External Login. It expires in five minutes.</p>
          <div className="profile-qr"><QRCodeSVG value={JSON.stringify({ type: "kingshall-external-login-v1", requestId: externalLogin.requestId, qrToken: externalLogin.qrToken, appName: "CrownStore" })} size={174} level="M" includeMargin /></div>
          <span className="profile-one-time-label">ONE-TIME LOGIN CODE</span>
          <strong className="profile-one-time-code">{externalLogin.loginCode}</strong>
          <p className="profile-external-expiry" role="timer" aria-live="off">
            {externalSecondsRemaining > 0
              ? `Expires in ${Math.floor(externalSecondsRemaining / 60)}:${String(externalSecondsRemaining % 60).padStart(2, "0")} · ${new Date(externalLogin.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
              : "Request expired"}
          </p>
          <p className="profile-external-help">Waiting for approval from KingsHall…</p>
          <button className="profile-text-button" type="button" disabled={externalBusy} onClick={() => void cancelExternalLogin()}>Cancel external sign-in</button>
        </>}
      </section>
    </div> : <div className="profile-content">
      <section className="profile-identity">
        <div className="profile-avatar">{safePhoto ? <img src={safePhoto} alt="" /> : <span>{initials}</span>}</div>
        <div className="profile-identity-copy">
          <span className="profile-eyebrow">KINGSHALL ACCOUNT</span>
          <div className="profile-identity-title-row"><h1 id="profile-page-title">{glassTitle}</h1>{user.verificationStatus === "verified" && <VerificationBadge size={20} title="Verified by KingsHall" />}</div>
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
          <div><span>Full name</span><strong className="profile-detail-name">{displayName(user)}{user.verificationStatus === "verified" && <VerificationBadge size={17} title="Verified by KingsHall" />}</strong></div>
          <div><span>Email</span><strong>{user.email || "Not provided"}</strong></div>
          <div><span>Username</span><strong>{user.username ? "@" + user.username : "Not set"}</strong></div>
          <div><span>Verification</span><strong>{user.verificationStatus === "verified" ? "Verified" : user.verificationStatus === "pending" ? "Pending review" : "Not verified"}</strong></div>
        </div>
      </section>

      <section className="profile-section profile-security-section" aria-labelledby="profile-security-title">
        <div className="profile-section-heading">
          <h2 id="profile-security-title">Account security</h2>
          <span>{securityLoading ? "Checking…" : "Synced with KingsHall"}</span>
        </div>
        <p className="profile-security-intro">Configure two-factor authentication and passkey/biometric sign-in for this KingsHall account. These settings apply across CrownStore web, PWA and APK, and are enforced by KingsHall during sign-in.</p>
        {securityError && <p className="profile-error" role="alert">{securityError}</p>}
        {securityNotice && <p className="profile-notice" role="status">{securityNotice}</p>}
        {securityLoading && !securityStatus ? <p className="profile-empty">Loading security settings…</p> : <>
          <div className="profile-security-item">
            <div className="profile-security-item-heading"><span className="profile-security-icon"><ShieldCheck size={19} /></span><div><h3>Authenticator app (2FA)</h3><p>Use a time-based six-digit code from Google Authenticator, Authy or another compatible app.</p></div></div>
            <div className="profile-security-status-row">
              <span className={securityStatus?.twoFactor.configured ? "profile-security-pill is-configured" : "profile-security-pill"}>{securityStatus?.twoFactor.configured ? "Configured" : securityStatus?.twoFactor.pending ? "Setup pending" : "Not configured"}</span>
              <span className={securityStatus?.twoFactor.enabled ? "profile-security-pill is-enabled" : "profile-security-pill"}>{securityStatus?.twoFactor.enabled ? "Required at sign-in" : "Sign-in requirement off"}</span>
            </div>
            {!securityStatus?.twoFactor.configured && <button className="profile-secondary-button" type="button" disabled={securityBusy} onClick={() => void beginTwoFactorSetup()}>{securityBusy ? <span className="profile-spinner" /> : <KeyRound size={15} />} {securityStatus?.twoFactor.pending ? "Restart authenticator setup" : "Configure authenticator"}</button>}
            {twoFactorSetupUri && <form className="profile-security-setup" onSubmit={verifyTwoFactorSetup}>
              <p>1. Scan this QR code in your authenticator app.</p>
              <div className="profile-security-qr"><QRCodeSVG value={twoFactorSetupUri} size={176} includeMargin /></div>
              <label htmlFor="crown-profile-totp-key">Manual setup key</label>
              <div className="profile-security-manual-key"><code id="crown-profile-totp-key">{twoFactorSetupSecret}</code><button className="profile-text-button" type="button" onClick={() => { void navigator.clipboard?.writeText(twoFactorSetupSecret).then(() => setSecurityNotice("Authenticator setup key copied."), () => setSecurityError("Could not copy the setup key on this device.")); }}>Copy key</button></div>
              <label htmlFor="crown-profile-totp-code">2. Enter the current six-digit code to verify setup</label>
              <input id="crown-profile-totp-code" value={twoFactorSetupCode} onChange={(event) => setTwoFactorSetupCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" required />
              <button className="profile-primary-button" type="submit" disabled={securityBusy || twoFactorSetupCode.length !== 6}>{securityBusy ? <span className="profile-spinner" /> : "Verify and finish setup"}</button>
              <button className="profile-text-button" type="button" disabled={securityBusy} onClick={() => void cancelTwoFactorSetup()}>Cancel setup</button>
            </form>}
            {securityStatus?.twoFactor.configured && <div className="profile-security-actions">
              <button className={securityStatus.twoFactor.enabled ? "profile-secondary-button" : "profile-primary-button"} type="button" disabled={securityBusy} onClick={() => void changeTwoFactorEnforcement(!securityStatus.twoFactor.enabled)}>{securityBusy ? <span className="profile-spinner" /> : <ShieldCheck size={15} />} {securityStatus.twoFactor.enabled ? "Disable 2FA at sign-in" : "Enable 2FA at sign-in"}</button>
              <label htmlFor="crown-profile-totp-remove">Authenticator code required to remove 2FA</label>
              <input id="crown-profile-totp-remove" value={twoFactorRemovalCode} onChange={(event) => setTwoFactorRemovalCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" />
              <button className="profile-text-button" type="button" disabled={securityBusy || twoFactorRemovalCode.length !== 6} onClick={() => void removeTwoFactor()}>Remove authenticator</button>
            </div>}
          </div>

          <div className="profile-security-item">
            <div className="profile-security-item-heading"><span className="profile-security-icon"><Fingerprint size={19} /></span><div><h3>Passkey / biometric security</h3><p>Register a device passkey. Your fingerprint, face or device-unlock check is handled by the device; CrownStore does not receive biometric templates.</p></div></div>
            <div className="profile-security-status-row">
              <span className={securityStatus?.biometric.configured ? "profile-security-pill is-configured" : "profile-security-pill"}>{securityStatus?.biometric.configured ? "Passkey configured" : "No passkey configured"}</span>
              <span className={securityStatus?.biometric.enabled ? "profile-security-pill is-enabled" : "profile-security-pill"}>{securityStatus?.biometric.enabled ? "Required at sign-in" : "Sign-in requirement off"}</span>
            </div>
            <div className="profile-security-actions">
              {!securityStatus?.biometric.configured && <button className="profile-secondary-button" type="button" disabled={securityBusy || !securityStatus} onClick={() => void registerBiometricPasskey()}>{securityBusy ? <span className="profile-spinner" /> : <Fingerprint size={15} />} Configure passkey on this device</button>}
              {securityStatus?.biometric.enabled && <p className="profile-security-meta">A passkey is already configured. Remove the existing passkey before configuring another.</p>}
              {securityStatus?.biometric.configured && <button className={securityStatus.biometric.enabled ? "profile-secondary-button" : "profile-primary-button"} type="button" disabled={securityBusy} onClick={() => void changeBiometricEnforcement(!securityStatus.biometric.enabled)}>{securityBusy ? <span className="profile-spinner" /> : <Fingerprint size={15} />} {securityStatus.biometric.enabled ? "Disable biometric at sign-in" : "Enable biometric at sign-in"}</button>}
              {securityStatus?.biometric.configured && <p className="profile-security-meta">{securityStatus.biometric.credentialCount} passkey credential{securityStatus.biometric.credentialCount === 1 ? "" : "s"} linked to your KingsHall account. Remove all existing passkeys before configuring another.</p>}
              {(securityStatus?.biometric.credentials || []).map((credential, index) => <div className="profile-security-passkey" key={credential.id}>
                <div><strong>Bound passkey {index + 1}</strong><span>{credential.createdAt ? "Added " + new Date(credential.createdAt).toLocaleDateString() : "Added date unavailable"}</span></div>
                <button className="profile-text-button" type="button" disabled={securityBusy} onClick={() => void removeBiometricPasskey(credential.id)}>Unbind passkey</button>
              </div>)}
            </div>
          </div>
        </>}
      </section>

      {!isAndroidApp ? <section className="profile-manage-apps">
        <span className="profile-manage-icon"><Smartphone size={24} /></span>
        <div className="profile-manage-copy"><h2>Manage your apps on the CrownStore app</h2><p>Check installed apps, available updates and Android app activity on your device.</p></div>
        <button className="profile-primary-button profile-manage-button" type="button" onClick={onOpenCrownStoreDetails}><ArrowDownToLine size={17} /> View CrownStore app <ChevronRight size={16} /></button>
      </section> : <>
        <section className="profile-stat-grid" aria-label="CrownStore summary">
          <div><span>Installed</span><strong>{installedScanStatus === "ready" ? installedCatalogueApps.length : "—"}</strong></div>
          <div><span>Updates</span><strong>{installedScanStatus === "ready" ? updatesNeeded.length : "—"}</strong></div>
          <div><span>Downloaded apps</span><strong>{downloadHistory.length}</strong></div>
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
          {usageError ? <div className="profile-inline-error"><span>{usageError}</span><button type="button" onClick={() => void refreshUsage()}>Retry</button></div> : usagePermissionRequired ? <div className="profile-permission-prompt"><div><strong>Enable app usage access</strong><p>Android keeps this private until you allow usage access in system settings.</p></div><button className="profile-secondary-button" type="button" onClick={() => void openUsageSettings()}><Smartphone size={16} /> Enable access</button></div>
            : usageLoading ? <p className="profile-empty">Loading app activity…</p>
            : mostUsed.length ? <div className="profile-app-list">{mostUsed.map(({ item, app }) => <ProfileAppRow key={item.packageId} app={app} detail={humanDuration(item.totalTimeInForeground) + " in foreground"} onClick={() => onOpenApp(app)} />)}</div>
            : <p className="profile-empty">There isn't enough usage history to rank your apps yet.</p>}
          {!usagePermissionRequired && <button className="profile-refresh-usage" type="button" onClick={() => void refreshUsage()} disabled={usageLoading}><RefreshCw size={14} /> {usageLoading ? "Refreshing…" : "Refresh usage"}</button>}
        </section>

        <section className="profile-section">
          <div className="profile-section-heading"><h2>Recently used</h2><span>Last 30 days</span></div>
          {usageError ? <p className="profile-empty">{usageError}</p> : usagePermissionRequired ? <p className="profile-empty">Enable app usage access to see your recent app activity.</p>
            : recentlyUsed.length ? <div className="profile-app-list">{recentlyUsed.map(({ item, app }) => <ProfileAppRow key={item.packageId} app={app} detail={"Last used " + dateLabel(item.lastTimeUsed)} trailing={<Clock3 size={15} />} onClick={() => onOpenApp(app)} />)}</div>
            : <p className="profile-empty">Recent app activity will appear here when Android has usage history.</p>}
        </section>
      </>}
      <div className="profile-signout-bottom"><button className="profile-text-button" type="button" onClick={signOut}><LogOut size={15} /> Sign out of CrownStore</button></div>
    </div>}

    {checkingAccounts && <div className="profile-loading-backdrop" role="status" aria-live="polite"><div className="profile-loading-dialog"><span className="profile-spinner" /><strong>Checking KingsHall accounts</strong><span>Your sign-in is being prepared.</span></div></div>}
    {showNoAccountModal && <div className="profile-modal-backdrop" role="presentation" onClick={() => setShowNoAccountModal(false)}>
      <section className="profile-no-account-modal" role="alertdialog" aria-modal="true" aria-labelledby="profile-no-account-title" onClick={(event) => event.stopPropagation()}>
        <span className="profile-auth-emblem"><KeyRound size={23} /></span>
        <h2 id="profile-no-account-title">No KingsHall account found</h2>
        <p>Sign in to KingsHall first, then return to CrownStore.</p>
        <button className="profile-primary-button" type="button" onClick={redirectToKingsHall}>Sign in to KingsHall</button>
        <button className="profile-text-button" type="button" onClick={() => setShowNoAccountModal(false)}><X size={15} /> Cancel</button>
      </section>
    </div>}
    {showRemoveTwoFactorConfirm && <div className="profile-modal-backdrop" role="presentation" onClick={() => { if (!securityBusy) setShowRemoveTwoFactorConfirm(false); }}>
      <section className="profile-no-account-modal profile-security-confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="profile-remove-2fa-title" onClick={(event) => event.stopPropagation()}>
        <span className="profile-auth-emblem"><ShieldCheck size={23} /></span>
        <h2 id="profile-remove-2fa-title">Remove authenticator?</h2>
        <p>This permanently removes the configured authenticator and disables 2FA sign-in enforcement for this KingsHall account. Your current authenticator code will be verified before removal.</p>
        <button className="profile-primary-button" type="button" disabled={securityBusy} onClick={() => void confirmRemoveTwoFactor()}>{securityBusy ? <span className="profile-spinner" /> : "Confirm and remove 2FA"}</button>
        <button className="profile-text-button" type="button" disabled={securityBusy} onClick={() => setShowRemoveTwoFactorConfirm(false)}>Keep authenticator</button>
      </section>
    </div>}
    {checkingSession && user && <span className="profile-session-refreshing" role="status">Refreshing profile…</span>}
  </section>;
}
