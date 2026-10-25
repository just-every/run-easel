package com.runeditrun.easel;

import android.app.*;
import android.content.*;
import android.graphics.Bitmap;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.widget.*;
import com.google.firebase.messaging.RemoteMessage;
import org.json.*;
import java.io.*;
import java.util.*;

/** One public-door journey; the only fake is the paid FCM network edge. No fake receiver is exported. */
public final class NativeJourney extends Instrumentation {
    Bundle arguments;
    MainActivity activity;
    String evidence;
    interface Check { boolean ready() throws Exception; }
    @Override public void onCreate(Bundle args) { super.onCreate(args); arguments = args; start(); }
    @Override public void onStart() {
        Bundle result = new Bundle();
        try {
            journey(); result.putString("stream", "Native Android journey passed.\n"); finish(Activity.RESULT_OK, result);
        } catch (Throwable failure) {
            try { if (activity != null) snapshot("Failed"); } catch (Exception ignored) { }
            result.putString("stream", "Native Android journey failed: " + failure.getClass().getSimpleName() + ": " + failure.getMessage() + "\n");
            finish(Activity.RESULT_CANCELED, result);
        }
    }
    String required(String key) {
        String value = arguments.getString(key, ""); if (value.isEmpty()) throw new AssertionError("Missing instrumentation argument: " + key); return value;
    }
    void journey() throws Exception {
        evidence = arguments.getString("screenshots", new File(getTargetContext().getExternalFilesDir(null), "evidence").getPath());
        Intent launch = new Intent(getTargetContext(), MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        activity = (MainActivity) startActivitySync(launch);
        runOnMainSync(() -> activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE));
        snapshot("SignIn");
        set("installation", required("origin")); set("confirmation", required("token")); tap("sign-in");
        waitFor(() -> activity.session.signedIn && !activity.busy && find("dashboard-scenario") != null);
        if (!containsText(activity.root, "Larch Labs") || !containsText(activity.root, "Board operating outlook")) throw new AssertionError("Saved dashboard was not rendered");
        snapshot("Dashboard");
        for (String tab : new String[] {"Alerts", "Tasks", "Approvals", "Comments", "Settings"}) {
            tap("tab-" + tab); waitFor(() -> !activity.busy && find("screen-title") != null); assertNoError();
            if (tab.equals("Tasks") && !containsText(activity.root, "Review October outlook")) throw new AssertionError("Calendar task was not rendered");
            if (tab.equals("Comments") && !containsText(activity.root, "Please review the hiring plan.")) throw new AssertionError("Existing comment was not rendered");
            snapshot(tab);
        }
        // Replace only FCM token issuance, then use the person's actual consent control.
        runOnMainSync(() -> {
            activity.push = new PushRegistration(activity, new PushRegistration.TokenIssuer() {
                public boolean ready(Context context) { return true; }
                public void request(java.util.function.Consumer<String> success, Runnable failed) {
                    success.accept(arguments.getString("fakeDeviceToken", "synthetic-easel-2"));
                }
            });
        });
        tap("enable-push");
        waitFor(() -> !activity.busy && !activity.session.deviceId.isEmpty()); assertNoError();
        Bundle registered = new Bundle(); registered.putString("stream", "ANDROID_DEVICE_REGISTERED\n"); sendStatus(1, registered);
        // A harness may write the captured FCM message to this test-only file after the registration handshake.
        JSONObject envelope;
        java.net.HttpURLConnection edge = (java.net.HttpURLConnection) new java.net.URL(required("edgeOrigin") + "/push?platform=android").openConnection();
        edge.setConnectTimeout(15000); edge.setReadTimeout(60000);
        try (InputStream input = edge.getInputStream(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096]; int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            envelope = new JSONObject(output.toString("UTF-8"));
        } finally { edge.disconnect(); }
        JSONObject message = envelope.optJSONObject("message"); if (message == null) message = envelope;
        JSONObject data = message.optJSONObject("data"); if (data == null) data = message;
        Map<String, String> payload = new HashMap<>(); Iterator<String> keys = data.keys();
        while (keys.hasNext()) { String key = keys.next(); payload.put(key, data.getString(key)); }
        RemoteMessage push = new RemoteMessage.Builder("synthetic-easel-3").setMessageId("synthetic-easel-4").setData(payload).build();
        new TestDeliveryService(getTargetContext()).onMessageReceived(push);
        waitFor(() -> getTargetContext().getSystemService(NotificationManager.class).getActiveNotifications().length > 0);
        android.service.notification.StatusBarNotification notification = getTargetContext().getSystemService(NotificationManager.class).getActiveNotifications()[0];
        String displayed = String.valueOf(notification.getNotification().extras.getCharSequence(Notification.EXTRA_TITLE))
            + " " + String.valueOf(notification.getNotification().extras.getCharSequence(Notification.EXTRA_TEXT));
        for (String privateValue : new String[] {"Cash floor", "Larch Labs", "owner@example.test", "$", "200000"})
            if (displayed.contains(privateValue)) throw new AssertionError("Push exposed private planning data");
        notification.getNotification().contentIntent.send();
        waitFor(() -> activity.tab.equals("Alerts") && !activity.busy); assertNoError(); snapshot("Push");
        tap("tab-Approvals"); waitFor(() -> !activity.busy); tap("review-" + required("proposal"));
        waitFor(() -> !activity.busy && find("approve-proposal") != null); assertNoError(); snapshot("Review");
        tap("approve-proposal"); waitFor(() -> dialogButton() != null);
        Button confirmation = dialogButton(); runOnMainSync(() -> confirmation.performClick());
        waitFor(() -> !activity.busy && find("review-" + required("proposal")) == null && titleEquals("Approvals")); assertNoError();
        JSONObject state = activity.api.get("/api/easel/state"); boolean promoted = false;
        JSONArray scenarios = state.getJSONArray("scenarios");
        for (int i = 0; i < scenarios.length(); i++) {
            JSONObject scenario = scenarios.getJSONObject(i);
            if (scenario.getString("id").equals(required("proposal"))) promoted = scenario.optString("proposalStatus").equals("promoted");
        }
        if (!promoted) throw new AssertionError("The proposal was not promoted");
        snapshot("Approved");
        tap("tab-Comments"); waitFor(() -> !activity.busy && find("comment-text") != null);
        if (!arguments.getString("department", "").isEmpty()) chooseDepartment(arguments.getString("department"));
        String comment = arguments.getString("comment", "synthetic-easel-1"); set("comment-text", comment); tap("post-comment");
        waitFor(() -> !activity.busy && containsText(activity.content, comment)); assertNoError(); snapshot("CommentPosted");
        // A background transition must discard financial cache and the reviewed comparison UI.
        runOnMainSync(() -> { callActivityOnPause(activity); callActivityOnStop(activity); });
        if (activity.session.state != null || find("approve-proposal") != null) throw new AssertionError("Background retained financial cache");
        runOnMainSync(() -> { callActivityOnRestart(activity); callActivityOnStart(activity); callActivityOnResume(activity); });
        waitFor(() -> !activity.busy);
        tap("tab-Settings"); tap("sign-out"); waitFor(() -> !activity.busy && activity.session.isEmpty() && find("sign-in") != null);
        if (getTargetContext().getSystemService(NotificationManager.class).getActiveNotifications().length != 0) throw new AssertionError("Sign-out retained notifications");
        if (containsText(activity.root, comment)) throw new AssertionError("Sign-out retained comment text");
        assertNoFinancialStorage(); snapshot("SignedOut");
        set("installation", required("origin")); set("confirmation", required("viewerToken")); tap("sign-in");
        waitFor(() -> activity.session.signedIn && !activity.busy && find("dashboard-scenario") != null);
        JSONObject viewer = activity.session.state;
        if (!viewer.getJSONObject("me").getString("role").equals("viewer") || viewer.getJSONArray("comments").length() != 0 || viewer.getJSONArray("members").length() != 0)
            throw new AssertionError("Viewer retained another person's cached data");
        snapshot("ViewerDashboard");
        for (String tab : new String[] {"Comments", "Tasks", "Approvals"}) {
            tap("tab-" + tab); waitFor(() -> !activity.busy); assertNoError();
            if (find("approve-proposal") != null || find("post-comment") != null || containsText(activity.root, "Please review the hiring plan."))
                throw new AssertionError("Viewer has unauthorized native controls or records");
            snapshot("Viewer" + tab);
        }
        tap("tab-Settings"); tap("sign-out"); waitFor(() -> !activity.busy && activity.session.isEmpty());
        runOnMainSync(() -> activity.finish());
    }
    void chooseDepartment(String id) throws Exception {
        JSONArray departments = activity.session.state.getJSONArray("departments");
        for (int i = 0; i < departments.length(); i++) if (departments.getJSONObject(i).getString("id").equals(id)) {
            int selection = i; runOnMainSync(() -> ((Spinner) find("comment-department")).setSelection(selection)); return;
        }
        throw new AssertionError("Requested department is not visible");
    }
    boolean titleEquals(String expected) { View view = find("screen-title"); return view instanceof TextView && ((TextView) view).getText().toString().equals(expected); }
    View find(String tag) { return activity == null || activity.root == null ? null : activity.root.findViewWithTag(tag); }
    void set(String tag, String value) { runOnMainSync(() -> ((EditText) find(tag)).setText(value)); }
    void tap(String tag) { runOnMainSync(() -> { View view = find(tag); if (view == null) throw new AssertionError("Missing control: " + tag); view.performClick(); }); }
    void assertNoError() { if (find("error") != null) throw new AssertionError("Installation request failed on " + activity.tab); }
    Button dialogButton() {
        final Button[] button = {null};
        runOnMainSync(() -> {
            for (android.view.View view : android.view.inspector.WindowInspector.getGlobalWindowViews()) {
                View found = view.findViewWithTag("confirm-approval"); if (found instanceof Button) button[0] = (Button) found;
            }
        }); return button[0];
    }
    boolean containsText(View view, String text) {
        if (view instanceof TextView && ((TextView) view).getText().toString().equals(text)) return true;
        if (view instanceof android.view.ViewGroup) {
            android.view.ViewGroup group = (android.view.ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) if (containsText(group.getChildAt(i), text)) return true;
        } return false;
    }
    void assertNoFinancialStorage() {
        File data = getTargetContext().getFilesDir();
        String[] files = data.list(); if (files != null && files.length > 0) throw new AssertionError("App wrote persistent financial files");
        String[] databases = getTargetContext().databaseList(); if (databases.length > 0) throw new AssertionError("App wrote a database");
        File preferences = new File(getTargetContext().getApplicationInfo().dataDir, "shared_prefs");
        File[] stored = preferences.listFiles();
        if (stored != null) for (File file : stored) if (!file.getName().startsWith("com.google") && !file.getName().startsWith("Firebase"))
            throw new AssertionError("App wrote persistent preferences");
    }
    void snapshot(String name) throws Exception {
        waitForIdleSync();
        getUiAutomation().waitForIdle(500, 5000);
        Bitmap bitmap = getUiAutomation().takeScreenshot();
        if (bitmap == null) throw new AssertionError("Native screenshot was unavailable");
        if (bitmap.getWidth() != Integer.parseInt(required("width"))) throw new AssertionError("Native display width does not match the requested viewport");
        File directory = new File(evidence); if (!directory.isDirectory() && !directory.mkdirs()) throw new IOException("Cannot create evidence directory");
        File target = new File(directory, arguments.getString("width", "native") + "-" + name + ".png");
        try (FileOutputStream output = new FileOutputStream(target)) { bitmap.compress(Bitmap.CompressFormat.PNG, 100, output); }
        bitmap.recycle();
    }
    void waitFor(Check check) throws Exception {
        long deadline = android.os.SystemClock.uptimeMillis() + 60000;
        while (!check.ready()) {
            if (android.os.SystemClock.uptimeMillis() > deadline) {
                View error = find("error");
                throw new AssertionError("Timed out on native screen " + activity.tab + (error instanceof TextView ? ": " + ((TextView) error).getText() : ""));
            }
            android.os.SystemClock.sleep(100);
        }
        waitForIdleSync();
    }
    static final class TestDeliveryService extends EaselMessagingService {
        final Context context;
        TestDeliveryService(Context context) { this.context = context; }
        @Override public Context getApplicationContext() { return context.getApplicationContext(); }
    }
}
