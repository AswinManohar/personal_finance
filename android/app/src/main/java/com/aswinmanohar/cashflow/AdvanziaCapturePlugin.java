package com.aswinmanohar.cashflow;

import android.Manifest;
import android.content.Intent;
import android.provider.Settings;

import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONException;

import java.util.ArrayList;
import java.util.List;

/**
 * The WebView's only door to captured notifications.
 *
 * The queue file itself is never exposed — not through @capacitor/preferences
 * (which is not installed and uses its own namespace anyway), just these
 * methods. Drain-on-resume is the source of truth: the WebView calls
 * {@link #getPending} when it comes to the foreground, renders what it gets, and
 * only then calls {@link #clearPending}. Ordering it that way means a crash
 * mid-drain leaves items queued rather than losing them.
 *
 * No maintained Capacitor plugin exists for reading another app's notifications
 * — the one candidate is archived, uses the Capacitor 2 registration API, and
 * explicitly does not handle the backgrounded case, which is the entire problem.
 * Hence this. Written in Java rather than the Kotlin the research recommended,
 * because the project has no Kotlin toolchain and four files did not justify
 * adding one.
 */
@CapacitorPlugin(
        name = "AdvanziaCapture",
        permissions = {
                @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = AdvanziaCapturePlugin.NOTIFICATIONS)
        }
)
public class AdvanziaCapturePlugin extends Plugin {

    static final String NOTIFICATIONS = "notifications";

    @Override
    public void load() {
        CaptureNotifications.ensureChannels(getContext());
    }

    @PluginMethod
    public void getPending(PluginCall call) {
        JSObject result = new JSObject();
        // The JSONArray goes in as-is. JSArray.from() takes an Object and would
        // wrap the serialized queue as a single string element instead of
        // parsing it — silently handing the WebView one item containing all the
        // others.
        result.put("items", CaptureStore.all(getContext()));
        call.resolve(result);
    }

    @PluginMethod
    public void clearPending(PluginCall call) {
        JSArray keys = call.getArray("keys");
        if (keys == null) {
            call.reject("keys is required");
            return;
        }

        List<String> toClear = new ArrayList<>();
        try {
            for (Object key : keys.toList()) {
                if (key != null) toClear.add(key.toString());
            }
        } catch (JSONException e) {
            call.reject("keys must be an array of strings");
            return;
        }

        CaptureStore.clear(getContext(), toClear);
        call.resolve();
    }

    /**
     * Everything the UI needs to tell the user whether capture is actually
     * working — the failure mode here is silence, so "no news" must be
     * distinguishable from "broken".
     */
    @PluginMethod
    public void getStatus(PluginCall call) {
        JSObject result = new JSObject();
        result.put("listenerEnabled", isListenerEnabled());
        result.put("notificationsEnabled",
                NotificationManagerCompat.from(getContext()).areNotificationsEnabled());
        result.put("lastCaptureAt", CaptureStore.lastCaptureAt(getContext()));
        result.put("lastSuspiciousAt", CaptureStore.lastSuspiciousAt(getContext()));
        result.put("queued", CaptureStore.all(getContext()).length());
        call.resolve(result);
    }

    /**
     * Notification access is a special permission: there is no in-app dialog for
     * it, and it can be revoked from system settings at any time with no
     * callback, which is why the UI re-checks this on every resume.
     */
    @PluginMethod
    public void openListenerSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    /**
     * The battery-optimisation exemption, opened as the settings list rather
     * than the direct request dialog — the direct one needs
     * REQUEST_IGNORE_BATTERY_OPTIMIZATIONS declared, and this is only hardening
     * against the listener being killed, not a requirement.
     */
    @PluginMethod
    public void openBatterySettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        requestPermissionForAlias(NOTIFICATIONS, call, "notificationPermissionCallback");
    }

    @PermissionCallback
    private void notificationPermissionCallback(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted",
                NotificationManagerCompat.from(getContext()).areNotificationsEnabled());
        call.resolve(result);
    }

    private boolean isListenerEnabled() {
        return NotificationManagerCompat
                .getEnabledListenerPackages(getContext())
                .contains(getContext().getPackageName());
    }
}
