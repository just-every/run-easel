package com.runeditrun.easel;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

public class EaselMessagingService extends FirebaseMessagingService {
    @Override public void onMessageReceived(RemoteMessage message) {
        // Never display provider-supplied titles or bodies, navigate provider URLs or trust cached authority.
        PushHandler.receive(getApplicationContext());
    }
    @Override public void onNewToken(String token) {
        EaselApplication application = (EaselApplication) getApplication();
        Session session = application.session;
        if (!session.signedIn || !session.pushConsent) return;
        // Firebase calls this on a worker thread. Registration is scoped to the current native session.
        try {
            org.json.JSONObject registered = new Api(session).post("/api/easel/mobile/devices/register",
                Api.object("platform", "android", "token", token, "consent", true));
            session.deviceId = registered.getString("id");
        } catch (Exception error) {
            // No invented successful registration and no blind mutation retry.
            session.pushConsent = false;
            com.google.firebase.messaging.FirebaseMessaging.getInstance().setAutoInitEnabled(false);
        }
    }
}
