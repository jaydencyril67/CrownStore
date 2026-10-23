import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { readNotificationPreferences } from "./notifications";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "https://apicrownstore.kingshall.online").replace(/\/$/, "");
const SESSION_KEY = "crownstore-profile-token";
const FCM_TOKEN_KEY = "crownstore-push-fcm-token";
const WEB_ENDPOINT_KEY = "crownstore-push-web-endpoint";

type RequestMethod = "GET" | "POST" | "PUT" | "DELETE";
type ApiError = { error?: string; message?: string };

function sessionToken(): string {
  try { return window.localStorage.getItem(SESSION_KEY) || ""; } catch { return ""; }
}

function apiMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object") {
    const value = payload as ApiError;
    if (typeof value.error === "string" && value.error.trim()) return value.error;
    if (typeof value.message === "string" && value.message.trim()) return value.message;
  }
  return fallback;
}

async function requestApi<T>(path: string, token: string, method: RequestMethod = "GET", body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers.Authorization = "Bearer " + token;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  if (Capacitor.isNativePlatform()) {
    const response = await CapacitorHttp.request({
      url: API_BASE + path,
      method,
      headers,
      data: body,
      connectTimeout: 12000,
      readTimeout: 20000
    });
    let payload: unknown = response.data;
    if (typeof payload === "string") {
      try { payload = JSON.parse(payload); } catch { payload = {}; }
    }
    if (response.status < 200 || response.status >= 300) {
      throw new Error(apiMessage(payload, "CrownStore could not configure push notifications."));
    }
    return payload as T;
  }

  const response = await fetch(API_BASE + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store"
  });
  const payload = await response.json().catch(() => ({})) as unknown;
  if (!response.ok) throw new Error(apiMessage(payload, "CrownStore could not configure push notifications."));
  return payload as T;
}

function decodeVapidKey(value: string): Uint8Array {
  const padded = value + "=".repeat((4 - value.length % 4) % 4);
  const raw = window.atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

async function waitForNativeToken(): Promise<string> {
  let resolveToken: (value: string) => void = () => undefined;
  let rejectToken: (reason: Error) => void = () => undefined;
  const tokenPromise = new Promise<string>((resolve, reject) => {
    resolveToken = resolve;
    rejectToken = reject;
  });
  const registered = await PushNotifications.addListener("registration", (token) => resolveToken(token.value));
  const registrationError = await PushNotifications.addListener("registrationError", (problem) => {
    rejectToken(new Error(problem.error || "Firebase could not register this device for push notifications."));
  });
  let timeoutId = 0;
  try {
    await PushNotifications.register();
    timeoutId = window.setTimeout(() => rejectToken(new Error("Firebase registration timed out. Check your internet connection and try again.")), 20000);
    const token = await tokenPromise;
    if (!token || token.length < 20) throw new Error("Firebase returned an invalid device token.");
    return token;
  } finally {
    if (timeoutId) window.clearTimeout(timeoutId);
    await registered.remove().catch(() => undefined);
    await registrationError.remove().catch(() => undefined);
  }
}

async function registerNative(token: string, askPermission: boolean): Promise<boolean> {
  let permission = await PushNotifications.checkPermissions();
  if (permission.receive !== "granted") {
    if (!askPermission) return false;
    permission = await PushNotifications.requestPermissions();
  }
  if (permission.receive !== "granted") {
    if (askPermission) throw new Error("Allow CrownStore notifications in Android to receive push alerts.");
    return false;
  }

  await PushNotifications.createChannel({
    id: "crownstore_alerts",
    name: "CrownStore alerts",
    description: "App releases and important CrownStore notices",
    importance: 5,
    sound: "default",
    vibration: true
  }).catch(() => undefined);

  let deviceToken = "";
  try {
    deviceToken = await waitForNativeToken();
  } catch (caught) {
    try { deviceToken = window.localStorage.getItem(FCM_TOKEN_KEY) || ""; } catch {}
    if (!deviceToken) throw caught;
  }
  try { window.localStorage.setItem(FCM_TOKEN_KEY, deviceToken); } catch {}
  await requestApi("/api/notifications/native-token", token, "POST", { token: deviceToken, platform: "android" });
  return true;
}

async function registerWeb(token: string, askPermission: boolean): Promise<boolean> {
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    if (askPermission) throw new Error("Browser push is not supported here. Use the CrownStore Android app or a supported browser/PWA.");
    return false;
  }
  let permission = Notification.permission;
  if (permission !== "granted" && askPermission) permission = await Notification.requestPermission();
  if (permission !== "granted") {
    if (askPermission) throw new Error("Allow browser notifications to enable CrownStore push alerts.");
    return false;
  }

  const keyResult = await requestApi<{ publicKey?: string | null; configured?: boolean; error?: string }>("/api/notifications/web-push-key", token);
  if (!keyResult.configured || !keyResult.publicKey) {
    if (askPermission) throw new Error("CrownStore browser push needs VAPID keys configured on ApiCrownStore.");
    return false;
  }
  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeVapidKey(keyResult.publicKey)
    });
  }
  await requestApi("/api/notifications/web-push-subscription", token, "POST", { subscription: subscription.toJSON() });
  try { window.localStorage.setItem(WEB_ENDPOINT_KEY, subscription.endpoint); } catch {}
  return true;
}

