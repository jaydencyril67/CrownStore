import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type TouchEvent, type ReactNode } from "react";
import { Home, Search, Download, Menu, UserRound, Info } from "lucide-react";
import { BUTTON_COLOR_ENABLED_KEY, BUTTON_COLOR_KEY, EDGE_LIGHT_KEY, EDGE_LIGHT_ENABLED_KEY, EDGE_LIGHT_COLOR_KEY, EDGE_LIGHT_MODE_KEY, EXPAND_MODE_KEY, SWIPE_NAVIGATION_KEY } from "./notifications";

type ActionLabel = "HOME" | "SEARCH" | "UPDATES" | "PROFILE" | "NOTIFICATIONS" | "MENU" | "ABOUT";
type Action = { label: ActionLabel; icon: ReactNode };
type EdgeMode = "stable-light" | "stable" | "blink-light" | "blink" | "pulse-light" | "pulse" | "color-light" | "color";

const actions: Action[] = [
  { label: "HOME", icon: <Home size={18} /> },
  { label: "SEARCH", icon: <Search size={18} /> },
  { label: "UPDATES", icon: <Download size={18} /> },
  { label: "PROFILE", icon: <UserRound size={18} /> },
  { label: "ABOUT", icon: <Info size={18} /> },
  { label: "MENU", icon: <Menu size={18} /> },
];

const ORDER: Array<"HOME" | "SEARCH" | "UPDATES" | "PROFILE" | "ABOUT" | "MENU"> = ["HOME", "SEARCH", "UPDATES", "PROFILE", "ABOUT", "MENU"];

