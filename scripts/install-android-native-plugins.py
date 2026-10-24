from pathlib import Path
import re
import shutil

root = Path("android")
if not root.is_dir():
    raise SystemExit("Generated Android project is missing; run npx cap add android first.")

source = Path("android-native/app/src/main/java/online/kingshall/crownstore/NativeAppUpdatePlugin.java")
target_root = root / "app/src/main"
target = target_root / "java/online/kingshall/crownstore/NativeAppUpdatePlugin.java"
if not source.is_file():
    raise SystemExit("Native CrownStore device/update plugin source is missing.")
target.parent.mkdir(parents=True, exist_ok=True)
shutil.copyfile(source, target)

# Keep KingsHall account selection and Android app-usage insights in the native layer.
for plugin_name in ("KingsHallAccountPlugin.java", "NativeProfileUsagePlugin.java", "NativeWebAuthnPlugin.java"):
    plugin_source = Path("android-native/app/src/main/java/online/kingshall/crownstore") / plugin_name
    plugin_target = target_root / "java/online/kingshall/crownstore" / plugin_name
    if not plugin_source.is_file():
        raise SystemExit("Native CrownStore profile plugin source is missing: " + str(plugin_source))
    plugin_target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(plugin_source, plugin_target)


# Android Credential Manager provides the native passkey dialog used by KingsHall sign-in.
gradle_path = root / "app/build.gradle"
if not gradle_path.is_file():
    raise SystemExit("Generated Android app/build.gradle was not found.")
gradle = gradle_path.read_text(encoding="utf-8")
dependency_marker = "dependencies {"
if dependency_marker not in gradle:
    raise SystemExit("Could not locate the generated Android dependencies block.")
for dependency in (
    '    implementation "androidx.credentials:credentials:1.6.0"',
    '    implementation "androidx.credentials:credentials-play-services-auth:1.6.0"',
):
    if dependency.strip() not in gradle:
        gradle = gradle.replace(dependency_marker, dependency_marker + "\n" + dependency, 1)
gradle_path.write_text(gradle, encoding="utf-8")

manifest_path = target_root / "AndroidManifest.xml"
manifest = manifest_path.read_text(encoding="utf-8")
permissions = [
    '    <uses-permission android:name="android.permission.INTERNET" />',
    '    <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />',
    '    <uses-permission android:name="android.permission.QUERY_ALL_PACKAGES" />',
    '    <uses-permission android:name="android.permission.PACKAGE_USAGE_STATS" />',
]
for permission in permissions:
    name = re.search(r'android:name="([^"]+)"', permission).group(1)
    if name not in manifest:
        manifest = manifest.replace("<application", permission + "\n\n    <application", 1)

deep_link_filters = {
    "app": """            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="crownstore" android:host="app" />
            </intent-filter>
"""
}
if "</activity>" not in manifest:
    raise SystemExit("Could not locate the generated Android activity.")
# Remove the retired external device-pairing link from previously generated projects.
manifest = re.sub(
    r'\s*<intent-filter>(?:(?!</intent-filter>).)*<data\s+android:scheme="crownstore"\s+android:host="connect"\s*/>(?:(?!</intent-filter>).)*</intent-filter>',
    "",
    manifest,
    count=1,
    flags=re.DOTALL,
)

for host, intent_filter in deep_link_filters.items():
    host_declaration = 'android:scheme="crownstore" android:host="' + host + '"'
    if host_declaration not in manifest:
        manifest = manifest.replace("</activity>", intent_filter + "        </activity>", 1)
manifest_path.write_text(manifest, encoding="utf-8")

activity_path = target_root / "java/online/kingshall/crownstore/MainActivity.java"
if not activity_path.exists():
    raise SystemExit("Expected generated MainActivity.java was not found.")
