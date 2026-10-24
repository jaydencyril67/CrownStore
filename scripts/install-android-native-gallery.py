from pathlib import Path
import re

root = Path("android")
main_root = root / "app/src/main"
if not main_root.is_dir():
    raise SystemExit("Generated Android project is missing; run Capacitor add/sync first.")

package = "online.kingshall.foundation"
java_dir = main_root / "java" / Path(package.replace(".", "/"))
java_dir.mkdir(parents=True, exist_ok=True)
plugin_path = java_dir / "NativeGalleryPlugin.java"
plugin_path.write_text(r'''package online.kingshall.foundation;

import android.Manifest;
import android.content.ContentUris;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Size;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "NativeGallery", permissions = {
    @Permission(alias = "photosLegacy", strings = { Manifest.permission.READ_EXTERNAL_STORAGE }),
    @Permission(alias = "photosModern", strings = { Manifest.permission.READ_MEDIA_IMAGES })
})
public class NativeGalleryPlugin extends Plugin {
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private String permissionAlias() { return Build.VERSION.SDK_INT >= 33 ? "photosModern" : "photosLegacy"; }
    private boolean hasPermission() { return getPermissionState(permissionAlias()) == PermissionState.GRANTED; }

    @PluginMethod public void getPhotos(PluginCall call) {
        if (!hasPermission()) { requestPermissionForAlias(permissionAlias(), call, "photosPermissionResult"); return; }
        loadPhotos(call);
    }
    @PermissionCallback private void photosPermissionResult(PluginCall call) {
        if (!hasPermission()) { call.reject("Photo library permission is required to show your gallery."); return; }
        loadPhotos(call);
    }
    private void loadPhotos(PluginCall call) {
        worker.execute(() -> {
            JSArray photos = new JSArray();
            String[] projection = { MediaStore.Images.Media._ID, MediaStore.Images.Media.DISPLAY_NAME, MediaStore.Images.Media.DATE_ADDED, MediaStore.Images.Media.BUCKET_DISPLAY_NAME };
            try (Cursor cursor = getContext().getContentResolver().query(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, projection, null, null, MediaStore.Images.Media.DATE_ADDED + " DESC")) {
                if (cursor != null) {
                    int idIndex = cursor.getColumnIndexOrThrow(MediaStore.Images.Media._ID);
                    int nameIndex = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DISPLAY_NAME);
                    int dateIndex = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_ADDED);
                    int albumIndex = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.BUCKET_DISPLAY_NAME);
                    while (cursor.moveToNext() && photos.length() < 200) {
                        long id = cursor.getLong(idIndex);
                        Uri uri = ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id);
                        JSObject photo = new JSObject();
                        photo.put("id", String.valueOf(id));
                        photo.put("name", cursor.getString(nameIndex) == null ? "Photo" : cursor.getString(nameIndex));
                        photo.put("dateAdded", cursor.getLong(dateIndex));
                        photo.put("album", cursor.getString(albumIndex) == null ? "Other" : cursor.getString(albumIndex));
                        String thumbnail = thumbnail(uri);
                        if (thumbnail != null) photo.put("thumbnail", "data:image/jpeg;base64," + thumbnail);
                        photos.put(photo);
                    }
                }
                JSObject result = new JSObject(); result.put("photos", photos); call.resolve(result);
            } catch (Exception error) { call.reject("Unable to read photos from this device.", error); }
        });
    }
    @PluginMethod public void getImage(PluginCall call) {
        if (!hasPermission()) { call.reject("Photo library permission is required to open this image."); return; }
        String id = call.getString("id");
        if (id == null || id.isEmpty()) { call.reject("A photo identifier is required."); return; }
        worker.execute(() -> {
            try {
                Uri uri = ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, Long.parseLong(id));
                try (InputStream input = getContext().getContentResolver().openInputStream(uri); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                    if (input == null) throw new IllegalStateException("Photo could not be opened.");
                    byte[] buffer = new byte[16384]; int count;
                    while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
                    String mime = getContext().getContentResolver().getType(uri);
                    if (mime == null || !mime.startsWith("image/")) mime = "image/jpeg";
                    String ext = mime.equals("image/png") ? ".png" : mime.equals("image/webp") ? ".webp" : ".jpg";
                    JSObject result = new JSObject();
                    result.put("dataUrl", "data:" + mime + ";base64," + Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP));
                    result.put("name", "photo-" + id + ext); call.resolve(result);
                }
            } catch (Exception error) { call.reject("Unable to open the selected photo.", error); }
        });
    }
    private String thumbnail(Uri uri) {
        Bitmap bitmap = null;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) bitmap = getContext().getContentResolver().loadThumbnail(uri, new Size(160, 160), null);
            else bitmap = MediaStore.Images.Thumbnails.getThumbnail(getContext().getContentResolver(), ContentUris.parseId(uri), MediaStore.Images.Thumbnails.MINI_KIND, null);
            if (bitmap == null) return null;
            ByteArrayOutputStream output = new ByteArrayOutputStream(); bitmap.compress(Bitmap.CompressFormat.JPEG, 55, output);
            return Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP);
        } catch (Exception ignored) { return null; }
        finally { if (bitmap != null && !bitmap.isRecycled()) bitmap.recycle(); }
    }
}
''', encoding="utf-8")

manifest_path = main_root / "AndroidManifest.xml"
manifest = manifest_path.read_text(encoding="utf-8")
for permission in (
    '    <uses-permission android:name="android.permission.CAMERA" />',
    '    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />',
    '    <uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />',
):
    name = permission.split('"')[1]
    if name not in manifest:
        manifest = manifest.replace("<application", permission + "\n\n    <application", 1)
# QR scanning uses the camera only when requested, so devices without a camera can still install KingsHall.
camera_feature = '    <uses-feature android:name="android.hardware.camera" android:required="false" />'
if camera_feature not in manifest:
    manifest = manifest.replace("<application", camera_feature + "\n\n    <application", 1)
manifest_path.write_text(manifest, encoding="utf-8")

activity_path = java_dir / "MainActivity.java"
if not activity_path.exists():
    candidates = list((main_root / "java").rglob("MainActivity.java"))
    if len(candidates) != 1:
        raise SystemExit("Could not uniquely locate generated MainActivity.java.")
    activity_path = candidates[0]
activity = activity_path.read_text(encoding="utf-8")
if "import online.kingshall.foundation.NativeGalleryPlugin;" not in activity:
    activity = activity.replace("import com.getcapacitor.BridgeActivity;", "import com.getcapacitor.BridgeActivity;\nimport online.kingshall.foundation.NativeGalleryPlugin;")
if "registerPlugin(NativeGalleryPlugin.class);" not in activity:
    marker = "super.onCreate(savedInstanceState);"
    if marker not in activity:
        raise SystemExit("Could not safely locate MainActivity.onCreate for native gallery registration.")
    activity = activity.replace(marker, "registerPlugin(NativeGalleryPlugin.class);\n        " + marker, 1)
activity_path.write_text(activity, encoding="utf-8")
print("Installed and registered KingsHall NativeGallery plugin.")
