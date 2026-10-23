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

    // Capacitor can decode small JavaScript numbers as Integer rather than Long.
    private long readDownloadId(PluginCall call) {
        Object raw = call.getData() == null ? null : call.getData().opt("downloadId");
        if (!(raw instanceof Number)) return -1L;
        long id = ((Number) raw).longValue();
        return id > 0L ? id : -1L;
    }

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
    public void installDownloadedApk(PluginCall call) {
        long downloadId = readDownloadId(call);
        String appName = call.getString("appName", "CrownStore app");
        String packageId = call.getString("packageId", "");
        if (downloadId <= 0L) {
            call.reject("A valid Android download ID is required.");
            return;
        }

        DownloadManager manager = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
        if (manager == null) {
            call.reject("Android's download service is unavailable.");
            return;
        }

        android.database.Cursor cursor = null;
        try {
            cursor = manager.query(new DownloadManager.Query().setFilterById(downloadId));
            if (cursor == null || !cursor.moveToFirst()) {
                call.reject("Android could not find this CrownStore download. Download the APK again.");
                return;
            }
            int statusColumn = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS);
            int state = statusColumn >= 0 ? cursor.getInt(statusColumn) : -1;
            if (state != DownloadManager.STATUS_SUCCESSFUL) {
                call.reject("The APK has not finished downloading yet.");
                return;
            }
        } catch (Exception error) {
            call.reject("Unable to verify the downloaded APK.", error);
            return;
        } finally {
            if (cursor != null) cursor.close();
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && !getContext().getPackageManager().canRequestPackageInstalls()) {
            try {
                Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + getContext().getPackageName()));
                settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getActivity().startActivity(settings);
                JSObject result = new JSObject();
                result.put("requiresPermission", true);
                call.resolve(result);
            } catch (Exception error) {
                call.reject("Android could not open CrownStore's installation permission settings.", error);
            }
            return;
        }

        Uri apk = manager.getUriForDownloadedFile(downloadId);
        if (apk == null) {
            call.reject("Android could not locate the downloaded " + appName + " APK.");
            return;
        }
        try {
            Intent install = new Intent(Intent.ACTION_VIEW);
            install.setDataAndType(apk, "application/vnd.android.package-archive");
            install.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(install);
            JSObject complete = new JSObject();
            complete.put("stage", "installer-opened");
            complete.put("packageId", packageId);
            complete.put("downloadId", downloadId);
            complete.put("timestamp", System.currentTimeMillis());
            notifyListeners("downloadComplete", complete);
            JSObject result = new JSObject();
            result.put("opened", true);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Android could not open the " + appName + " installer.", error);
        }
    }

    @PluginMethod
    public void getDownloadStatus(PluginCall call) {
        long downloadId = readDownloadId(call);
        if (downloadId <= 0L) {
            call.reject("A valid Android download ID is required.");
            return;
        }

        DownloadManager manager = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
        if (manager == null) {
            call.reject("Android's download service is unavailable.");
            return;
        }

        android.database.Cursor cursor = null;
        try {
            cursor = manager.query(new DownloadManager.Query().setFilterById(downloadId));
            if (cursor == null || !cursor.moveToFirst()) {
                call.reject("Android could not find this CrownStore download.");
                return;
            }

            int statusColumn = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS);
            int downloadedColumn = cursor.getColumnIndex(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR);
            int totalColumn = cursor.getColumnIndex(DownloadManager.COLUMN_TOTAL_SIZE_BYTES);
            int reasonColumn = cursor.getColumnIndex(DownloadManager.COLUMN_REASON);

            int state = statusColumn >= 0 ? cursor.getInt(statusColumn) : -1;
            String status;
            if (state == DownloadManager.STATUS_PENDING) status = "pending";
            else if (state == DownloadManager.STATUS_RUNNING) status = "running";
            else if (state == DownloadManager.STATUS_PAUSED) status = "paused";
            else if (state == DownloadManager.STATUS_SUCCESSFUL) status = "successful";
            else if (state == DownloadManager.STATUS_FAILED) status = "failed";
            else status = "unknown";

            long downloaded = downloadedColumn >= 0 ? cursor.getLong(downloadedColumn) : 0L;
            long total = totalColumn >= 0 ? cursor.getLong(totalColumn) : 0L;
            int reason = reasonColumn >= 0 ? cursor.getInt(reasonColumn) : 0;

            JSObject result = new JSObject();
            result.put("status", status);
            result.put("bytesDownloaded", Math.max(0L, downloaded));
            result.put("totalSize", Math.max(0L, total));
            result.put("reason", reason);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Unable to read Android's APK download progress.", error);
        } finally {
            if (cursor != null) cursor.close();
        }
    }

    @PluginMethod
    public void cancelDownload(PluginCall call) {
        long downloadId = readDownloadId(call);
        if (downloadId <= 0L) {
            call.reject("A valid Android download ID is required.");
            return;
        }

        DownloadManager manager = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
        if (manager == null) {
            call.reject("Android's download service is unavailable.");
            return;
        }

        try {
            int removed = manager.remove(downloadId);
            if (downloadId == pendingDownloadId) {
                if (downloadReceiver != null) {
                    try { getContext().unregisterReceiver(downloadReceiver); } catch (Exception ignored) {}
                    downloadReceiver = null;
                }
                pendingDownloadId = -1L;
            }
            JSObject result = new JSObject();
            result.put("removed", removed > 0);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Unable to cancel the Android APK download.", error);
        }
    }

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url");
        String appName = call.getString("appName", "CrownStore app");
        Uri uri = url == null ? null : Uri.parse(url);
        boolean trusted = uri != null
            && "https".equalsIgnoreCase(uri.getScheme())
            && "apicrownstore.kingshall.online".equalsIgnoreCase(uri.getHost())
            && (uri.getPort() == -1 || uri.getPort() == 443)
            && uri.getPath() != null
            && uri.getPath().matches("^/api/downloads/[0-9a-fA-F-]{36}$")
            && uri.getQuery() == null;
        if (!trusted) {
            call.reject("The APK URL is not a trusted CrownStore published-release endpoint.");
            return;
        }
        // One active DownloadManager handoff at a time: don't unregister another
        // download's receiver if a second screen requests an APK concurrently.
        if (downloadReceiver != null) {
            call.reject("Another CrownStore APK download is already in progress. Wait for it to finish, then retry.");
            return;
        }

        DownloadManager manager = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
        if (manager == null) {
            call.reject("Android's download service is unavailable.");
            return;
        }

        try {
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
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                            && !getContext().getPackageManager().canRequestPackageInstalls()) {
                        try {
                            Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                                    Uri.parse("package:" + getContext().getPackageName()));
                            settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                            getActivity().startActivity(settings);
                            JSObject needed = new JSObject();
                            needed.put("message", "The APK is downloaded. Allow CrownStore to install apps, then return and tap Continue installation.");
                            needed.put("packageId", packageId);
                            needed.put("downloadId", completedId);
                            notifyListeners("installPermissionRequired", needed);
                        } catch (Exception error) {
                            JSObject failure = new JSObject();
                            failure.put("message", "The APK is downloaded, but Android could not open installation settings: " + String.valueOf(error.getMessage()));
                            failure.put("packageId", packageId);
                            notifyListeners("downloadError", failure);
                        }
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
            // Unique names prevent repeated updates from failing because a prior APK still exists.
            request.setDestinationInExternalFilesDir(getContext(), Environment.DIRECTORY_DOWNLOADS,
                    "CrownStore-" + packageId.replaceAll("[^A-Za-z0-9._-]", "_") + "-" + System.currentTimeMillis() + ".apk");
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
