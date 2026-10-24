package online.kingshall.crownstore;

import android.accounts.Account;
import android.accounts.AccountManager;
import android.app.Activity;
import android.content.Intent;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "KingsHallAccount")
public class KingsHallAccountPlugin extends Plugin {
    private static final String ACCOUNT_TYPE = "online.kingshall.account";

    @PluginMethod
    public void hasAccounts(PluginCall call) {
        boolean found = false;
        for (Account account : AccountManager.get(getContext()).getAccountsByType(ACCOUNT_TYPE)) {
            if (account.name != null && account.name.trim().contains("@")) { found = true; break; }
        }
        JSObject result = new JSObject();
        result.put("hasAccount", found);
        call.resolve(result);
    }

    @PluginMethod
    public void chooseAccount(PluginCall call) {
        // Let Android's account picker be the source of truth instead of pre-filtering
        // through getAccountsByType, which can be visibility-restricted on Android 8+.
        Intent intent = AccountManager.newChooseAccountIntent(
                null, null, new String[] { ACCOUNT_TYPE }, null, null, null, null);
        startActivityForResult(call, intent, "handleChooseAccountResult");
    }

    @ActivityCallback
    private void handleChooseAccountResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            JSObject cancelled = new JSObject();
            cancelled.put("cancelled", true);
            call.resolve(cancelled);
            return;
        }
        String email = result.getData().getStringExtra(AccountManager.KEY_ACCOUNT_NAME);
        String type = result.getData().getStringExtra(AccountManager.KEY_ACCOUNT_TYPE);
        if (email == null || email.trim().isEmpty() || !ACCOUNT_TYPE.equals(type)) {
            call.reject("Select a registered KingsHall account to continue.");
            return;
        }
        JSObject selected = new JSObject();
        selected.put("email", email.trim().toLowerCase(java.util.Locale.ROOT));
        call.resolve(selected);
    }
}
