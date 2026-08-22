package com.kepitravel.app;

import android.os.Bundle;
import android.webkit.WebSettings;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(KepiLocationPlugin.class);
        super.onCreate(savedInstanceState);

        // Capacitor's Bridge never sets these itself, so the WebView falls
        // back to Android's default "narrow viewport" behavior — it ignores
        // the page's own <meta name="viewport" content="width=device-width">
        // tag and renders as if it were a fixed-width desktop page, then
        // shrinks the whole thing to fit the screen. That's the "everything
        // is tiny" symptom. iOS's WKWebView doesn't have this default, which
        // is why the same site looked correct there without any change.
        WebSettings settings = getBridge().getWebView().getSettings();
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
    }
}
