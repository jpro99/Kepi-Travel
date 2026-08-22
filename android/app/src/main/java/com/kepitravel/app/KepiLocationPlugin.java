package com.kepitravel.app;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.getcapacitor.PermissionState;

/**
 * Always + Precise family GPS, Android side. Mirrors the iOS pair
 * (KepiLocationBridge.swift + KepiAlwaysLocation.swift): the web page hands
 * this plugin a bearer token + URL via {@code Capacitor.Plugins.KepiLocation},
 * and Android keeps posting location from a foreground service after the
 * app is backgrounded or the screen locks — the JS-only web/PWA path cannot
 * do this at all.
 */
@CapacitorPlugin(
    name = "KepiLocation",
    permissions = {
        @Permission(
            strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION },
            alias = "location"
        ),
        @Permission(strings = { Manifest.permission.ACCESS_BACKGROUND_LOCATION }, alias = "backgroundLocation"),
    }
)
public class KepiLocationPlugin extends Plugin {
    static final String PREFS_NAME = "KepiAlwaysLocation";
    static final String KEY_TOKEN = "token";
    static final String KEY_URL = "url";
    static final String KEY_ENABLED = "enabled";

    @PluginMethod
    public void start(PluginCall call) {
        String token = call.getString("token");
        String url = call.getString("url", "https://kepitravel.com/api/family/native-location");
        if (token == null || token.isEmpty()) {
            call.reject("Missing token");
            return;
        }

        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putString(KEY_TOKEN, token).putString(KEY_URL, url).putBoolean(KEY_ENABLED, true).apply();

        if (getPermissionState("location") != PermissionState.GRANTED) {
            requestPermissionForAlias("location", call, "onForegroundLocationPermission");
            return;
        }
        continueAfterForegroundPermission(call);
    }

    @PermissionCallback
    private void onForegroundLocationPermission(PluginCall call) {
        if (getPermissionState("location") != PermissionState.GRANTED) {
            call.reject("Location permission denied");
            return;
        }
        continueAfterForegroundPermission(call);
    }

    private void continueAfterForegroundPermission(PluginCall call) {
        // Background location is a SEPARATE, second system dialog on Android
        // 10+ (must be requested after foreground is already granted — the
        // OS refuses to show both at once). Proceed either way: foreground-
        // only tracking while the app is open is still strictly better than
        // nothing, matching this feature's "best effort" framing.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && getPermissionState("backgroundLocation") != PermissionState.GRANTED) {
            requestPermissionForAlias("backgroundLocation", call, "onBackgroundLocationPermission");
            return;
        }
        startTrackingService();
        call.resolve();
    }

    @PermissionCallback
    private void onBackgroundLocationPermission(PluginCall call) {
        startTrackingService();
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putBoolean(KEY_ENABLED, false).apply();
        getContext().stopService(new Intent(getContext(), KepiLocationService.class));
        call.resolve();
    }

    private void startTrackingService() {
        Intent intent = new Intent(getContext(), KepiLocationService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(intent);
        } else {
            getContext().startService(intent);
        }
    }
}