activity = activity_path.read_text(encoding="utf-8")
plugin_imports = [
    "import online.kingshall.crownstore.NativeAppUpdatePlugin;",
    "import online.kingshall.crownstore.KingsHallAccountPlugin;",
    "import online.kingshall.crownstore.NativeProfileUsagePlugin;",
    "import online.kingshall.crownstore.NativeWebAuthnPlugin;",
]
bridge_import = "import com.getcapacitor.BridgeActivity;"
if bridge_import not in activity:
    raise SystemExit("Could not safely locate the BridgeActivity import.")
missing_imports = [line for line in plugin_imports if line not in activity]
if missing_imports:
    activity = activity.replace(bridge_import, bridge_import + "\n" + "\n".join(missing_imports), 1)

# Android WebView draws native scroll indicators independently of page CSS.
# Disable both axes at the native layer while preserving normal touch scrolling.
for import_line in ("import android.view.View;", "import android.webkit.WebView;"):
    if import_line not in activity:
        package_end = activity.find("\n", activity.find("package "))
        if package_end < 0:
            raise SystemExit("Could not locate the MainActivity package declaration.")
        activity = activity[:package_end + 1] + "\n" + import_line + activity[package_end + 1:]

registrations_to_add = [
    "registerPlugin(NativeAppUpdatePlugin.class);",
    "registerPlugin(KingsHallAccountPlugin.class);",
    "registerPlugin(NativeProfileUsagePlugin.class);",
    "registerPlugin(NativeWebAuthnPlugin.class);",
]
marker = "super.onCreate(savedInstanceState);"
if marker in activity:
    missing_registrations = [line for line in registrations_to_add if line not in activity]
    if missing_registrations:
        activity = activity.replace(marker, "\n        ".join(missing_registrations) + "\n        " + marker, 1)
elif not all(line in activity for line in registrations_to_add):
    # A new Capacitor project may start with an empty BridgeActivity subclass.
    class_marker = "public class MainActivity extends BridgeActivity {"
    if class_marker not in activity:
        raise SystemExit("Could not locate a Java MainActivity extending BridgeActivity.")
    if "import android.os.Bundle;" not in activity:
        package_marker = "package online.kingshall.crownstore;"
        if package_marker not in activity:
            raise SystemExit("Could not locate the MainActivity package declaration.")
        activity = activity.replace(package_marker, package_marker + "\n\nimport android.os.Bundle;", 1)
    final_brace = activity.rfind("}")
    if final_brace < 0:
        raise SystemExit("Could not locate the end of MainActivity.")
    override = "\n    @Override\n    public void onCreate(Bundle savedInstanceState) {\n        " + "\n        ".join(registrations_to_add) + "\n        super.onCreate(savedInstanceState);\n    }\n"
    activity = activity[:final_brace] + override + activity[final_brace:]

scrollbar_setup = """        // Match CryBots: hide native scrollbars without disabling scrolling.
        if (getBridge() != null && getBridge().getWebView() != null) {
            WebView webView = getBridge().getWebView();
            webView.setVerticalScrollBarEnabled(false);
            webView.setHorizontalScrollBarEnabled(false);
            webView.setScrollBarStyle(View.SCROLLBARS_INSIDE_OVERLAY);
            webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        }
"""
if "webView.setVerticalScrollBarEnabled(false);" not in activity:
    marker = "super.onCreate(savedInstanceState);"
    if marker not in activity:
        raise SystemExit("Could not locate onCreate completion point for WebView scrollbar settings.")
    activity = activity.replace(marker, marker + "\n" + scrollbar_setup.rstrip(), 1)

activity_path.write_text(activity, encoding="utf-8")
print("Installed CrownStore account picker, Android usage insights, passkey authentication, native APK installer, hidden WebView scrollbars, and app deep links.")

import subprocess
import sys

# Install the KingsHall-style custom Android photo gallery before the shared launcher.
subprocess.run([sys.executable, "scripts/install-android-native-gallery.py"], check=True)

# Install the shared native APK launcher after MainActivity and its other plugins exist.
subprocess.run([sys.executable, "scripts/install-android-cross-app-launcher.py", "online.kingshall.crownstore"], check=True)

