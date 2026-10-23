import { useEffect, useLayoutEffect, useRef, useState, type TouchEvent, type ReactNode } from "react";
import { Home, Search, Download, Sparkles, CircleHelp, Menu, Crosshair, ListFilter, Plus } from "lucide-react";

type ActionLabel = "HOME" | "SEARCH" | "UPDATES" | "OPTION 3" | "OPTION 4" | "OPTION 5" | "OPTION 6" | "OPTION 7" | "OPTION 8" | "OPTION 9" | "OPTION 10" | "OPTION 11";
type Action = { label: ActionLabel; icon: ReactNode };

const actions: Action[] = [
  { label: "HOME", icon: <Home size={18} /> },
  { label: "SEARCH", icon: <Search size={18} /> },
  { label: "UPDATES", icon: <Download size={18} /> },
  { label: "OPTION 3", icon: <Download size={18} /> },
  { label: "OPTION 4", icon: <Sparkles size={18} /> },
  { label: "OPTION 5", icon: <CircleHelp size={18} /> },
  { label: "OPTION 6", icon: <Menu size={18} /> },
  { label: "OPTION 7", icon: <Crosshair size={18} /> },
  { label: "OPTION 8", icon: <ListFilter size={18} /> },
  { label: "OPTION 9", icon: <ListFilter size={18} /> },
  { label: "OPTION 10", icon: <Plus size={18} /> },
  { label: "OPTION 11", icon: <Download size={18} /> },
];

const ORDER: Array<"HOME" | "SEARCH" | "UPDATES"> = ["HOME", "SEARCH", "UPDATES"];

export default function NowBar({ onHome, onSearch, onUpdates, activePage = "HOME" }: { onHome: () => void; onSearch: () => void; onUpdates: () => void; activePage?: "HOME" | "SEARCH" | "UPDATES" }) {
  const [barState, setBarState] = useState<{ view: "title" | "actions"; mode: "compact" | "expanded" }>({ view: "title", mode: "compact" });
  const [pressing, setPressing] = useState(false);
  const { view, mode } = barState;
  const barRef = useRef<HTMLDivElement | null>(null);
  const holdTimer = useRef<number | null>(null);
  const idleTimer = useRef<number | null>(null);
  const holdTriggered = useRef(false);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const swipeHandled = useRef(false);

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
    if (label !== "HOME" && label !== "SEARCH" && label !== "UPDATES") return;
    try { window.localStorage.setItem("crownstore-nowbar-action", label); } catch {}
    resetIdle();
    setBarState({ view: "title", mode: "compact" });
    if (label === "HOME") onHome(); else if (label === "SEARCH") onSearch(); else onUpdates();
  };

  const finishSwipe = (event: TouchEvent<HTMLDivElement>) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start || event.changedTouches.length !== 1) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < 50 || Math.abs(dx) <= Math.abs(dy)) return;
    const index = ORDER.indexOf(activePage);
    const next = ORDER[index + (dx < 0 ? 1 : -1)];
    if (!next) return;
    swipeHandled.current = true;
    try { window.localStorage.setItem("crownstore-nowbar-action", next); } catch {}
    if (next === "HOME") onHome(); else if (next === "SEARCH") onSearch(); else onUpdates();
    setBarState({ view: "title", mode: "compact" });
    resetIdle();
  };

  return (
    <div className={`kh-nowbar-dock ${mode === "expanded" ? "is-expanded" : ""}`}>
      <div
        ref={barRef}
        className={`kh-nowbar ${view === "title" ? "is-title" : "is-actions"} ${mode === "expanded" ? "is-expanded" : ""}`}
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
          if ((event.target as HTMLElement).closest(".kh-nowbar-title")) finishSwipe(event);
        }}
        onTouchCancel={() => { stopHold(); swipeStart.current = null; }}
      >
        <div className="kh-nowbar-rail" />
        {view === "title" ? (
          <div className={`kh-nowbar-title ${pressing ? "is-pressing" : ""}`}>
            <span className="kh-nowbar-orb" />
            <span className="kh-nowbar-current">{activePage}</span>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>
          </div>
        ) : (
          actions.map((action) => (
              <div className={`kh-nowbar-slot ${mode === "expanded" ? "is-expanded" : ""}`} key={action.label}>
                <button
                  data-nowbar-label={action.label}
                  className={`kh-nowbar-action ${action.label === activePage ? "is-active" : ""}`}
                  type="button"
                  aria-label={action.label}
                  onClick={() => {
                    if (holdTriggered.current) { holdTriggered.current = false; return; }
                    if (action.label === "HOME" || action.label === "SEARCH" || action.label === "UPDATES") activate(action.label);
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
