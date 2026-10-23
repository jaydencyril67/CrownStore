import { registerPlugin } from "@capacitor/core";

export type NativeProfileUsageEntry = {
  packageId: string;
  totalTimeInForeground: number;
  lastTimeUsed: number;
};

export type NativeProfileUsageResult = {
  permissionRequired?: boolean;
  apps: NativeProfileUsageEntry[];
};

type NativeProfileUsagePlugin = {
  getUsageStats(options: { packageIds: string[] }): Promise<NativeProfileUsageResult>;
  openUsageAccessSettings(): Promise<void>;
};

export const NativeProfileUsage = registerPlugin<NativeProfileUsagePlugin>("NativeProfileUsage");
