import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { NativeAppUpdate } from "./native/nativeAppUpdate";
import type { BridgeSessionRef, BridgeSnapshot } from "./native/deviceBridgeTypes";
import { API_BASE, bridgeFetch } from "./native/deviceBridge";

type Props = { session: BridgeSessionRef | null };
type Catalogue = { apps?: Array<{ packageId?: string }> };
const pause = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

export default function NativeDeviceBridgeAgent({ session }: Props) {
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || session === null) return;
    // Copy the non-null session into an effect-local snapshot. This remains
    // narrowed inside async functions and callbacks, including TypeScript builds.
    const activeSession: BridgeSessionRef = {
      sessionId: session.sessionId,
      secret: session.secret,
      deepLink: session.deepLink,
      expiresAt: session.expiresAt,
    };
    let stopped = false;
    let activeCommandId = "";
    let activeCommandPackageId = "";
    let pendingInstall: { packageId: string; downloadId: number } | null = null;
    const listeners: Array<{ remove: () => Promise<void> }> = [];

    const setStatus = async (status: string, message?: string) => {
      try {
        await bridgeFetch(activeSession, "/api/device-bridge/sessions/" + encodeURIComponent(activeSession.sessionId) + "/command-status", {
          method: "POST", body: JSON.stringify({ status, message }),
        });
      } catch { /* The short-lived session may expire while a download is running. */ }
    };

    for (const eventName of ["downloadError", "downloadComplete", "installPermissionRequired"] as const) {
      void NativeAppUpdate.addListener(eventName, (event) => {
        if (stopped || !activeCommandPackageId || event.packageId !== activeCommandPackageId) return;
        if (eventName === "installPermissionRequired" && Number(event.downloadId) > 0) {
          pendingInstall = { packageId: activeCommandPackageId, downloadId: Number(event.downloadId) };
        }
        void setStatus(eventName === "downloadError" ? "failed" : eventName === "installPermissionRequired" ? "permission-required" : "install-ready",
          event.message || (eventName === "downloadComplete" ? "Android's installer opened; confirm its prompt." : eventName === "installPermissionRequired" ? "Allow CrownStore to install apps in Android settings, then request the update again." : "APK download or installer failed."));
        activeCommandPackageId = "";
      }).then((handle) => {
        if (stopped) void handle.remove(); else listeners.push(handle);
      }).catch(() => {});
    }

    async function run() {
      try {
        const response = await fetch(API_BASE + "/api/apps");
        if (!response.ok) throw new Error("Could not load CrownStore's package catalogue.");
        const catalogue = await response.json() as Catalogue;
        const packageIds = Array.from(new Set((catalogue.apps || [])
          .map((app) => app.packageId || "")
          .filter((id) => /^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+$/.test(id))
        )).slice(0, 250);
        const inventory = await NativeAppUpdate.getInstalledApps({ packageIds });
        if (stopped) return;
        const reportInventory = async () => {
          const latestInventory = await NativeAppUpdate.getInstalledApps({ packageIds });
          if (stopped) return;
          await bridgeFetch(activeSession, "/api/device-bridge/sessions/" + encodeURIComponent(activeSession.sessionId) + "/report", {
            method: "POST", body: JSON.stringify({ installedApps: latestInventory.apps || [] }),
          });
        };
        await bridgeFetch(activeSession, "/api/device-bridge/sessions/" + encodeURIComponent(activeSession.sessionId) + "/report", {
          method: "POST", body: JSON.stringify({ installedApps: inventory.apps || [] }),
        });
        let lastInventoryReportAt = Date.now();

        while (!stopped) {
          // Refresh the server's installed-version snapshot periodically, so the PWA
          // reflects installs and updates without asking the user to press Scan again.
          if (Date.now() - lastInventoryReportAt >= 30000) {
            await reportInventory();
            lastInventoryReportAt = Date.now();
          }
          const snapshot = await bridgeFetch<BridgeSnapshot>(activeSession, "/api/device-bridge/sessions/" + encodeURIComponent(activeSession.sessionId));
          const command = snapshot.command;
          if (command && snapshot.commandStatus === "pending" && command.commandId !== activeCommandId) {
            activeCommandId = command.commandId;
            activeCommandPackageId = command.packageId;
            await setStatus("downloading", "Starting the " + command.name + " update.");
            try {
              if (pendingInstall && pendingInstall.packageId === command.packageId) {
                const cachedDownload = pendingInstall;
                try {
                  const result = await NativeAppUpdate.installDownloadedApk({
                    downloadId: cachedDownload.downloadId, appName: command.name, packageId: command.packageId,
                  });
                  if (result.requiresPermission) {
                    await setStatus("permission-required", "The APK is already downloaded. Allow CrownStore to install apps in Android settings, then tap Update again to continue without downloading it again.");
                  } else if (result.opened) {
                    pendingInstall = null;
                    await setStatus("install-ready", "Android's installer opened; confirm its prompt.");
                  } else {
                    throw new Error("Android did not confirm that the installer opened.");
                  }
                } catch (error) {
                  pendingInstall = null;
                  throw error;
                }
              } else {
                await NativeAppUpdate.downloadAndInstall({
                  url: API_BASE + command.downloadPath, appName: command.name, packageId: command.packageId,
                });
              }
            } catch (error) {
              await setStatus("failed", error instanceof Error ? error.message : "Could not start the APK download.");
            }
          }
          await pause(1800);
        }
      } catch (error) {
        if (!stopped) await setStatus("failed", error instanceof Error ? error.message : "CrownStore could not connect this phone.");
      }
    }

    void run();
    return () => { stopped = true; listeners.forEach((listener) => void listener.remove()); };
  }, [session?.sessionId, session?.secret]);

  return null;
}
