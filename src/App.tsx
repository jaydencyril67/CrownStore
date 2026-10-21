import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import NowBar from "./NowBar";
import {
  ArrowDownToLine, ArrowRight, Bot, CheckCircle2, ChevronRight,
  Download, Info, Layers3, MessageCircle, PackageCheck, Search,
  ShieldCheck, Smartphone, Sparkles, X
} from "lucide-react";
import type { AppsResponse, CrownApp } from "./types";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "https://api.crownstore.kingshall.online").replace(/\/$/, "");
type View = "HOME" | "APPS" | "UPDATES" | "ABOUT";

function formatSize(value: number | string | null) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return "Size pending";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 3);
  return (bytes / Math.pow(1024, i)).toFixed(i > 1 ? 1 : 0) + " " + units[i];
}
function formatDate(value: string | null) {
  if (!value) return "Not published";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not published" : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
function readableCategory(value: string) {
  return value.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function StoreMark({ size = 24 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true" focusable="false">
    <path d="M20 3.5 33 11v15L20 33.5 7 26V11L20 3.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    <path d="m12 14.2 8-4.6 8 4.6-8 4.6-8-4.6Z" fill="currentColor" fillOpacity=".95" />
    <path d="m12 19.3 8 4.6 8-4.6M12 23.8l8 4.6 8-4.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="m30.8 5.2.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" fill="currentColor" />
  </svg>;
}

function AppIcon({ app }: { app: CrownApp }) {
  if (app.iconUrl) return <img className="app-icon-image" src={app.iconUrl} alt={app.name + " icon"} loading="lazy" />;
  return <div className="app-icon-fallback" aria-hidden="true"><StoreMark size={27} /></div>;
}

function AppCard({ app, onDetails }: { app: CrownApp; onDetails: (app: CrownApp) => void }) {
  return <button className="shelf-app-tile" onClick={() => onDetails(app)} aria-label={"View " + app.name + " details"}>
    <span className="shelf-app-icon"><AppIcon app={app} /></span>
    <span className="shelf-app-name">{app.name}</span>
  </button>;
}

function AppDetails({ app, onClose }: { app: CrownApp; onClose: () => void }) {
  const ready = Boolean(app.releaseId);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="details-modal glass-panel" role="dialog" aria-modal="true" aria-labelledby="details-title">
      <button className="modal-close" onClick={onClose} aria-label="Close details"><X size={19} /></button>
      <div className="details-heading">
        <AppIcon app={app} />
        <div><span className="eyebrow">KINGSHALL ECOSYSTEM</span><h2 id="details-title">{app.name}</h2><span className="details-package">{app.packageId}</span></div>
      </div>
      <p className="details-description">{app.description || app.shortDescription}</p>
      {app.screenshots.length > 0 && <div className="details-screenshots" aria-label={app.name + " screenshots"}>
        {app.screenshots.map((screenshot, index) => <img key={screenshot + index} src={screenshot} alt={app.name + " screenshot " + (index + 1)} loading="lazy" />)}
      </div>}
      <div className="details-facts">
        <div><span>Latest version</span><strong>{app.versionName ? "v" + app.versionName : "Not released yet"}</strong></div>
        <div><span>Version code</span><strong>{app.versionCode ?? "Not available"}</strong></div>
        <div><span>APK size</span><strong>{formatSize(app.sizeBytes)}</strong></div>
        <div><span>Release status</span><strong>{ready ? "Published stable" : "Coming soon"}</strong></div>
        <div><span>Category</span><strong>{readableCategory(app.category || "Utilities")}</strong></div>
        <div><span>Published</span><strong>{formatDate(app.publishedAt)}</strong></div>
        {app.sha256 && <div className="details-checksum"><span>Verified APK SHA-256</span><strong>{app.sha256}</strong></div>}
      </div>
      {app.changelog && <div className="changelog"><strong>What's new</strong><p>{app.changelog}</p></div>}
      {ready
        ? <a className="button button-primary details-download" href={API_BASE + "/api/downloads/" + app.releaseId}><Download size={17} /> Download official APK</a>
        : <div className="release-note"><ShieldCheck size={17} /> The download appears here after an official stable APK is verified and published.</div>}
    </section>
  </div>;
}

function PublisherPanel({ onClose, apps, onPublished }: { onClose: () => void; apps: CrownApp[]; onPublished: () => void }) {
  const [token, setToken] = useState("");
  const [appSlug, setAppSlug] = useState(apps[0]?.slug || "kingshall");
  const [tagName, setTagName] = useState("");
  const [versionName, setVersionName] = useState("");
  const [versionCode, setVersionCode] = useState("");
  const [assetName, setAssetName] = useState("");
  const [sourceCommit, setSourceCommit] = useState("");
  const [changelog, setChangelog] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (apps.length > 0 && !apps.some((item) => item.slug === appSlug)) setAppSlug(apps[0].slug);
  }, [apps, appSlug]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(API_BASE + "/api/publishing/releases", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ appSlug, tagName, versionName, versionCode: Number(versionCode), assetName, sourceCommit, changelog })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Publishing failed.");
      setMessage("Published " + data.app.name + " " + data.release.versionName + " successfully. SHA-256: " + data.release.sha256);
      setVersionCode(""); setVersionName(""); setTagName(""); setAssetName(""); setSourceCommit(""); setChangelog("");
      onPublished();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Publishing failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="modal-backdrop publisher-backdrop">
    <section className="publisher-modal glass-panel" role="dialog" aria-modal="true" aria-labelledby="publisher-title">
      <button className="modal-close" onClick={onClose} aria-label="Close publisher"><X size={19} /></button>
      <span className="eyebrow">ADMINISTRATOR TOOL</span>
      <h2 id="publisher-title">Publish an official APK</h2>
      <p className="publisher-intro">First create a published, non-prerelease GitHub Release with the APK attached in the public CrownStoreApk repository. This publisher downloads it to a temporary server file, checks the APK manifest against the selected app and version, calculates SHA-256, then atomically publishes the verified release metadata. Your publishing token stays in this browser session and is sent only to the CrownStore API.</p>
      <form onSubmit={submit} className="publisher-form">
        <label>Publishing token<input type="password" value={token} onChange={(event) => setToken(event.target.value)} autoComplete="off" required placeholder="Render PUBLISHING_TOKEN" /></label>
        <label>Application<select value={appSlug} onChange={(event) => setAppSlug(event.target.value)} required disabled={apps.length === 0}>
          {apps.map((item) => <option value={item.slug} key={item.id}>{item.name} ({item.slug})</option>)}
        </select></label>
        {apps.length === 0 && <p className="publisher-message">No listed apps are available to publish. Add and list an app in Manage Apps first.</p>}
        <div className="publisher-fields">
          <label>Release tag<input value={tagName} onChange={(event) => setTagName(event.target.value)} required placeholder="v1.0.0" /></label>
          <label>Version name<input value={versionName} onChange={(event) => setVersionName(event.target.value)} required placeholder="1.0.0" /></label>
          <label>Version code<input type="number" min="1" step="1" value={versionCode} onChange={(event) => setVersionCode(event.target.value)} required placeholder="1" /></label>
          <label>APK filename<input value={assetName} onChange={(event) => setAssetName(event.target.value)} required placeholder="KingsHall-1.0.0.apk" /></label>
        </div>
        <label>Source commit SHA (40 characters)<input value={sourceCommit} onChange={(event) => setSourceCommit(event.target.value)} minLength={40} maxLength={40} pattern="[a-fA-F0-9]{40}" required placeholder="Git commit used to build the APK" /></label>
        <label>What's new<textarea value={changelog} onChange={(event) => setChangelog(event.target.value)} rows={3} maxLength={10000} placeholder="Release notes (optional)" /></label>
        <button className="button button-primary publisher-submit" disabled={busy}>{busy ? "Verifying APK…" : "Verify and publish release"}</button>
        {message && <p className="publisher-message" role="status">{message}</p>}
      </form>
    </section>
  </div>;
}


type ManagedApp = CrownApp & { sourceRepo: string; isListed: boolean };
type CatalogueForm = {
  name: string; slug: string; packageId: string; shortDescription: string; description: string;
  category: string; sourceRepo: string; iconUrl: string; screenshotsText: string; isListed: boolean;
};
const emptyCatalogueForm = (): CatalogueForm => ({
  name: "", slug: "", packageId: "", shortDescription: "", description: "",
  category: "Utilities", sourceRepo: "", iconUrl: "", screenshotsText: "", isListed: true
});
function catalogueFormFor(app: ManagedApp): CatalogueForm {
  return {
    name: app.name, slug: app.slug, packageId: app.packageId, shortDescription: app.shortDescription || "",
    description: app.description || "", category: app.category || "Utilities", sourceRepo: app.sourceRepo || "",
    iconUrl: app.iconUrl || "", screenshotsText: (app.screenshots || []).join("\n"), isListed: app.isListed
  };
}

function AppManagerPanel({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [token, setToken] = useState("");
  const [catalogue, setCatalogue] = useState<ManagedApp[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editingSlug, setEditingSlug] = useState("__new__");
  const [form, setForm] = useState<CatalogueForm>(emptyCatalogueForm);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function loadCatalogue() {
    if (!token.trim()) { setMessage("Enter the Render PUBLISHING_TOKEN to access app management."); return; }
    setBusy(true); setMessage("");
    try {
      const response = await fetch(API_BASE + "/api/apps/admin/catalogue", {
        headers: { Authorization: "Bearer " + token.trim() }
      });
      const data = await response.json() as { apps?: ManagedApp[]; error?: string };
      if (!response.ok) throw new Error(data.error || "Could not load the managed catalogue.");
      const items = Array.isArray(data.apps) ? data.apps : [];
      setCatalogue(items); setLoaded(true);
      setEditingSlug("__new__"); setForm(emptyCatalogueForm());
      setMessage("Loaded " + items.length + " catalogue entries.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load the managed catalogue.");
    } finally { setBusy(false); }
  }

  function selectEntry(value: string) {
    setMessage("");
    setEditingSlug(value);
    if (value === "__new__") { setForm(emptyCatalogueForm()); return; }
    const item = catalogue.find((entry) => entry.slug === value);
    if (item) setForm(catalogueFormFor(item));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token.trim()) { setMessage("Enter your publishing token first."); return; }
    setBusy(true); setMessage("");
    const previousSlug = editingSlug;
    const isNew = previousSlug === "__new__";
    const payload = {
      name: form.name.trim(),
      slug: form.slug.trim().toLowerCase(),
      packageId: form.packageId.trim(),
      shortDescription: form.shortDescription.trim(),
      description: form.description.trim(),
      category: form.category.trim() || "Utilities",
      sourceRepo: form.sourceRepo.trim(),
      iconUrl: form.iconUrl.trim() || null,
      screenshots: form.screenshotsText.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean),
      isListed: form.isListed
    };
    try {
      const endpoint = isNew ? API_BASE + "/api/apps" : API_BASE + "/api/apps/" + encodeURIComponent(previousSlug);
      const response = await fetch(endpoint, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token.trim() },
        body: JSON.stringify(payload)
      });
      const data = await response.json() as { app?: ManagedApp; error?: string };
      if (!response.ok || !data.app) throw new Error(data.error || "Could not save application details.");
      const saved = data.app;
      setCatalogue((current) => {
        const next = isNew ? [...current, saved] : current.map((item) => item.slug === previousSlug ? saved : item);
        return next.sort((a, b) => a.name.localeCompare(b.name));
      });
      setEditingSlug(saved.slug);
      setForm(catalogueFormFor(saved));
      setMessage((isNew ? "Application added: " : "Application updated: ") + saved.name + ". " +
        (saved.isListed ? "It is listed in the public store." : "It is hidden from the public store."));
      onSaved();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save application details.");
    } finally { setBusy(false); }
  }

  return <div className="modal-backdrop publisher-backdrop">
    <section className="publisher-modal glass-panel" role="dialog" aria-modal="true" aria-labelledby="manager-title">
      <button className="modal-close" onClick={onClose} aria-label="Close app manager"><X size={19} /></button>
      <span className="eyebrow">CATALOGUE ADMINISTRATION</span>
      <h2 id="manager-title">Manage CrownStore apps</h2>
      <p className="publisher-intro">Add, update, or hide applications without editing the storefront source. App metadata is stored in the CrownStore database. APK releases are published separately through the verified Publisher.</p>
      <div className="publisher-form">
        <label>Administrator publishing token<input type="password" value={token} onChange={(event) => setToken(event.target.value)} autoComplete="off" required placeholder="Render PUBLISHING_TOKEN" /></label>
        <button className="button button-outline" type="button" onClick={() => void loadCatalogue()} disabled={busy}>{busy ? "Loading…" : "Load catalogue"}</button>
      </div>
      {loaded && <>
        <form onSubmit={submit} className="publisher-form manager-form">
          <label>Application<select value={editingSlug} onChange={(event) => selectEntry(event.target.value)}>
            <option value="__new__">+ Add a new application</option>
            {catalogue.map((item) => <option value={item.slug} key={item.id}>{item.name}{item.isListed ? "" : " (hidden)"}</option>)}
          </select></label>
          <div className="publisher-fields">
            <label>App name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required maxLength={80} placeholder="My KingsHall App" /></label>
            <label>URL slug<input value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value })} required maxLength={80} pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="my-app" /></label>
            <label>Android package ID<input value={form.packageId} onChange={(event) => setForm({ ...form, packageId: event.target.value })} required maxLength={200} placeholder="com.kingshall.myapp" /></label>
            <label>Category<input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} required maxLength={50} placeholder="Utilities, Social, AI…" /></label>
            <label>Source repository (owner/repo)<input value={form.sourceRepo} onChange={(event) => setForm({ ...form, sourceRepo: event.target.value })} required maxLength={200} pattern="[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+" placeholder="jaydencyril67/MyApp" /></label>
            <label>App icon HTTPS URL<input type="url" value={form.iconUrl} onChange={(event) => setForm({ ...form, iconUrl: event.target.value })} placeholder="https://…/icon.png" /></label>
          </div>
          <label>Short description<input value={form.shortDescription} onChange={(event) => setForm({ ...form, shortDescription: event.target.value })} maxLength={180} placeholder="A short description for the catalogue" /></label>
          <label>Full description<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={3} maxLength={5000} placeholder="Describe what the app does" /></label>
          <label>Screenshot HTTPS URLs (one per line)<textarea value={form.screenshotsText} onChange={(event) => setForm({ ...form, screenshotsText: event.target.value })} rows={3} placeholder="https://…/screenshot-1.png" /></label>
          <label className="manager-listed"><input type="checkbox" checked={form.isListed} onChange={(event) => setForm({ ...form, isListed: event.target.checked })} /> Show this app in the public CrownStore catalogue</label>
          <button className="button button-primary publisher-submit" disabled={busy}>{busy ? "Saving…" : editingSlug === "__new__" ? "Add application" : "Save application changes"}</button>
        </form>
      </>}
      {message && <p className="publisher-message manager-message" role="status">{message}</p>}
    </section>
  </div>;
}

