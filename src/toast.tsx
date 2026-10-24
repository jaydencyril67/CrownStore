import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

export type ToastKind = "success" | "error" | "warning" | "info";
type ToastItem = { id: string; message: string; kind: ToastKind; duration: number };
const TOAST_EVENT = "crownstore:toast";

export function toastKindForMessage(message: string): ToastKind {
  const value = message.toLowerCase();
  if (/could not|cannot|can't|unable|failed|failure|error|invalid|expired|denied|unavailable|not configured|not an image|larger than|at most|enter |must have|must be|please try again|temporarily unavailable|couldn't|did not|didn't|not find|couldn’t|isn't valid|is not valid/.test(value)) return "error";
  if (/cancelled|canceled|already|retry|permission needed|not available|could not be checked/.test(value)) return "warning";
  if (/saved|successfully|enabled|disabled|configured|updated|removed|published|added|loaded|selected|verified|approved|applied|copied|ready|cleared|refreshed|sent|synchronized|synced/.test(value)) return "success";
  return "info";
}

export function showToast(message: string, kind: ToastKind = toastKindForMessage(message), duration = 5000) {
  const cleanMessage = String(message || "").trim();
  if (!cleanMessage || typeof window === "undefined") return;
  const detail: ToastItem = {
    id: Date.now().toString(36) + "-" + Math.random().toString(36).slice(2),
    message: cleanMessage,
    kind,
    duration: Math.max(0, duration)
  };
  window.dispatchEvent(new CustomEvent<ToastItem>(TOAST_EVENT, { detail }));
}

export default function ToastViewport() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const removeToast = (id: string) => {
      const timer = timers.current.get(id);
      if (timer !== undefined) window.clearTimeout(timer);
      timers.current.delete(id);
      setItems((current) => current.filter((item) => item.id !== id));
    };

    const handleToast = (event: Event) => {
      const item = (event as CustomEvent<ToastItem>).detail;
      if (!item || !item.message) return;
      setItems((current) => [...current, item].slice(-4));
      if (item.duration > 0) {
        const timer = window.setTimeout(() => removeToast(item.id), item.duration);
        timers.current.set(item.id, timer);
      }
    };

    window.addEventListener(TOAST_EVENT, handleToast);
    return () => {
      window.removeEventListener(TOAST_EVENT, handleToast);
      timers.current.forEach((timer) => window.clearTimeout(timer));
      timers.current.clear();
    };
  }, []);

  const dismiss = (id: string) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) window.clearTimeout(timer);
    timers.current.delete(id);
    setItems((current) => current.filter((item) => item.id !== id));
  };

  return <div className="crown-toast-viewport" aria-label="CrownStore alerts">
    {items.map((item) => <div key={item.id} className={"crown-toast is-" + item.kind} role={item.kind === "error" ? "alert" : "status"} aria-live={item.kind === "error" ? "assertive" : "polite"}>
      <span className="crown-toast-icon" aria-hidden="true">
        {item.kind === "success" ? <CheckCircle2 size={19} />
          : item.kind === "error" ? <AlertCircle size={19} />
            : <Info size={19} />}
      </span>
      <span className="crown-toast-message">{item.message}</span>
      <button type="button" className="crown-toast-dismiss" aria-label="Dismiss notification" title="Dismiss" onClick={() => dismiss(item.id)}><X size={15} /></button>
    </div>)}
  </div>;
}
