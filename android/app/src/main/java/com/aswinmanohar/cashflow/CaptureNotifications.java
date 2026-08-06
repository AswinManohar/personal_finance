package com.aswinmanohar.cashflow;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

/**
 * Cashflow's own notifications about capture.
 *
 * Three channels, and the split is load-bearing rather than tidiness. The nag
 * fires per unconfirmed item, which on a heavy shopping day invites muting — and
 * if nags shared a channel with captures, muting them would also silence the
 * capture notifications and the health alarm, turning an annoyance into silent
 * data loss. Android lets the user mute each channel independently, so they get
 * separate ones.
 *
 * Note the whole set still rides on a single POST_NOTIFICATIONS grant: denying
 * that takes out all three at once.
 */
final class CaptureNotifications {

    /** Per-transaction "tap to review". The primary path. */
    static final String CHANNEL_CAPTURED = "advanzia_captured";
    /** Guard 1: unconfirmed items nagging for attention. Safe to mute. */
    static final String CHANNEL_REMINDERS = "advanzia_reminders";
    /** Guard 2: capture may be broken. Rare, important, must survive muting the nags. */
    static final String CHANNEL_HEALTH = "advanzia_health";

    static final String DEEP_LINK_SCHEME = "cashflow";
    static final String DEEP_LINK_HOST = "review";

    private static final int NAG_NOTIFICATION_ID = 91_001;
    private static final int HEALTH_NOTIFICATION_ID = 91_002;

    private CaptureNotifications() {}

    static void ensureChannels(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;

        NotificationChannel captured = new NotificationChannel(
                CHANNEL_CAPTURED, "Transaction captured", NotificationManager.IMPORTANCE_DEFAULT);
        captured.setDescription("A card transaction was captured and is waiting for you to confirm it.");

        NotificationChannel reminders = new NotificationChannel(
                CHANNEL_REMINDERS, "Reminders", NotificationManager.IMPORTANCE_LOW);
        reminders.setDescription("Nudges about captured transactions you have not confirmed yet.");

        NotificationChannel health = new NotificationChannel(
                CHANNEL_HEALTH, "Capture health", NotificationManager.IMPORTANCE_HIGH);
        health.setDescription("Warnings that transaction capture may have stopped working.");

        manager.createNotificationChannel(captured);
        manager.createNotificationChannel(reminders);
        manager.createNotificationChannel(health);
    }

    /**
     * Opens MainActivity on the review sheet for one capture.
     *
     * A custom scheme rather than an App Link: App Links need a verified
     * assetlinks.json on a web host, which is ceremony a sideloaded personal app
     * does not need. The URI rides Capacitor's built-in appUrlOpen event, so no
     * custom plugin event is involved in the tap path.
     *
     * The notification key contains '|' and ':', so it goes in as an encoded
     * query parameter rather than a path segment.
     */
    private static PendingIntent reviewIntent(Context context, String captureKey) {
        Uri.Builder uri = new Uri.Builder().scheme(DEEP_LINK_SCHEME).authority(DEEP_LINK_HOST);
        if (captureKey != null) uri.appendQueryParameter("key", captureKey);

        Intent intent = new Intent(Intent.ACTION_VIEW, uri.build(), context, MainActivity.class);
        // MainActivity is singleTask, so a repeat tap routes through onNewIntent
        // on the existing instance instead of stacking a second copy.
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        return PendingIntent.getActivity(
                context,
                captureKey == null ? 0 : captureKey.hashCode(),
                intent,
                // Mandatory from API 31; available since 23, so no version branch.
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static void post(Context context, int id, Notification notification) {
        // Silently dropped by the OS without POST_NOTIFICATIONS on API 33+. The
        // queue is written first regardless, so a denied permission costs the
        // nudge, never the capture itself.
        NotificationManagerCompat.from(context).notify(id, notification);
    }

    static void postCaptured(Context context, String captureKey, String summary) {
        ensureChannels(context);
        Notification notification = new NotificationCompat.Builder(context, CHANNEL_CAPTURED)
                .setSmallIcon(android.R.drawable.ic_menu_save)
                .setContentTitle("New expense captured")
                .setContentText(summary)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(summary))
                .setContentIntent(reviewIntent(context, captureKey))
                .setAutoCancel(true)
                .build();
        post(context, captureKey.hashCode(), notification);
    }

    static void postNag(Context context, int unconfirmedCount) {
        ensureChannels(context);
        String text = unconfirmedCount == 1
                ? "1 captured transaction is still unconfirmed."
                : unconfirmedCount + " captured transactions are still unconfirmed.";
        Notification notification = new NotificationCompat.Builder(context, CHANNEL_REMINDERS)
                .setSmallIcon(android.R.drawable.ic_menu_recent_history)
                .setContentTitle("Unconfirmed expenses")
                .setContentText(text)
                .setContentIntent(reviewIntent(context, null))
                .setAutoCancel(true)
                .build();
        post(context, NAG_NOTIFICATION_ID, notification);
    }

    /**
     * Guard 2. An Advanzia notification quoted a euro amount but did not pass
     * the title gate — which is what a renamed title looks like from here, and
     * would otherwise stop capture with no symptom at all.
     */
    static void postCaptureHealthWarning(Context context, String captureKey) {
        ensureChannels(context);
        String text = "An Advanzia notification looked like a transaction but wasn't recognised. "
                + "Capture may need updating.";
        Notification notification = new NotificationCompat.Builder(context, CHANNEL_HEALTH)
                .setSmallIcon(android.R.drawable.stat_sys_warning)
                .setContentTitle("Capture may be broken")
                .setContentText(text)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
                .setContentIntent(reviewIntent(context, captureKey))
                .setAutoCancel(true)
                .build();
        post(context, HEALTH_NOTIFICATION_ID, notification);
    }
}
