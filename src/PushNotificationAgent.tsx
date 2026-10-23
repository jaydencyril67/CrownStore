import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { addCrownNotification, mergeCrownNotifications, readNotificationPreferences, saveNotificationPreferences, type NotificationKind } from "./notifications";
import { loadCrownStoreAccountNotificationPreferences, refreshCrownStorePush, syncCrownStorePushPreferences } from "./pushNotifications";

const SESSION_KEY = "crownstore-profile-token";
const VALID_KINDS: NotificationKind[] = ["appUpdates", "downloads", "security", "storeNotices"];

function currentToken(): string {
  try { return window.localStorage.getItem(SESSION_KEY) || ""; } catch { return ""; }
}

async function syncAccountInbox(token = currentToken()): Promise<void> {
  if (!token) return;
  const apiBase = (import.meta.env.VITE_API_BASE_URL || "https://apicrownstore.kingshall.online").replace(/\/$/, "");
  try {
    const response = await fetch(apiBase + "/api/notifications", {
      headers: { Accept: "application/json", Authorization: "Bearer " + token },
      cache: "no-store"
    });
    if (!response.ok) return;
    const result = await response.json().catch(() => ({})) as { notifications?: Parameters<typeof mergeCrownNotifications>[0] };
    if (Array.isArray(result.notifications)) mergeCrownNotifications(result.notifications);
  } catch {
    // Local notifications remain usable during an API/network interruption.
  }
}

function notificationKind(value: unknown): NotificationKind {
  return typeof value === "string" && VALID_KINDS.includes(value as NotificationKind)
    ? value as NotificationKind
    : "storeNotices";
}

function safeNotificationPath(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const url = new URL(value, window.location.origin);
    return url.origin === window.location.origin ? url.pathname + url.search + url.hash : "/";
  } catch {
    return "/";
  }
}

export default function PushNotificationAgent() {
  useEffect(() => {
    let disposed = false;
    const listeners: Array<{ remove: () => Promise<void> }> = [];

    async function attachNativeListeners() {
      if (Capacitor.getPlatform() !== "android") return;
      const received = await PushNotifications.addListener("pushNotificationReceived", (notification) => {
        const data = notification.data || {};
        const title = notification.title || (typeof data.title === "string" ? data.title : "CrownStore alert");
        const body = notification.body || (typeof data.body === "string" ? data.body : typeof data.message === "string" ? data.message : "");
        const tag = typeof data.tag === "string" ? data.tag : typeof data.notificationId === "string" ? data.notificationId : "";
        const appSlug = typeof data.appSlug === "string" && data.appSlug ? data.appSlug : undefined;
        addCrownNotification({
          id: "push:" + (tag || title + ":" + body),
          externalKey: tag || undefined,
          kind: notificationKind(data.type),
          title,
          body,
          appSlug,
          versionName: typeof data.versionName === "string" ? data.versionName : undefined
        });
      });
      const tapped = await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
        const path = safeNotificationPath(action.notification.data?.url);
        window.location.assign(path);
      });
      if (disposed) {
        await received.remove();
        await tapped.remove();
      } else {
        listeners.push(received, tapped);
      }
    }

    async function syncCurrentAccount(registerIfEnabled: boolean) {
      const token = currentToken();
      if (!token) return;
      try {
        if (registerIfEnabled) {
          const saved = await loadCrownStoreAccountNotificationPreferences(token);
          if (!saved) {
            const local = readNotificationPreferences();
            // Email is account-linked. Never carry an email opt-in from a previous
            // signed-in account into a new account on the same device.
            const firstAccountPreferences = {
              ...local,
              channels: { ...local.channels, email: false }
            };
            if (local.channels.email) {
              saveNotificationPreferences(firstAccountPreferences);
            }
            await syncCrownStorePushPreferences(token, local.channels.device, {
              inApp: local.channels.inApp,
              email: false
            });
          }
          if (readNotificationPreferences().channels.device) await refreshCrownStorePush(token);
          else await syncCrownStorePushPreferences(token);
          await syncAccountInbox(token);
          return;
        }
        await syncCrownStorePushPreferences(token);
      } catch {
        // Do not block the store UI when push services or notification permissions are unavailable.
      }
    }

    void attachNativeListeners().catch(() => undefined);
    void syncCurrentAccount(true);
    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key === SESSION_KEY) void syncCurrentAccount(true);
      else if (event.key === "crownstore-notification-preferences-v1") void syncCurrentAccount(false);
    };
    const onSessionChange = () => void syncCurrentAccount(true);
    const onPreferencesChange = () => void syncCurrentAccount(false);
    const onAccountNotificationsChange = () => void syncAccountInbox();
    window.addEventListener("storage", onStorage);
    window.addEventListener("crownstore:profile-session-changed", onSessionChange);
    window.addEventListener("crownstore:notification-preferences-changed", onPreferencesChange);
    window.addEventListener("crownstore:account-notifications-changed", onAccountNotificationsChange);

    return () => {
      disposed = true;
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("crownstore:profile-session-changed", onSessionChange);
      window.removeEventListener("crownstore:notification-preferences-changed", onPreferencesChange);
      window.removeEventListener("crownstore:account-notifications-changed", onAccountNotificationsChange);
      listeners.forEach((listener) => void listener.remove());
    };
  }, []);

  return null;
}
