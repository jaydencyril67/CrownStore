import { useEffect, useMemo, useState } from "react";
import { Bell, CheckCheck, Download, Info, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import {
  clearNotifications, markAllNotificationsRead, markNotificationRead, mergeCrownNotifications, readNotifications,
  type CrownNotification, type NotificationKind
} from "./notifications";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "https://apicrownstore.kingshall.online").replace(/\/$/, "");
const SESSION_KEY = "crownstore-profile-token";
const KIND_LABELS: Record<NotificationKind, string> = {
  appUpdates: "App release",
  downloads: "Download",
  security: "Security",
  storeNotices: "CrownStore notice"
};
function kindIcon(kind: NotificationKind) {
  if (kind === "appUpdates") return <Download size={17} />;
  if (kind === "security") return <ShieldCheck size={17} />;
  if (kind === "storeNotices") return <Info size={17} />;
  return <Bell size={17} />;
}
function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
function sessionToken(): string {
  try { return window.localStorage.getItem(SESSION_KEY) || ""; } catch { return ""; }
}
function isServerNotificationId(id: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(id);
}

export default function NotificationsPage({ onBack, onOpenApp }: { onBack: () => void; onOpenApp: (slug: string) => void }) {
  void onBack;
  const [items, setItems] = useState<CrownNotification[]>(() => readNotifications());
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [confirmClear, setConfirmClear] = useState(false);
  const [syncNotice, setSyncNotice] = useState("");

  async function syncAccountInbox(token = sessionToken()) {
    if (!token) return;
    try {
      const response = await fetch(API_BASE + "/api/notifications", {
        headers: { Accept: "application/json", Authorization: "Bearer " + token },
        cache: "no-store"
      });
      if (!response.ok) return;
      const result = await response.json().catch(() => ({})) as { notifications?: CrownNotification[] };
      if (Array.isArray(result.notifications)) mergeCrownNotifications(result.notifications);
    } catch {
      // The saved on-device inbox remains usable when the API is temporarily unavailable.
    }
  }

  useEffect(() => {
    const refresh = () => setItems(readNotifications());
    const onSession = () => void syncAccountInbox();
    window.addEventListener("crownstore:notifications-changed", refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener("crownstore:profile-session-changed", onSession);
    void syncAccountInbox();
    return () => {
      window.removeEventListener("crownstore:notifications-changed", refresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("crownstore:profile-session-changed", onSession);
    };
  }, []);

  const unread = useMemo(() => items.filter((item) => !item.readAt).length, [items]);
  const visible = useMemo(() => (filter === "unread" ? items.filter((item) => !item.readAt) : items)
    .slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [items, filter]);

  async function markOneRead(item: CrownNotification) {
    if (!item.readAt) markNotificationRead(item.id);
    const token = sessionToken();
    if (token) {
      try {
        if (isServerNotificationId(item.id)) {
          await fetch(API_BASE + "/api/notifications/" + encodeURIComponent(item.id) + "/read", {
            method: "PATCH",
            headers: { Authorization: "Bearer " + token }
          });
        } else if (item.externalKey) {
          await fetch(API_BASE + "/api/notifications/read-by-key", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
            body: JSON.stringify({ externalKey: item.externalKey })
          });
        }
      } catch { /* Keep the local read state if sync is temporarily unavailable. */ }
    }
  }

  async function markAllRead() {
    markAllNotificationsRead();
    const token = sessionToken();
    if (token) {
      try {
        const response = await fetch(API_BASE + "/api/notifications/read-all", {
          method: "POST",
          headers: { Authorization: "Bearer " + token }
        });
        if (!response.ok) setSyncNotice("Read status was saved on this device; account sync will retry when available.");
      } catch {
        setSyncNotice("Read status was saved on this device; account sync will retry when available.");
      }
    }
  }

  const openItem = (item: CrownNotification) => {
    void markOneRead(item);
    if (item.appSlug) onOpenApp(item.appSlug);
  };

  async function clearAll() {
    clearNotifications();
    const token = sessionToken();
    if (token) {
      try {
        const response = await fetch(API_BASE + "/api/notifications", {
          method: "DELETE",
          headers: { Authorization: "Bearer " + token }
        });
        if (!response.ok) setSyncNotice("Cleared this device’s inbox, but the account inbox could not be cleared.");
      } catch {
        setSyncNotice("Cleared this device’s inbox, but the account inbox could not be cleared.");
      }
    }
    setConfirmClear(false);
  }

  return <section className="notifications-page" aria-label="CrownStore notifications">
    <div className="notifications-heading">
      <div className="app-detail-topbar">
        <span className="app-detail-top-label">NOTIFICATIONS</span>
      </div>
      <span className="eyebrow"><Bell size={14} /> CROWNSTORE ALERTS</span>
      <h1>Notifications</h1>
      <p>Sign-in alerts, app releases, completed downloads and important CrownStore notices.</p>
      <div className="notifications-toolbar">
        <div className="notifications-filters" role="group" aria-label="Filter notifications">
          <button type="button" className={filter === "all" ? "is-selected" : ""} aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All <span>{items.length}</span></button>
          <button type="button" className={filter === "unread" ? "is-selected" : ""} aria-pressed={filter === "unread"} onClick={() => setFilter("unread")}>Unread <span>{unread}</span></button>
        </div>
        <div className="notifications-actions">
          <button type="button" onClick={() => void markAllRead()} disabled={!unread}><CheckCheck size={14} /> Mark all read</button>
          <button type="button" onClick={() => setConfirmClear(true)} disabled={!items.length}><Trash2 size={14} /> Clear</button>
        </div>
      </div>
    </div>

    {syncNotice && <p className="notifications-footnote" role="status">{syncNotice}</p>}
    {confirmClear && <div className="notifications-confirm" role="group" aria-label="Confirm clearing notifications"><span>Clear notifications from this device and your signed-in account inbox?</span><button type="button" onClick={() => void clearAll()}>Clear all</button><button type="button" onClick={() => setConfirmClear(false)}>Cancel</button></div>}

    {visible.length ? <div className="notifications-list">{visible.map((item) => <article key={item.id} className={"notification-item" + (!item.readAt ? " is-unread" : "")}>
      <button type="button" className="notification-main" onClick={() => openItem(item)} aria-label={item.appSlug ? "Open " + item.title : "Read " + item.title}>
        <span className="notification-type-icon">{kindIcon(item.kind)}</span>
        <span className="notification-copy"><span className="notification-kind">{KIND_LABELS[item.kind]}</span><strong>{item.title}</strong><span className="notification-body">{item.body}</span><time dateTime={item.createdAt}>{formatTime(item.createdAt)}</time></span>
        {!item.readAt && <span className="notification-unread-dot" aria-label="Unread" />}
      </button>
      <div className="notification-item-actions">
        {!item.readAt && <button type="button" onClick={() => void markOneRead(item)}>Mark read</button>}
        {item.appSlug && <button type="button" onClick={() => onOpenApp(item.appSlug!)}>View app</button>}
      </div>
    </article>)}</div> : <div className="notifications-empty"><span><Bell size={22} /></span><strong>{filter === "unread" ? "You’re all caught up" : "No notifications yet"}</strong><p>{filter === "unread" ? "New unread CrownStore alerts will show up here." : "When CrownStore has a sign-in alert, new release, completed download or important notice, you’ll find it here."}<button type="button" onClick={() => setFilter("all")}><Sparkles size={14} /> View all notifications</button></p></div>}
    <p className="notifications-footnote">Account-linked notifications sync from CrownStore when you are signed in. Device alerts require notification permission, and email alerts require the email channel to be enabled in Menu.</p>
  </section>;
}
