import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import NowBar from "./NowBar";
import DeviceUpdatesPanel from "./DeviceUpdatesPanel";
import NativeDeviceBridgeAgent from "./NativeDeviceBridgeAgent";
import NativeSelfUpdate from "./NativeSelfUpdate";
import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { NativeAppUpdate } from "./native/nativeAppUpdate";
import type { NativeInstalledApp } from "./native/nativeAppUpdate";
import { App as CapacitorApp } from "@capacitor/app";
import type { BridgeSessionRef } from "./native/deviceBridgeTypes";
import {
  ArrowDownToLine, ArrowLeft, ArrowRight, Bot, CheckCircle2, ChevronRight,
  Download, Image as ImageIcon, Info, Layers3, MessageCircle, PackageCheck, Search, Send, Star,
  ShieldCheck, Smartphone, Sparkles, X
} from "lucide-react";
import type { AppsResponse, CrownApp } from "./types";
import "./search.css";
import "./app-details.css";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "https://apicrownstore.kingshall.online").replace(/\/$/, "");
type View = "HOME" | "APPS" | "UPDATES" | "ABOUT" | "SEARCH";

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

type InstalledScanStatus = "checking" | "ready" | "error" | "unsupported";
type AppInstallState = "checking" | "check-error" | "update" | "installed" | "download" | "unreleased";

function getAppInstallState(app: CrownApp, installedApps: Record<string, NativeInstalledApp>, scanStatus: InstalledScanStatus): AppInstallState {
  if (scanStatus === "checking") return "checking";
  if (scanStatus === "error") return "check-error";
  const installed = installedApps[app.packageId];
  if (installed) {
    const latestCode = Number(app.versionCode);
    if (app.releaseId && app.versionCode != null && Number.isFinite(latestCode) && latestCode > installed.versionCode) return "update";
    return "installed";
  }
  return app.releaseId ? "download" : "unreleased";
}

function StoreMark({ size = 24 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true" focusable="false">
    <path d="M4.5 6.5H9L12.2 26.7H29.5L33.2 13.2H13.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M13.4 14.1 16.7 8.8 21 13.8 25.1 7.8 28.8 13.7 33.1 11.8 29.5 25.1H15.1L13.4 14.1Z" fill="currentColor" fillOpacity=".94" stroke="currentColor" strokeWidth="1.35" strokeLinejoin="round" />
    <path d="M17 31.2a1.8 1.8 0 1 0 0 .1M27.7 31.2a1.8 1.8 0 1 0 0 .1" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
    <path d="M16.8 18.1h11.6" stroke="#24133f" strokeOpacity=".72" strokeWidth="1.25" strokeLinecap="round" />
  </svg>;
}

function AppIcon({ app }: { app: CrownApp }) {
  // The catalogue's official icon URL is the single source of truth across web, PWA, and APK.
  // Never guess by slug or substitute a generic/store icon: missing or broken URLs stay visible.
  const iconUrl = typeof app.iconUrl === "string" ? app.iconUrl.trim() : "";
  const [failedUrl, setFailedUrl] = useState("");
  useEffect(() => {
    setFailedUrl("");
  }, [iconUrl]);

  if (!iconUrl || failedUrl === iconUrl) {
    const reason = !iconUrl ? "LOGO URL MISSING" : "LOGO FAILED TO LOAD";
    return <div className="app-icon-fallback" role="img" aria-label={app.name + ": " + reason} title={app.name + ": " + reason}>
      <span>{reason}</span>
    </div>;
  }

  return <img
    className="app-icon-image"
    src={iconUrl}
    alt={app.name + " official app logo"}
    loading="eager"
    decoding="async"
    onError={() => setFailedUrl(iconUrl)}
  />;
}

type DownloadStatus = "starting" | "downloading" | "installing" | "permission" | "complete" | "error" | "cancelled";
type DownloadProgress = {
  releaseId: string;
  appName: string;
  filename: string;
  status: DownloadStatus;
  loaded: number;
  total: number;
  error?: string;
  platform: "browser" | "android";
  downloadId?: number;
};

function formatProgressBytes(value: number) {
  if (!Number.isFinite(value) || value < 1) return "0 B";
  return formatSize(value);
}

function DownloadFeedback({
  progress, onCancel, onRetry, onDismiss, onInstall
}: {
  progress: DownloadProgress;
  onCancel: () => void;
  onRetry: () => void;
  onDismiss: () => void;
  onInstall: () => void;
}) {
  const busy = ["starting", "downloading", "installing"].includes(progress.status);
  const percent = progress.total > 0
    ? Math.min(100, Math.floor((progress.loaded / progress.total) * 100))
    : null;
  const title = progress.status === "starting" ? "Preparing download"
    : progress.status === "downloading" ? "Downloading APK"
    : progress.status === "installing" ? "Opening Android installer"
    : progress.status === "permission" ? "Installation permission needed"
    : progress.status === "complete" ? (progress.platform === "android" ? "Installer ready" : "Download ready")
    : progress.status === "cancelled" ? "Download cancelled"
    : "Download failed";
  const message = progress.status === "starting" ? "Connecting securely to CrownStore…"
    : progress.status === "downloading" ? "CrownStore is downloading the verified APK."
    : progress.status === "installing" ? "The APK is downloaded. CrownStore is opening Android’s installer…"
    : progress.status === "permission" ? "The APK is downloaded. Allow CrownStore to install apps in Android settings, then return and tap Continue installation."
    : progress.status === "complete" ? (progress.platform === "android" ? "Android’s installer is open. Review its prompt to install or update " + progress.appName + "." : "The APK is already saved as " + progress.filename + ". Tap Install saved APK to open your device’s Files app at Downloads, then select the saved APK. CrownStore will not download it again.")
    : progress.status === "cancelled" ? "The download was stopped. You can start it again."
    : progress.error || "CrownStore could not finish the download. Check your connection and try again.";

  return <section className={"download-feedback status-" + progress.status} role="status" aria-live="polite">
    <div className="download-feedback-heading">
      <span className="download-feedback-icon" aria-hidden="true">
        {progress.status === "complete" ? <CheckCircle2 size={17} />
          : progress.status === "error" ? <Info size={17} />
          : progress.status === "permission" ? <Smartphone size={17} />
          : <Download size={17} />}
      </span>
      <div className="download-feedback-copy">
        <strong>{progress.appName} · {title}</strong>
        <span>{message}</span>
      </div>
      <button className="download-feedback-dismiss" type="button" onClick={busy ? onCancel : onDismiss} aria-label={busy ? "Cancel download" : "Dismiss download status"}>
        {busy ? "Cancel" : "Dismiss"}
      </button>
    </div>
    {(busy || progress.status === "complete" || progress.status === "installing" || progress.status === "permission") && <>
      <div className="download-progress-track" aria-label={percent === null ? "Download in progress" : "Download " + percent + "% complete"}>
        <span className={percent === null && busy && progress.status !== "installing" ? "is-indeterminate" : ""} style={{ width: (percent === null ? 28 : progress.status === "complete" || progress.status === "installing" || progress.status === "permission" ? 100 : percent) + "%" }} />
      </div>
      <div className="download-progress-meta">
        <span>{progress.total > 0 ? formatProgressBytes(progress.loaded) + " of " + formatProgressBytes(progress.total) : formatProgressBytes(progress.loaded) + " downloaded"}</span>
        <strong>{progress.status === "complete" || progress.status === "installing" || progress.status === "permission" ? "100%" : percent === null ? "In progress" : percent + "%"}</strong>
      </div>
    </>}
    {(progress.status === "complete" || progress.status === "error" || progress.status === "cancelled" || progress.status === "permission") && <div className="download-feedback-actions">
      {progress.status === "complete" && <button type="button" className="button button-primary" onClick={onInstall}>{progress.platform === "android" ? <><Smartphone size={15} /> Open installer</> : <><PackageCheck size={15} /> Install saved APK</>}</button>}
      {(progress.status === "error" || progress.status === "cancelled" || progress.status === "permission") && <button type="button" className="button button-outline" onClick={progress.status === "permission" ? onInstall : onRetry}>{progress.status === "permission" ? <><Smartphone size={15} /> Continue installation</> : <><Download size={15} /> Try again</>}</button>}
    </div>}
  </section>;
}

function AppCard({ app, onDetails }: { app: CrownApp; onDetails: (app: CrownApp) => void }) {
  const summary = (app.shortDescription || app.description || "Official KingsHall ecosystem app.").trim();
  return <button className="shelf-app-tile" onClick={() => onDetails(app)} aria-label={"View " + app.name + " details"}>
    <span className="shelf-app-icon"><AppIcon app={app} /></span>
    <span className="shelf-app-copy">
      <span className="shelf-app-name">{app.name}</span>
      <span className="shelf-app-meta">{readableCategory(app.category || "Utilities")}{app.versionName ? " · Version " + app.versionName : ""}</span>
      <span className="shelf-app-description">{summary}</span>
    </span>
    <span className="shelf-app-chevron" aria-hidden="true"><ChevronRight size={17} /></span>
  </button>;
}

function SearchAppResultRow({ app, onDetails }: { app: CrownApp; onDetails: (app: CrownApp) => void }) {
  return <div className="store-search-result">
    <button className="store-search-result-main" type="button" aria-label={"Open " + app.name + " details"} onClick={() => onDetails(app)}>
      <span className="store-search-result-icon"><AppIcon app={app} /></span>
      <span className="store-search-result-copy">
        <strong>{app.name}</strong>
        <small>{readableCategory(app.category || "Utilities")} · {app.versionName ? "Version " + app.versionName : "Coming soon"}</small>
        <span>{app.shortDescription || app.description || "Official KingsHall ecosystem app."}</span>
      </span>
    </button>
    <button className="store-search-result-action" type="button" onClick={() => onDetails(app)} aria-label={"Open " + app.name + " details"}>
      <ChevronRight size={16} />
    </button>
  </div>;
}

type AppReview = {
  id: string;
  displayName: string;
  rating: number;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};
type AppRatingDistribution = { rating: number; count: number };
type AppReviewsPayload = {
  summary: { averageRating: number; reviewCount: number; ratingDistribution: AppRatingDistribution[] };
  reviews: AppReview[];
  myReview: AppReview | null;
};

function getReviewerToken(): string {
  const makeToken = () => {
    if (typeof window.crypto?.randomUUID === "function") return window.crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (letter) => {
      const random = Math.floor(Math.random() * 16);
      return (letter === "x" ? random : (random & 0x3) | 0x8).toString(16);
    });
  };
  try {
    const saved = window.localStorage.getItem("crownstore-reviewer-token-v1");
    if (saved && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(saved)) return saved;
    const next = makeToken();
    window.localStorage.setItem("crownstore-reviewer-token-v1", next);
    return next;
  } catch {
    return makeToken();
  }
}

function apiErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "error" in payload) {
    const value = (payload as { error?: unknown }).error;
    if (typeof value === "string" && value.trim()) return value;
  }
  return fallback;
}

async function requestStoreJson<T>(url: string, method: "GET" | "POST" = "GET", body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  if (Capacitor.isNativePlatform()) {
    const options = { url, headers, connectTimeout: 12000, readTimeout: 20000 };
    const response = method === "POST"
      ? await CapacitorHttp.post({ ...options, data: body })
      : await CapacitorHttp.get(options);
    let payload: unknown = response.data;
    if (typeof payload === "string") {
      try { payload = JSON.parse(payload); } catch { payload = {}; }
    }
    if (response.status < 200 || response.status >= 300) {
      throw new Error(apiErrorMessage(payload, "CrownStore could not complete this request."));
    }
    return payload as T;
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let payload: unknown;
  try { payload = await response.json(); } catch { payload = {}; }
  if (!response.ok) throw new Error(apiErrorMessage(payload, "CrownStore could not complete this request."));
  return payload as T;
}

function RatingStars({ rating, size = 13 }: { rating: number; size?: number }) {
  return <span className="app-rating-stars" aria-label={rating.toFixed(1) + " out of 5 stars"}>
    {Array.from({ length: 5 }, (_, index) => <Star key={index} size={size} fill={index < Math.round(rating) ? "currentColor" : "none"} strokeWidth={1.8} />)}
  </span>;
}

function AppDetailsPage({ app, onClose, download, isAnotherDownloadRunning, onDownload, onCancelDownload, onDismissDownload, onInstallDownloaded, installState, installedVersion, onRefreshInstalledApps, allApps, onOpenApp }: {
  app: CrownApp; onClose: () => void; download: DownloadProgress | null; isAnotherDownloadRunning: boolean;
  onDownload: (app: CrownApp) => Promise<void>; onCancelDownload: () => void; onDismissDownload: () => void;
  onInstallDownloaded: (app: CrownApp) => void; installState: AppInstallState;
  installedVersion?: NativeInstalledApp; onRefreshInstalledApps: () => void;
  allApps: CrownApp[]; onOpenApp: (app: CrownApp) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [previewScreenshot, setPreviewScreenshot] = useState<string | null>(null);
  const [reviewerToken] = useState(() => getReviewerToken());
  const [reviewPayload, setReviewPayload] = useState<AppReviewsPayload | null>(null);
  const [reviewLoading, setReviewLoading] = useState(true);
  const [reviewLoadError, setReviewLoadError] = useState("");
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewBody, setReviewBody] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewNotice, setReviewNotice] = useState("");
  const [reviewNoticeError, setReviewNoticeError] = useState(false);

  const ready = Boolean(app.releaseId);
  const currentDownload = download?.releaseId === app.releaseId ? download : null;
  const isCurrentDownloadBusy = Boolean(currentDownload && ["starting", "downloading", "installing"].includes(currentDownload.status));
  const installStateClass = installState === "update" ? "details-status is-ready" : installState === "installed" ? "details-status is-installed" : installState === "check-error" ? "details-status is-error" : "details-status";
  const installStateLabel = installState === "checking"
    ? "Checking installation"
    : installState === "check-error"
      ? "Install status unavailable"
      : installState === "update"
        ? "Update available"
        : installState === "installed"
          ? "Installed"
          : installState === "unreleased"
            ? "Coming soon"
            : "Available to download";
  const screenshots = Array.isArray(app.screenshots) ? app.screenshots.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
  const reviewSummary = reviewPayload?.summary;
  const averageRating = reviewSummary ? Number(reviewSummary.averageRating) || 0 : Number(app.averageRating) || 0;
  const reviewCount = reviewSummary ? Number(reviewSummary.reviewCount) || 0 : Number(app.reviewCount) || 0;
  const totalDownloads = Math.max(0, Number(app.totalDownloads) || 0);
  const firstPublishedAt = app.firstPublishedAt || app.publishedAt;
  const lastUpdatedAt = app.lastUpdatedAt || app.publishedAt;
  const distribution = reviewSummary?.ratingDistribution || [5, 4, 3, 2, 1].map((rating) => ({ rating, count: 0 }));
  const relatedApps = allApps.filter((item) => item.slug !== app.slug).slice(0, 6);

  useEffect(() => {
    let active = true;
    setReviewLoading(true);
    setReviewLoadError("");
    setReviewPayload(null);
    setReviewNotice("");
    const url = API_BASE + "/api/apps/" + encodeURIComponent(app.slug) + "/reviews?reviewerToken=" + encodeURIComponent(reviewerToken);
    void requestStoreJson<AppReviewsPayload>(url).then((payload) => {
      if (!active) return;
      setReviewPayload(payload);
      const own = payload.myReview;
      if (own) {
        setReviewRating(own.rating);
        setReviewBody(own.body || "");
      } else {
        setReviewRating(5);
        setReviewBody("");
      }
    }).catch(() => {
      if (active) setReviewLoadError("Reviews are temporarily unavailable.");
    }).finally(() => {
      if (active) setReviewLoading(false);
    });
    return () => { active = false; };
  }, [app.slug, reviewerToken]);

  useEffect(() => {
    if (!previewScreenshot) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreviewScreenshot(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previewScreenshot]);

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reviewSubmitting) return;
    const cleanBody = reviewBody.trim();
    if (cleanBody.length < 8) {
      setReviewNotice("Add a little more detail to your review.");
      setReviewNoticeError(true);
      return;
    }
    setReviewSubmitting(true);
    setReviewNotice("");
    setReviewNoticeError(false);
    try {
      await requestStoreJson<{ review: AppReview }>(
        API_BASE + "/api/apps/" + encodeURIComponent(app.slug) + "/reviews",
        "POST",
        {
          reviewerToken,
          displayName: "CrownStore user",
          rating: reviewRating,
          title: "",
          body: cleanBody
        }
      );
      setReviewNotice("Your review is saved.");
      const refreshed = await requestStoreJson<AppReviewsPayload>(
        API_BASE + "/api/apps/" + encodeURIComponent(app.slug) + "/reviews?reviewerToken=" + encodeURIComponent(reviewerToken)
      );
      setReviewPayload(refreshed);
      if (refreshed.myReview) {
        setReviewRating(refreshed.myReview.rating);
        setReviewBody(refreshed.myReview.body || "");
      }
    } catch (error) {
      setReviewNotice(error instanceof Error ? error.message : "Your review could not be saved. Try again.");
      setReviewNoticeError(true);
    } finally {
      setReviewSubmitting(false);
    }
  }

  return <section className="app-details-page" aria-labelledby="app-details-title">
    <div className="app-detail-topbar">
      <button className="app-detail-back app-detail-back-icon" type="button" onClick={onClose} aria-label="Back to CrownStore" title="Back to CrownStore"><ArrowLeft size={18} /></button>
      <span className="app-detail-top-label">APP DETAILS</span>
    </div>

    <section className="app-detail-hero glass-panel">
      <div className="app-detail-identity">
        <div className="app-detail-icon"><AppIcon app={app} /></div>
        <div className="app-detail-identity-copy">
          <span className="app-detail-eyebrow"><ShieldCheck size={12} /> KINGSHALL ECOSYSTEM</span>
          <h1 id="app-details-title">{app.name}</h1>
          <p className="app-detail-short-description">{app.shortDescription || app.description || "Official app in the KingsHall ecosystem."}</p>
          <div className="app-detail-meta-line">
            <span className="app-detail-category">{readableCategory(app.category || "Utilities")}</span>
            <span className={installStateClass}><span className="details-status-dot" />{installStateLabel}</span>
          </div>
        </div>
      </div>

      <div className="app-detail-metrics">
        <div className="app-detail-metric"><span className="app-detail-metric-label">Published date</span><strong className="app-detail-metric-value">{formatDate(firstPublishedAt)}</strong><span className="app-detail-metric-note">First release</span></div>
        <div className="app-detail-metric"><span className="app-detail-metric-label">Total downloads</span><strong className="app-detail-metric-value">{totalDownloads.toLocaleString()}</strong><span className="app-detail-metric-note">Completed APK downloads</span></div>
        <div className="app-detail-metric"><span className="app-detail-metric-label">Latest version</span><strong className="app-detail-metric-value">{app.versionName ? "v" + app.versionName : "—"}</strong><span className="app-detail-metric-note">{ready ? formatSize(app.sizeBytes) : "Coming soon"}</span></div>
      </div>

      <div className="app-detail-install-wrap">
        {installState === "checking"
          ? <button className="button button-outline app-detail-primary-action" type="button" disabled><span className="download-dot-loader" aria-hidden="true"><i /><i /><i /></span> Checking installed apps…</button>
          : installState === "check-error"
            ? <button className="button button-outline app-detail-primary-action" type="button" onClick={onRefreshInstalledApps}><Smartphone size={17} /> Retry installed-app check</button>
            : installState === "installed"
              ? <button className="button button-outline app-detail-primary-action" type="button" disabled><CheckCircle2 size={17} /> {ready ? "Installed · up to date" : "Installed"}{installedVersion?.versionName ? " · v" + installedVersion.versionName : ""}</button>
              : ready
                ? <>
                  <button className="button button-primary app-detail-primary-action" type="button" onClick={() => {
                    if (currentDownload?.status === "complete" || currentDownload?.status === "permission") onInstallDownloaded(app);
                    else void onDownload(app);
                  }} disabled={isAnotherDownloadRunning || isCurrentDownloadBusy}>
                    {isCurrentDownloadBusy
                      ? <><span className="download-dot-loader" aria-hidden="true"><i /><i /><i /></span>{currentDownload?.status === "starting" ? "Starting download…" : currentDownload?.status === "installing" ? "Opening installer…" : "Downloading " + (currentDownload && currentDownload.total > 0 ? Math.min(100, Math.floor(currentDownload.loaded / currentDownload.total * 100)) : 0) + "%"}</>
                      : isAnotherDownloadRunning ? "Another download is in progress"
                      : currentDownload?.status === "complete" ? <><PackageCheck size={17} /> {currentDownload.platform === "android" ? "Open installer again" : "Install saved APK"}</>
                      : currentDownload?.status === "permission" ? <><Smartphone size={17} /> Continue installation</>
                      : currentDownload?.status === "error" || currentDownload?.status === "cancelled" ? <><Download size={17} /> Retry download</>
                      : installState === "update" ? <><Download size={17} /> Update to v{app.versionName || "latest"}</>
                      : <><Download size={17} /> Download APK</>}
                  </button>
                  {currentDownload && <DownloadFeedback progress={currentDownload} onCancel={onCancelDownload} onRetry={() => void onDownload(app)} onDismiss={onDismissDownload} onInstall={() => onInstallDownloaded(app)} />}
                </>
                : <div className="app-detail-release-note"><ShieldCheck size={16} /> No stable release yet.</div>}
      </div>
    </section>

    <section className="app-detail-section" aria-labelledby="app-screenshots-title">
      <div className="app-detail-section-heading"><div><h2 id="app-screenshots-title">Screenshots</h2><p>Take a closer look inside the app.</p></div><span className="app-detail-section-count">{screenshots.length} {screenshots.length === 1 ? "image" : "images"}</span></div>
      {screenshots.length > 0
        ? <div className="app-detail-screenshot-track" aria-label={app.name + " screenshots"}>
            {screenshots.map((screenshot, index) => <button className="app-detail-screenshot" key={screenshot + index} type="button" onClick={() => setPreviewScreenshot(screenshot)} aria-label={"View screenshot " + (index + 1)}>
              <img src={screenshot} alt={app.name + " screenshot " + (index + 1)} loading="lazy" />
            </button>)}
          </div>
        : <div className="app-detail-screenshot-empty"><ImageIcon size={22} /><span>Screenshots coming soon</span></div>}
    </section>

    <section className="app-detail-section" aria-labelledby="app-about-title">
      <div className="app-detail-section-heading"><div><h2 id="app-about-title">About this app</h2><p>Everything you need to know.</p></div></div>
      <p className={"app-detail-description" + (app.description && app.description.length > 420 && !expanded ? " is-collapsed" : "")}>{app.description || app.shortDescription || "Official app in the KingsHall ecosystem."}</p>
      {app.changelog && <div className="app-detail-changelog"><h3>What’s new</h3><p>{app.changelog}</p></div>}
      {app.description && app.description.length > 420 && <button className="app-detail-back app-detail-read-more" type="button" onClick={() => setExpanded((value) => !value)}>{expanded ? "Show less" : "More about this app"} <ChevronRight size={14} /></button>}

    </section>

    <section className="app-detail-section" aria-labelledby="app-info-title">
      <div className="app-detail-section-heading"><div><h2 id="app-info-title">App information</h2><p>Release details and version history.</p></div></div>
      <div className="app-detail-info-grid">
        <div className="app-detail-info-item"><span>Category</span><strong>{readableCategory(app.category || "Utilities")}</strong></div>
        <div className="app-detail-info-item"><span>Published date</span><strong>{formatDate(firstPublishedAt)}</strong></div>
        <div className="app-detail-info-item"><span>Last updated</span><strong>{formatDate(lastUpdatedAt)}</strong></div>
        <div className="app-detail-info-item"><span>Version name</span><strong>{app.versionName ? "v" + app.versionName : "Not available"}</strong></div>
        <div className="app-detail-info-item"><span>Version code</span><strong>{app.versionCode ?? "Not available"}</strong></div>
        <div className="app-detail-info-item"><span>APK size</span><strong>{formatSize(app.sizeBytes)}</strong></div>
        <div className="app-detail-info-item"><span>Total downloads</span><strong>{totalDownloads.toLocaleString()}</strong></div>
        <div className="app-detail-info-item"><span>Package ID</span><strong>{app.packageId}</strong></div>
        <div className="app-detail-info-item"><span>Release status</span><strong>{ready ? "Verified stable release" : "Coming soon"}</strong></div>
      </div>
      {app.sha256 && <div className="app-detail-checksum"><span>Verified APK SHA-256</span><code>{app.sha256}</code></div>}
    </section>

    <section className="app-detail-section" aria-labelledby="app-ratings-title">
      <div className="app-detail-section-heading"><div><h2 id="app-ratings-title">Ratings &amp; reviews</h2><p>Feedback from the CrownStore community.</p></div><span className="app-detail-section-count">{reviewCount.toLocaleString()} total</span></div>
      <div className="app-rating-summary">
        <div className="app-rating-score">
          <strong>{reviewCount ? averageRating.toFixed(1) : "—"}</strong>
          <RatingStars rating={averageRating} size={15} />
          <span>{reviewCount ? reviewCount.toLocaleString() + (reviewCount === 1 ? " review" : " reviews") : "No ratings yet"}</span>
        </div>
        <div className="app-rating-bars" aria-label="Rating breakdown">
          {distribution.map((item) => <div className="app-rating-bar-row" key={item.rating}>
            <span>{item.rating}</span><div className="app-rating-bar-track"><span className="app-rating-bar-fill" style={{ width: (reviewCount ? Math.min(100, (item.count / reviewCount) * 100) : 0) + "%" }} /></div><span>{item.count.toLocaleString()}</span>
          </div>)}
        </div>
      </div>

      <hr className="app-review-divider" />
      <form className="app-review-form" onSubmit={(event) => void submitReview(event)}>
        <div className="app-review-form-heading"><h3>{reviewPayload?.myReview ? "Update your review" : "Rate this app"}</h3><span>One review per browser</span></div>
        <div className="app-review-rating-picker" role="group" aria-label="Your rating">
          {[1, 2, 3, 4, 5].map((value) => <button className={"review-rating-star" + (value <= reviewRating ? " is-filled" : "")} key={value} type="button" aria-label={"Rate " + value + " out of 5"} aria-pressed={reviewRating === value} onClick={() => setReviewRating(value)}><Star size={22} fill={value <= reviewRating ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.35} /></button>)}
        </div>
        <label className="app-review-field"><span>Your review</span><textarea value={reviewBody} onChange={(event) => setReviewBody(event.target.value)} minLength={8} maxLength={1600} required placeholder="What did you like, or what could be better?" /></label>
        <div className="app-review-form-actions"><span>{reviewBody.trim().length}/1,600 characters</span><button className="button button-primary" type="submit" disabled={reviewSubmitting || reviewBody.trim().length < 8}>{reviewSubmitting ? "Saving…" : <><Send size={15} /> {reviewPayload?.myReview ? "Update review" : "Post review"}</>}</button></div>
        {reviewNotice && <p className={"app-review-notice " + (reviewNoticeError ? "is-error" : "")} role={reviewNoticeError ? "alert" : "status"}>{reviewNotice}</p>}
        {reviewLoadError && <p className="app-review-notice is-error" role="alert">{reviewLoadError}</p>}
      </form>

      <hr className="app-review-divider" />
      <div className="app-detail-section-heading"><div><h2>Recent reviews</h2><p>{reviewLoading ? "Loading reviews…" : reviewCount.toLocaleString() + (reviewCount === 1 ? " review" : " reviews")}</p></div></div>
      {reviewLoading
        ? <div className="app-review-empty"><span className="download-dot-loader" aria-hidden="true"><i /><i /><i /></span><span>Loading reviews…</span></div>
        : reviewLoadError
          ? <div className="app-review-empty"><MessageCircle size={22} /><strong>Reviews unavailable</strong><span>Try reopening this page in a moment.</span></div>
          : (reviewPayload?.reviews || []).length > 0
            ? <div className="app-review-list">{(reviewPayload?.reviews || []).map((review) => <article className="app-review-card" key={review.id}>
                <div className="app-review-card-heading">
                  <div className="app-review-author"><span className="app-review-avatar">{(review.displayName || "C").trim().charAt(0).toUpperCase()}</span><div className="app-review-author-copy"><strong>{review.displayName || "CrownStore user"}</strong><span>{formatDate(review.createdAt)}{review.updatedAt && review.createdAt !== review.updatedAt ? " · Edited" : ""}</span></div></div>
                  <RatingStars rating={Number(review.rating) || 0} size={12} />
                </div>
                {review.title && <h3 className="app-review-title">{review.title}</h3>}
                <p className="app-review-body">{review.body}</p>
              </article>)}</div>
            : <div className="app-review-empty"><MessageCircle size={23} /><strong>Be the first to review {app.name}</strong><span>Your feedback helps people choose their next app.</span></div>}
    </section>

    {relatedApps.length > 0 && <section className="app-detail-section" aria-labelledby="app-related-title">
      <div className="app-detail-section-heading"><div><h2 id="app-related-title">More from KingsHall</h2><p>Discover another app from the ecosystem.</p></div></div>
      <div className="app-detail-related-track">{relatedApps.map((item) => <button className="app-detail-related-card" type="button" key={item.id} onClick={() => onOpenApp(item)}>
        <span className="app-detail-related-icon"><AppIcon app={item} /></span><span className="app-detail-related-copy"><strong>{item.name}</strong><span>{item.shortDescription || readableCategory(item.category || "Utilities")}</span></span><ChevronRight size={15} />
      </button>)}</div>
    </section>}

    {previewScreenshot && <div className="app-screenshot-lightbox" role="dialog" aria-modal="true" aria-label={app.name + " screenshot preview"} onClick={() => setPreviewScreenshot(null)}>
      <button type="button" aria-label="Close screenshot" onClick={(event) => { event.stopPropagation(); setPreviewScreenshot(null); }}><X size={20} /></button>
      <img src={previewScreenshot} alt={app.name + " full screenshot"} onClick={(event) => event.stopPropagation()} />
    </div>}
  </section>;
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
  const [syncBusy, setSyncBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function syncSourceReleases() {
    if (!token.trim()) { setMessage("Enter the publishing token first."); return; }
    setSyncBusy(true);
    setMessage("");
    try {
      const response = await fetch(API_BASE + "/api/publishing/sync", {
        method: "POST",
        headers: { Authorization: "Bearer " + token.trim() }
      });
      const report = await response.json() as {
        status?: string; trigger?: string; checked?: number; message?: string;
        published?: Array<{ app: string; tag?: string; message?: string }>;
        unchanged?: Array<{ app: string; tag?: string; message?: string }>;
        skipped?: Array<{ app: string; tag?: string; message?: string }>;
        errors?: Array<{ app: string; tag?: string; message?: string }>;
        error?: string;
      };
      if (!response.ok) throw new Error(report.error || report.message || "Could not synchronize source releases.");
      const lines = [
        "Sync " + (report.status || "finished") + " — checked " + (report.checked ?? 0) + " app(s).",
        "Published: " + (report.published?.length ?? 0) + ".",
        "Already current: " + (report.unchanged?.length ?? 0) + ".",
        "Skipped: " + (report.skipped?.length ?? 0) + ".",
        "Errors: " + (report.errors?.length ?? 0) + "."
      ];
      for (const item of [...(report.published || []), ...(report.skipped || []), ...(report.errors || [])]) {
        lines.push(item.app + (item.tag ? " (" + item.tag + ")" : "") + ": " + (item.message || "No additional details."));
      }
      if (report.message) lines.push(report.message);
      setMessage(lines.join("\n"));
      onPublished();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not synchronize source releases.");
    } finally {
      setSyncBusy(false);
    }
  }

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
      <p className="publisher-intro">CrownStore checks each listed app's own GitHub releases automatically. The API verifies each APK, mirrors valid builds to the public CrownStore APK repository, and updates the catalogue. Automatic checks run when the API starts and every five minutes; use the button below to request an immediate sync. Your publishing token is held in this browser session and sent only to the CrownStore API.</p>
      <div className="publisher-form publisher-sync-control">
        <label>Publishing token<input type="password" value={token} onChange={(event) => setToken(event.target.value)} autoComplete="off" required placeholder="Render PUBLISHING_TOKEN" /></label>
        <button className="button button-outline publisher-submit" type="button" onClick={() => void syncSourceReleases()} disabled={busy || syncBusy || !token.trim()}>{syncBusy ? "Checking latest releases…" : "Sync latest source releases now"}</button>
      </div>
      <form onSubmit={submit} className="publisher-form">
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
  const [installedApps, setInstalledApps] = useState<Record<string, NativeInstalledApp>>({});
  const [installedScanStatus, setInstalledScanStatus] = useState<InstalledScanStatus>(Capacitor.getPlatform() === "android" ? "checking" : "unsupported");
  const [installedScanError, setInstalledScanError] = useState("");
  const installedScanRef = useRef<() => void>(() => {});
  const isAndroidApp = Capacitor.getPlatform() === "android";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isOnline, setIsOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine);
  const [search, setSearch] = useState("");
  const [searchPageQuery, setSearchPageQuery] = useState("");
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try { const saved = JSON.parse(window.localStorage.getItem("crownstore-recent-searches") || "[]"); return Array.isArray(saved) ? saved.filter((item): item is string => typeof item === "string").slice(0, 8) : []; } catch { return []; }
  });
  const [category, setCategory] = useState("All apps");
  const [selectedApp, setSelectedApp] = useState<CrownApp | null>(null);
  const detailHistoryPushedRef = useRef(false);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const downloadAbortRef = useRef<AbortController | null>(null);
  const nativeDownloadIdRef = useRef<number | null>(null);
  const [showPublisher, setShowPublisher] = useState(false);
  const [showAppManager, setShowAppManager] = useState(false);
  const [view, setView] = useState<View>(() => {
    try {
      const saved = window.localStorage.getItem("crownstore-current-view");
      return saved === "HOME" || saved === "APPS" || saved === "UPDATES" || saved === "ABOUT" || saved === "SEARCH" ? saved : "HOME";
    } catch { return "HOME"; }
  });

  useEffect(() => {
    const updateOnlineStatus = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);
    updateOnlineStatus();
    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
    };
  }, []);

  useEffect(() => {
    try { window.localStorage.setItem("crownstore-current-view", view); } catch { /* Keep navigation working when storage is unavailable. */ }
  }, [view]);
  const [bridgeSession, setBridgeSession] = useState<BridgeSessionRef | null>(() => {
    try {
      const saved = window.localStorage.getItem("crownstore-device-bridge-session");
      if (!saved) return null;
      const parsed = JSON.parse(saved) as BridgeSessionRef;
      return parsed?.sessionId && parsed?.secret ? parsed : null;
    } catch { return null; }
  });

  useEffect(() => {
    try {
      if (bridgeSession) window.localStorage.setItem("crownstore-device-bridge-session", JSON.stringify(bridgeSession));
      else window.localStorage.removeItem("crownstore-device-bridge-session");
    } catch { /* Keep the bridge usable if browser storage is unavailable. */ }
  }, [bridgeSession]);
  const [requestedAppSlug, setRequestedAppSlug] = useState(() => {
    try { return new URLSearchParams(window.location.search).get("app")?.trim().toLowerCase() || ""; } catch { return ""; }
  });

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let disposed = false;
    let subscription: { remove: () => Promise<void> } | null = null;
    const acceptUrl = (value: string) => {
      try {
        const url = new URL(value);
        if (url.protocol !== "crownstore:") return;
        if (url.hostname === "app") {
          const slug = (url.searchParams.get("slug") || url.pathname.replace(/^\/+/, "")).trim().toLowerCase();
          if (slug && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
            setRequestedAppSlug(slug);
            setView("APPS");
          }
          return;
        }
        if (url.hostname !== "connect") return;
        const sessionId = url.searchParams.get("sessionId") || "";
        const secret = url.searchParams.get("secret") || "";
        if (!sessionId || !secret) return;
        setBridgeSession({ sessionId, secret, deepLink: value, expiresAt: "" });
        setView("UPDATES");
      } catch { /* Ignore unrelated Android intents. */ }
    };
    void CapacitorApp.getLaunchUrl().then((launch) => {
      if (launch?.url && !disposed) acceptUrl(launch.url);
    }).catch(() => {});
    void CapacitorApp.addListener("appUrlOpen", (event) => acceptUrl(event.url)).then((handle) => {
      if (disposed) void handle.remove(); else subscription = handle;
    }).catch(() => {});
    return () => { disposed = true; if (subscription) void subscription.remove(); };
  }, []);

  // App detail pages can be opened directly or shared with a lightweight hash URL.
  useEffect(() => {
    const syncAppDetailFromUrl = () => {
      const match = window.location.hash.match(/^#app\/(.+)$/i);
      if (!match) {
        setSelectedApp(null);
        detailHistoryPushedRef.current = false;
        return;
      }
      let slug = "";
      try { slug = decodeURIComponent(match[1]).toLowerCase(); } catch { slug = match[1].toLowerCase(); }
      const matchedApp = apps.find((item) => item.slug === slug);
      if (matchedApp) setSelectedApp(matchedApp);
    };
    syncAppDetailFromUrl();
    window.addEventListener("popstate", syncAppDetailFromUrl);
    window.addEventListener("hashchange", syncAppDetailFromUrl);
    return () => {
      window.removeEventListener("popstate", syncAppDetailFromUrl);
      window.removeEventListener("hashchange", syncAppDetailFromUrl);
    };
  }, [apps]);

  // Let the browser restore the user's previous scroll position on refresh.
  useEffect(() => {
    if ("scrollRestoration" in window.history) window.history.scrollRestoration = "auto";
  }, []);

  // Catalogue data arrives asynchronously. Reset shelves again after the real
  // app tiles replace loading placeholders, so browser scroll restoration or
  // snap positioning cannot leave the user parked among empty slots.
  useEffect(() => {
    if (loading || view !== "HOME") return;
    const resetShelves = () => {
      document.querySelectorAll<HTMLElement>(".shelf-track").forEach((track) => {
        track.scrollLeft = 0;
      });
    };
    resetShelves();
    const frame = window.requestAnimationFrame(resetShelves);
    return () => window.cancelAnimationFrame(frame);
  }, [loading, apps.length, view]);

  async function loadApps(signal?: AbortSignal, silent = false) {
    if (!silent) {
      setLoading(true);
      setError("");
    }

    const parseCatalogue = (value: unknown): AppsResponse | null => {
      let parsed = value;
      // Capacitor's native HTTP bridge can expose a JSON response as text on
      // some Android/WebView combinations. Normalize both response shapes.
      if (typeof parsed === "string") {
        try { parsed = JSON.parse(parsed); } catch { return null; }
      }
      if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as AppsResponse).apps)) return null;
      return parsed as AppsResponse;
    };

    let nativeFailure = "";
    try {
      // Prefer native networking in the APK so WebView origin/CORS behaviour
      // cannot prevent the live catalogue from loading.
      if (Capacitor.isNativePlatform()) {
        try {
          const nativeResponse = await CapacitorHttp.get({
            url: API_BASE + "/api/apps",
            headers: { Accept: "application/json" },
            connectTimeout: 12000,
            readTimeout: 20000
          });
          if (signal?.aborted) return;

          if (nativeResponse.status >= 200 && nativeResponse.status < 300) {
            const data = parseCatalogue(nativeResponse.data);
            if (data) {
              setApps(data.apps);
              setSelectedApp((current) => current ? data.apps.find((candidate) => candidate.slug === current.slug) ?? current : current);
              return;
            }
            nativeFailure = "The native request returned an unexpected catalogue format.";
          } else {
            nativeFailure = "The native catalogue request returned HTTP " + nativeResponse.status + ".";
          }
          console.warn("CrownStore native catalogue request needs browser fallback:", nativeFailure);
        } catch (error) {
          if (signal?.aborted) return;
          nativeFailure = error instanceof Error ? error.message : String(error || "Native catalogue request failed.");
          console.warn("CrownStore native catalogue request failed; trying browser fetch.", error);
        }
      }

      if (signal?.aborted) return;

      // Browser fetch is the fallback for Android and the standard path for PWA/web.
      const response = await fetch(API_BASE + "/api/apps", {
        signal,
        headers: { Accept: "application/json" }
      });
      if (!response.ok) {
        throw new Error(response.status === 503
          ? "The catalogue service is temporarily unavailable. Please try again shortly."
          : "CrownStore could not load the catalogue (HTTP " + response.status + "). Please try again.");
      }

      let data: AppsResponse | null = null;
      try {
        data = parseCatalogue(await response.json());
      } catch {
        data = null;
      }
      if (!data) {
        throw new Error("CrownStore received an invalid catalogue response. Please try again.");
      }
      setApps(data.apps);
      setSelectedApp((current) => current ? data.apps.find((candidate) => candidate.slug === current.slug) ?? current : current);
    } catch (error) {
      if (signal?.aborted) return;
      const browserFailure = error instanceof Error ? error.message : "Something went wrong loading CrownStore.";
      if (silent) {
        console.warn("CrownStore background catalogue refresh failed:", browserFailure);
      } else {
        setError(nativeFailure
          ? browserFailure + " (Native request also failed: " + nativeFailure + ")"
          : browserFailure);
      }
    } finally {
      if (!signal?.aborted && !silent) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void loadApps(controller.signal);
    return () => controller.abort();
  }, []);

  // Web/PWA clients listen for completed release events only while the page is visible.
  // Android APK clients refresh on resume instead of keeping an SSE connection open.
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      let disposed = false;
      let subscription: { remove: () => Promise<void> } | null = null;
      void CapacitorApp.addListener("appStateChange", ({ isActive }) => {
        if (isActive) void loadApps(undefined, true);
      }).then((handle) => {
        if (disposed) void handle.remove();
        else subscription = handle;
      }).catch(() => {});
      return () => {
        disposed = true;
        if (subscription) void subscription.remove();
      };
    }

    let stream: EventSource | null = null;
    const disconnect = () => {
      stream?.close();
      stream = null;
    };
    const connect = () => {
      if (document.visibilityState !== "visible" || stream) return;
      stream = new EventSource(API_BASE + "/api/events/releases");
      let hasOpened = false;
      stream.addEventListener("open", () => {
        // Reconcile once when an existing stream reconnects after a dropped connection.
        if (hasOpened) void loadApps(undefined, true);
        hasOpened = true;
      });
      stream.addEventListener("release-published", () => {
        void loadApps(undefined, true);
      });
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        disconnect();
      } else {
        // Catch up if a release was published while the tab was hidden.
        void loadApps(undefined, true);
        connect();
      }
    };

    connect();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      disconnect();
    };
  }, []);

  useEffect(() => {
    if (!isAndroidApp) {
      setInstalledApps({});
      setInstalledScanStatus("unsupported");
      setInstalledScanError("");
      return;
    }

    let disposed = false;
    let inFlight = false;
    const scanInstalledApps = async () => {
      if (disposed || inFlight) return;
      inFlight = true;
      setInstalledScanStatus("checking");
      setInstalledScanError("");
      try {
        const packageIds = Array.from(new Set(apps
          .map((app) => app.packageId || "")
          .filter((id) => /^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+$/.test(id))
        )).slice(0, 250);

        const inventory = packageIds.length
          ? await NativeAppUpdate.getInstalledApps({ packageIds })
          : { apps: [] as NativeInstalledApp[] };
        if (disposed) return;

        const next = Object.fromEntries((inventory.apps || []).map((item) => [item.packageId, item])) as Record<string, NativeInstalledApp>;
        setInstalledApps(next);
        setInstalledScanStatus("ready");
        setDownloadProgress((current) => {
          if (!current || current.status !== "complete") return current;
          const catalogueApp = apps.find((item) => item.releaseId === current.releaseId);
          const installed = catalogueApp ? next[catalogueApp.packageId] : undefined;
          return installed && catalogueApp?.versionCode != null &&
            installed.versionCode >= Number(catalogueApp.versionCode) ? null : current;
        });
      } catch (caught) {
        if (!disposed) {
          setInstalledScanError(caught instanceof Error ? caught.message : "CrownStore could not read installed app versions.");
          setInstalledScanStatus("error");
        }
      } finally {
        inFlight = false;
      }
    };

    installedScanRef.current = () => { void scanInstalledApps(); };
    void scanInstalledApps();
    const stateListener = CapacitorApp.addListener("appStateChange", (state) => {
      if (state.isActive) void scanInstalledApps();
    });

    return () => {
      disposed = true;
      installedScanRef.current = () => {};
      void stateListener.then((handle) => handle.remove()).catch(() => {});
    };
  }, [apps, isAndroidApp]);

  useEffect(() => {
    if (!requestedAppSlug || loading) return;
    const matched = apps.find((app) => app.slug.toLowerCase() === requestedAppSlug);
    setRequestedAppSlug("");
    if (!matched) return;
    setView("APPS");
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("app");
      window.history.replaceState({}, "", url.toString());
    } catch { /* The selected app still opens if history cannot be updated. */ }
    openAppDetails(matched);
  }, [requestedAppSlug, loading, apps]);

  async function continueNativeInstall(app: CrownApp, downloadId: number): Promise<void> {
    setDownloadProgress((current) => current?.releaseId === app.releaseId
      ? { ...current, status: "installing", error: undefined, downloadId }
      : current);
    try {
      const result = await NativeAppUpdate.installDownloadedApk({
        downloadId,
        appName: app.name,
        packageId: app.packageId
      });
      if (result.requiresPermission) {
        setDownloadProgress((current) => current?.releaseId === app.releaseId
          ? { ...current, status: "permission", downloadId, error: "Allow CrownStore to install apps in Android settings, then return and tap Continue installation." }
          : current);
        return;
      }
      if (!result.opened) throw new Error("Android did not confirm that the installer opened.");
      setDownloadProgress((current) => current?.releaseId === app.releaseId
        ? { ...current, status: "complete", loaded: current.total || current.loaded, total: current.total || current.loaded, downloadId, error: undefined }
        : current);
    } catch (error) {
      setDownloadProgress((current) => current?.releaseId === app.releaseId
        ? { ...current, status: "error", error: error instanceof Error ? error.message : "Android could not open the installer." }
        : current);
    }
  }

  async function downloadRelease(app: CrownApp): Promise<void> {
    if (!app.releaseId) return;
    if (Capacitor.getPlatform() === "android" && downloadProgress?.releaseId === app.releaseId && downloadProgress.status === "permission" && downloadProgress.downloadId) {
      await continueNativeInstall(app, downloadProgress.downloadId);
      return;
    }
    if (downloadProgress && ["starting", "downloading", "installing", "permission"].includes(downloadProgress.status)) return;

    const releaseId = app.releaseId;
    const version = String(app.versionName || "latest").replace(/[^A-Za-z0-9._-]/g, "-");
    const filename = (app.slug || "app") + "-" + version + ".apk";
    const controller = new AbortController();
    downloadAbortRef.current = controller;
    let loaded = 0;
    let total = Number(app.sizeBytes) || 0;
    const platform = Capacitor.getPlatform() === "android" ? "android" as const : "browser" as const;

    setDownloadProgress({ releaseId, appName: app.name, filename, status: "starting", loaded: 0, total, platform });

    if (platform === "android") {
      let terminalStatus: "complete" | "error" | "permission" | "cancelled" | null = null;
      let completedHandle: { remove: () => Promise<void> } | null = null;
      let failedHandle: { remove: () => Promise<void> } | null = null;
      let permissionHandle: { remove: () => Promise<void> } | null = null;
      let lastError = "";
      const settle = (status: "complete" | "error" | "permission" | "cancelled", errorMessage?: string) => {
        if (terminalStatus) return;
        terminalStatus = status;
        setDownloadProgress((current) => {
          if (!current || current.releaseId !== releaseId) return current;
          const finishedBytes = current.total || current.loaded;
          return {
            ...current,
            status,
            loaded: status === "complete" || status === "permission" ? finishedBytes : current.loaded,
            total: status === "complete" || status === "permission" ? finishedBytes : current.total,
            error: errorMessage
          };
        });
      };

      try {
        completedHandle = await NativeAppUpdate.addListener("downloadComplete", (event) => {
          if (event.packageId && event.packageId !== app.packageId) return;
          settle("complete");
        });
        failedHandle = await NativeAppUpdate.addListener("downloadError", (event) => {
          if (event.packageId && event.packageId !== app.packageId) return;
          lastError = event.message || "Android could not finish the APK download or open its installer.";
          settle("error", lastError);
        });
        permissionHandle = await NativeAppUpdate.addListener("installPermissionRequired", (event) => {
          if (event.packageId && event.packageId !== app.packageId) return;
          const message = event.message || "The APK is downloaded. Allow CrownStore to install apps in Android settings, then return and tap Continue installation.";
          settle("permission", message);
          setDownloadProgress((current) => current?.releaseId === releaseId
            ? { ...current, status: "permission", downloadId: Number(event.downloadId) || current.downloadId, error: message, loaded: current.total || current.loaded, total: current.total || current.loaded }
            : current);
        });

        const result = await NativeAppUpdate.downloadAndInstall({
          url: API_BASE + "/api/downloads/" + encodeURIComponent(releaseId),
          appName: app.name,
          packageId: app.packageId
        });

        const downloadId = Number(result.downloadId);
        if (!Number.isSafeInteger(downloadId) || downloadId <= 0) {
          throw new Error("Android did not confirm that the APK download was queued. Please retry.");
        }
        nativeDownloadIdRef.current = downloadId;
        if (controller.signal.aborted) {
          await NativeAppUpdate.cancelDownload({ downloadId }).catch(() => undefined);
          settle("cancelled");
          return;
        }
        setDownloadProgress((current) => current?.releaseId === releaseId
          ? { ...current, status: "downloading", downloadId }
          : current);

        let downloadedAt: number | null = null;
        while (!terminalStatus && !controller.signal.aborted) {
          const snapshot = await NativeAppUpdate.getDownloadStatus({ downloadId });
          if (terminalStatus || controller.signal.aborted) break;
          const received = Math.max(0, Number(snapshot.bytesDownloaded) || 0);
          const availableSize = Math.max(0, Number(snapshot.totalSize) || 0);
          if (availableSize > 0) total = availableSize;
          loaded = received;

          if (snapshot.status === "failed") {
            throw new Error("Android Download Manager failed the APK download (reason " + snapshot.reason + "). Check your connection and retry.");
          }
          if (snapshot.status === "successful") {
            downloadedAt = downloadedAt || Date.now();
            setDownloadProgress((current) => current?.releaseId === releaseId
              ? { ...current, status: "installing", loaded: total || loaded, total: total || loaded, downloadId }
              : current);
            // The native receiver normally confirms that the installer opened. This
            // fallback keeps the UI accurate if Android delivers that event late.
            if (Date.now() - downloadedAt > 9000 && !terminalStatus) {
              settle("complete");
              break;
            }
          } else {
            downloadedAt = null;
            setDownloadProgress((current) => current?.releaseId === releaseId
              ? { ...current, status: "downloading", loaded, total, downloadId }
              : current);
          }
          await new Promise<void>((resolve) => window.setTimeout(resolve, 450));
        }

        if (controller.signal.aborted && !terminalStatus) settle("cancelled");
      } catch (error) {
        settle(controller.signal.aborted ? "cancelled" : "error",
          controller.signal.aborted ? undefined : error instanceof Error ? error.message : lastError || "The Android APK download failed. Please retry.");
      } finally {
        if (completedHandle) await completedHandle.remove().catch(() => undefined);
        if (failedHandle) await failedHandle.remove().catch(() => undefined);
        if (permissionHandle) await permissionHandle.remove().catch(() => undefined);
        nativeDownloadIdRef.current = null;
        if (downloadAbortRef.current === controller) downloadAbortRef.current = null;
      }
      return;
    }

    try {
      const response = await fetch(API_BASE + "/api/downloads/" + encodeURIComponent(releaseId), {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
        headers: { Accept: "application/vnd.android.package-archive" }
      });
      if (!response.ok) {
        let message = "Download failed (HTTP " + response.status + ").";
        try {
          const body = await response.json() as { error?: string; message?: string };
          message = body.error || body.message || message;
        } catch {
          // Some proxies return a plain-text error body; keep the useful HTTP status.
        }
        throw new Error(message);
      }
      if (!response.body) throw new Error("This browser cannot stream the APK download. Try opening CrownStore in a recent browser.");

      const headerLength = Number(response.headers.get("content-length") || 0);
      if (Number.isSafeInteger(headerLength) && headerLength > 0) total = headerLength;
      setDownloadProgress({ releaseId, appName: app.name, filename, status: "downloading", loaded: 0, total, platform });

      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let lastProgressUpdate = 0;
      try {
        while (true) {
          if (controller.signal.aborted) throw new Error("Download cancelled.");
          const result = await reader.read();
          if (result.done) break;
          const chunk = result.value;
          if (chunk && chunk.byteLength > 0) {
            chunks.push(chunk);
            loaded += chunk.byteLength;
          }
          const now = Date.now();
          if (now - lastProgressUpdate >= 120) {
            setDownloadProgress({ releaseId, appName: app.name, filename, status: "downloading", loaded, total, platform });
            lastProgressUpdate = now;
          }
        }
      } finally {
        reader.releaseLock();
      }

      if (loaded < 1) throw new Error("The server returned an empty APK file.");
      if (Number.isSafeInteger(headerLength) && headerLength > 0 && loaded !== headerLength) {
        throw new Error("The download ended before the full APK arrived. Please retry.");
      }

      const apkBlob = new Blob(chunks as BlobPart[], { type: "application/vnd.android.package-archive" });
      const objectUrl = URL.createObjectURL(apkBlob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);

      setDownloadProgress({ releaseId, appName: app.name, filename, status: "complete", loaded, total: loaded, platform });
    } catch (error) {
      const cancelled = controller.signal.aborted;
      setDownloadProgress({
        releaseId, appName: app.name, filename,
        status: cancelled ? "cancelled" : "error",
        loaded, total, platform,
        error: cancelled ? undefined : error instanceof Error ? error.message : "The APK download failed. Please try again."
      });
    } finally {
      if (downloadAbortRef.current === controller) downloadAbortRef.current = null;
    }
  }

  function onInstallDownloaded(app: CrownApp) {
    if (!downloadProgress || downloadProgress.releaseId !== app.releaseId || downloadProgress.status !== "complete" && downloadProgress.status !== "permission") return;
    if (Capacitor.getPlatform() === "android") {
      const downloadId = downloadProgress.downloadId;
      if (downloadId && downloadId > 0) void continueNativeInstall(app, downloadId);
      else window.alert("CrownStore cannot find the completed Android download. Please download the APK again.");
      return;
    }

    // A web page cannot access the browser's saved file URI or force PackageInstaller.
    // On Android, make a best-effort handoff to the system DocumentsUI Downloads folder.
    // This opens the existing Downloads folder only; it never starts a second APK download.
    if (/Android/i.test(window.navigator.userAgent)) {
      const downloadsIntent = "intent://com.android.externalstorage.documents/document/primary%3ADownload"
        + "#Intent;scheme=content;action=android.intent.action.VIEW;type=vnd.android.document/directory;category=android.intent.category.DEFAULT;end";
      window.location.href = downloadsIntent;

      // Some browsers/device builds block external activity intents. Keep a clear fallback
      // instead of leaving the Install button appearing to do nothing.
      window.setTimeout(() => {
        window.alert(
          "Your APK is already downloaded as " + downloadProgress.filename +
          ". If Files did not open, open your phone's Files app (or My Files) → Downloads, " +
          "then tap that APK. Do not download it again."
        );
      }, 900);
      return;
    }

    window.alert("Your APK is already downloaded as " + downloadProgress.filename + ". On your Android phone, open Files (or My Files) → Downloads and tap the saved APK. CrownStore will not download it again.");
  }

  function cancelDownload() {
    downloadAbortRef.current?.abort();
    const downloadId = nativeDownloadIdRef.current;
    if (downloadId !== null && Capacitor.getPlatform() === "android") {
      void NativeAppUpdate.cancelDownload({ downloadId }).catch(() => undefined);
    }
  }

  function dismissDownload() {
    if (downloadProgress && ["starting", "downloading", "installing"].includes(downloadProgress.status)) return;
    setDownloadProgress(null);
  }

  const categories = useMemo(() => ["All apps", ...Array.from(new Set(apps.map((app) => app.category).filter((item): item is string => Boolean(item && item.trim())))).sort((a, b) => a.localeCompare(b))], [apps]);
  const filtered = useMemo(() => {
    const base = view === "UPDATES"
      ? apps.filter((app) => app.releaseId && (!isAndroidApp || getAppInstallState(app, installedApps, installedScanStatus) === "update"))
      : apps;
    const q = search.trim().toLowerCase();
    return base.filter((app) => {
      const categoryMatches = category === "All apps" || app.category?.toLowerCase() === category.toLowerCase();
      const searchMatches = !q || [app.name, app.shortDescription, app.description, app.category, app.packageId].some((value) => value?.toLowerCase().includes(q));
      return categoryMatches && searchMatches;
    }).sort((a, b) => {
      if (view === "UPDATES") return new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime();
      return a.name.localeCompare(b.name);
    });
  }, [apps, search, category, view, installedApps, installedScanStatus, isAndroidApp]);

  const searchResults = useMemo(() => {
    const query = searchPageQuery.trim().toLowerCase();
    if (!query) return [];
    const fields = (app: CrownApp) => [app.name, app.slug, app.packageId, app.category, app.shortDescription, app.description]
      .map((value) => (value || "").toLowerCase());
    const rank = (app: CrownApp) => {
      const name = app.name.toLowerCase();
      const slug = app.slug.toLowerCase();
      const packageId = app.packageId.toLowerCase();
      if (name === query) return 0;
      if (name.startsWith(query)) return 1;
      if (slug === query || packageId === query) return 2;
      if (name.includes(query)) return 3;
      if (slug.includes(query) || packageId.includes(query)) return 4;
      if ((app.category || "").toLowerCase().includes(query)) return 5;
      return 6;
    };
    return apps
      .filter((app) => fields(app).some((field) => field.includes(query)))
      .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  }, [apps, searchPageQuery]);

  function navigate(next: View) {
    setView(next);
    // Updates and Search always open at the page top, regardless of the previous scroll position.
    window.requestAnimationFrame(() => {
      if (next === "UPDATES" || next === "SEARCH") {
        window.scrollTo({ top: 0, behavior: "auto" });
      } else {
        const targetId = next === "HOME" ? "home" : next === "ABOUT" ? "about" : "apps";
        document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }

  function submitSearch(value = searchPageQuery) {
    const query = value.trim().replace(/\\s+/g, " ");
    if (!query) return;
    const next = [query, ...recentSearches.filter((item) => item.toLowerCase() !== query.toLowerCase())].slice(0, 8);
    setRecentSearches(next);
    try { window.localStorage.setItem("crownstore-recent-searches", JSON.stringify(next)); } catch {}
    setSearchPageQuery(query);
  }

  function removeRecentSearch(value: string) {
    const next = recentSearches.filter((item) => item !== value);
    setRecentSearches(next);
    try { window.localStorage.setItem("crownstore-recent-searches", JSON.stringify(next)); } catch {}
  }

  function openAppDetails(app: CrownApp) {
    const nextUrl = window.location.pathname + window.location.search + "#app/" + encodeURIComponent(app.slug);
    if (window.location.hash.startsWith("#app/")) {
      window.history.replaceState({ crownStoreDetail: true, slug: app.slug }, "", nextUrl);
    } else {
      window.history.pushState({ crownStoreDetail: true, slug: app.slug }, "", nextUrl);
      detailHistoryPushedRef.current = true;
    }

    // Show the catalogue copy immediately, then refresh all app metadata from Neon
    // whenever details opens. Reviews are independently reloaded by AppDetailsPage.
    setSelectedApp(app);
    window.scrollTo({ top: 0, behavior: "auto" });
    const requestedSlug = app.slug;
    void requestStoreJson<{ app: CrownApp }>(
      API_BASE + "/api/apps/" + encodeURIComponent(requestedSlug) + "?_=" + Date.now()
    ).then((payload) => {
      const freshApp = payload?.app;
      if (!freshApp || freshApp.slug !== requestedSlug) return;
      setApps((current) => current.map((item) => item.slug === requestedSlug ? freshApp : item));
      setSelectedApp((current) => current?.slug === requestedSlug ? freshApp : current);
    }).catch((error) => {
      console.warn("CrownStore could not refresh app details from the database:", error);
    });
  }

  function closeAppDetails() {
    if (window.location.hash.startsWith("#app/")) {
      if (detailHistoryPushedRef.current) window.history.back();
      else window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    detailHistoryPushedRef.current = false;
    setSelectedApp(null);
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  const updatesAvailable = apps.some((app) => Boolean(app.releaseId));
  return <div className="site-shell">
    <div className="ambient ambient-one" /><div className="ambient ambient-two" />
    <header className="app-header glass-panel" aria-label="CrownStore">
      <span className="header-artwork"><span className="header-logo brand-mark"><StoreMark size={19} /></span></span>
      <div className={"header-brand" + (!isOnline ? " header-brand-offline" : "")} aria-live="polite"><div className="header-brand-copy"><p className="header-brand-title">{isOnline ? "CrownStore" : "NO INTERNET"}</p>{!isOnline && <p className="header-brand-subtitle">Check your connection</p>}</div></div>
      <div className="header-right-artwork"><span className="header-logo brand-mark"><StoreMark size={19} /></span></div>
    </header>
    <main id="home">
      {selectedApp ? <AppDetailsPage
        app={selectedApp}
        onClose={closeAppDetails}
        download={downloadProgress}
        isAnotherDownloadRunning={Boolean(downloadProgress && ["starting", "downloading", "installing", "permission"].includes(downloadProgress.status) && downloadProgress.releaseId !== selectedApp.releaseId)}
        onDownload={downloadRelease}
        onCancelDownload={cancelDownload}
        onDismissDownload={dismissDownload}
        onInstallDownloaded={onInstallDownloaded}
        installState={getAppInstallState(selectedApp, installedApps, installedScanStatus)}
        installedVersion={installedApps[selectedApp.packageId]}
        onRefreshInstalledApps={() => installedScanRef.current()}
        allApps={apps}
        onOpenApp={openAppDetails}
      /> : view === "SEARCH" ? <section id="search-page" className="store-search-page" aria-label="Search CrownStore apps">
        <div className="store-search-heading"><span className="eyebrow"><Search size={14} /> CROWNSTORE DISCOVERY</span><h1>Find your next app.</h1><p>Search official apps by name, category, description, or package ID.</p></div>
        <form className="store-search-bar glass-panel" role="search" onSubmit={(event) => { event.preventDefault(); submitSearch(); }}>
          <Search size={20} aria-hidden="true" />
          <input autoComplete="off" autoCapitalize="none" spellCheck={false} value={searchPageQuery} onChange={(event) => setSearchPageQuery(event.target.value)} placeholder="Search apps…" aria-label="Search apps" />
          {searchPageQuery && <button type="button" onClick={() => setSearchPageQuery("")} aria-label="Clear search"><X size={17} /></button>}
          <button className="store-search-submit" type="submit" disabled={!searchPageQuery.trim()}>Search</button>
        </form>
        {!searchPageQuery.trim() && recentSearches.length > 0 && <section className="recent-searches" aria-label="Recent searches">
          <div className="search-section-heading"><h2>Recent searches</h2><button type="button" onClick={() => { setRecentSearches([]); try { window.localStorage.removeItem("crownstore-recent-searches"); } catch {} }}>Clear all</button></div>
          {recentSearches.map((term) => <div className="recent-search-row" key={term}>
            <button className="recent-search-term" type="button" onClick={() => submitSearch(term)}><span className="recent-search-clock" aria-hidden="true">↻</span><span>{term}</span></button>
            <button className="recent-search-remove" type="button" aria-label={"Remove " + term} onClick={() => removeRecentSearch(term)}><X size={15} /></button>
          </div>)}
        </section>}
        {searchPageQuery.trim()
          ? <section className="search-results-section" aria-label="Search results">
              <div className="search-section-heading"><h2>Search results</h2><span>{searchResults.length} {searchResults.length === 1 ? "app" : "apps"}</span></div>
              {loading
                ? <div className="state-panel"><div className="loader-ring" /><strong>Searching apps</strong><span>Loading the official catalogue…</span></div>
                : error
                  ? <div className="state-panel state-error"><strong>Search is temporarily unavailable</strong><span>{error}</span><button className="button button-outline" onClick={() => void loadApps()}>Try again</button></div>
                  : searchResults.length
                    ? <div className="store-search-results">{searchResults.map((app) => <SearchAppResultRow key={app.id} app={app} onDetails={openAppDetails} />)}</div>
                    : <div className="state-panel"><div className="state-icon"><Search size={22} /></div><strong>No apps found</strong><span>Try another name, category, or package ID.</span></div>}
            </section>
          : <section className="search-discover" aria-label="Discover apps">
              {categories.length > 1 && <div className="search-category-section">
                <div className="search-section-heading"><h2>Browse categories</h2><span>Find apps by type</span></div>
                <div className="search-category-chips">{categories.filter((item) => item !== "All apps").slice(0, 8).map((item) => <button className="search-category-chip" key={item} type="button" onClick={() => submitSearch(item)}>{readableCategory(item)}</button>)}</div>
              </div>}
              <div className="search-section-heading"><h2><Sparkles size={17} /> Explore apps</h2><span>{apps.length} in the catalogue</span></div>
              {loading
                ? <div className="state-panel"><div className="loader-ring" /><strong>Loading apps</strong><span>Fetching the official catalogue…</span></div>
                : error
                  ? <div className="state-panel state-error"><strong>The catalogue is temporarily unavailable</strong><span>{error}</span><button className="button button-outline" onClick={() => void loadApps()}>Try again</button></div>
                  : apps.length
                    ? <div className="store-search-results">{[...apps].sort((a, b) => Number(Boolean(b.releaseId)) - Number(Boolean(a.releaseId)) || a.name.localeCompare(b.name)).slice(0, 6).map((app) => <SearchAppResultRow key={app.id} app={app} onDetails={openAppDetails} />)}</div>
                    : <div className="search-empty-prompt"><Search size={24} /><strong>No apps are listed yet</strong><span>Official apps will appear here when they are published to CrownStore.</span></div>}
            </section>}
      </section> : view === "HOME" ? <section className="home-shelves" aria-label="App shelves">
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
              {(loading ? [] : shelfApps).map((app) => <div className="shelf-app-card" key={app.id}><AppCard app={app} onDetails={openAppDetails} /></div>)}

            </div>
          </section>;
        })}
        <div className="shelf-footer-note"><ShieldCheck size={15} /> Official apps and verified Android releases, all in one trusted place.</div>
      </section> : <>
      <section className={`hero ${view === "UPDATES" ? "updates-hero" : ""}`}>
        <div className="hero-copy">
          <div className="eyebrow"><Sparkles size={14} /> THE OFFICIAL APP COLLECTION</div>
          <h1>All your apps.<br /><span>One royal home.</span></h1>
          <p className="hero-description">Discover the apps built for the KingsHall ecosystem. Official Android releases, clear version details and direct downloads—all in one trusted place.</p>
          
          <div className="trust-row"><span><ShieldCheck size={16} /> Official releases</span><span><CheckCircle2 size={16} /> Verified APK metadata</span></div>
        </div>
        <div className="hero-art"><div className="orbit orbit-outer" /><div className="orbit orbit-inner" /><div className="hero-glow" /><div className="hero-crown"><StoreMark size={61} /><span>CROWNSTORE</span></div><div className="floating-chip chip-one"><Smartphone size={17} /> Android apps</div><div className="floating-chip chip-two"><ShieldCheck size={17} /> Verified builds</div><div className="floating-chip chip-three"><ArrowDownToLine size={17} /> Direct downloads</div></div>
      </section>
            {view === "UPDATES" && !isAndroidApp && <DeviceUpdatesPanel launchSession={bridgeSession} onConnect={setBridgeSession} />}
      <section className={`apps-section ${view === "UPDATES" ? "updates-page" : ""}`} id="apps">
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
            : view === "UPDATES" && isAndroidApp && installedScanStatus === "checking"
              ? <div className="state-panel"><div className="loader-ring" /><strong>Checking your installed apps</strong><span>Comparing installed version codes with the latest verified releases…</span></div>
              : view === "UPDATES" && isAndroidApp && installedScanStatus === "error"
                ? <div className="state-panel state-error"><div className="state-icon"><Info size={22} /></div><strong>Installed apps could not be checked</strong><span>{installedScanError || "CrownStore couldn't read this phone's installed app versions."}</span><button className="button button-outline" onClick={() => installedScanRef.current()}>Try again</button></div>
                : filtered.length
              ? <div className="app-grid">{filtered.map((app) => <AppCard key={app.id} app={app} onDetails={openAppDetails} />)}</div>
              : view === "UPDATES" && isAndroidApp && installedScanStatus === "ready" && !search.trim() && category === "All apps"
                ? <div className="state-panel"><div className="state-icon"><CheckCircle2 size={22} /></div><strong>You’re all caught up</strong><span>Every installed CrownStore app is using the latest published version. Apps you haven’t installed remain available in the collection.</span></div>
              : view === "UPDATES" && !search.trim() && category === "All apps" && !updatesAvailable
                ? <div className="state-panel"><div className="state-icon"><Download size={22} /></div><strong>No published updates yet</strong><span>The apps are in the catalogue, but no stable APK release has been published yet. Check back after the first release is verified.</span></div>
                : apps.length
                  ? <div className="state-panel"><div className="state-icon"><Search size={22} /></div><strong>No matching applications</strong><span>Try another search term or category.</span><button className="button button-outline" onClick={() => { setSearch(""); setCategory("All apps"); }}>Clear filters</button></div>
                  : <div className="state-panel"><div className="state-icon"><StoreMark size={23} /></div><strong>The collection is getting ready</strong><span>Official apps appear here as soon as the catalogue is configured.</span></div>}
        <div className="catalogue-footnote"><ShieldCheck size={15} /> Downloads resolve through the official CrownStore API and published release catalogue.</div>
      </section>
      </>}
      {view !== "HOME" && view !== "SEARCH" && view !== "UPDATES" && <section className="bottom-banner"><div className="banner-icon"><StoreMark size={28} /></div><div><span className="eyebrow">BUILT FOR THE ECOSYSTEM</span><h2>One home. Every KingsHall app.</h2><p>Come back for official releases and verified updates.</p></div><button className="button button-outline" onClick={() => navigate("APPS")}>Browse apps <ArrowRight size={16} /></button></section>}
    </main>
    <footer className="site-footer"><a className="brand footer-brand" href="#home"><span className="brand-mark"><StoreMark size={19} /></span><span className="brand-word">Crown<span>Store</span><small>BY KINGSHALL</small></span></a><span>Official apps. One trusted home.</span><span className="footer-status"><span className="status-dot live-dot" /> Public catalogue</span><div className="footer-admin-actions"><button className="publisher-open" onClick={() => setShowAppManager(true)}>Manage Apps</button><button className="publisher-open" onClick={() => setShowPublisher(true)}>Publisher</button></div></footer>
    <NativeDeviceBridgeAgent session={bridgeSession} />
    <NativeSelfUpdate apps={apps} onRequestUpdate={downloadRelease} />
    <NowBar activePage={selectedApp ? "DETAILS" : view === "SEARCH" ? "SEARCH" : view === "UPDATES" ? "UPDATES" : "HOME"} onHome={() => { closeAppDetails(); setView("HOME"); window.scrollTo({ top: 0, behavior: "auto" }); }} onSearch={() => { closeAppDetails(); navigate("SEARCH"); }} onUpdates={() => { closeAppDetails(); navigate("UPDATES"); }} />
    {downloadProgress && (!selectedApp || selectedApp.releaseId !== downloadProgress.releaseId) && <div className="download-tray">
      <DownloadFeedback
        progress={downloadProgress}
        onCancel={cancelDownload}
        onRetry={() => {
          const app = apps.find((item) => item.releaseId === downloadProgress.releaseId);
          if (app) void downloadRelease(app);
        }}
        onDismiss={dismissDownload}
        onInstall={() => {
          const app = apps.find((item) => item.releaseId === downloadProgress.releaseId);
          if (app) onInstallDownloaded(app);
        }}
      />
    </div>}

    {showAppManager && <AppManagerPanel onClose={() => setShowAppManager(false)} onSaved={() => void loadApps()} />}
    {showPublisher && <PublisherPanel apps={apps.filter((item) => !("isListed" in item) || item.isListed)} onPublished={() => void loadApps()} onClose={() => setShowPublisher(false)} />}
  </div>;
}