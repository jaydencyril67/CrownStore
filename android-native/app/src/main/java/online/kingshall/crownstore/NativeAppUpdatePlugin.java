package online.kingshall.crownstore;

import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NativeAppUpdate")
public class NativeAppUpdatePlugin extends Plugin {
    private BroadcastReceiver downloadReceiver;
    private long pendingDownloadId = -1L;

    @PluginMethod
    public void getAppInfo(PluginCall call) {
        try {
            PackageInfo info = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            JSObject result = new JSObject();
            result.put("versionName", info.versionName == null ? "" : info.versionName);
            result.put("versionCode", Build.VERSION.SDK_INT >= 28 ? (double) info.getLongVersionCode() : (double) info.versionCode);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Unable to read the installed CrownStore version.", error);
        }
    }

    @PluginMethod
    public void getInstalledApps(PluginCall call) {
        JSArray packageIds = call.getArray("packageIds");
        if (packageIds == null) {
            call.reject("A list of CrownStore catalogue package IDs is required.");
            return;
        }
        PackageManager manager = getContext().getPackageManager();
        JSArray apps = new JSArray();
        try {
            int count = Math.min(packageIds.length(), 250);
            for (int index = 0; index < count; index++) {
                String id;
                try { id = packageIds.getString(index); }
                catch (Exception ignored) { continue; }
                if (id == null || !id.matches("[A-Za-z0-9_]+(\\.[A-Za-z0-9_]+)+")) continue;
                try {
                    PackageInfo info = manager.getPackageInfo(id, 0);
                    ApplicationInfo application = info.applicationInfo;
                    CharSequence label = application == null ? id : manager.getApplicationLabel(application);
                    JSObject item = new JSObject();
                    item.put("packageId", id);
                    item.put("appName", label == null ? id : label.toString());
                    item.put("versionName", info.versionName == null ? "" : info.versionName);
                    item.put("versionCode", Build.VERSION.SDK_INT >= 28 ? (double) info.getLongVersionCode() : (double) info.versionCode);
                    apps.put(item);
                } catch (PackageManager.NameNotFoundException ignored) {
                    // Only package IDs from CrownStore's catalogue are queried.
                }
            }
            JSObject result = new JSObject();
            result.put("apps", apps);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Unable to check installed CrownStore catalogue apps.", error);
        }
    }

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url");
        String appName = call.getString("appName", "CrownStore app");
        Uri uri = url == null ? null : Uri.parse(url);
        boolean trusted = uri != null
            && "https".equalsIgnoreCase(uri.getScheme())
            && "api.crownstore.kingshall.online".equalsIgnoreCase(uri.getHost())
            && (uri.getPort() == -1 || uri.getPort() == 443)
            && uri.getPath() != null
            && uri.getPath().matches("^/api/downloads/[0-9a-fA-F-]{36}$")
            && uri.getQuery() == null;
        if (!trusted) {
            call.reject("The APK URL is not a trusted CrownStore published-release endpoint.");
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && !getContext().getPackageManager().canRequestPackageInstalls()) {
            Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getContext().getPackageName()));
            getActivity().startActivity(settings);
            JSObject result = new JSObject();
            result.put("requiresPermission", true);
            call.resolve(result);
            return;
        }

        DownloadManager manager = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
        if (manager == null) {
            call.reject("Android's download service is unavailable.");
            return;
        }

        try {
            if (downloadReceiver != null) {
                try { getContext().unregisterReceiver(downloadReceiver); } catch (Exception ignored) {}
                downloadReceiver = null;
            }
            final String packageId = call.getString("packageId", "");
            IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
            downloadReceiver = new BroadcastReceiver() {
                @Override public void onReceive(Context context, Intent intent) {
                    long completedId = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L);
                    if (completedId != pendingDownloadId) return;
                    try { getContext().unregisterReceiver(this); } catch (Exception ignored) {}
                    downloadReceiver = null;
                    DownloadManager.Query query = new DownloadManager.Query().setFilterById(completedId);
                    android.database.Cursor cursor = null;
                    int state = -1;
                    try {
                        cursor = manager.query(query);
                        if (cursor != null && cursor.moveToFirst()) {
                            int column = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS);
                            if (column >= 0) state = cursor.getInt(column);
                        }
                    } finally {
                        if (cursor != null) cursor.close();
                    }
                    if (state != DownloadManager.STATUS_SUCCESSFUL) {
                        JSObject failure = new JSObject();
                        failure.put("message", "The " + appName + " APK download failed. Check your connection and retry.");
                        failure.put("packageId", packageId);
                        notifyListeners("downloadError", failure);
                        return;
                    }
                    Uri apk = manager.getUriForDownloadedFile(completedId);
                    if (apk == null) {
                        JSObject failure = new JSObject();
                        failure.put("message", "Android could not locate the downloaded " + appName + " APK.");
                        failure.put("packageId", packageId);
                        notifyListeners("downloadError", failure);
                        return;
                    }
                    Intent install = new Intent(Intent.ACTION_VIEW);
                    install.setDataAndType(apk, "application/vnd.android.package-archive");
                    install.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    try {
                        getActivity().startActivity(install);
                        JSObject complete = new JSObject();
                        complete.put("stage", "installer-opened");
                        complete.put("packageId", packageId);
                        complete.put("timestamp", System.currentTimeMillis());
                        notifyListeners("downloadComplete", complete);
                    } catch (Exception error) {
                        JSObject failure = new JSObject();
                        failure.put("message", "Android could not open the " + appName + " installer: " + String.valueOf(error.getMessage()));
                        failure.put("packageId", packageId);
                        notifyListeners("downloadError", failure);
                    }
                }
            };
            if (Build.VERSION.SDK_INT >= 33) {
                getContext().registerReceiver(downloadReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
            } else {
                getContext().registerReceiver(downloadReceiver, filter);
            }
            DownloadManager.Request request = new DownloadManager.Request(uri);
            request.setTitle(appName + " APK");
            request.setDescription("Downloading the verified update from CrownStore");
            request.setMimeType("application/vnd.android.package-archive");
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setDestinationInExternalFilesDir(getContext(), Environment.DIRECTORY_DOWNLOADS,
                    "CrownStore-" + packageId.replaceAll("[^A-Za-z0-9._-]", "_") + ".apk");
            request.setAllowedOverMetered(true);
            request.setAllowedOverRoaming(true);
            pendingDownloadId = manager.enqueue(request);
            JSObject result = new JSObject();
            result.put("status", "queued");
            result.put("downloadId", pendingDownloadId);
            result.put("url", url);
            result.put("queuedAt", System.currentTimeMillis());
            call.resolve(result);
        } catch (Exception error) {
            if (downloadReceiver != null) {
                try { getContext().unregisterReceiver(downloadReceiver); } catch (Exception ignored) {}
                downloadReceiver = null;
            }
            call.reject("Unable to start the CrownStore APK download.", error);
        }
    }
}
