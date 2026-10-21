import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "online.kingshall.crownstore",
  appName: "CrownStore",
  webDir: "dist",
  server: { androidScheme: "https" },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 700,
      backgroundColor: "#0b0912",
      showSpinner: false,
    },
  },
};

export default config;
