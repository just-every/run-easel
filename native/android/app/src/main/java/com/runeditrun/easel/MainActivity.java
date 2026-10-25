package com.runeditrun.easel;

import android.app.Activity;
import android.os.Bundle;
import android.view.WindowManager;
import android.widget.*;
import org.json.JSONObject;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    Session session;
    Api api;
    final ExecutorService network = Executors.newSingleThreadExecutor();
    LinearLayout root, content;
    String tab = "Dashboard";
    volatile boolean busy;
    boolean foreground;
    int serial;
    PushRegistration push;
    interface Request { JSONObject run() throws Exception; }
    interface Result { void show(JSONObject value) throws Exception; }

    @Override public void onCreate(Bundle ignored) {
        super.onCreate(null);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        session = ((EaselApplication) getApplication()).session; api = new Api(session); push = new PushRegistration(this);
        if (session.signedIn) shell(); else signIn("");
    }
    @Override protected void onResume() {
        super.onResume(); foreground = true;
        if (session.signedIn) showTab(tab); else signIn("");
    }
    @Override protected void onStop() {
        foreground = false; serial++; busy = false; session.clearCache();
        // Discard every visible financial record and reviewed revision when backgrounded.
        if (session.signedIn) { shell(); content.addView(NativeStyle.text(this, "Refresh to continue.", 16)); }
        super.onStop();
    }
    @Override protected void onDestroy() { serial++; network.shutdownNow(); super.onDestroy(); }
    @Override protected void onNewIntent(android.content.Intent intent) {
        super.onNewIntent(intent); setIntent(intent);
        if (session.signedIn) { tab = "Alerts"; showTab(tab); }
        else signIn("Sign in to read the latest update.");
    }
    void base() {
        root = NativeStyle.column(this); root.setBackgroundColor(NativeStyle.PAPER);
        root.setPadding(0, NativeStyle.dp(this, 12), 0, 0); setContentView(root);
    }
    void signIn(String message) {
        base(); LinearLayout form = NativeStyle.column(this);
        form.addView(NativeStyle.text(this, "Easel", 30)); form.addView(NativeStyle.text(this, "Your plan, wherever you work.", 16));
        form.addView(NativeStyle.text(this, "Installation address", 14));
        EditText address = NativeStyle.field(this, "https://your-installation.example", "installation", false); form.addView(address);
        form.addView(NativeStyle.text(this, "Email address", 14));
        EditText email = NativeStyle.field(this, "Your email address", "email", false);
        email.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS); form.addView(email);
        form.addView(NativeStyle.button(this, "Email me a sign-in link", "request-link", () -> {
            String entered = address.getText().toString(), mailbox = email.getText().toString();
            request(() -> {
                session.origin = Session.installation(entered);
                return api.post("/auth/magic-link", Api.object("email", mailbox, "returnTo", "/app"));
            }, value -> form.addView(NativeStyle.text(this, "Check your email, then paste your sign-in link below.", 15)));
        }));
        form.addView(NativeStyle.text(this, "Email confirmation link", 14));
        EditText token = NativeStyle.field(this, "Paste your confirmation link", "confirmation", true); form.addView(token);
        form.addView(NativeStyle.button(this, "Sign in", "sign-in", () -> {
            String entered = address.getText().toString(), pasted = token.getText().toString(); token.setText("");
            session.wipe();
            request(() -> {
                session.origin = Session.installation(entered);
                api.post("/auth/confirm", Api.object("token", Session.confirmationToken(pasted, session.origin)));
                JSONObject state = api.get("/api/easel/state");
                if (!state.has("me") || state.optJSONObject("workspace") == null) throw new Api.Failure(403, "Your account needs access to this workspace.");
                return state;
            }, state -> { session.signedIn = true; session.state = state; shell(); showTab("Dashboard"); });
        }));
        if (!message.isEmpty()) form.addView(NativeStyle.tagged(NativeStyle.text(this, message, 15), "error"));
        ScrollView scroll = new ScrollView(this); scroll.setFillViewport(true); scroll.addView(form); root.addView(scroll);
    }
    void shell() {
        base(); LinearLayout heading = NativeStyle.column(this);
        heading.addView(NativeStyle.text(this, "Easel", 27));
        if (session.state != null && session.state.optJSONObject("workspace") != null)
            heading.addView(NativeStyle.text(this, session.state.optJSONObject("workspace").optString("name"), 15));
        root.addView(heading);
        // Two compact rows keep all six named destinations accessible at phone width.
        String[][] tabs = {{"Dashboard", "Alerts", "Tasks"}, {"Approvals", "Comments", "Settings"}};
        for (String[] names : tabs) {
            LinearLayout line = new LinearLayout(this);
            for (String name : names) {
                Button button = NativeStyle.button(this, name, "tab-" + name, () -> showTab(name));
                button.setSelected(name.equals(tab));
                if (name.equals(tab)) button.setBackgroundTintList(android.content.res.ColorStateList.valueOf(0xffdce5d9));
                line.addView(button, new LinearLayout.LayoutParams(0, -2, 1));
            }
            root.addView(line);
        }
        ScrollView scroll = new ScrollView(this); scroll.setFillViewport(true); content = NativeStyle.column(this);
        scroll.addView(content); root.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
    }
    void showTab(String name) {
        tab = name; shell();
        if (name.equals("Settings")) { new Screens(this).settings(); return; }
        request(() -> api.get("/api/easel/state"), state -> {
            if (state.optJSONObject("workspace") == null || state.optJSONObject("me") == null || state.getJSONObject("me").isNull("role"))
                throw new Api.Failure(401, "Your workspace access changed. Sign in again.");
            session.state = state; content.removeAllViews();
            new Screens(this).render(name, state);
        });
    }
    void request(Request work, Result result) {
        int ticket = ++serial; busy = true;
        network.execute(() -> {
            JSONObject value = null; Exception failure = null;
            try { value = work.run(); } catch (Exception error) { failure = error; }
            JSONObject response = value; Exception error = failure;
            runOnUiThread(() -> {
                if (ticket != serial || isFinishing() || !foreground) return;
                busy = false;
                if (error != null) { failed(error); return; }
                try { result.show(response); } catch (Exception problem) { failed(problem); }
            });
        });
    }
    void failed(Exception error) {
        session.clearCache();
        if (!session.signedIn || error instanceof Api.Failure && ((Api.Failure) error).status == 401) {
            session.wipe(); push.clearLocal(); signIn(error.getMessage()); return;
        }
        shell(); content.addView(NativeStyle.tagged(NativeStyle.text(this, error.getMessage(), 16), "error"));
        content.addView(NativeStyle.button(this, "Refresh", "refresh", () -> showTab(tab)));
    }
    void signOut() {
        push.disableAutoInit();
        request(() -> {
            Exception failure = null;
            try { if (!session.deviceId.isEmpty()) api.post("/api/easel/mobile/devices/revoke", Api.object("id", session.deviceId)); }
            catch (Exception error) { failure = error; }
            try { api.post("/auth/signout", new JSONObject()); }
            catch (Exception error) { failure = error; }
            finally { session.wipe(); runOnUiThread(() -> push.clearLocal()); }
            // Local erasure is unconditional even when the installation cannot be reached.
            return Api.object("revoked", failure == null);
        }, value -> {
            push.clearLocal(); signIn(value.optBoolean("revoked") ? "Signed out." : "Signed out on this device. Server revocation could not be confirmed.");
        });
    }
    @Override public void onRequestPermissionsResult(int code, String[] permissions, int[] grants) {
        super.onRequestPermissionsResult(code, permissions, grants);
        if (code == 12 && grants.length > 0 && grants[0] == android.content.pm.PackageManager.PERMISSION_GRANTED) push.enable();
    }
}
