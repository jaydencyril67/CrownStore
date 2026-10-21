export type BridgeSessionRef = {
  sessionId: string;
  secret: string;
  deepLink: string;
  expiresAt: string;
};

export type InstalledCatalogueApp = {
  slug: string;
  name: string;
  packageId: string;
  iconUrl: string | null;
  installedVersionName: string;
  installedVersionCode: number;
  latestVersionName: string | null;
  latestVersionCode: number | null;
  updateAvailable: boolean;
  changelog: string | null;
  downloadPath: string | null;
};

export type BridgeCommand = {
  commandId: string;
  slug: string;
  name: string;
  packageId: string;
  versionName: string;
  versionCode: number;
  downloadPath: string;
};

export type BridgeSnapshot = {
  session: { sessionId: string; status: "waiting" | "connected"; expiresAt: string };
  installedApps: InstalledCatalogueApp[];
  command: BridgeCommand | null;
  commandStatus: "none" | "pending" | "downloading" | "install-ready" | "permission-required" | "failed" | "complete";
  commandMessage: string | null;
};
