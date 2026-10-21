import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  ArrowDownToLine, ArrowRight, Bot, CheckCircle2, ChevronRight, Crown,
  Download, Home, Info, Layers3, MessageCircle, PackageCheck, Search,
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

function AppIcon({ app }: { app: CrownApp }) {
  if (app.iconUrl) return <img className="app-icon-image" src={app.iconUrl} alt={app.name + " icon"} loading="lazy" />;
  const Icon = app.slug === "halls-chat" ? MessageCircle : app.slug === "crybots" ? Bot : Crown;
  return <div className={"app-icon-fallback icon-" + app.slug} aria-hidden="true"><Icon size={27} /></div>;
}

function AppCard({ app, onDetails }: { app: CrownApp; onDetails: (app: CrownApp) => void }) {
  const ready = Boolean(app.releaseId);
  return <article className="app-card">
    <button className="app-card-details" onClick={() => onDetails(app)} aria-label={"View " + app.name + " details"}>
      <div className="app-card-top">
        <AppIcon app={app} />
        <span className={ready ? "category-pill is-ready" : "category-pill"}>{ready ? "Official release" : "Coming soon"}</span>
      </div>
      <h3>{app.name}</h3>
      <p className="app-description">{app.shortDescription || app.description || "An official application from the KingsHall ecosystem."}</p>
      <span className="details-link">App details <ChevronRight size={15} /></span>
    </button>
    <div className="app-meta"><span>{app.versionName ? "v" + app.versionName : "Awaiting first release"}</span><span>{formatSize(app.sizeBytes)}</span></div>
    {ready
      ? <a className="button button-primary card-download" href={API_BASE + "/api/downloads/" + app.releaseId}><ArrowDownToLine size={17} /> Download APK</a>
      : <button className="button button-muted card-download" disabled><span className="status-dot" /> Release coming soon</button>}
  </article>;
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

function PublisherPanel({ onClose }: { onClose: () => void }) {
  const [token, setToken] = useState("");
  const [appSlug, setAppSlug] = useState("kingshall");
  const [tagName, setTagName] = useState("");
  const [versionName, setVersionName] = useState("");
  const [versionCode, setVersionCode] = useState("");
  const [assetName, setAssetName] = useState("");
  const [sourceCommit, setSourceCommit] = useState("");
  const [changelog, setChangelog] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

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
        <label>Application<select value={appSlug} onChange={(event) => setAppSlug(event.target.value)}><option value="kingshall">KingsHall</option><option value="halls-chat">HallsChat</option><option value="crybots">CryBots</option></select></label>
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

export default function App() {
  const [apps, setApps] = useState<CrownApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All apps");
  const [selectedApp, setSelectedApp] = useState<CrownApp | null>(null);
  const [showPublisher, setShowPublisher] = useState(false);
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
      <span className="header-artwork"><span className="header-logo brand-mark"><Crown size={19} /></span></span>
      <div className="header-brand"><div className="header-brand-copy"><p className="header-brand-title">CrownStore</p></div></div>
      <div className="header-right-artwork"><span className="header-logo brand-mark"><Crown size={19} /></span></div>
    </header>
    <main id="home">
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><Sparkles size={14} /> THE OFFICIAL APP COLLECTION</div>
          <h1>All your apps.<br /><span>One royal home.</span></h1>
          <p className="hero-description">Discover the apps built for the KingsHall ecosystem. Official Android releases, clear version details and direct downloads—all in one trusted place.</p>
          <div className="hero-actions"><button className="button button-primary" onClick={() => navigate("APPS")}>Explore applications <ArrowRight size={17} /></button><button className="button button-quiet" onClick={() => navigate("ABOUT")}>How it works <ChevronRight size={16} /></button></div>
          <div className="trust-row"><span><ShieldCheck size={16} /> Official releases</span><span><CheckCircle2 size={16} /> Verified APK metadata</span></div>
        </div>
        <div className="hero-art"><div className="orbit orbit-outer" /><div className="orbit orbit-inner" /><div className="hero-glow" /><div className="hero-crown"><Crown size={61} /><span>CROWNSTORE</span></div><div className="floating-chip chip-one"><Smartphone size={17} /> Android apps</div><div className="floating-chip chip-two"><ShieldCheck size={17} /> Verified builds</div><div className="floating-chip chip-three"><ArrowDownToLine size={17} /> Direct downloads</div></div>
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
                  : <div className="state-panel"><div className="state-icon"><Crown size={23} /></div><strong>The collection is getting ready</strong><span>Official apps appear here as soon as the catalogue is configured.</span></div>}
        <div className="catalogue-footnote"><ShieldCheck size={15} /> Downloads resolve through the official CrownStore API and published release catalogue.</div>
      </section>
      <section className="bottom-banner"><div className="banner-icon"><Crown size={28} /></div><div><span className="eyebrow">BUILT FOR THE ECOSYSTEM</span><h2>One home. Every KingsHall app.</h2><p>Come back for official releases and verified updates.</p></div><button className="button button-outline" onClick={() => navigate("APPS")}>Browse apps <ArrowRight size={16} /></button></section>
    </main>
    <footer className="site-footer"><a className="brand footer-brand" href="#home"><span className="brand-mark"><Crown size={19} /></span><span className="brand-word">Crown<span>Store</span><small>BY KINGSHALL</small></span></a><span>Official apps. One trusted home.</span><span className="footer-status"><span className="status-dot live-dot" /> Public catalogue</span><button className="publisher-open" onClick={() => setShowPublisher(true)}>Publisher</button></footer>
    <nav className="nowbar glass-panel" aria-label="CrownStore navigation"><button className={view === "HOME" ? "nowbar-item active" : "nowbar-item"} onClick={() => navigate("HOME")}><Home size={17} /><span>HOME</span></button><button className={view === "APPS" ? "nowbar-item active" : "nowbar-item"} onClick={() => navigate("APPS")}><Layers3 size={17} /><span>APPS</span></button><button className={view === "UPDATES" ? "nowbar-item active" : "nowbar-item"} onClick={() => navigate("UPDATES")}><Download size={17} /><span>UPDATES</span></button><button className={view === "ABOUT" ? "nowbar-item active" : "nowbar-item"} onClick={() => navigate("ABOUT")}><Info size={17} /><span>ABOUT</span></button></nav>
    {selectedApp && <AppDetails app={selectedApp} onClose={() => setSelectedApp(null)} />}
    {showPublisher && <PublisherPanel onClose={() => setShowPublisher(false)} />}
  </div>;
}
