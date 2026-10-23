package online.kingshall.crownstore;

import android.app.AppOpsManager;
import android.app.usage.UsageStats;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.os.Process;
import android.provider.Settings;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@CapacitorPlugin(name = "NativeProfileUsage")
public class NativeProfileUsagePlugin extends Plugin {
    private boolean hasUsageAccess() {
        AppOpsManager appOps = (AppOpsManager) getContext().getSystemService(Context.APP_OPS_SERVICE);
        if (appOps == null) return false;
        int mode = appOps.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), getContext().getPackageName());
        return mode == AppOpsManager.MODE_ALLOWED;
    }

    @PluginMethod
    public void getUsageStats(PluginCall call) {
        JSArray requested = call.getArray("packageIds");
        JSObject response = new JSObject();
        JSArray output = new JSArray();
        boolean permitted = hasUsageAccess();
        response.put("permissionRequired", !permitted);
        if (!permitted) {
            response.put("apps", output);
            call.resolve(response);
            return;
        }

        java.util.Set<String> allowlist = new java.util.HashSet<>();
        if (requested != null) {
            for (int i = 0; i < requested.length(); i++) {
                try {
                    String packageId = requested.getString(i);
                    if (packageId != null && packageId.matches("[A-Za-z0-9_]+(\\.[A-Za-z0-9_]+)+")) allowlist.add(packageId);
                } catch (org.json.JSONException ignored) {}
            }
        }

        long end = System.currentTimeMillis();
        long start = end - 30L * 24L * 60L * 60L * 1000L;
        UsageStatsManager manager = (UsageStatsManager) getContext().getSystemService(Context.USAGE_STATS_SERVICE);
        Map<String, long[]> combined = new HashMap<>();
        if (manager != null && !allowlist.isEmpty()) {
            List<UsageStats> stats = manager.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, start, end);
            for (UsageStats item : stats) {
                String packageId = item.getPackageName();
                if (!allowlist.contains(packageId)) continue;
                long[] totals = combined.computeIfAbsent(packageId, ignored -> new long[] { 0L, 0L });
                totals[0] += item.getTotalTimeInForeground();
                totals[1] = Math.max(totals[1], item.getLastTimeUsed());
            }
        }
        for (Map.Entry<String, long[]> entry : combined.entrySet()) {
            JSObject app = new JSObject();
            app.put("packageId", entry.getKey());
            app.put("totalTimeInForeground", entry.getValue()[0]);
            app.put("lastTimeUsed", entry.getValue()[1]);
            output.put(app);
        }
        response.put("apps", output);
        call.resolve(response);
    }

    @PluginMethod
    public void openUsageAccessSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception error) {
            call.reject("Android could not open usage-access settings.", error);
        }
    }
}
