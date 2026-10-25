package com.runeditrun.easel;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.Manifest;
import android.content.pm.PackageManager;

/** FCM payloads are untrusted wake-up hints. No financial fields enter a notification or cached view. */
final class PushHandler {
    static final String CHANNEL = "easel-planning-updates";
    static final int NOTIFICATION = 7;
    static void receive(Context context) {
        Session session = ((EaselApplication) context.getApplicationContext()).session;
        if (!session.signedIn || !session.pushConsent) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        manager.createNotificationChannel(new NotificationChannel(CHANNEL, "Planning updates", NotificationManager.IMPORTANCE_DEFAULT));
        if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        Intent intent = new Intent(context, MainActivity.class).setAction("com.runeditrun.easel.OPEN_UPDATE")
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent click = PendingIntent.getActivity(context, 7, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        manager.notify(NOTIFICATION, new Notification.Builder(context, CHANNEL).setSmallIcon(android.R.drawable.ic_popup_reminder)
            .setContentTitle("Easel update").setContentText("Open Easel to review your latest planning updates.")
            .setVisibility(Notification.VISIBILITY_PRIVATE).setContentIntent(click).setAutoCancel(true).build());
    }
}
