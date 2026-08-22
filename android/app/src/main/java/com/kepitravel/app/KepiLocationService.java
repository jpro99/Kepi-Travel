package com.kepitravel.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.Location;
import android.os.Build;
import android.os.IBinder;
import android.os.Looper;

import androidx.annotation.Nullable;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Always + Precise family GPS, Android side. Mirrors KepiAlwaysLocation.swift
 * exactly: same 20m distance filter, same 15s/8s cooldown windows, same POST
 * body shape ({lat, lon, accuracy}) to the same /api/family/native-location
 * endpoint with the same bearer token. Runs as a foreground service —
 * required by Android to keep receiving location updates once the app is
 * backgrounded or the screen locks; a plain JS/WebView watch cannot do this.
 */
public class KepiLocationService extends Service {
    private static final String CHANNEL_ID = "kepi_location_channel";
    private static final int NOTIFICATION_ID = 4821;
    /** Reject fixes worse than this — matches the iOS accuracy gate. */
    private static final float MAX_ACCEPTABLE_ACCURACY_M = 65f;
    private static final float MIN_MOVE_METERS = 20f;
    private static final long MOVE_COOLDOWN_MS = 15_000L;
    private static final long FIRST_POST_COOLDOWN_MS = 8_000L;

    private FusedLocationProviderClient fusedClient;
    private LocationCallback locationCallback;
    private ExecutorService network;

    private long lastPostedAtMs = 0L;
    private Location lastPosted;

    @Override
    public void onCreate() {
        super.onCreate();
        fusedClient = LocationServices.getFusedLocationProviderClient(this);
        network = Executors.newSingleThreadExecutor();
        startForeground(NOTIFICATION_ID, buildNotification());
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        SharedPreferences prefs = getSharedPreferences(KepiLocationPlugin.PREFS_NAME, Context.MODE_PRIVATE);
        boolean enabled = prefs.getBoolean(KepiLocationPlugin.KEY_ENABLED, false);
        if (!enabled) {
            stopSelf();
            return START_NOT_STICKY;
        }
        beginLocationUpdates();
        // Ask Android to restart this service (without redelivering the
        // Intent) if the system kills it under memory pressure — mirrors
        // iOS's allowsBackgroundLocationUpdates persistence.
        return START_STICKY;
    }

    private void beginLocationUpdates() {
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                != PackageManager.PERMISSION_GRANTED) {
            stopSelf();
            return;
        }
        if (locationCallback != null) {
            // Already running (e.g. onStartCommand called again) — don't double-subscribe.
            return;
        }

        LocationRequest request = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, MOVE_COOLDOWN_MS)
            .setMinUpdateDistanceMeters(MIN_MOVE_METERS)
            .setWaitForAccurateLocation(false)
            .build();

        locationCallback = new LocationCallback() {
            @Override
            public void onLocationResult(LocationResult result) {
                Location location = result.getLastLocation();
                if (location != null) {
                    handleLocation(location);
                }
            }
        };

        fusedClient.requestLocationUpdates(request, locationCallback, Looper.getMainLooper());
    }

    private void handleLocation(Location location) {
        if (!location.hasAccuracy() || location.getAccuracy() <= 0 || location.getAccuracy() > MAX_ACCEPTABLE_ACCURACY_M) {
            return;
        }
        long now = System.currentTimeMillis();
        if (lastPosted != null) {
            float moved = location.distanceTo(lastPosted);
            if (moved < MIN_MOVE_METERS && now - lastPostedAtMs < MOVE_COOLDOWN_MS) {
                return;
            }
        } else if (now - lastPostedAtMs < FIRST_POST_COOLDOWN_MS) {
            return;
        }
        lastPosted = location;
        lastPostedAtMs = now;
        post(location);
    }

    private void post(Location location) {
        SharedPreferences prefs = getSharedPreferences(KepiLocationPlugin.PREFS_NAME, Context.MODE_PRIVATE);
        if (!prefs.getBoolean(KepiLocationPlugin.KEY_ENABLED, false)) {
            return;
        }
        String token = prefs.getString(KepiLocationPlugin.KEY_TOKEN, null);
        String urlString = prefs.getString(KepiLocationPlugin.KEY_URL, null);
        if (token == null || urlString == null) {
            return;
        }

        double lat = location.getLatitude();
        double lon = location.getLongitude();
        float accuracy = location.getAccuracy();

        network.execute(() -> {
            HttpURLConnection conn = null;
            try {
                JSONObject body = new JSONObject();
                body.put("lat", lat);
                body.put("lon", lon);
                body.put("accuracy", accuracy);

                URL url = new URL(urlString);
                conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Authorization", "Bearer " + token);
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setDoOutput(true);
                conn.setConnectTimeout(15_000);
                conn.setReadTimeout(15_000);
                try (OutputStream out = conn.getOutputStream()) {
                    out.write(body.toString().getBytes(StandardCharsets.UTF_8));
                }
                conn.getResponseCode(); // drain the response; fire-and-forget like the iOS side
            } catch (Exception ignored) {
                // Best-effort — no retry, matching iOS's fire-and-forget URLSession.dataTask.
            } finally {
                if (conn != null) {
                    conn.disconnect();
                }
            }
        });
    }

    private Notification buildNotification() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = getSystemService(NotificationManager.class);
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Kepi journey location",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Active while journey check-ins or family location sharing is on.");
            manager.createNotificationChannel(channel);
        }
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Kepi Travel")
            .setContentText("Watching your location for journey check-ins / family sharing")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();
    }

    @Override
    public void onDestroy() {
        if (fusedClient != null && locationCallback != null) {
            fusedClient.removeLocationUpdates(locationCallback);
        }
        locationCallback = null;
        if (network != null) {
            network.shutdown();
        }
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
