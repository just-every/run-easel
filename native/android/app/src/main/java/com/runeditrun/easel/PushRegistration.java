package com.runeditrun.easel;

import android.Manifest;
import android.app.NotificationManager;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.widget.TextView;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.installations.FirebaseInstallations;
import com.google.firebase.messaging.FirebaseMessaging;

final class PushRegistration {
    final MainActivity activity;
    interface TokenIssuer {
        boolean ready(Context context);
        void request(java.util.function.Consumer<String> success, Runnable failed);
    }
    final TokenIssuer issuer;
    PushRegistration(MainActivity activity) {
        this(activity, new TokenIssuer() {
            public boolean ready(Context context) { return configured(context); }
            public void request(java.util.function.Consumer<String> success, Runnable failed) {
                FirebaseMessaging.getInstance().setAutoInitEnabled(true);
                FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
                    if (task.isSuccessful()) success.accept(task.getResult()); else failed.run();
                });
            }
        });
    }
    PushRegistration(MainActivity activity, TokenIssuer issuer) { this.activity = activity; this.issuer = issuer; }
    static boolean configured(Context context) {
        if (BuildConfig.FIREBASE_APP_ID.isEmpty() || BuildConfig.FIREBASE_API_KEY.isEmpty()
            || BuildConfig.FIREBASE_PROJECT_ID.isEmpty() || BuildConfig.FIREBASE_SENDER_ID.isEmpty()) return false;
        if (FirebaseApp.getApps(context).isEmpty()) FirebaseApp.initializeApp(context, new FirebaseOptions.Builder()
            .setApplicationId(BuildConfig.FIREBASE_APP_ID).setApiKey(BuildConfig.FIREBASE_API_KEY)
            .setProjectId(BuildConfig.FIREBASE_PROJECT_ID).setGcmSenderId(BuildConfig.FIREBASE_SENDER_ID).build());
        return true;
    }
    void status(String message) {
        TextView view = activity.root.findViewWithTag("push-status"); if (view != null) view.setText(message);
    }
    void requestConsent() {
        if (!issuer.ready(activity)) { status("Push delivery is not configured for this installation."); return; }
        if (Build.VERSION.SDK_INT >= 33 && activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            activity.requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS }, 12); return;
        }
        enable();
    }
    void enable() {
        if (!activity.session.signedIn || !issuer.ready(activity)) return;
        activity.session.pushConsent = true;
        status("Registering push notifications…");
        issuer.request(token -> {
            if (!activity.session.signedIn || !activity.session.pushConsent) return;
            registerToken(token);
        }, () -> { disableAutoInit(); status("Push registration failed. Try enabling it again."); });
    }
    void registerToken(String token) {
        activity.request(() -> {
            try { return activity.api.post("/api/easel/mobile/devices/register", Api.object("platform", "android", "token", token, "consent", true)); }
            catch (Exception error) { disableAutoInit(); throw error; }
        },
            result -> {
                activity.session.deviceId = result.getString("id");
                status("Push enabled");
            });
    }
    void disableAutoInit() {
        activity.session.pushConsent = false;
        if (!FirebaseApp.getApps(activity).isEmpty()) FirebaseMessaging.getInstance().setAutoInitEnabled(false);
    }
    void revoke() {
        disableAutoInit();
        activity.request(() -> {
            if (!activity.session.deviceId.isEmpty()) activity.api.post("/api/easel/mobile/devices/revoke", Api.object("id", activity.session.deviceId));
            return new org.json.JSONObject();
        }, result -> { activity.session.deviceId = ""; clearLocal(); status("Push disabled"); });
    }
    void clearLocal() {
        disableAutoInit(); activity.getSystemService(NotificationManager.class).cancelAll();
        if (!FirebaseApp.getApps(activity).isEmpty()) {
            FirebaseMessaging.getInstance().deleteToken();
            FirebaseInstallations.getInstance().delete();
        }
    }
}
