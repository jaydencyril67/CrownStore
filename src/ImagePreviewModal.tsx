import { useEffect, useRef, useState } from "react";
import { X, Download } from "lucide-react";
import type { TouchList, TouchEvent, MouseEvent } from "react";


type Props = { imageUrl: string; onClose: () => void; title?: string };

function touchDistance(touches: TouchList) {
  if (touches.length < 2) return 0;
  return Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
}

export default function ImagePreviewModal({ imageUrl, onClose, title = "Screenshot preview" }: Props) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const stageRef = useRef<HTMLDivElement | null>(null);
  const pinchStart = useRef<{ distance: number; zoom: number; imagePointX: number; imagePointY: number } | null>(null);
  const dragStart = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const dragging = useRef(false);
  const pendingViewRef = useRef<{ zoom: number; offset: { x: number; y: number } } | null>(null);
  const viewFrameRef = useRef<number | null>(null);
  const scheduleViewUpdate = (nextZoom: number, nextOffset: { x: number; y: number }) => {
    pendingViewRef.current = { zoom: nextZoom, offset: nextOffset };
    if (viewFrameRef.current !== null) return;
    viewFrameRef.current = requestAnimationFrame(() => {
      viewFrameRef.current = null;
      const pending = pendingViewRef.current;
      pendingViewRef.current = null;
      if (!pending) return;
      setOffset(pending.offset);
      setZoom(pending.zoom);
    });
  };
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");

  async function downloadImage() {
    if (downloading) return;
    setDownloading(true);
    setDownloadError("");
    try {
      const response = await fetch(imageUrl);
      if (!response.ok) throw new Error("Image download failed.");
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const extension = (blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg").replace(/[^a-z0-9]/gi, "");
      anchor.href = objectUrl;
      anchor.download = `crownstore-image-${Date.now()}.${extension}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch {
      setDownloadError("Couldn't download this image directly. Try opening the image in a new tab and saving it.");
    } finally {
      setDownloading(false);
    }
  }

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const keyHandler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", keyHandler);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", keyHandler);
      if (viewFrameRef.current !== null) cancelAnimationFrame(viewFrameRef.current);
      viewFrameRef.current = null;
      pendingViewRef.current = null;
    };
  }, [onClose]);

  const touchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length === 2) {
      const bounds = stageRef.current?.getBoundingClientRect();
      const midX = (event.touches[0].clientX + event.touches[1].clientX) / 2;
      const midY = (event.touches[0].clientY + event.touches[1].clientY) / 2;
      const centerX = bounds ? bounds.left + bounds.width / 2 : midX;
      const centerY = bounds ? bounds.top + bounds.height / 2 : midY;
      pinchStart.current = {
        distance: Math.max(1, touchDistance(event.touches)),
        zoom,
        imagePointX: (midX - centerX - offset.x) / zoom,
        imagePointY: (midY - centerY - offset.y) / zoom,
      };
      dragStart.current = null;
    } else if (event.touches.length === 1 && zoom > 1) {
      dragStart.current = { x: event.touches[0].clientX, y: event.touches[0].clientY, offsetX: offset.x, offsetY: offset.y };
    }
  };
  const touchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length === 2 && pinchStart.current) {
      event.preventDefault();
      const start = pinchStart.current;
      const nextZoom = Math.max(1, Math.min(10, start.zoom * touchDistance(event.touches) / Math.max(1, start.distance)));
      const bounds = stageRef.current?.getBoundingClientRect();
      const midX = (event.touches[0].clientX + event.touches[1].clientX) / 2;
      const midY = (event.touches[0].clientY + event.touches[1].clientY) / 2;
      const centerX = bounds ? bounds.left + bounds.width / 2 : midX;
      const centerY = bounds ? bounds.top + bounds.height / 2 : midY;
      scheduleViewUpdate(nextZoom, {
        x: midX - centerX - start.imagePointX * nextZoom,
        y: midY - centerY - start.imagePointY * nextZoom,
      });
    } else if (event.touches.length === 1 && dragStart.current && zoom > 1) {
      event.preventDefault();
      const start = dragStart.current;
      scheduleViewUpdate(zoom, { x: start.offsetX + event.touches[0].clientX - start.x, y: start.offsetY + event.touches[0].clientY - start.y });
    }
  };
  const touchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length < 2) pinchStart.current = null;
    if (event.touches.length === 0) dragStart.current = null;
  };
  const mouseDown = (event: MouseEvent<HTMLImageElement>) => {
    if (zoom <= 1) return;
    dragging.current = true;
    dragStart.current = { x: event.clientX, y: event.clientY, offsetX: offset.x, offsetY: offset.y };
    event.preventDefault();
  };
  const mouseMove = (event: React.MouseEvent<HTMLImageElement>) => {
    if (!dragging.current || !dragStart.current || zoom <= 1) return;
    scheduleViewUpdate(zoom, { x: dragStart.current.offsetX + event.clientX - dragStart.current.x, y: dragStart.current.offsetY + event.clientY - dragStart.current.y });
  };
  const mouseUp = () => { dragging.current = false; dragStart.current = null; };

  return (
    <div className="crownstore-image-modal" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <header className="crownstore-image-modal-header" onClick={event => event.stopPropagation()}>
        <div>

        </div>
        <div className="crownstore-image-modal-actions"><button type="button" className="crownstore-image-modal-download" onClick={() => void downloadImage()} disabled={downloading} aria-label="Download image" title="Download image">{downloading ? <span className="crownstore-image-modal-download-spinner" aria-hidden="true" /> : <Download size={20} />}</button><button type="button" className="crownstore-image-modal-close" onClick={onClose} aria-label="Close image preview" title="Close preview"><X size={22} /></button></div>
      </header>
      {downloadError && <p className="crownstore-image-modal-download-note" role="status">{downloadError}</p>}
      <div ref={stageRef} className="crownstore-image-modal-stage" onClick={event => event.stopPropagation()} onTouchStart={touchStart} onTouchMove={touchMove} onTouchEnd={touchEnd}>
        <img src={imageUrl} alt="Full-size CrownStore screenshot" draggable={false} onMouseDown={mouseDown} onMouseMove={mouseMove} onMouseUp={mouseUp} onMouseLeave={mouseUp} style={{ transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${zoom})`, transformOrigin: "center center", willChange: "transform", transition: "none", cursor: zoom > 1 ? (dragging.current ? "grabbing" : "grab") : "zoom-in" }} />
      </div>
    </div>
  );
}
