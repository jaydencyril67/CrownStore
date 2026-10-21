import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine, ArrowRight, CheckCircle2, ChevronDown, Crown,
  ExternalLink, Menu, Search, ShieldCheck, Smartphone, Sparkles, X
} from "lucide-react";
import type { AppsResponse, CrownApp } from "./types";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "http://localhost:4000").replace(/\/$/, "");

function formatSize(value: number | string | null): string {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return "Size unavailable";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return (bytes / Math.pow(1024, index)).toFixed(index > 1 ? 1 : 0) + " " + units[index];
}

function AppIcon({ app }: { app: CrownApp }) {
  if (app.iconUrl) return <img className="app-icon-image" src={app.iconUrl} alt="" loading="lazy" />;
  return <div className="app-icon-fallback"><Crown size={28} strokeWidth={1.5} /></div>;
}

function AppCard({ app }: { app: CrownApp }) {
  const ready = Boolean(app.releaseId);
  return (
    <article className="app-card">
      <div className="app-card-top">
        <AppIcon app={app} />
        <span className="category-pill">{app.category || "Application"}</span>
      </div>
      <h3>{app.name}</h3>
      <p className="app-description">{app.shortDescription || app.description || "An official application from the KingsHall ecosystem."}</p>
      <div className="app-meta">
        <span>{app.versionName ? "Version " + app.versionName : "Coming soon"}</span>
        <span>{formatSize(app.sizeBytes)}</span>
      </div>
      {ready ? (
        <a className="button button-primary card-download" href={API_BASE + "/api/downloads/" + app.releaseId}>
          <ArrowDownToLine size={17} /> Download APK
        </a>
      ) : (
        <button className="button button-muted card-download" disabled>
          <span className="status-dot" /> Release coming soon
        </button>
      )}
    </article>
  );
}

