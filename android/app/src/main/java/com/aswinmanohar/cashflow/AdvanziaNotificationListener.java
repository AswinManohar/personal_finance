package com.aswinmanohar.cashflow;

import android.app.Notification;
import android.content.ComponentName;
import android.os.Build;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import java.util.regex.Pattern;

/**
 * Watches Advanzia's notifications and queues the ones that look like card
 * transactions.
 *
 * Bound by the system once the user grants notification access, which is what
 * lets it work at all: notifications arrive while Cashflow is not running, and
 * because the *system* initiates the bind, Android starts the process to deliver
 * them rather than the background-start limits blocking it.
 *
 * This class is deliberately stupid. It applies three cheap checks — the
 * package, the group-summary flag, and the title — then writes the raw text to
 * {@link CaptureStore}. All real parsing, guessing and UX lives in TypeScript
 * (utils/advanziaNotification.ts), because that code is testable and this one
 * effectively is not.
 *
 * Ground truth for the checks below came from `dumpsys notification --noredact`
 * on the device; see .scratch/advanzia-notification-capture/issues/02-*.
 */
public class AdvanziaNotificationListener extends NotificationListenerService {

    private static final String ADVANZIA_PACKAGE = "com.advanzia.mobile";

    /** Every captured transaction carried exactly this title. */
    private static final String TRANSACTION_TITLE = "Kartentransaktion";

    /**
     * Guard 2's tell, mirrored from looksTransactional() in
     * utils/advanziaNotification.ts. Kept in step with it by hand — this copy
     * exists only because the check has to run while the WebView is dead.
     */
    private static final Pattern EURO_AMOUNT =
            Pattern.compile("\\d+,\\d{2}\\s*€|€\\s*\\d+,\\d{2}");

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null || !ADVANZIA_PACKAGE.equals(sbn.getPackageName())) return;

        Notification notification = sbn.getNotification();
        if (notification == null) return;

        // Android auto-groups an app's notifications once there are enough of
        // them and synthesises a summary under the app's own package. That
        // summary carries no title and no text at all, so without this it would
        // land in the inbox as a bogus unparsed item every time.
        if ((notification.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return;

        Bundle extras = notification.extras;
        if (extras == null) return;

        String title = string(extras, Notification.EXTRA_TITLE);
        // bigText is the untruncated payload; text is identical in every
        // captured sample but is kept as a fallback in case that ever changes.
        String body = string(extras, Notification.EXTRA_BIG_TEXT);
        if (body.isEmpty()) body = string(extras, Notification.EXTRA_TEXT);
        if (body.isEmpty()) return;

        String key = sbn.getKey();
        long postedAt = sbn.getPostTime();

        if (TRANSACTION_TITLE.equals(title)) {
            if (CaptureStore.append(this, key, CaptureStore.GATE_TRANSACTION, title, body, postedAt)) {
                CaptureNotifications.postCaptured(this, key, body);
                CaptureNagScheduler.scheduleNag(this);
            }
            return;
        }

        // Failed the title gate but quotes a euro amount: this is what a renamed
        // title looks like from in here, and the reason capture would otherwise
        // stop with no symptom. Queue it and say so.
        if (EURO_AMOUNT.matcher(body).find()) {
            if (CaptureStore.append(this, key, CaptureStore.GATE_SUSPICIOUS, title, body, postedAt)) {
                CaptureNotifications.postCaptureHealthWarning(this, key);
            }
        }
        // Anything else — ordinary marketing — is dropped without a trace, on
        // purpose. An inbox that cries wolf is an inbox nobody reads.
    }

    @Override
    public void onListenerConnected() {
        super.onListenerConnected();
        CaptureNotifications.ensureChannels(this);
    }

    @Override
    public void onListenerDisconnected() {
        super.onListenerDisconnected();
        // The only safe call once the binding drops. Listeners do get killed
        // under memory pressure and do not always come back on their own.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            requestRebind(new ComponentName(this, AdvanziaNotificationListener.class));
        }
    }

    private static String string(Bundle extras, String key) {
        CharSequence value = extras.getCharSequence(key);
        return value == null ? "" : value.toString().trim();
    }
}
