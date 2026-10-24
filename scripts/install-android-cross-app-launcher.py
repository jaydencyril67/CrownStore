#!/usr/bin/env python3
"""Install the native Android bridge used to launch KingsHall ecosystem APKs."""
from pathlib import Path
import re
import sys

PACKAGE_ID = sys.argv[1] if len(sys.argv) > 1 else ""
if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)+", PACKAGE_ID):
    raise SystemExit("Pass this APK's Java package ID, for example com.kingshall.exchange.")

android = Path("android")
main_root = android / "app/src/main"
if not main_root.is_dir():
    raise SystemExit("Generated Android project is missing. Run npx cap add/sync android first.")

activities = list((main_root / "java").rglob("MainActivity.java"))
if len(activities) != 1:
    raise SystemExit(f"Expected exactly one generated MainActivity.java; found {len(activities)}.")
activity_path = activities[0]
activity = activity_path.read_text(encoding="utf-8")
package_match = re.search(r"(?m)^package\s+([\w.]+)\s*;", activity)
if not package_match:
    raise SystemExit("Could not determine the generated MainActivity Java package.")
java_package = package_match.group(1)

java_source = r'''package __JAVA_PACKAGE__;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "CrossAppLauncher")
public class CrossAppLauncherPlugin extends Plugin {
    private static final String DEFAULT_STORE_PACKAGE = "online.kingshall.crownstore";
    private static final String DEFAULT_STORE_URL = "https://crownstore.kingshall.online/";

    @PluginMethod
    public void openApp(PluginCall call) {
        String targetPackage = clean(call.getString("targetPackage"));
        String storePackage = clean(call.getString("storePackage"));
        String slug = clean(call.getString("appSlug"));
        String storeUrl = clean(call.getString("storeUrl"));
        String targetUrl = clean(call.getString("targetUrl"));

        if (storePackage.isEmpty()) storePackage = DEFAULT_STORE_PACKAGE;
        if (storeUrl.isEmpty()) {
            storeUrl = DEFAULT_STORE_URL + (slug.isEmpty() ? "" : "?app=" + Uri.encode(slug));
        }
        if (targetPackage.isEmpty()) {
            call.reject("A target Android package is required.");
            return;
        }

        if (targetPackage.equals(storePackage)) {
            if (openStoreDetails(storePackage, slug)) {
                resolveDestination(call, "crownstore", targetPackage);
            } else {
                openStoreWebsite(call, storeUrl);
            }
            return;
        }

        if (launchInstalledPackage(targetPackage, targetUrl)) {
            resolveDestination(call, "app", targetPackage);
            return;
        }

        // The requested app is not installed. Open that exact catalogue entry in CrownStore.
        if (!slug.isEmpty() && openStoreDetails(storePackage, slug)) {
            resolveDestination(call, "crownstore", storePackage);
            return;
        }

        // CrownStore is not installed (or its detail deep link is unavailable): use its public web page.
        openStoreWebsite(call, storeUrl);
    }

    @PluginMethod
    public void getLaunchUrl(PluginCall call) {
        JSObject result = new JSObject();
        if (getActivity() != null) {
            Intent launchIntent = getActivity().getIntent();
            if (launchIntent != null && launchIntent.getData() != null) {
                result.put("url", launchIntent.getData().toString());
            }
        }
        call.resolve(result);
    }

    @Override
    public void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        if (intent == null || intent.getData() == null) return;
        JSObject event = new JSObject();
        event.put("url", intent.getData().toString());
        notifyListeners("appUrlOpen", event, true);
    }

    private boolean launchInstalledPackage(String packageName, String targetUrl) {
        try {
            Intent intent = getContext().getPackageManager().getLaunchIntentForPackage(packageName);
            if (intent == null) return false;
            if (!targetUrl.isEmpty()) {
                // Keep the launcher's explicit component, but pass the route to the destination APK.
                intent.setAction(Intent.ACTION_VIEW);
                intent.setData(Uri.parse(targetUrl));
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                    | Intent.FLAG_ACTIVITY_CLEAR_TOP
                    | Intent.FLAG_ACTIVITY_SINGLE_TOP
                    | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
            getContext().startActivity(intent);
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }

    private boolean openStoreDetails(String storePackage, String slug) {
        if (slug.isEmpty()) return false;
        try {
            Uri uri = Uri.parse("crownstore://app?slug=" + Uri.encode(slug));
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            intent.setPackage(storePackage);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                    | Intent.FLAG_ACTIVITY_CLEAR_TOP
                    | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            getContext().startActivity(intent);
            return true;
        } catch (ActivityNotFoundException | SecurityException ignored) {
            return false;
        } catch (Exception ignored) {
            return false;
        }
    }

    private void openStoreWebsite(PluginCall call, String url) {
        if (url.isEmpty()) {
            call.reject("The CrownStore web fallback URL is missing.");
            return;
        }
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            resolveDestination(call, "web", url);
        } catch (Exception error) {
            call.reject("Android could not open the CrownStore website.", error);
        }
    }

    private void resolveDestination(PluginCall call, String destination, String value) {
        JSObject result = new JSObject();
        result.put("opened", true);
        result.put("destination", destination);
        result.put("value", value);
        call.resolve(result);
    }

    private String clean(String value) {
        return value == null ? "" : value.trim();
    }
}
'''.replace("__JAVA_PACKAGE__", java_package)

plugin_path = activity_path.parent / "CrossAppLauncherPlugin.java"
plugin_path.write_text(java_source, encoding="utf-8")

# Android 11+ package visibility: explicitly list the ecosystem APKs whose launch intents we resolve.
packages = [
    "online.kingshall.foundation",
    "com.kingshall.exchange",
    "com.kingshall.hallschat",
    "online.kingshall.crownstore",
]
manifest_path = main_root / "AndroidManifest.xml"
if not manifest_path.is_file():
    raise SystemExit("Generated AndroidManifest.xml is missing.")
manifest = manifest_path.read_text(encoding="utf-8")
query_lines = [f'        <package android:name="{name}" />' for name in packages]
if "<queries" in manifest:
    for line in query_lines:
        name = re.search(r'android:name="([^"]+)"', line).group(1)
        if f'<package android:name="{name}"' not in manifest:
            manifest = manifest.replace("</queries>", line + "\n    </queries>", 1)
else:
    queries_block = "    <queries>\n" + "\n".join(query_lines) + "\n    </queries>\n"
    manifest, count = re.subn(r"(<manifest\b[^>]*>)", r"\1\n" + queries_block, manifest, count=1)
    if count != 1:
        raise SystemExit("Could not insert Android package visibility queries.")
manifest_path.write_text(manifest, encoding="utf-8")

plugin_import = f"import {java_package}.CrossAppLauncherPlugin;"
if plugin_import not in activity:
    bridge_import = "import com.getcapacitor.BridgeActivity;"
    if bridge_import not in activity:
        raise SystemExit("Could not safely locate the generated BridgeActivity import.")
    activity = activity.replace(bridge_import, bridge_import + "\n" + plugin_import, 1)

registration = "registerPlugin(CrossAppLauncherPlugin.class);"
if registration not in activity:
    marker = "super.onCreate(savedInstanceState);"
    if marker not in activity:
        raise SystemExit("Could not safely locate MainActivity.onCreate for plugin registration.")
    activity = activity.replace(marker, registration + "\n        " + marker, 1)
activity_path.write_text(activity, encoding="utf-8")

print("Installed CrossAppLauncher, registered its native bridge, and enabled visibility for the four official ecosystem APK packages.")
