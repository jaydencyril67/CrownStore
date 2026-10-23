export type NotificationKind = "appUpdates" | "downloads" | "security" | "storeNotices";

export type CrownNotification = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  externalKey?: string;
  appSlug?: string;
  versionName?: string;
  details?: Record<string, unknown>;
};

export type NotificationPreferences = {
  channels: { inApp: boolean; device: boolean };
  types: Record<NotificationKind, boolean>;
  badgeColorEnabled: boolean;
  badgeColor: string;
  headerLightingEnabled: boolean;
  headerLightingColor: string;
};

export const NOTIFICATION_STORAGE_KEY = "crownstore-notifications-v1";
export const NOTIFICATION_PREFERENCES_KEY = "crownstore-notification-preferences-v1";
export const EDGE_LIGHT_KEY = "crownstore-nowbar-edge-light";
export const BUTTON_COLOR_KEY = "crownstore-nowbar-button-color";
export const BUTTON_COLOR_ENABLED_KEY = "crownstore-nowbar-button-color-enabled";
export const SWIPE_NAVIGATION_KEY = "crownstore-nowbar-swipe-enabled";
export const EXPAND_MODE_KEY = "crownstore-nowbar-expand-enabled";
export const HEADER_LIGHTING_KEY = "crownstore-header-lighting";
export const DEFAULT_ACCENT = "#c4b5fd";

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  channels: { inApp: true, device: false },
  types: { appUpdates: true, downloads: true, security: true, storeNotices: true },
  badgeColorEnabled: true,
  badgeColor: DEFAULT_ACCENT,
  headerLightingEnabled: false,
  headerLightingColor: DEFAULT_ACCENT
};

function safeRead<T>(key: string, fallback: T): T {
  try {
    const saved = window.localStorage.getItem(key);
    return saved ? JSON.parse(saved) as T : fallback;
  } catch {
    return fallback;
  }
}

function validColor(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fallback;
}

export function readNotificationPreferences(): NotificationPreferences {
  const saved = safeRead<Partial<NotificationPreferences>>(NOTIFICATION_PREFERENCES_KEY, {});
  const channels = saved.channels && typeof saved.channels === "object" ? saved.channels : {};
  const types = saved.types && typeof saved.types === "object" ? saved.types : {};
  return {
    channels: {
      inApp: channels.inApp !== false,
      device: channels.device === true
    },
    types: {
      appUpdates: types.appUpdates !== false,
      downloads: types.downloads !== false,
      security: types.security !== false,
      storeNotices: types.storeNotices !== false
    },
    badgeColorEnabled: saved.badgeColorEnabled !== false,
    badgeColor: validColor(saved.badgeColor, DEFAULT_NOTIFICATION_PREFERENCES.badgeColor),
    headerLightingEnabled: saved.headerLightingEnabled === true,
    headerLightingColor: validColor(saved.headerLightingColor, DEFAULT_NOTIFICATION_PREFERENCES.headerLightingColor)
  };
}

export function saveNotificationPreferences(next: NotificationPreferences): void {
  try {
    window.localStorage.setItem(NOTIFICATION_PREFERENCES_KEY, JSON.stringify(next));
  } catch {
    // The current view still updates when the browser denies persistent storage.
  }
  window.dispatchEvent(new CustomEvent("crownstore:notification-preferences-changed", { detail: next }));
}

export function readNotifications(): CrownNotification[] {
  const saved = safeRead<unknown>(NOTIFICATION_STORAGE_KEY, []);
  if (!Array.isArray(saved)) return [];
  return saved.filter((item): item is CrownNotification =>
    Boolean(item && typeof item === "object" &&
      typeof (item as CrownNotification).id === "string" &&
      typeof (item as CrownNotification).title === "string" &&
      typeof (item as CrownNotification).body === "string" &&
      ["appUpdates", "downloads", "security", "storeNotices"].includes((item as CrownNotification).kind)
    )
  ).slice(0, 100);
}

function persistNotifications(next: CrownNotification[]): void {
  try {
    window.localStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(next.slice(0, 100)));
  } catch {
    // Notifications remain available in memory for the current render.
  }
  window.dispatchEvent(new CustomEvent("crownstore:notifications-changed", { detail: next }));
}

export function addCrownNotification(
  input: Omit<CrownNotification, "createdAt" | "readAt"> & Partial<Pick<CrownNotification, "createdAt" | "readAt">>
): CrownNotification | null {
  const preferences = readNotificationPreferences();
  if (!preferences.types[input.kind]) return null;

  const existing = readNotifications();
  const duplicate = existing.find((item) => item.id === input.id ||
    Boolean(input.externalKey && item.externalKey === input.externalKey));
  if (duplicate) return duplicate;

  const notification: CrownNotification = {
    ...input,
    createdAt: input.createdAt || new Date().toISOString(),
    readAt: input.readAt ?? null
  };
  if (preferences.channels.inApp) persistNotifications([notification, ...existing]);

  if (preferences.channels.device && typeof Notification !== "undefined" && Notification.permission === "granted") {
    const options: NotificationOptions & { data?: { url: string } } = {
      body: notification.body,
      tag: notification.externalKey || notification.id,
      data: { url: notification.appSlug ? "/?app=" + encodeURIComponent(notification.appSlug) : "/?view=NOTIFICATIONS" },
      icon: "/crownstore-pwa-icon.svg?v=2",
      badge: "/crownstore-pwa-icon.svg?v=2"
    };
    void (async () => {
      try {
        if ("serviceWorker" in navigator) {
          const registration = await navigator.serviceWorker.ready;
          await registration.showNotification(notification.title, options);
        } else {
          new Notification(notification.title, options);
        }
      } catch {
        // OS notifications are optional; the in-app center remains available.
      }
    })();
  }
  return notification;
}

export function markNotificationRead(id: string): void {
  const next = readNotifications().map((item) => item.id === id ? { ...item, readAt: item.readAt || new Date().toISOString() } : item);
  persistNotifications(next);
}

export function markAllNotificationsRead(): void {
  const stamp = new Date().toISOString();
  persistNotifications(readNotifications().map((item) => ({ ...item, readAt: item.readAt || stamp })));
}

export function clearNotifications(): void {
  persistNotifications([]);
}

export function unreadNotificationCount(): number {
  return readNotifications().filter((item) => !item.readAt).length;
}

export function requestDeviceNotificationPermission(): Promise<boolean> {
  if (typeof Notification === "undefined") return Promise.resolve(false);
  if (Notification.permission === "granted") return Promise.resolve(true);
  if (Notification.permission === "denied") return Promise.resolve(false);
  return Notification.requestPermission().then((permission) => permission === "granted").catch(() => false);
}
