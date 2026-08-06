package com.aswinmanohar.cashflow;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /**
     * Local plugins are not auto-discovered the way npm ones are — without this
     * line the WebView's AdvanziaCapture calls fail at runtime with "plugin not
     * implemented", and nothing in the build warns about it.
     *
     * Must come before super.onCreate(), which is where the Bridge is built.
     */
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AdvanziaCapturePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
