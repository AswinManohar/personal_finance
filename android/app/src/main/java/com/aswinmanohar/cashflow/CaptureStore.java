package com.aswinmanohar.cashflow;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.List;

/**
 * The hand-off point between the notification listener and the WebView.
 *
 * A JSON array in its own SharedPreferences file. Deliberately not Room or
 * SQLite: this is an append-then-drain queue of a handful of items a day, and
 * keeping it dumb means no schema, no migrations, and no query logic in the
 * native layer.
 *
 * Using a file as the boundary also decouples the two sides. The listener is
 * started by the system and can write while the Activity, the Bridge and the
 * plugin instance do not exist — which is the normal case, since notifications
 * arrive while the app is dead. The plugin just reads whatever accumulated the
 * next time it is asked.
 *
 * Every mutation is synchronized on {@link #LOCK}: onNotificationPosted can
 * fire back-to-back, and the read-modify-write below is not atomic.
 */
final class CaptureStore {

    private static final String PREFS = "advanzia_pending_queue";
    private static final String KEY_QUEUE = "queue";
    private static final String KEY_LAST_CAPTURE_AT = "lastCaptureAt";
    private static final String KEY_LAST_SUSPICIOUS_AT = "lastSuspiciousAt";

    /** Queued because the title gate recognised it as a card transaction. */
    static final String GATE_TRANSACTION = "transaction";
    /**
     * Queued because it quoted a euro amount but did NOT pass the title gate —
     * the tell that Advanzia may have renamed the title and capture is silently
     * broken. See Guard 2 in the parsing spec.
     */
    static final String GATE_SUSPICIOUS = "suspicious";

    private static final Object LOCK = new Object();

    private CaptureStore() {}

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static JSONArray readQueue(SharedPreferences prefs) {
        String raw = prefs.getString(KEY_QUEUE, "[]");
        try {
            return new JSONArray(raw);
        } catch (JSONException e) {
            // A corrupt queue must not wedge capture forever. Losing unconfirmed
            // items is bad; never capturing again is worse.
            return new JSONArray();
        }
    }

    /**
     * Appends unless the notification key is already queued.
     *
     * Key-level dedup only. The richer "have I already turned this into an
     * expense" check needs the handled-key set, which lives on the WebView side.
     *
     * @return true if the item was added.
     */
    static boolean append(Context context, String key, String gate, String title, String body, long postedAt) {
        synchronized (LOCK) {
            SharedPreferences prefs = prefs(context);
            JSONArray queue = readQueue(prefs);

            for (int i = 0; i < queue.length(); i++) {
                JSONObject existing = queue.optJSONObject(i);
                if (existing != null && key.equals(existing.optString("key"))) {
                    return false;
                }
            }

            try {
                JSONObject item = new JSONObject();
                item.put("key", key);
                item.put("gate", gate);
                item.put("title", title);
                item.put("body", body);
                item.put("postedAt", postedAt);
                queue.put(item);
            } catch (JSONException e) {
                return false;
            }

            SharedPreferences.Editor editor = prefs.edit().putString(KEY_QUEUE, queue.toString());
            if (GATE_TRANSACTION.equals(gate)) {
                editor.putLong(KEY_LAST_CAPTURE_AT, postedAt);
            } else {
                editor.putLong(KEY_LAST_SUSPICIOUS_AT, postedAt);
            }
            editor.apply();
            return true;
        }
    }

    static JSONArray all(Context context) {
        synchronized (LOCK) {
            return readQueue(prefs(context));
        }
    }

    /**
     * Drops the named keys. Called only once the WebView holds the items, so an
     * interrupted drain leaves them queued rather than losing them — the
     * duplicate that causes is caught by the handled-key set.
     */
    static void clear(Context context, List<String> keys) {
        synchronized (LOCK) {
            SharedPreferences prefs = prefs(context);
            JSONArray queue = readQueue(prefs);
            JSONArray kept = new JSONArray();

            for (int i = 0; i < queue.length(); i++) {
                JSONObject item = queue.optJSONObject(i);
                if (item != null && !keys.contains(item.optString("key"))) {
                    kept.put(item);
                }
            }

            prefs.edit().putString(KEY_QUEUE, kept.toString()).apply();
        }
    }

    /** Epoch ms of the last recognised transaction, or 0. Powers "capture is working". */
    static long lastCaptureAt(Context context) {
        return prefs(context).getLong(KEY_LAST_CAPTURE_AT, 0L);
    }

    /** Epoch ms of the last transaction-looking notification that failed the title gate, or 0. */
    static long lastSuspiciousAt(Context context) {
        return prefs(context).getLong(KEY_LAST_SUSPICIOUS_AT, 0L);
    }
}
