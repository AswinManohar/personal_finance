package com.aswinmanohar.cashflow;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Fires Guard 1's nudge, if there is still anything to nudge about.
 *
 * Counts only queued items — once the WebView has drained and cleared them, an
 * alarm that survives finds nothing and stays quiet, so no cancellation
 * bookkeeping is needed on the confirm path.
 */
public class CaptureNagReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        JSONArray queue = CaptureStore.all(context);

        int unconfirmed = 0;
        for (int i = 0; i < queue.length(); i++) {
            JSONObject item = queue.optJSONObject(i);
            if (item != null && CaptureStore.GATE_TRANSACTION.equals(item.optString("gate"))) {
                unconfirmed++;
            }
        }

        if (unconfirmed > 0) {
            CaptureNotifications.postNag(context, unconfirmed);
        }
    }
}
