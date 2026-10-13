package app.hexopro.mobile;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.MessageDigest;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;

@CapacitorPlugin(name = "SecureCredentials")
public class SecureCredentialsPlugin extends Plugin {
    private static final String ALIAS = "hexopro_credentials_v1";

    private SharedPreferences preferences() {
        return getContext().getSharedPreferences("hexopro_credentials", Context.MODE_PRIVATE);
    }

    private String account(PluginCall call) throws Exception {
        String key = call.getString("key");
        if (key == null || key.isEmpty()) throw new IllegalArgumentException("Missing account");
        return Base64.encodeToString(MessageDigest.getInstance("SHA-256").digest(key.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
    }

    private SecretKey encryptionKey() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (store.containsAlias(ALIAS)) return (SecretKey) store.getKey(ALIAS, null);
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return generator.generateKey();
    }

    @PluginMethod
    public void set(PluginCall call) {
        try {
            String value = call.getString("value");
            if (value == null || value.isEmpty()) throw new IllegalArgumentException("Missing credential");
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, encryptionKey());
            String encrypted = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + ":"
                + Base64.encodeToString(cipher.doFinal(value.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
            if (!preferences().edit().putString(account(call), encrypted).commit()) throw new Exception("Storage unavailable");
            call.resolve();
        } catch (Exception error) { call.reject("无法保存系统安全凭据，请检查设备存储空间"); }
    }

    @PluginMethod
    public void get(PluginCall call) {
        try {
            String encrypted = preferences().getString(account(call), null);
            JSObject result = new JSObject();
            if (encrypted == null) result.put("value", JSONObject.NULL);
            else {
                String[] parts = encrypted.split(":", 2);
                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.DECRYPT_MODE, encryptionKey(), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
                result.put("value", new String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), StandardCharsets.UTF_8));
            }
            call.resolve(result);
        } catch (Exception error) { call.reject("系统安全凭据无法读取，请在设置中重新填写凭据"); }
    }

    @PluginMethod
    public void remove(PluginCall call) {
        try {
            if (!preferences().edit().remove(account(call)).commit()) throw new Exception("Storage unavailable");
            call.resolve();
        } catch (Exception error) { call.reject("无法移除系统安全凭据，请重试"); }
    }
}
