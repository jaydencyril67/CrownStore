import { useState, type MouseEvent as ReactMouseEvent, type CSSProperties } from "react";
import { ArrowLeft, Check, ChevronRight } from "lucide-react";
import {
  BUTTON_COLOR_KEY,
  DEFAULT_ACCENT,
  EDGE_LIGHT_COLOR_KEY,
  EDGE_LIGHT_KEY,
  readNotificationPreferences,
  saveNotificationPreferences
} from "./notifications";

export type ColorPickerTarget = "nowbar" | "header" | "button";

type Rgb = { r: number; g: number; b: number };
type EdgeSettings = { enabled?: boolean; color?: string; mode?: string };

const isHexColor = (value: string) => /^#[0-9a-f]{6}$/i.test(value);

const hexToRgb = (hex: string): Rgb => ({
  r: parseInt(hex.slice(1, 3), 16),
  g: parseInt(hex.slice(3, 5), 16),
  b: parseInt(hex.slice(5, 7), 16)
});

const rgbToHex = (r: number, g: number, b: number) =>
  "#" + [r, g, b].map((value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0")).join("");

const hsvToHex = (hue: number, saturation: number, value: number) => {
  const chroma = value * saturation;
  const segment = hue / 60;
  const secondary = chroma * (1 - Math.abs((segment % 2) - 1));
  const channels = segment < 1 ? [chroma, secondary, 0]
    : segment < 2 ? [secondary, chroma, 0]
    : segment < 3 ? [0, chroma, secondary]
    : segment < 4 ? [0, secondary, chroma]
    : segment < 5 ? [secondary, 0, chroma]
    : [chroma, 0, secondary];
  const match = value - chroma;
  return rgbToHex(
    Math.round((channels[0] + match) * 255),
    Math.round((channels[1] + match) * 255),
    Math.round((channels[2] + match) * 255)
  );
};

const hueFromHex = (hex: string) => {
  const { r, g, b } = hexToRgb(hex);
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  if (delta === 0) return 0;
  if (max === red) return ((60 * ((green - blue) / delta) + 360) % 360);
  if (max === green) return 60 * ((blue - red) / delta + 2);
  return 60 * ((red - green) / delta + 4);
};

const readColor = (target: ColorPickerTarget): string => {
  try {
    let saved = "";
    if (target === "nowbar") {
      saved = window.localStorage.getItem(EDGE_LIGHT_COLOR_KEY) || "";
      if (!isHexColor(saved)) {
        const edge = JSON.parse(window.localStorage.getItem(EDGE_LIGHT_KEY) || "{}") as EdgeSettings;
        saved = edge.color || "";
      }
    } else if (target === "button") {
      saved = window.localStorage.getItem(BUTTON_COLOR_KEY) || "";
    } else {
      saved = readNotificationPreferences().headerLightingColor;
    }
    return isHexColor(saved) ? saved.toLowerCase() : DEFAULT_ACCENT;
  } catch {
    return DEFAULT_ACCENT;
  }
};

const saveColor = (target: ColorPickerTarget, color: string) => {
  try {
    if (target === "nowbar") {
      const edge = JSON.parse(window.localStorage.getItem(EDGE_LIGHT_KEY) || "{}") as EdgeSettings;
      window.localStorage.setItem(EDGE_LIGHT_KEY, JSON.stringify({ ...edge, color }));
      window.localStorage.setItem(EDGE_LIGHT_COLOR_KEY, color);
      window.dispatchEvent(new CustomEvent("crownstore:nowbar-settings-changed", { detail: { ...edge, color } }));
      return;
    }
    if (target === "button") {
      window.localStorage.setItem(BUTTON_COLOR_KEY, color);
      window.dispatchEvent(new CustomEvent("crownstore:nowbar-settings-changed", { detail: { key: BUTTON_COLOR_KEY, value: color } }));
      return;
    }
    const preferences = readNotificationPreferences();
    saveNotificationPreferences({ ...preferences, headerLightingColor: color });
  } catch {
    // Keep the picker responsive if browser storage is unavailable.
  }
};

const TARGET_COPY: Record<ColorPickerTarget, { title: string; description: string; shortName: string }> = {
  nowbar: {
    title: "NowBar light color",
    description: "Choose the color used by the NowBar edge-lighting effect. Your selection is saved immediately.",
    shortName: "NOWBAR COLOR"
  },
  header: {
    title: "App header notification color",
    description: "Choose the shared accent for the notification count and the app-header glow. Your selection is saved immediately.",
    shortName: "HEADER NOTIFICATION COLOR"
  },
  button: {
    title: "NowBar button color",
    description: "Choose the color used by NowBar navigation button borders, labels, and glow when button lighting is enabled.",
    shortName: "BUTTON COLOR"
  }
};

export default function ColorPickerPage({ target, onBack }: {
  target: ColorPickerTarget;
  onBack: () => void;
}) {
  const initialColor = readColor(target);
  const [color, setColor] = useState(initialColor);
  const [customColor, setCustomColor] = useState(initialColor);
  const [rgb, setRgb] = useState<Rgb>(() => hexToRgb(initialColor));
  const [hue, setHue] = useState(() => hueFromHex(initialColor));
  const [saturation, setSaturation] = useState(() => {
    const values = hexToRgb(initialColor);
    const max = Math.max(values.r, values.g, values.b) / 255;
    const min = Math.min(values.r, values.g, values.b) / 255;
    return max === 0 ? 0 : (max - min) / max;
  });
  const [value, setValue] = useState(() => Math.max(...Object.values(hexToRgb(initialColor))) / 255);
  const [error, setError] = useState("");
  const copy = TARGET_COPY[target];

  const selectColor = (nextColor: string) => {
    if (!isHexColor(nextColor)) return;
    const normalized = nextColor.toLowerCase();
    const nextRgb = hexToRgb(normalized);
    const max = Math.max(nextRgb.r, nextRgb.g, nextRgb.b) / 255;
    const min = Math.min(nextRgb.r, nextRgb.g, nextRgb.b) / 255;
    setColor(normalized);
    setCustomColor(normalized);
    setRgb(nextRgb);
    setHue(hueFromHex(normalized));
    setValue(max);
    setSaturation(max === 0 ? 0 : (max - min) / max);
    setError("");
    saveColor(target, normalized);
  };

  const selectHueAtPoint = (clientX: number, clientY: number, element: HTMLDivElement) => {
    const rect = element.getBoundingClientRect();
    const dx = clientX - (rect.left + rect.width / 2);
    const dy = clientY - (rect.top + rect.height / 2);
    const distance = Math.hypot(dx, dy);
    const outerRadius = Math.min(rect.width, rect.height) / 2;
    if (distance < outerRadius - 24 || distance > outerRadius) return;
    const nextHue = (Math.atan2(dy, dx) * 180 / Math.PI + 90 + 360) % 360;
    setHue(nextHue);
    selectColor(hsvToHex(nextHue, saturation, value));
  };

  const updateColorField = (event: ReactMouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const nextSaturation = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const nextValue = Math.max(0, Math.min(1, 1 - (event.clientY - rect.top) / rect.height));
    setSaturation(nextSaturation);
    setValue(nextValue);
    selectColor(hsvToHex(hue, nextSaturation, nextValue));
  };

  const updateRgb = (channel: keyof Rgb, raw: string) => {
    const next = { ...rgb, [channel]: Math.max(0, Math.min(255, Number(raw) || 0)) };
    setRgb(next);
    selectColor(rgbToHex(next.r, next.g, next.b));
  };

  const applyCustomColor = () => {
    const normalized = customColor.startsWith("#") ? customColor : "#" + customColor;
    if (!isHexColor(normalized)) {
      setError("Enter a valid six-digit HEX color, for example #c4b5fd.");
      return;
    }
    selectColor(normalized);
  };

  return <section className="crown-color-page" aria-label={copy.title}>
    <header className="crown-color-page-header">
      <button type="button" className="crown-color-back" onClick={onBack}><ArrowLeft size={17} /> Menu</button>
      <strong>{copy.shortName}</strong>
      <span className="crown-color-header-spacer" aria-hidden="true" />
    </header>
    <div className="crown-color-content">
      <h1>{copy.title}</h1>
      <p className="crown-color-intro">{copy.description}</p>

      <section className="alert-color-preview">
        <span className="crown-color-preview-swatch" style={{ background: color, boxShadow: "0 0 24px " + color }} />
        <strong>Selected color</strong>
        <code>{color.toUpperCase()}</code>
      </section>

      <section className="alert-color-picker-card">
        <h2>Color wheel</h2>
        <div className="alert-color-picker" role="group" aria-label="Color wheel">
          <div className="alert-color-hue-ring" onClick={(event) => selectHueAtPoint(event.clientX, event.clientY, event.currentTarget)}>
            <span className="alert-color-hue-track" style={{ transform: "rotate(" + hue + "deg)" }}><span /></span>
            <div className="alert-color-field" style={{ "--picker-hue": hsvToHex(hue, 1, 1) } as CSSProperties} onClick={(event) => { event.stopPropagation(); updateColorField(event); }}>
              <span style={{ left: (saturation * 100) + "%", top: ((1 - value) * 100) + "%" }} />
            </div>
          </div>
        </div>
        <div className="alert-color-hex-row">
          <input aria-label="HEX color" value={customColor} onChange={(event) => setCustomColor(event.target.value)} placeholder="#c4b5fd" />
          <button type="button" className="crown-color-apply" onClick={applyCustomColor}><Check size={16} /> Apply</button>
        </div>
        <div className="alert-color-rgb-row">
          {(["r", "g", "b"] as const).map((channel) => <label key={channel}>{channel.toUpperCase()}<input aria-label={channel.toUpperCase() + " color value"} type="number" min="0" max="255" value={rgb[channel]} onChange={(event) => updateRgb(channel, event.target.value)} /></label>)}
        </div>
        {error && <p className="alert-color-error" role="alert">{error}</p>}
      </section>
      <p className="crown-color-saved"><Check size={14} /> Color changes are applied and saved as you choose them.</p>
      <button type="button" className="alert-color-done" onClick={onBack}><ChevronRight size={15} /> Done</button>
    </div>
  </section>;
}
