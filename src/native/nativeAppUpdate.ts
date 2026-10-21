import { registerPlugin } from "@capacitor/core";

export type NativeAppInfo = { versionName: string; versionCode: number };
export type NativeInstalledApp = { packageId: string; appName: string; versionName: string; versionCode: number };
export type NativeAppUpdateEvent = { message?: string; stage?: string; packageId?: string; timestamp?: number };
export type NativeAppUpdatePlugin = {
  getAppInfo(): Promise<NativeAppInfo>;
  getInstalledApps(options: { packageIds: string[] }): Promise<{ apps: NativeInstalledApp[] }>;
  downloadAndInstall(options: { url: string; appName?: string; packageId?: string }): Promise<{
    status?: string; downloadId?: number; requiresPermission?: boolean; url?: string; queuedAt?: number
  }>;
  addListener(eventName: "downloadError" | "downloadComplete", listener: (event: NativeAppUpdateEvent) => void): Promise<{ remove: () => Promise<void> }>;
};

export const NativeAppUpdate = registerPlugin<NativeAppUpdatePlugin>("NativeAppUpdate");
