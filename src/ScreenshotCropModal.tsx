import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Check, X } from "lucide-react";
import { showToast } from "./toast";

type ScreenshotCropModalProps = {
  imageUrl: string;
  onCancel: () => void;
  onDone: (file: File) => void | Promise<void>;
  title?: string;
  aspectRatio?: number;
};
type Point = { x: number; y: number };
type CropRect = { x: number; y: number; width: number; height: number };
type CropDrag = { pointerId: number; start: Point; crop: CropRect; mode: "move" | "resize"; handle?: string };
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export default function ScreenshotCropModal({ imageUrl, onCancel, onDone, title = "Crop screenshot", aspectRatio }: ScreenshotCropModalProps) {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const pointersRef = useRef(new Map<number, Point>());
  const gestureRef = useRef<{ distance: number; midpoint: Point; zoom: number; offset: Point } | null>(null);
  const imageDragRef = useRef<{ pointerId: number; point: Point; offset: Point } | null>(null);
  const cropDragRef = useRef<CropDrag | null>(null);
  const cropSelectionRef = useRef<HTMLDivElement | null>(null);
  const zoomRef = useRef(1);
  const offsetRef = useRef<Point>({ x: 0, y: 0 });
  const paintFrameRef = useRef<number | null>(null);
  const cropPaintFrameRef = useRef<number | null>(null);
  const [frame, setFrame] = useState({ width: 320, height: 320 });
  const [crop, setCrop] = useState<CropRect>({ x: 16, y: 16, width: 288, height: 288 });
  const cropRef = useRef(crop);
  const pendingCropRef = useRef<CropRect | null>(null);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    document.body.classList.add("crownstore-image-focus-mode");
    return () => document.body.classList.remove("crownstore-image-focus-mode");
  }, []);

  useEffect(() => { if (errorMessage) showToast(errorMessage, "error"); }, [errorMessage]);

  const updateCrop = (next: CropRect) => {
    cropRef.current = next;
    pendingCropRef.current = null;
    setCrop(next);
  };

  // Paint the crop box directly once per display frame. Avoid React renders on every
  // finger movement; on slower phones those renders can make the crop handles feel sticky.
  const scheduleCropUpdate = (next: CropRect) => {
    cropRef.current = next;
    pendingCropRef.current = next;
    if (cropPaintFrameRef.current !== null) return;
    cropPaintFrameRef.current = requestAnimationFrame(() => {
      cropPaintFrameRef.current = null;
      const pending = pendingCropRef.current;
      pendingCropRef.current = null;
      const selection = cropSelectionRef.current;
      if (!pending || !selection) return;
      selection.style.transform = `translate3d(${pending.x}px, ${pending.y}px, 0)`;
      selection.style.width = `${pending.width}px`;
      selection.style.height = `${pending.height}px`;
    });
  };

  useEffect(() => {
    zoomRef.current = 1;
    offsetRef.current = { x: 0, y: 0 };
    setReady(false);
    pointersRef.current.clear();
    gestureRef.current = null;
    imageDragRef.current = null;
    cropDragRef.current = null;
    if (paintFrameRef.current !== null) cancelAnimationFrame(paintFrameRef.current);
    if (cropPaintFrameRef.current !== null) cancelAnimationFrame(cropPaintFrameRef.current);
    paintFrameRef.current = null;
    cropPaintFrameRef.current = null;
    pendingCropRef.current = null;
    setErrorMessage("");
    return () => {
      if (paintFrameRef.current !== null) cancelAnimationFrame(paintFrameRef.current);
      if (cropPaintFrameRef.current !== null) cancelAnimationFrame(cropPaintFrameRef.current);
      paintFrameRef.current = null;
      cropPaintFrameRef.current = null;
      pendingCropRef.current = null;
      pointersRef.current.clear();
      gestureRef.current = null;
      imageDragRef.current = null;
      cropDragRef.current = null;
    };
  }, [imageUrl]);

  const baseScale = () => {
    const image = imageRef.current;
    if (!image?.naturalWidth || !image.naturalHeight) return 1;
    return frame.width / image.naturalWidth;
  };

  const geometry = (activeZoom = zoomRef.current) => {
    const image = imageRef.current;
    if (!image?.naturalWidth || !image.naturalHeight) return null;
    const scale = baseScale() * activeZoom;
    return { width: image.naturalWidth * scale, height: image.naturalHeight * scale };
  };

  const constrainOffset = (next: Point, nextZoom = zoomRef.current) => {
    const image = imageRef.current;
    if (!image?.naturalWidth || !image.naturalHeight) return next;
    const scale = baseScale() * nextZoom;
    return {
      x: clamp(next.x, frame.width - image.naturalWidth * scale, 0),
      y: clamp(next.y, frame.height - image.naturalHeight * scale, 0),
    };
  };

  const handleImageLoad = () => {
    const image = imageRef.current;
    if (!image?.naturalWidth || !image.naturalHeight) return;
    const maxWidth = Math.max(200, Math.min(window.innerWidth * 0.92, 900));
    const maxHeight = Math.max(180, Math.min(window.innerHeight * 0.70, 900));
    const scale = Math.min(maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
    const width = Math.max(1, image.naturalWidth * scale);
    const height = Math.max(1, image.naturalHeight * scale);
    const nextFrame = { width, height };
    setFrame(nextFrame);
    const ratio = typeof aspectRatio === "number" && aspectRatio > 0 ? aspectRatio : null;
    let cropWidth = width * 0.84;
    let cropHeight = height * 0.84;
    if (ratio) {
      if (cropWidth / cropHeight > ratio) cropWidth = cropHeight * ratio;
      else cropHeight = cropWidth / ratio;
    }
    const initialCrop = { x: (width - cropWidth) / 2, y: (height - cropHeight) / 2, width: cropWidth, height: cropHeight };
    updateCrop(initialCrop);
    zoomRef.current = 1;
    offsetRef.current = { x: 0, y: 0 };
    setReady(true);
  };

  const syncImageStyles = () => {
    if (paintFrameRef.current !== null) return;
    paintFrameRef.current = requestAnimationFrame(() => {
      paintFrameRef.current = null;
      const image = imageRef.current;
      if (!image?.naturalWidth || !image.naturalHeight) return;
      const scale = baseScale();
      image.style.width = `${image.naturalWidth * scale}px`;
      image.style.height = `${image.naturalHeight * scale}px`;
      image.style.transform = `translate3d(${offsetRef.current.x}px, ${offsetRef.current.y}px, 0) scale(${zoomRef.current})`;
    });
  };

  const localPoint = (event: { clientX: number; clientY: number }): Point => {
    const bounds = stageRef.current?.getBoundingClientRect();
    return bounds ? { x: event.clientX - bounds.left, y: event.clientY - bounds.top } : { x: 0, y: 0 };
  };

  const handleStagePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!ready || saving || (event.target as HTMLElement).closest(".crownstore-screenshot-crop-selection")) return;
    setErrorMessage("");
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Pointer capture is optional. */ }
    const point = localPoint(event);
    pointersRef.current.set(event.pointerId, point);
    if (pointersRef.current.size === 1) {
      imageDragRef.current = { pointerId: event.pointerId, point, offset: offsetRef.current };
      gestureRef.current = null;
    } else if (pointersRef.current.size === 2) {
      const [a, b] = Array.from(pointersRef.current.values());
      gestureRef.current = {
        distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
        midpoint: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        zoom: zoomRef.current,
        offset: offsetRef.current,
      };
      imageDragRef.current = null;
    }
  };

  const handleStagePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId) || !ready || saving) return;
    event.preventDefault();
    const point = localPoint(event);
    pointersRef.current.set(event.pointerId, point);
    if (pointersRef.current.size >= 2 && gestureRef.current) {
      const [a, b] = Array.from(pointersRef.current.values());
      const distance = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
      const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const nextZoom = clamp(gestureRef.current.zoom * distance / gestureRef.current.distance, 1, 12);
      const startScale = baseScale() * gestureRef.current.zoom;
      const nextScale = baseScale() * nextZoom;
      const imagePointX = (gestureRef.current.midpoint.x - gestureRef.current.offset.x) / startScale;
      const imagePointY = (gestureRef.current.midpoint.y - gestureRef.current.offset.y) / startScale;
      offsetRef.current = constrainOffset({ x: midpoint.x - imagePointX * nextScale, y: midpoint.y - imagePointY * nextScale }, nextZoom);
      zoomRef.current = nextZoom;
      syncImageStyles();
      return;
    }
    if (!imageDragRef.current || imageDragRef.current.pointerId !== event.pointerId) return;
    offsetRef.current = constrainOffset({
      x: offsetRef.current.x + point.x - imageDragRef.current.point.x,
      y: offsetRef.current.y + point.y - imageDragRef.current.point.y,
    });
    imageDragRef.current = { pointerId: event.pointerId, point, offset: offsetRef.current };
    syncImageStyles();
  };

  const handleStagePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* Capture may already be released. */ }
    gestureRef.current = null;
    imageDragRef.current = null;
    if (pointersRef.current.size === 1) {
      const [pointerId, point] = Array.from(pointersRef.current.entries())[0];
      imageDragRef.current = { pointerId, point, offset: offsetRef.current };
    }
  };

  const handleCropPointerDown = (event: PointerEvent<HTMLElement>, mode: "move" | "resize", handle?: string) => {
    if (!ready || saving) return;
    // Ignore additional fingers while a crop-box gesture is already active.
    if (cropDragRef.current && cropDragRef.current.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    setErrorMessage("");
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Pointer capture is optional. */ }
    cropDragRef.current = { pointerId: event.pointerId, start: localPoint(event), crop: cropRef.current, mode, handle };
  };

  const handleCropPointerMove = (event: PointerEvent<HTMLElement>) => {
    const drag = cropDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || saving) return;
    event.preventDefault();
    event.stopPropagation();
    const point = localPoint(event);
    const dx = point.x - drag.start.x;
    const dy = point.y - drag.start.y;
    const minSize = 56;
    if (drag.mode === "move") {
      scheduleCropUpdate({ ...drag.crop, x: clamp(drag.crop.x + dx, 0, frame.width - drag.crop.width), y: clamp(drag.crop.y + dy, 0, frame.height - drag.crop.height) });
      return;
    }
    let left = drag.crop.x;
    let top = drag.crop.y;
    let right = drag.crop.x + drag.crop.width;
    let bottom = drag.crop.y + drag.crop.height;
    const handle = drag.handle || "";
    if (handle.includes("w")) left = clamp(drag.crop.x + dx, 0, right - minSize);
    if (handle.includes("e")) right = clamp(drag.crop.x + drag.crop.width + dx, left + minSize, frame.width);
    if (handle.includes("n")) top = clamp(drag.crop.y + dy, 0, bottom - minSize);
    if (handle.includes("s")) bottom = clamp(drag.crop.y + drag.crop.height + dy, top + minSize, frame.height);
    const ratio = typeof aspectRatio === "number" && aspectRatio > 0 ? aspectRatio : null;
    if (ratio) {
      const width = right - left;
      const height = bottom - top;
      if (Math.abs(dx) >= Math.abs(dy)) {
        const nextHeight = width / ratio;
        if (handle.includes("n")) top = clamp(bottom - nextHeight, 0, bottom - minSize);
        else bottom = clamp(top + nextHeight, top + minSize, frame.height);
      } else {
        const nextWidth = height * ratio;
        if (handle.includes("w")) left = clamp(right - nextWidth, 0, right - minSize);
        else right = clamp(left + nextWidth, left + minSize, frame.width);
      }
    }
    scheduleCropUpdate({ x: left, y: top, width: Math.max(minSize, right - left), height: Math.max(minSize, bottom - top) });
  };

  const handleCropPointerUp = (event: PointerEvent<HTMLElement>) => {
    if (cropDragRef.current?.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    cropDragRef.current = null;
    // Commit the final queued pointer position before the user saves the crop.
    if (cropPaintFrameRef.current !== null) cancelAnimationFrame(cropPaintFrameRef.current);
    cropPaintFrameRef.current = null;
    const pending = pendingCropRef.current;
    pendingCropRef.current = null;
    setCrop(pending || cropRef.current);
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* Capture may already be released. */ }
  };

  const saveCrop = async () => {
    const image = imageRef.current;
    const drawn = geometry();
    if (!image || !drawn || !ready || saving) return;
    setSaving(true);
    setErrorMessage("");
    try {
      const selected = cropRef.current;
      const scale = baseScale() * zoomRef.current;
      const sourceX = clamp((selected.x - offsetRef.current.x) / scale, 0, image.naturalWidth);
      const sourceY = clamp((selected.y - offsetRef.current.y) / scale, 0, image.naturalHeight);
      const sourceWidth = Math.min(image.naturalWidth - sourceX, selected.width / scale);
      const sourceHeight = Math.min(image.naturalHeight - sourceY, selected.height / scale);
      if (sourceWidth <= 0 || sourceHeight <= 0) throw new Error("Move the crop box over the photo before applying it.");
      const outputWidth = Math.min(1600, Math.max(800, Math.round(selected.width * 2)));
      const outputHeight = Math.max(1, Math.round(outputWidth * selected.height / selected.width));
      const canvas = document.createElement("canvas");
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Couldn't prepare this screenshot. Please try again.");
      context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, outputWidth, outputHeight);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", 0.9));
      if (!blob) throw new Error("Couldn't crop this photo. Please try again.");
      await onDone(new File([blob], "crownstore-screenshot.jpg", { type: "image/jpeg" }));
    } catch (error) {
      console.error("[screenshot-crop] failed to create cropped image", error);
      setErrorMessage(error instanceof Error ? error.message : "Couldn’t crop this photo. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handles = [
    { key: "nw", className: "nw" }, { key: "n", className: "n" }, { key: "ne", className: "ne" },
    { key: "w", className: "w" }, { key: "e", className: "e" },
    { key: "sw", className: "sw" }, { key: "s", className: "s" }, { key: "se", className: "se" },
  ];

  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="crownstore-screenshot-crop-overlay">
      <header className="crownstore-screenshot-crop-header">
        <button type="button" onClick={onCancel} disabled={saving} aria-label="Cancel screenshot crop"><X size={23} /></button>
        <button type="button" onClick={() => void saveCrop()} disabled={!ready || saving} aria-label="Apply crop">{saving ? "…" : <Check size={25} />}</button>
      </header>
      <div className="crownstore-screenshot-crop-stage">
        <div
          ref={stageRef}
          className="crownstore-screenshot-crop-frame"
          style={{ width: frame.width, height: frame.height, maxWidth: "92vw", maxHeight: "70dvh" }}
          onPointerDown={handleStagePointerDown}
          onPointerMove={handleStagePointerMove}
          onPointerUp={handleStagePointerUp}
          onPointerCancel={handleStagePointerUp}
        >
          <img
            crossOrigin="anonymous"
            ref={imageRef}
            src={imageUrl}
            alt="Selected screenshot crop"
            onLoad={handleImageLoad}
            draggable={false}
            style={{
              width: ready && imageRef.current?.naturalWidth ? imageRef.current.naturalWidth * baseScale() : "100%",
              height: ready && imageRef.current?.naturalHeight ? imageRef.current.naturalHeight * baseScale() : "100%",
              transform: `translate3d(${offsetRef.current.x}px, ${offsetRef.current.y}px, 0) scale(${zoomRef.current})`,
            }}
          />
          {ready && <div
            ref={cropSelectionRef}
            className="crownstore-screenshot-crop-selection"
            style={{ left: 0, top: 0, transform: `translate3d(${crop.x}px, ${crop.y}px, 0)`, width: crop.width, height: crop.height }}
            onPointerDown={event => handleCropPointerDown(event, "move")}
            onPointerMove={handleCropPointerMove}
            onPointerUp={handleCropPointerUp}
            onPointerCancel={handleCropPointerUp}
          >
            <div className="crownstore-screenshot-crop-grid" aria-hidden="true" />
            {handles.map(({ key, className }) => <span
              key={key}
              className={`crownstore-screenshot-crop-handle ${className}`}
              onPointerDown={event => { event.stopPropagation(); handleCropPointerDown(event, "resize", key); }}
              onPointerMove={handleCropPointerMove}
              onPointerUp={handleCropPointerUp}
              onPointerCancel={handleCropPointerUp}
            />)}
          </div>}
        </div>
      </div>

    </div>
  );
}
