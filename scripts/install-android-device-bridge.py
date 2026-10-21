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

manifest_path = target_root / "AndroidManifest.xml"
manifest = manifest_path.read_text(encoding="utf-8")
permissions = [
    '    <uses-permission android:name="android.permission.INTERNET" />',
    '    <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />',
    '    <uses-permission android:name="android.permission.QUERY_ALL_PACKAGES" />',
]
for permission in permissions:
    name = re.search(r'android:name="([^"]+)"', permission).group(1)
    if name not in manifest:
        manifest = manifest.replace("<application", permission + "\n\n    <application", 1)

intent_filter = """            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="crownstore" android:host="connect" />
            </intent-filter>
"""
if 'android:scheme="crownstore"' not in manifest:
    if "</activity>" not in manifest:
        raise SystemExit("Could not locate the generated Android activity.")
    manifest = manifest.replace("</activity>", intent_filter + "        </activity>", 1)
manifest_path.write_text(manifest, encoding="utf-8")

activity_path = target_root / "java/online/kingshall/crownstore/MainActivity.java"
if not activity_path.exists():
    raise SystemExit("Expected generated MainActivity.java was not found.")
activity = activity_path.read_text(encoding="utf-8")
plugin_import = "import online.kingshall.crownstore.NativeAppUpdatePlugin;"
if plugin_import not in activity:
    marker = "import com.getcapacitor.BridgeActivity;"
    if marker not in activity:
        raise SystemExit("Could not safely locate the BridgeActivity import.")
    activity = activity.replace(marker, marker + "\n" + plugin_import, 1)

registration = "registerPlugin(NativeAppUpdatePlugin.class);"
if registration not in activity:
    marker = "super.onCreate(savedInstanceState);"
    if marker in activity:
        activity = activity.replace(marker, registration + "\n        " + marker, 1)
    else:
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
        override = "\n    @Override\n    public void onCreate(Bundle savedInstanceState) {\n        " + registration + "\n        super.onCreate(savedInstanceState);\n    }\n"
        activity = activity[:final_brace] + override + activity[final_brace:]
activity_path.write_text(activity, encoding="utf-8")
print("Installed CrownStore native package scanner, trusted APK downloader/installer bridge, and crownstore://connect deep link.")