export default function App() {
  const [apps, setApps] = useState<CrownApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [mobileMenu, setMobileMenu] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    async function loadApps() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(API_BASE + "/api/apps", { signal: controller.signal });
        if (!response.ok) {
          throw new Error(response.status === 503
            ? "The app catalogue is being configured. Please check back soon."
            : "CrownStore could not load the catalogue. Please try again.");
        }
        const data = await response.json() as AppsResponse;
        setApps(Array.isArray(data.apps) ? data.apps : []);
      } catch (reason) {
        if (controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : "Something went wrong while loading CrownStore.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadApps();
    return () => controller.abort();
  }, []);

  const filteredApps = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return apps;
    return apps.filter((app) =>
      [app.name, app.shortDescription, app.description, app.category]
        .some((value) => value?.toLowerCase().includes(query))
    );
  }, [apps, search]);

  return (
    <div className="site-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <header className="site-header">
        <a className="brand" href="#home" aria-label="CrownStore home">
          <span className="brand-mark"><Crown size={22} strokeWidth={1.8} /></span>
          <span className="brand-word">Crown<span>Store</span><small>BY KINGSHALL</small></span>
        </a>
        <nav className={mobileMenu ? "nav-links nav-open" : "nav-links"}>
          <a href="#apps" onClick={() => setMobileMenu(false)}>Explore apps</a>
          <a href="#about" onClick={() => setMobileMenu(false)}>Why CrownStore</a>
          <a href="#apps" className="nav-mobile-cta" onClick={() => setMobileMenu(false)}>Browse catalogue <ArrowRight size={16} /></a>
        </nav>
        <a className="button button-outline header-cta" href="#apps">Explore store <ArrowRight size={16} /></a>
        <button className="menu-toggle" onClick={() => setMobileMenu((open) => !open)} aria-label={mobileMenu ? "Close menu" : "Open menu"}>
          {mobileMenu ? <X size={22} /> : <Menu size={22} />}
        </button>
      </header>

      <main id="home">
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow"><Sparkles size={14} /> THE OFFICIAL APP COLLECTION</div>
            <h1>Your next favourite app.<br /><span>One royal home.</span></h1>
            <p className="hero-description">Discover the apps built for the KingsHall ecosystem. Official releases, straightforward downloads, all in one place.</p>
            <div className="hero-actions">
              <a className="button button-primary" href="#apps">Explore applications <ArrowRight size={17} /></a>
              <a className="button button-quiet" href="#about">How it works <ChevronDown size={16} /></a>
            </div>
            <div className="trust-row">
              <span><ShieldCheck size={16} /> Official releases</span>
              <span><CheckCircle2 size={16} /> Verified file checks</span>
            </div>
          </div>
          <div className="hero-art" aria-label="CrownStore application collection illustration">
            <div className="orbit orbit-outer" />
            <div className="orbit orbit-inner" />
            <div className="hero-glow" />
            <div className="hero-crown"><Crown size={64} strokeWidth={1.2} /><span>CROWNSTORE</span></div>
            <div className="floating-chip chip-one"><Smartphone size={17} /><span>Android apps</span></div>
            <div className="floating-chip chip-two"><ShieldCheck size={17} /><span>Official builds</span></div>
            <div className="floating-chip chip-three"><ArrowDownToLine size={17} /><span>Direct downloads</span></div>
          </div>
        </section>

        <section className="feature-strip" id="about">
          <div><ShieldCheck /><span><strong>Official builds</strong><small>Published releases only</small></span></div>
          <div><ArrowDownToLine /><span><strong>Simple downloads</strong><small>No account required</small></span></div>
          <div><Smartphone /><span><strong>Android ready</strong><small>Install with Android's installer</small></span></div>
        </section>

        <section className="apps-section" id="apps">
          <div className="section-heading">
            <div><div className="eyebrow">THE COLLECTION</div><h2>Find your next app.</h2><p>Every official KingsHall release, in one place.</p></div>
            <label className="search-box"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search applications..." aria-label="Search applications" />{search && <button onClick={() => setSearch("")} aria-label="Clear search"><X size={15} /></button>}</label>
          </div>

          {loading ? (
            <div className="state-panel"><div className="loader-ring" /><strong>Opening the collection</strong><span>Fetching the latest published apps…</span></div>
          ) : error ? (
            <div className="state-panel state-error"><div className="state-icon"><ExternalLink size={22} /></div><strong>Catalogue temporarily unavailable</strong><span>{error}</span><button className="button button-outline" onClick={() => window.location.reload()}>Try again</button></div>
          ) : filteredApps.length ? (
            <div className="app-grid">{filteredApps.map((app) => <AppCard key={app.id} app={app} />)}</div>
          ) : apps.length ? (
            <div className="state-panel"><div className="state-icon"><Search size={22} /></div><strong>No matching applications</strong><span>Try another search term.</span><button className="button button-outline" onClick={() => setSearch("")}>Clear search</button></div>
          ) : (
            <div className="state-panel"><div className="state-icon"><Crown size={23} /></div><strong>The collection is getting ready.</strong><span>Official apps will appear here when their first stable releases are published.</span></div>
          )}
          <div className="catalogue-footnote"><ShieldCheck size={15} /> CrownStore lists published stable releases only.</div>
        </section>

        <section className="bottom-banner">
          <div className="banner-icon"><Crown size={28} /></div>
          <div><span className="eyebrow">BUILT FOR THE ECOSYSTEM</span><h2>One home. Every KingsHall app.</h2><p>Come back here for official releases and future updates.</p></div>
          <a className="button button-outline" href="#apps">Browse apps <ArrowRight size={16} /></a>
        </section>
      </main>

      <footer className="site-footer">
        <a className="brand footer-brand" href="#home"><span className="brand-mark"><Crown size={19} /></span><span className="brand-word">Crown<span>Store</span><small>BY KINGSHALL</small></span></a>
        <span>Official apps. One trusted home.</span>
        <span className="footer-status"><span className="status-dot" /> Public catalogue</span>
      </footer>
    </div>
  );
}
