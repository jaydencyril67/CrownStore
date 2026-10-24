import { Capacitor, registerPlugin } from '@capacitor/core';

export type EcosystemApp = 'kingshall' | 'halls-chat' | 'crybots' | 'crownstore';
export type EcosystemAppSlug = Exclude<EcosystemApp, 'crownstore'>;
export type CrossAppLaunchResult = {
  opened: boolean;
  destination: 'app' | 'crownstore' | 'web';
  value?: string;
};
type CrossAppLauncherPlugin = {
  openApp(options: {
    targetPackage: string;
    storePackage: string;
    appSlug: string;
    storeUrl: string;
    targetUrl?: string;
  }): Promise<CrossAppLaunchResult>;
  getLaunchUrl(): Promise<{ url?: string }>;
  addListener(eventName: 'appUrlOpen', listener: (event: { url: string }) => void): Promise<{ remove: () => Promise<void> }>;
};

const NativeLauncher = registerPlugin<CrossAppLauncherPlugin>('CrossAppLauncher');
const CROWNSTORE_BASE_URL = 'https://crownstore.kingshall.online';
const CROWNSTORE_ANDROID_PACKAGE = 'online.kingshall.crownstore';
const APP_PACKAGES: Record<EcosystemApp, string> = {
  kingshall: 'online.kingshall.foundation',
  'halls-chat': 'com.kingshall.hallschat',
  crybots: 'com.kingshall.exchange',
  crownstore: CROWNSTORE_ANDROID_PACKAGE,
};

export function crownStoreDetailsUrl(slug: string): string {
  return CROWNSTORE_BASE_URL + '/?app=' + encodeURIComponent(slug);
}

/**
 * Launches an installed ecosystem APK through Android's PackageManager.
 * If the target is missing, it opens that app's exact CrownStore detail page.
 * If CrownStore is missing too, Android opens the CrownStore website.
 */
export async function openEcosystemApp(
  target: EcosystemApp,
  appSlug: string = target,
  targetUrl?: string,
  onMessage?: (message: string) => void,
): Promise<CrossAppLaunchResult> {
  const storeUrl = crownStoreDetailsUrl(appSlug);
  onMessage?.('Opening ' + (target === 'crownstore' ? 'CrownStore' : target) + '…');

  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('CrossAppLauncher')) {
    try {
      const result = await NativeLauncher.openApp({
        targetPackage: APP_PACKAGES[target],
        storePackage: CROWNSTORE_ANDROID_PACKAGE,
        appSlug,
        storeUrl,
        ...(targetUrl ? { targetUrl } : {}),
      });
      onMessage?.(
        result.destination === 'app' ? 'Opening ' + target + '…'
          : result.destination === 'crownstore' ? 'Opening app details in CrownStore…'
            : 'Opening CrownStore in your browser…',
      );
      return result;
    } catch (error) {
      console.warn('Native cross-app launch failed; opening the CrownStore web detail page.', error);
    }
  }

  // Browser/PWA and older APK builds without the bridge use the public catalogue fallback.
  window.location.assign(storeUrl);
  return { opened: true, destination: 'web', value: storeUrl };
}

export function openCrownStoreApp(
  slug: EcosystemAppSlug,
  onMessage?: (message: string) => void,
): void {
  void openEcosystemApp('crownstore', slug, undefined, onMessage);
}

/**
 * Handle launch URLs received when an ecosystem APK is opened by another APK.
 * The app-specific route callback must validate and map the URL into its own local route.
 */
export function listenForNativeLaunchUrls(onUrl: (value: string) => void): () => void {
  if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable('CrossAppLauncher')) return () => undefined;
  let active = true;
  let listener: { remove: () => Promise<void> } | undefined;

  void NativeLauncher.getLaunchUrl().then(({ url }) => {
    if (active && url) onUrl(url);
  }).catch((error) => console.warn('Could not read the native launch URL.', error));

  void NativeLauncher.addListener('appUrlOpen', ({ url }) => {
    if (active && url) onUrl(url);
  }).then((handle) => {
    if (active) listener = handle;
    else void handle.remove();
  }).catch((error) => console.warn('Could not subscribe to native launch URLs.', error));

  return () => {
    active = false;
    if (listener) void listener.remove();
  };
}
