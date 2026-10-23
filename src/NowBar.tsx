import { useEffect, useRef, useState, type TouchEvent } from "react";

type ActionLabel = "HOME" | "SEARCH" | "UPDATES" | "OPTION 3" | "OPTION 4" | "OPTION 5";
type Action = { label: ActionLabel; icon: string };

const actions: Action[] = [
  { label: "HOME", icon: "M3 10.5 12 3l9 7.5M5.5 9v11h13V9M9 20v-6h6v6" },
  { label: "SEARCH", icon: "M21 21l-4.3-4.3M10.8 18a7.2 7.2 0 1 1 0-14.4 7.2 7.2 0 0 1 0 14.4Z" },
  { label: "UPDATES", icon: "M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4" },
  { label: "OPTION 3", icon: "M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4" },
  { label: "OPTION 4", icon: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3ZM19 16l1 2.5 2 1-2 1-1 2.5-1-2.5-2-1 2-1 1-2.5" },
  { label: "OPTION 5", icon: "M12 16v-4M12 8h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" },
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
      setBarState({ view: "title", mode: "compact" });
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

  useEffect(() => {
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
    const frame = window.requestAnimationFrame(centerTarget);
    return () => window.cancelAnimationFrame(frame);
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
        role="group"
        aria-label="CrownStore quick navigation"
        onPointerDown={startHold}
        onPointerUp={stopHold}
        onPointerLeave={stopHold}
        onPointerCancel={stopHold}
        onTouchStart={(event) => {
          startHold();
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
          <button
            className={`kh-nowbar-title ${pressing ? "is-pressing" : ""}`}
            type="button"
            aria-label={activePage + " page. Tap to show navigation buttons; hold to expand; swipe to navigate."}
            onClick={() => {
              if (swipeHandled.current) { swipeHandled.current = false; return; }
              if (holdTriggered.current) { holdTriggered.current = false; return; }
              setBarState((current) => ({ view: current.view === "title" ? "actions" : "title", mode: "compact" }));
              resetIdle();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setBarState((current) => ({ view: current.view === "title" ? "actions" : "title", mode: "compact" }));
                resetIdle();
              }
            }}
          >
            <span className="kh-nowbar-orb" />
            <span className="kh-nowbar-current">{activePage}</span>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>
          </button>
        ) : (
          <div className={`kh-nowbar-actions ${mode === "expanded" ? "is-expanded" : "is-compact"}`} aria-label="Navigation buttons">
            {actions.map((action) => (
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
                  <span className="kh-nowbar-icon"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d={action.icon} /></svg></span>
                  {mode === "compact" && <span className="kh-nowbar-label-compact">{action.label}</span>}
                  {mode === "expanded" && <span className="kh-nowbar-label-expanded">{action.label.length > 12 ? <span className="kh-nowbar-marquee">{action.label.toUpperCase()} · {action.label.toUpperCase()}</span> : action.label}</span>}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