export default function App() {
  const [apps, setApps] = useState<CrownApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All apps");
  const [selectedApp, setSelectedApp] = useState<CrownApp | null>(null);
  const [showPublisher, setShowPublisher] = useState(false);
  const [showAppManager, setShowAppManager] = useState(false);
  const [view, setView] = useState<View>("HOME");

  async function loadApps(signal?: AbortSignal) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(API_BASE + "/api/apps", { signal });
      if (!response.ok) throw new Error(response.status === 503 ? "The catalogue service is temporarily unavailable. Please try again shortly." : "CrownStore could not load the catalogue. Please try again.");
      const data = await response.json() as AppsResponse;
      setApps(Array.isArray(data.apps) ? data.apps : []);
    } catch (error) {
      if (signal?.aborted) return;
      setError(error instanceof Error ? error.message : "Something went wrong loading CrownStore.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void loadApps(controller.signal);
    return () => controller.abort();
  }, []);

  const categories = useMemo(() => ["All apps", ...Array.from(new Set(apps.map((app) => app.category).filter((item): item is string => Boolean(item && item.trim())))).sort((a, b) => a.localeCompare(b))], [apps]);
  const filtered = useMemo(() => {
    const base = view === "UPDATES" ? apps.filter((app) => app.releaseId) : apps;
    const q = search.trim().toLowerCase();
    return base.filter((app) => {
      const categoryMatches = category === "All apps" || app.category?.toLowerCase() === category.toLowerCase();
      const searchMatches = !q || [app.name, app.shortDescription, app.description, app.category, app.packageId].some((value) => value?.toLowerCase().includes(q));
      return categoryMatches && searchMatches;
    }).sort((a, b) => {
      if (view === "UPDATES") return new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime();
      return a.name.localeCompare(b.name);
    });
  }, [apps, search, category, view]);

  function navigate(next: View) {
    setView(next);
    document.getElementById(next === "HOME" ? "home" : next === "ABOUT" ? "about" : "apps")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const updatesAvailable = apps.some((app) => Boolean(app.releaseId));
  return <div className="site-shell">
    <div className="ambient ambient-one" /><div className="ambient ambient-two" />
    <header className="app-header glass-panel" aria-label="CrownStore">
      <span className="header-artwork"><span className="header-logo brand-mark"><StoreMark size={19} /></span></span>
      <div className="header-brand"><div className="header-brand-copy"><p className="header-brand-title">CrownStore</p></div></div>
      <div className="header-right-artwork"><span className="header-logo brand-mark"><ShoppingBag size={19} /></span></div>
    </header>
    <main id="home">
      {view === "HOME" ? <section className="home-shelves" aria-label="App shelves">
        {[
          { id: "recommended", title: "Recommended for you", subtitle: "Explore the official KingsHall app collection.", icon: Sparkles, select: (_app: CrownApp) => true, sort: (a: CrownApp, b: CrownApp) => Number(Boolean(b.releaseId)) - Number(Boolean(a.releaseId)) || a.name.localeCompare(b.name) },
          { id: "top-charts", title: "Top charts", subtitle: "Discover the apps available across CrownStore.", icon: Layers3, select: (_app: CrownApp) => true, sort: (a: CrownApp, b: CrownApp) => Number(Boolean(b.releaseId)) - Number(Boolean(a.releaseId)) || a.name.localeCompare(b.name) },
          { id: "recently-updated", title: "Recently updated", subtitle: "The latest officially published app releases.", icon: Download, select: (app: CrownApp) => Boolean(app.releaseId), sort: (a: CrownApp, b: CrownApp) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime() },
          { id: "social", title: "Social", subtitle: "Apps for conversations and staying connected.", icon: MessageCircle, select: (app: CrownApp) => /social|chat|communication|community/i.test([app.category, app.slug, app.name].join(" ")), sort: (a: CrownApp, b: CrownApp) => a.name.localeCompare(b.name) },
          { id: "ai-productivity", title: "AI & productivity", subtitle: "Tools designed to help you create and get things done.", icon: Bot, select: (app: CrownApp) => /ai|productivity|bot|automation/i.test([app.category, app.slug, app.name].join(" ")), sort: (a: CrownApp, b: CrownApp) => a.name.localeCompare(b.name) },
          { id: "tools", title: "Tools & utilities", subtitle: "Useful apps from across the KingsHall ecosystem.", icon: ShieldCheck, select: (app: CrownApp) => /tool|utilit|finance|security/i.test([app.category, app.slug, app.name].join(" ")), sort: (a: CrownApp, b: CrownApp) => a.name.localeCompare(b.name) }
        ].map((shelf) => {
          const ShelfIcon = shelf.icon;
          const shelfApps = apps.filter(shelf.select).sort(shelf.sort);
          return <section className="app-shelf" key={shelf.id} aria-labelledby={"shelf-" + shelf.id}>
            <div className="shelf-heading"><div className="shelf-title-wrap"><span className="shelf-icon"><ShelfIcon size={18} /></span><div><h2 id={"shelf-" + shelf.id}>{shelf.title}</h2><p>{shelf.subtitle}</p></div></div><div className="shelf-heading-actions"><span className="shelf-count">{shelfApps.length} {shelfApps.length === 1 ? "app" : "apps"}</span></div></div>
            <div className="shelf-track" aria-label={shelf.title + " app slots"}>
              {(loading ? [] : shelfApps).map((app) => <div className="shelf-app-card" key={app.id}><AppCard app={app} onDetails={setSelectedApp} /></div>)}
              {Array.from({ length: Math.max(0, 50 - (loading ? 0 : shelfApps.length)) }, (_, index) => (
                <div className="shelf-app-card shelf-empty-slot-card" key={"empty-slot-" + index} aria-hidden="true">
                  <div className="shelf-app-tile shelf-empty-slot" />
                </div>
              ))}
            </div>
          </section>;
        })}
        <div className="shelf-footer-note"><ShieldCheck size={15} /> Official apps and verified Android releases, all in one trusted place.</div>
      </section> : <>
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><Sparkles size={14} /> THE OFFICIAL APP COLLECTION</div>
          <h1>All your apps.<br /><span>One royal home.</span></h1>
          <p className="hero-description">Discover the apps built for the KingsHall ecosystem. Official Android releases, clear version details and direct downloads—all in one trusted place.</p>
          <div className="hero-actions"><button className="button button-primary" onClick={() => navigate("APPS")}>Explore applications <ArrowRight size={17} /></button><button className="button button-quiet" onClick={() => navigate("ABOUT")}>How it works <ChevronRight size={16} /></button></div>
          <div className="trust-row"><span><ShieldCheck size={16} /> Official releases</span><span><CheckCircle2 size={16} /> Verified APK metadata</span></div>
        </div>
        <div className="hero-art"><div className="orbit orbit-outer" /><div className="orbit orbit-inner" /><div className="hero-glow" /><div className="hero-crown"><StoreMark size={61} /><span>CROWNSTORE</span></div><div className="floating-chip chip-one"><Smartphone size={17} /> Android apps</div><div className="floating-chip chip-two"><ShieldCheck size={17} /> Verified builds</div><div className="floating-chip chip-three"><ArrowDownToLine size={17} /> Direct downloads</div></div>
      </section>
      <section className="feature-strip" id="about">
        <div><ShieldCheck /><span><strong>Verified releases</strong><small>APK package and version checked</small></span></div>
        <div><PackageCheck /><span><strong>Release details</strong><small>Version, size, checksum and changelog</small></span></div>
        <div><Smartphone /><span><strong>Android ready</strong><small>Direct APK downloads</small></span></div>
      </section>
      <section className="apps-section" id="apps">
        <div className="section-heading">
          <div><div className="eyebrow">{view === "UPDATES" ? "LATEST PUBLISHED BUILDS" : "THE COLLECTION"}</div><h2>{view === "UPDATES" ? "Latest releases" : "Find your next app."}</h2><p>{view === "UPDATES" ? "The latest stable APKs published to CrownStore." : "Browse the official KingsHall app family."}</p></div>
          <label className="search-box"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search apps or package names..." aria-label="Search applications" />{search && <button onClick={() => setSearch("")} aria-label="Clear search"><X size={15} /></button>}</label>
        </div>
        {!loading && !error && apps.length > 0 && <div className="catalogue-controls">
          <div className="category-filters" role="group" aria-label="Filter by app category">
            {categories.map((item) => <button key={item} className={category === item ? "category-filter active" : "category-filter"} aria-pressed={category === item} onClick={() => setCategory(item)}>{item === "All apps" ? item : readableCategory(item)}</button>)}
          </div>
          <span className="results-count">{filtered.length} {filtered.length === 1 ? "app" : "apps"}</span>
        </div>}
        {loading
          ? <div className="state-panel"><div className="loader-ring" /><strong>Opening the collection</strong><span>Fetching published apps…</span></div>
          : error
            ? <div className="state-panel state-error"><div className="state-icon"><Info size={22} /></div><strong>Catalogue temporarily unavailable</strong><span>{error}</span><button className="button button-outline" onClick={() => void loadApps()}>Try again</button></div>
            : filtered.length
              ? <div className="app-grid">{filtered.map((app) => <AppCard key={app.id} app={app} onDetails={setSelectedApp} />)}</div>
              : view === "UPDATES" && !search.trim() && category === "All apps" && !updatesAvailable
                ? <div className="state-panel"><div className="state-icon"><Download size={22} /></div><strong>No published updates yet</strong><span>The apps are in the catalogue, but no stable APK release has been published yet. Check back after the first release is verified.</span></div>
                : apps.length
                  ? <div className="state-panel"><div className="state-icon"><Search size={22} /></div><strong>No matching applications</strong><span>Try another search term or category.</span><button className="button button-outline" onClick={() => { setSearch(""); setCategory("All apps"); }}>Clear filters</button></div>
                  : <div className="state-panel"><div className="state-icon"><StoreMark size={23} /></div><strong>The collection is getting ready</strong><span>Official apps appear here as soon as the catalogue is configured.</span></div>}
        <div className="catalogue-footnote"><ShieldCheck size={15} /> Downloads resolve through the official CrownStore API and published release catalogue.</div>
      </section>
      </>}
      {view !== "HOME" && <section className="bottom-banner"><div className="banner-icon"><StoreMark size={28} /></div><div><span className="eyebrow">BUILT FOR THE ECOSYSTEM</span><h2>One home. Every KingsHall app.</h2><p>Come back for official releases and verified updates.</p></div><button className="button button-outline" onClick={() => navigate("APPS")}>Browse apps <ArrowRight size={16} /></button></section>}
    </main>
    <footer className="site-footer"><a className="brand footer-brand" href="#home"><span className="brand-mark"><ShoppingBag size={19} /></span><span className="brand-word">Crown<span>Store</span><small>BY KINGSHALL</small></span></a><span>Official apps. One trusted home.</span><span className="footer-status"><span className="status-dot live-dot" /> Public catalogue</span><div className="footer-admin-actions"><button className="publisher-open" onClick={() => setShowAppManager(true)}>Manage Apps</button><button className="publisher-open" onClick={() => setShowPublisher(true)}>Publisher</button></div></footer>
    <NowBar onHome={() => { setView("HOME"); document.getElementById("home")?.scrollIntoView({ behavior: "smooth", block: "start" }); }} />
    {selectedApp && <AppDetails app={selectedApp} onClose={() => setSelectedApp(null)} />}
    {showAppManager && <AppManagerPanel onClose={() => setShowAppManager(false)} onSaved={() => void loadApps()} />}
    {showPublisher && <PublisherPanel apps={apps.filter((item) => !("isListed" in item) || item.isListed)} onPublished={() => void loadApps()} onClose={() => setShowPublisher(false)} />}
  </div>;
}
