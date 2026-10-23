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
for plugin_name in ("KingsHallAccountPlugin.java", "NativeProfileUsagePlugin.java"):
    plugin_source = Path("android-native/app/src/main/java/online/kingshall/crownstore") / plugin_name
    plugin_target = target_root / "java/online/kingshall/crownstore" / plugin_name
    if not plugin_source.is_file():
        raise SystemExit("Native CrownStore profile plugin source is missing: " + str(plugin_source))
    plugin_target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(plugin_source, plugin_target)

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
    "connect": """            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="crownstore" android:host="connect" />
            </intent-filter>
""",
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
for host, intent_filter in deep_link_filters.items():
    host_declaration = 'android:scheme="crownstore" android:host="' + host + '"'
    if host_declaration not in manifest:
        manifest = manifest.replace("</activity>", intent_filter + "        </activity>", 1)
manifest_path.write_text(manifest, encoding="utf-8")

activity_path = target_root / "java/online/kingshall/crownstore/MainActivity.java"
if not activity_path.exists():
    raise SystemExit("Expected generated MainActivity.java was not found.")
activity = activity_path.read_text(encoding="utf-8")
plugin_import = "import online.kingshall.crownstore.NativeAppUpdatePlugin;"
extra_plugin_imports = [
    "import online.kingshall.crownstore.KingsHallAccountPlugin;",
    "import online.kingshall.crownstore.NativeProfileUsagePlugin;",
]
if plugin_import not in activity:
    marker = "import com.getcapacitor.BridgeActivity;"
    if marker not in activity:
        raise SystemExit("Could not safely locate the BridgeActivity import.")
    activity = activity.replace(marker, marker + "\n" + plugin_import, 1)
    for extra_import in extra_plugin_imports:
        if extra_import not in activity:
            activity = activity.replace(marker + "\n" + plugin_import, marker + "\n" + plugin_import + "\n" + extra_import, 1)

# Android WebView draws native scroll indicators independently of page CSS.
# Disable both axes at the native layer while preserving normal touch scrolling.
for import_line in ("import android.view.View;", "import android.webkit.WebView;"):
    if import_line not in activity:
        package_end = activity.find("\n", activity.find("package "))
        if package_end < 0:
            raise SystemExit("Could not locate the MainActivity package declaration.")
        activity = activity[:package_end + 1] + "\n" + import_line + activity[package_end + 1:]

registration = "registerPlugin(NativeAppUpdatePlugin.class);"
extra_registrations = [
    "registerPlugin(KingsHallAccountPlugin.class);",
    "registerPlugin(NativeProfileUsagePlugin.class);",
]
if registration not in activity:
    marker = "super.onCreate(savedInstanceState);"
    if marker in activity:
        activity = activity.replace(marker, registration + "\n        " + marker, 1)
        for extra_registration in extra_registrations:
            if extra_registration not in activity:
                activity = activity.replace(registration + "\n        " + marker, registration + "\n        " + extra_registration + "\n        " + marker, 1)
    else:
        # A new Capacitor project may start with an empty BridgeActivity subclass.
        class_marker = "public class MainActivity extends BridgeActivity {"
        if class_marker not in activity:
            raise SystemExit("Could not locate a Java MainActivity extending BridgeActivity.")
        # All profile plugins are registered together when onCreate is generated below.
        if "import android.os.Bundle;" not in activity:
            package_marker = "package online.kingshall.crownstore;"
            if package_marker not in activity:
                raise SystemExit("Could not locate the MainActivity package declaration.")
            activity = activity.replace(package_marker, package_marker + "\n\nimport android.os.Bundle;", 1)
        final_brace = activity.rfind("}")
        if final_brace < 0:
            raise SystemExit("Could not locate the end of MainActivity.")
        override = "\n    @Override\n    public void onCreate(Bundle savedInstanceState) {\n        " + registration + "\n        super.onCreate(savedInstanceState);\n    }\n"
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
print("Installed CrownStore account picker, Android usage insights, package scanner, trusted APK downloader/installer bridge, hidden WebView scrollbars, and CrownStore deep links.")
