import type { BridgeSessionRef, BridgeSnapshot } from "./deviceBridgeTypes";

export const API_BASE = (import.meta.env.VITE_API_BASE_URL || "https://api.crownstore.kingshall.online").replace(/\/$/, "");

export async function bridgeFetch<T>(session: BridgeSessionRef, path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", "Bearer " + session.secret);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(API_BASE + path, { ...init, headers });
  const data = await response.json().catch(() => ({})) as { error?: string } & Record<string, unknown>;
  if (!response.ok) throw new Error(data.error || "The CrownStore device connection could not be reached.");
  return data as T;
}

export const readBridgeSnapshot = (session: BridgeSessionRef) =>
  bridgeFetch<BridgeSnapshot>(session, "/api/device-bridge/sessions/" + encodeURIComponent(session.sessionId));

export async function createBridgeSession(): Promise<BridgeSessionRef> {
  const response = await fetch(API_BASE + "/api/device-bridge/sessions", { method: "POST" });
  const data = await response.json().catch(() => ({})) as Partial<BridgeSessionRef> & { error?: string };
  if (!response.ok) throw new Error(data.error || "CrownStore could not start a device connection.");
  if (!data.sessionId || !data.secret || !data.deepLink || !data.expiresAt) throw new Error("The API returned an incomplete device connection.");
  return data as BridgeSessionRef;
}
