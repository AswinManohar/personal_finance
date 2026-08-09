package com.aswinmanohar.cashflow;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;

/**
 * Guard 1: a single nudge, four hours after a capture, if it is still
 * unconfirmed.
 *
 * Four hours is long enough that the errand is over and you have plausibly had a
 * chance to act, short enough to still catch it the same day. It fires once per
 * scheduling rather than repeating — the inbox is the durable record; this is
 * only a nudge.
 *
 * The alarm is inexact on purpose. Exact alarms need SCHEDULE_EXACT_ALARM on
 * Android 12+, which is a lot of permission to spend on a reminder that does not
 * care about minutes.
 */
final class CaptureNagScheduler {

    private static final long NAG_DELAY_MS = 4 * 60 * 60 * 1000L;
    private static final int REQUEST_CODE = 92_001;

    private CaptureNagScheduler() {}

    private static PendingIntent pendingIntent(Context context) {
        Intent intent = new Intent(context, CaptureNagReceiver.class);
        return PendingIntent.getBroadcast(
                context, REQUEST_CODE, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /**
     * Schedules (or reschedules) the nudge. A fresh capture pushes the alarm out
     * again, so a burst of shopping produces one reminder rather than a stream.
     */
    static void scheduleNag(Context context) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return;
        alarms.setAndAllowWhileIdle(
                AlarmManager.RTC_WAKEUP,
                System.currentTimeMillis() + NAG_DELAY_MS,
                pendingIntent(context));
    }

    static void cancelNag(Context context) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms != null) alarms.cancel(pendingIntent(context));
    }
}
