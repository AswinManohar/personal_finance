package com.aswinmanohar.cashflow;

import android.content.SharedPreferences;

import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKey;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Encrypted key/value storage, used for the Gmail OAuth refresh token.
 *
 * That token grants read access to the whole mailbox and is long-lived, so it
 * must not sit in localStorage — which is readable by anything in the WebView
 * and survives in device backups. EncryptedSharedPreferences keys off the
 * Android Keystore, so the ciphertext is useless off the device.
 *
 * Deliberately separate from AdvanziaCapturePlugin rather than added to it: the
 * Advanzia capture path is working code and is not being modified.
 */
@CapacitorPlugin(name = "SecureStore")
public class SecureStorePlugin extends Plugin {

    private static final String FILE = "cashflow_secure";

    private SharedPreferences prefs() throws Exception {
        MasterKey key = new MasterKey.Builder(getContext())
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build();
        return EncryptedSharedPreferences.create(
                getContext(),
                FILE,
                key,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM);
    }

    @PluginMethod
    public void get(PluginCall call) {
        String name = call.getString("key");
        if (name == null) {
            call.reject("key is required");
            return;
        }
        try {
            JSObject result = new JSObject();
            result.put("value", prefs().getString(name, null));
            call.resolve(result);
        } catch (Exception e) {
            // Failing loudly matters: a silent null here looks identical to
            // "never authorized" and would send the user round the consent
            // flow forever without explaining why.
            call.reject("secure storage unavailable", e);
        }
    }

    @PluginMethod
    public void set(PluginCall call) {
        String name = call.getString("key");
        String value = call.getString("value");
        if (name == null || value == null) {
            call.reject("key and value are required");
            return;
        }
        try {
            prefs().edit().putString(name, value).apply();
            call.resolve();
        } catch (Exception e) {
            call.reject("secure storage unavailable", e);
        }
    }

    @PluginMethod
    public void remove(PluginCall call) {
        String name = call.getString("key");
        if (name == null) {
            call.reject("key is required");
            return;
        }
        try {
            prefs().edit().remove(name).apply();
            call.resolve();
        } catch (Exception e) {
            call.reject("secure storage unavailable", e);
        }
    }
}
