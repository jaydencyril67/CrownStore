import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Bell, CheckCheck, Download, Info, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import {
  clearNotifications, markAllNotificationsRead, markNotificationRead, readNotifications,
  type CrownNotification, type NotificationKind
} from "./notifications";

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

export default function NotificationsPage({ onBack, onOpenApp }: { onBack: () => void; onOpenApp: (slug: string) => void }) {
  const [items, setItems] = useState<CrownNotification[]>(() => readNotifications());
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    const refresh = () => setItems(readNotifications());
    window.addEventListener("crownstore:notifications-changed", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("crownstore:notifications-changed", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const unread = useMemo(() => items.filter((item) => !item.readAt).length, [items]);
  const visible = useMemo(() => (filter === "unread" ? items.filter((item) => !item.readAt) : items)
    .slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [items, filter]);

  const openItem = (item: CrownNotification) => {
    if (!item.readAt) markNotificationRead(item.id);
    if (item.appSlug) onOpenApp(item.appSlug);
  };

  return <section className="notifications-page" aria-label="CrownStore notifications">
    <div className="notifications-heading">
      <button className="menu-back" type="button" onClick={onBack}><ArrowLeft size={16} /> Back to Menu</button>
      <span className="eyebrow"><Bell size={14} /> CROWNSTORE ALERTS</span>
      <h1>Notifications</h1>
      <p>Release updates and important alerts from CrownStore, collected in one place.</p>
      <div className="notifications-toolbar">
        <div className="notifications-filters" role="group" aria-label="Filter notifications">
          <button type="button" className={filter === "all" ? "is-selected" : ""} aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All <span>{items.length}</span></button>
          <button type="button" className={filter === "unread" ? "is-selected" : ""} aria-pressed={filter === "unread"} onClick={() => setFilter("unread")}>Unread <span>{unread}</span></button>
        </div>
        <div className="notifications-actions">
          <button type="button" onClick={() => markAllNotificationsRead()} disabled={!unread}><CheckCheck size={14} /> Mark all read</button>
          <button type="button" onClick={() => setConfirmClear(true)} disabled={!items.length}><Trash2 size={14} /> Clear</button>
        </div>
      </div>
    </div>

    {confirmClear && <div className="notifications-confirm" role="group" aria-label="Confirm clearing notifications"><span>Clear all saved notifications from this device?</span><button type="button" onClick={() => { clearNotifications(); setConfirmClear(false); }}>Clear all</button><button type="button" onClick={() => setConfirmClear(false)}>Cancel</button></div>}

    {visible.length ? <div className="notifications-list">{visible.map((item) => <article key={item.id} className={"notification-item" + (!item.readAt ? " is-unread" : "")}>
      <button type="button" className="notification-main" onClick={() => openItem(item)} aria-label={item.appSlug ? "Open " + item.title : "Read " + item.title}>
        <span className="notification-type-icon">{kindIcon(item.kind)}</span>
        <span className="notification-copy"><span className="notification-kind">{KIND_LABELS[item.kind]}</span><strong>{item.title}</strong><span className="notification-body">{item.body}</span><time dateTime={item.createdAt}>{formatTime(item.createdAt)}</time></span>
        {!item.readAt && <span className="notification-unread-dot" aria-label="Unread" />}
      </button>
      <div className="notification-item-actions">
        {!item.readAt && <button type="button" onClick={() => markNotificationRead(item.id)}>Mark read</button>}
        {item.appSlug && <button type="button" onClick={() => onOpenApp(item.appSlug!)}>View app</button>}
      </div>
    </article>)}</div> : <div className="notifications-empty"><span><Bell size={22} /></span><strong>{filter === "unread" ? "You’re all caught up" : "No notifications yet"}</strong><p>{filter === "unread" ? "New unread CrownStore alerts will show up here." : "When CrownStore has a new release update or important notice, you’ll find it here."}</p><button type="button" onClick={() => setFilter("all")}><Sparkles size={14} /> View all notifications</button></div>}
    <p className="notifications-footnote">Notifications are currently stored on this device. Device alerts require permission and an active CrownStore connection.</p>
  </section>;
}