export async function syncCrownStorePushPreferences(token = sessionToken(), deviceEnabled?: boolean): Promise<void> {
  if (!token) return;
  const preferences = readNotificationPreferences();
  await requestApi("/api/notifications/preferences", token, "PUT", {
    channels: { device: deviceEnabled === undefined ? preferences.channels.device : deviceEnabled },
    types: preferences.types
  });
}

export async function enableCrownStorePush(): Promise<void> {
  const token = sessionToken();
  if (!token) throw new Error("Sign in to your CrownStore profile before enabling account-linked push notifications.");
  if (Capacitor.getPlatform() === "android") {
    await registerNative(token, true);
  } else {
    await registerWeb(token, true);
  }
  await syncCrownStorePushPreferences(token, true);
}

export async function refreshCrownStorePush(token = sessionToken()): Promise<void> {
  if (!token) return;
  const preferences = readNotificationPreferences();
  if (preferences.channels.device) {
    if (Capacitor.getPlatform() === "android") await registerNative(token, false);
    else await registerWeb(token, false);
  }
  await syncCrownStorePushPreferences(token, preferences.channels.device);
}

export async function disableCrownStorePush(token = sessionToken()): Promise<void> {
  // Local opt-out must still take effect when the API is temporarily unreachable.
  if (token) await syncCrownStorePushPreferences(token, false).catch(() => undefined);

  if (Capacitor.getPlatform() === "android") {
    if (token) {
      let deviceToken = "";
      try { deviceToken = window.localStorage.getItem(FCM_TOKEN_KEY) || ""; } catch {}
      await requestApi("/api/notifications/native-token", token, "DELETE", deviceToken ? { token: deviceToken } : {}).catch(() => undefined);
    }
  } else if ("serviceWorker" in navigator) {
    let registration: ServiceWorkerRegistration | undefined;
    let subscription: PushSubscription | null = null;
    try {
      registration = await navigator.serviceWorker.getRegistration("/");
      subscription = await registration?.pushManager.getSubscription() || null;
    } catch { /* Continue clearing this device's local subscription state. */ }
    let endpoint = subscription?.endpoint || "";
    if (!endpoint) {
      try { endpoint = window.localStorage.getItem(WEB_ENDPOINT_KEY) || ""; } catch {}
    }
    if (token) {
      await requestApi("/api/notifications/web-push-subscription", token, "DELETE", endpoint ? { endpoint } : {}).catch(() => undefined);
    }
    if (subscription) await subscription.unsubscribe().catch(() => false);
    try { window.localStorage.removeItem(WEB_ENDPOINT_KEY); } catch {}
  }
}
