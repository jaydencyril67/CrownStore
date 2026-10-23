package online.kingshall.crownstore;

import android.os.CancellationSignal;
import androidx.credentials.CreateCredentialResponse;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.CreateCredentialException;
import androidx.credentials.exceptions.GetCredentialException;
import androidx.credentials.CreatePublicKeyCredentialRequest;
import androidx.credentials.CreatePublicKeyCredentialResponse;
import androidx.credentials.GetPublicKeyCredentialOption;
import androidx.credentials.PublicKeyCredential;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;
import java.util.concurrent.Executor;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "NativeWebAuthn")
public class NativeWebAuthnPlugin extends Plugin {
    private final Executor executor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void create(PluginCall call) {
        String options = call.getString("options");
        if (options == null || options.isEmpty()) {
            call.reject("WebAuthn registration options are required.");
            return;
        }
        CreatePublicKeyCredentialRequest request = new CreatePublicKeyCredentialRequest(options);
        CredentialManager manager = CredentialManager.create(getContext());
        manager.createCredentialAsync(getActivity(), request, new CancellationSignal(), executor,
                new CredentialManagerCallback<CreateCredentialResponse, CreateCredentialException>() {
                    @Override public void onResult(CreateCredentialResponse result) {
                        if (!(result instanceof CreatePublicKeyCredentialResponse)) {
                            call.reject("Android did not return a public-key credential.");
                            return;
                        }
                        JSObject response = new JSObject();
                        response.put("responseJson", ((CreatePublicKeyCredentialResponse) result).getRegistrationResponseJson());
                        call.resolve(response);
                    }
                    @Override public void onError(CreateCredentialException error) {
                        call.reject(error.getMessage() == null ? "Android passkey registration failed." : error.getMessage());
                    }
                });
    }

    @PluginMethod
    public void get(PluginCall call) {
        String options = call.getString("options");
        if (options == null || options.isEmpty()) {
            call.reject("WebAuthn authentication options are required.");
            return;
        }
        GetPublicKeyCredentialOption option = new GetPublicKeyCredentialOption(options);
        GetCredentialRequest request = new GetCredentialRequest.Builder().addCredentialOption(option).build();
        CredentialManager manager = CredentialManager.create(getContext());
        manager.getCredentialAsync(getActivity(), request, new CancellationSignal(), executor,
                new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                    @Override public void onResult(GetCredentialResponse result) {
                        Credential credential = result.getCredential();
                        if (!(credential instanceof PublicKeyCredential)) {
                            call.reject("Android did not return a public-key credential.");
                            return;
                        }
                        JSObject response = new JSObject();
                        response.put("responseJson", ((PublicKeyCredential) credential).getAuthenticationResponseJson());
                        call.resolve(response);
                    }
                    @Override public void onError(GetCredentialException error) {
                        call.reject(error.getMessage() == null ? "Android passkey authentication failed." : error.getMessage());
                    }
                });
    }
}