export default function NowBar({ onHome, onSearch, onUpdates, onProfile, onNotifications, onMenu, onAbout, activePage = "HOME" }: { onHome: () => void; onSearch: () => void; onUpdates: () => void; onProfile: () => void; onNotifications: () => void; onMenu: () => void; onAbout: () => void; activePage?: "HOME" | "SEARCH" | "UPDATES" | "PROFILE" | "MENU" | "NOTIFICATIONS" | "ABOUT" | "DETAILS" }) {
  const [barState, setBarState] = useState<{ view: "title" | "actions"; mode: "compact" | "expanded" }>({ view: "title", mode: "compact" });
  const [pressing, setPressing] = useState(false);
  const readEdgeSettings = (): { enabled: boolean; color: string; mode: EdgeMode } => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(EDGE_LIGHT_KEY) || "{}") as { enabled?: boolean; color?: string; mode?: string };
      const modes: EdgeMode[] = ["stable-light", "stable", "blink-light", "blink", "pulse-light", "pulse", "color-light", "color"];
      const dedicatedMode = window.localStorage.getItem(EDGE_LIGHT_MODE_KEY);
      const storedMode = modes.includes(dedicatedMode as EdgeMode) ? dedicatedMode : saved.mode;
      const storedColor = window.localStorage.getItem(EDGE_LIGHT_COLOR_KEY) ?? saved.color;
      const storedEnabled = window.localStorage.getItem(EDGE_LIGHT_ENABLED_KEY);
      const mode: EdgeMode = modes.includes(storedMode as EdgeMode) ? storedMode as EdgeMode : "stable";
      return {
        enabled: storedEnabled === null ? saved.enabled === true : storedEnabled === "true",
        color: typeof storedColor === "string" && /^#[0-9a-f]{6}$/i.test(storedColor) ? storedColor : "#c4b5fd",
        mode
      };
    } catch { return { enabled: false, color: "#c4b5fd", mode: "stable" }; }
  };
  const readColor = (key: string, fallback: string) => {
    try { const saved = window.localStorage.getItem(key); return saved && /^#[0-9a-f]{6}$/i.test(saved) ? saved : fallback; } catch { return fallback; }
  };
  const readEnabled = (key: string, fallback: boolean) => {
    try { const saved = window.localStorage.getItem(key); return saved === null ? fallback : saved === "true"; } catch { return fallback; }
  };
  const [edgeSettings, setEdgeSettings] = useState(readEdgeSettings);
  const [buttonColor, setButtonColor] = useState(() => readColor(BUTTON_COLOR_KEY, "#c4b5fd"));
  const [buttonColorEnabled, setButtonColorEnabled] = useState(() => readEnabled(BUTTON_COLOR_ENABLED_KEY, false));
  const [expandModeEnabled, setExpandModeEnabled] = useState(() => readEnabled(EXPAND_MODE_KEY, true));
  const [swipeNavigationEnabled, setSwipeNavigationEnabled] = useState(() => readEnabled(SWIPE_NAVIGATION_KEY, true));
  const { view, mode } = barState;
  const barRef = useRef<HTMLDivElement | null>(null);
  const holdTimer = useRef<number | null>(null);
  const idleTimer = useRef<number | null>(null);
  const holdTriggered = useRef(false);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const swipeHandled = useRef(false);

  useEffect(() => {
    const refreshSettings = () => {
      setEdgeSettings(readEdgeSettings());
      setButtonColor(readColor(BUTTON_COLOR_KEY, "#c4b5fd"));
      setButtonColorEnabled(readEnabled(BUTTON_COLOR_ENABLED_KEY, false));
      setExpandModeEnabled(readEnabled(EXPAND_MODE_KEY, true));
      setSwipeNavigationEnabled(readEnabled(SWIPE_NAVIGATION_KEY, true));
    };
    const refreshWhenRestored = () => refreshSettings();
    window.addEventListener("storage", refreshSettings);
    window.addEventListener("crownstore:nowbar-settings-changed", refreshSettings);
    window.addEventListener("pageshow", refreshWhenRestored);
    window.addEventListener("focus", refreshWhenRestored);
    document.addEventListener("visibilitychange", refreshWhenRestored);
    return () => {
      window.removeEventListener("storage", refreshSettings);
      window.removeEventListener("crownstore:nowbar-settings-changed", refreshSettings);
      window.removeEventListener("pageshow", refreshWhenRestored);
      window.removeEventListener("focus", refreshWhenRestored);
      document.removeEventListener("visibilitychange", refreshWhenRestored);
    };
  }, []);

  const stopHold = () => {
    setPressing(false);
    if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };

  const resetIdle = () => {
    if (idleTimer.current !== null) window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => {
      setBarState((current) => ({ ...current, view: "title" }));
    }, 10000);
  };

  const startHold = () => {
    if (!expandModeEnabled) return;
    holdTriggered.current = false;
    setPressing(true);
    if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
    holdTimer.current = window.setTimeout(() => {
      holdTriggered.current = true;
      setBarState((current) => ({ view: "actions", mode: current.mode === "compact" ? "expanded" : "compact" }));
      resetIdle();
    }, 700);
  };

  useLayoutEffect(() => {
    if (view !== "actions" || mode !== "compact" || !barRef.current) return;
    let saved: string | null = null;
    try { saved = window.localStorage.getItem("crownstore-nowbar-action"); } catch {}
    const target = Array.from(barRef.current.querySelectorAll<HTMLButtonElement>("[data-nowbar-label]"))
      .find((button) => button.dataset.nowbarLabel === saved);
    if (!target) return;
    const centerTarget = () => {
      if (!barRef.current) return;
      const max = barRef.current.scrollWidth - barRef.current.clientWidth;
      const left = target.offsetLeft - (barRef.current.clientWidth - target.offsetWidth) / 2;
      barRef.current.scrollLeft = Math.max(0, Math.min(left, max));
    };
    centerTarget();
  }, [view, mode]);

  useEffect(() => () => {
    if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
    if (idleTimer.current !== null) window.clearTimeout(idleTimer.current);
  }, []);

  const activate = (label: ActionLabel) => {
    if (!["HOME", "SEARCH", "UPDATES", "PROFILE", "NOTIFICATIONS", "MENU", "ABOUT"].includes(label)) return;
    try { window.localStorage.setItem("crownstore-nowbar-action", label); } catch {}
    resetIdle();
    setBarState({ view: "title", mode: "compact" });
    if (label === "HOME") onHome(); else if (label === "SEARCH") onSearch(); else if (label === "UPDATES") onUpdates(); else if (label === "PROFILE") onProfile(); else if (label === "NOTIFICATIONS") onNotifications(); else if (label === "ABOUT") onAbout(); else onMenu();
  };

  const finishSwipe = (event: TouchEvent<HTMLDivElement>) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!swipeNavigationEnabled || !start || event.changedTouches.length !== 1) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < 50 || Math.abs(dx) <= Math.abs(dy)) return;
    if (!ORDER.includes(activePage as (typeof ORDER)[number])) return;
    const currentPage = activePage as (typeof ORDER)[number];
    const index = ORDER.indexOf(currentPage);
    const next = ORDER[index + (dx < 0 ? 1 : -1)];
    if (!next) return;
    swipeHandled.current = true;
    try { window.localStorage.setItem("crownstore-nowbar-action", next); } catch {}
    if (next === "HOME") onHome();
    else if (next === "SEARCH") onSearch();
    else if (next === "UPDATES") onUpdates();
    else if (next === "PROFILE") onProfile();
    else if (next === "ABOUT") onAbout();
    else onMenu();
    setBarState({ view: "title", mode: "compact" });
    resetIdle();
  };

  return (
    <div className={`kh-nowbar-dock ${mode === "expanded" ? "is-expanded" : ""} ${"kh-nowbar-light-" + (edgeSettings.enabled ? edgeSettings.mode : "stable-light")}`} style={{
      "--kh-nowbar-accent": edgeSettings.enabled ? edgeSettings.color : "rgba(220,226,234,.18)",
      "--kh-nowbar-glow": edgeSettings.enabled ? edgeSettings.color + "66" : "transparent",
      "--kh-light-accent": edgeSettings.enabled ? edgeSettings.color : "rgba(220,226,234,.18)",
      "--kh-light-glow": edgeSettings.enabled ? edgeSettings.color + "66" : "transparent"
    } as CSSProperties}>
      <div
        ref={barRef}
        className={`kh-nowbar ${view === "title" ? "is-title" : "is-actions"} ${mode === "expanded" ? "is-expanded" : ""}`}
        data-nowbar-edge-style={edgeSettings.enabled ? edgeSettings.mode : undefined}
        role="button"
        tabIndex={0}
        aria-label={view === "title" ? `${activePage} page. Tap to show navigation buttons; hold to expand; swipe to navigate.` : "Navigation buttons. Tap to show current page."}
        onClick={() => {
          if (swipeHandled.current) {
            swipeHandled.current = false;
          } else if (!pressing && !holdTriggered.current) {
            resetIdle();
            setBarState({ view: view === "title" ? "actions" : "title", mode: "compact" });
          }
          holdTriggered.current = false;
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            resetIdle();
            setBarState({ view: view === "title" ? "actions" : "title", mode: "compact" });
          }
        }}
        onPointerDown={startHold}
        onPointerUp={stopHold}
        onPointerLeave={stopHold}
        onPointerCancel={stopHold}
        onTouchStart={(event) => {
          const titleTarget = (event.target as HTMLElement).closest(".kh-nowbar-title");
          if (titleTarget && event.touches.length === 1) {
            swipeStart.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
          }
        }}
        onTouchEnd={(event) => {
          stopHold();
          if (swipeStart.current) finishSwipe(event);
        }}
        onTouchCancel={() => { stopHold(); swipeStart.current = null; }}
      >
        <div className="kh-nowbar-rail" />
        {view === "title" ? (
          <div className={`kh-nowbar-title ${pressing ? "is-pressing" : ""}`}>
            <span className="kh-nowbar-orb" />
            <span className="kh-nowbar-current" style={buttonColorEnabled ? { color: buttonColor, textShadow: `0 0 6px ${buttonColor}aa, 0 0 14px ${buttonColor}66` } : undefined}>{activePage}</span>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>
          </div>
        ) : (
          actions.map((action) => (
              <div className={`kh-nowbar-slot ${mode === "expanded" ? "is-expanded" : ""}`} key={action.label}>
                <button
                  data-nowbar-label={action.label}
                  className={`kh-nowbar-action ${action.label === activePage ? "is-active" : ""}`}
                  style={buttonColorEnabled ? ({
                    borderColor: buttonColor,
                    borderWidth: "1.5px",
                    color: buttonColor,
                    boxShadow: `0 0 0 1px ${buttonColor}66, 0 0 10px ${buttonColor}55, inset 0 0 5px ${buttonColor}1f`
                  } as CSSProperties) : undefined}
                  type="button"
                  aria-label={action.label}
                  onClick={() => {
                    if (holdTriggered.current) { holdTriggered.current = false; return; }
                    activate(action.label);
                  }}
                >
                  <span className="kh-nowbar-icon">{action.icon}</span>
                  {mode === "compact" && <span className="kh-nowbar-label-compact">{action.label}</span>}
                  {mode === "expanded" && <span className="kh-nowbar-label-expanded">{action.label.length > 12 ? <span className="kh-nowbar-marquee">{action.label.toUpperCase()} · {action.label.toUpperCase()}</span> : action.label}</span>}
                </button>
              </div>
          ))
        )}
      </div>
    </div>
  );
}
