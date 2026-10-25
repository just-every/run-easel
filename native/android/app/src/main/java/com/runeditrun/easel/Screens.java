package com.runeditrun.easel;

import android.widget.*;
import org.json.*;
import java.math.BigDecimal;
import java.text.NumberFormat;
import java.util.*;

final class Screens {
    final MainActivity activity;
    final LinearLayout body;
    Screens(MainActivity activity) { this.activity = activity; body = activity.content; }
    static JSONArray array(JSONObject value, String key) { JSONArray found = value.optJSONArray(key); return found == null ? new JSONArray() : found; }
    static String money(Object cents, String currency) {
        if (cents == null || cents == JSONObject.NULL) return "Unavailable";
        try {
            NumberFormat format = NumberFormat.getCurrencyInstance(); format.setCurrency(Currency.getInstance(currency));
            return format.format(new BigDecimal(cents.toString()).movePointLeft(2));
        } catch (Exception e) { return new BigDecimal(cents.toString()).movePointLeft(2).toPlainString() + " " + currency; }
    }
    void title(String text) { body.addView(NativeStyle.tagged(NativeStyle.text(activity, text, 24), "screen-title")); }
    void render(String tab, JSONObject state) throws Exception {
        title(tab);
        if (tab.equals("Dashboard")) new SavedDashboards(activity, body).load(() -> dashboard(state));
        else if (tab.equals("Alerts")) activity.request(() -> activity.api.get("/api/easel/notifications"), value -> alerts(value));
        else if (tab.equals("Tasks")) tasks();
        else if (tab.equals("Approvals")) approvals(state);
        else if (tab.equals("Comments")) comments(state);
    }
    void dashboard(JSONObject state) throws Exception {
        JSONArray scenarios = array(state, "scenarios");
        List<JSONObject> choices = new ArrayList<>(); int selected = 0;
        for (int i = 0; i < scenarios.length(); i++) {
            JSONObject scenario = scenarios.getJSONObject(i);
            if (scenario.optString("kind").equals("proposal")) continue;
            choices.add(scenario);
            if (scenario.optString("kind").equals("forecast") && scenario.optString("status").equals("working")) selected = choices.size() - 1;
        }
        if (choices.isEmpty()) { NativeStyle.row(body, "No plans to review", "Create a plan in your installation."); return; }
        Spinner picker = picker(choices, "dashboard-scenario"); picker.setSelection(selected); body.addView(picker);
        LinearLayout summary = NativeStyle.column(activity); body.addView(summary);
        picker.setOnItemSelectedListener(new android.widget.AdapterView.OnItemSelectedListener() {
            public void onNothingSelected(android.widget.AdapterView<?> parent) { }
            public void onItemSelected(android.widget.AdapterView<?> parent, android.view.View view, int index, long id) {
                summary.removeAllViews();
                activity.request(() -> activity.api.get("/api/easel/scenario/" + Api.encode(choices.get(index).optString("id"))), value -> {
                    summary.removeAllViews(); JSONObject calculation = value.getJSONObject("calculation");
                    String currency = calculation.getString("currency");
                    NativeStyle.row(summary, value.getJSONObject("scenario").getString("name"), "Revision " + value.getJSONObject("scenario").getLong("revision") + " · " + currency);
                    JSONArray cash = array(calculation, "cash");
                    for (int i = 0; i < cash.length(); i++) {
                        JSONObject month = cash.getJSONObject(i);
                        String detail = "Opening " + money(month.opt("opening"), currency) + "\nCollections " + money(month.opt("collections"), currency)
                            + " · Payments " + money(month.opt("payments"), currency);
                        JSONArray reasons = array(month, "incompleteReasons");
                        if (reasons.length() > 0) detail += "\nIncomplete: " + reasons.join("; ");
                        NativeStyle.row(summary, month.getString("month") + " · Closing " + money(month.opt("closing"), currency), detail);
                    }
                    if (cash.length() == 0) NativeStyle.row(summary, "Cash summary unavailable", "This view has no visible cash periods.");
                });
            }
        });
    }
    void alerts(JSONObject value) throws Exception {
        JSONArray notifications = array(value, "notifications");
        if (notifications.length() == 0) NativeStyle.row(body, "You're up to date", "No alerts for your account.");
        for (int i = 0; i < notifications.length(); i++) {
            JSONObject item = notifications.getJSONObject(i);
            NativeStyle.row(body, item.optString("title", "Planning update"), item.optString("event") + " · " + item.optString("createdAt"));
        }
    }
    void tasks() {
        activity.request(() -> {
            java.util.concurrent.ExecutorService reads = java.util.concurrent.Executors.newFixedThreadPool(2);
            try {
                java.util.concurrent.Future<JSONObject> metrics = reads.submit(() -> activity.api.get("/api/easel/metric-tasks"));
                java.util.concurrent.Future<JSONObject> calendar = reads.submit(() -> activity.api.get("/api/easel/calendar"));
                JSONObject result = new JSONObject(); result.put("metrics", metrics.get()); result.put("calendar", calendar.get()); return result;
            } finally { reads.shutdownNow(); }
        }, result -> {
            JSONArray metrics = array(result.getJSONObject("metrics"), "tasks"), calendar = array(result.getJSONObject("calendar"), "tasks");
            if (metrics.length() + calendar.length() == 0) NativeStyle.row(body, "No assigned tasks", "Your work will appear here.");
            for (int i = 0; i < metrics.length(); i++) {
                JSONObject item = metrics.getJSONObject(i);
                NativeStyle.row(body, item.optString("name"), "Due " + item.optString("due") + " · " + item.optString("owner")
                    + "\n" + (item.optJSONObject("evidence") == null ? "" : item.optJSONObject("evidence").optString("summary")));
            }
            for (int i = 0; i < calendar.length(); i++) {
                JSONObject item = calendar.getJSONObject(i);
                NativeStyle.row(body, item.optString("name"), "Due " + item.optString("due") + " · " + array(item, "owners").join(", ")
                    + (item.optBoolean("open") ? "" : " · " + item.optString("doneLabel")));
            }
        });
    }
    void approvals(JSONObject state) throws Exception {
        JSONArray scenarios = array(state, "scenarios"); boolean found = false;
        for (int i = 0; i < scenarios.length(); i++) {
            JSONObject proposal = scenarios.getJSONObject(i);
            if (!proposal.optString("kind").equals("proposal") || !proposal.optString("proposalStatus").equals("submitted")) continue;
            found = true; NativeStyle.row(body, proposal.getString("name"), "Revision " + proposal.getLong("revision") + " · " + proposal.optString("summary"));
            body.addView(NativeStyle.button(activity, "Review comparison", "review-" + proposal.getString("id"), () -> new ProposalReview(activity).open(proposal)));
        }
        if (!found) NativeStyle.row(body, "No pending approvals", "Submitted proposals will appear here.");
    }
    void comments(JSONObject state) throws Exception {
        JSONArray comments = array(state, "comments");
        for (int i = 0; i < comments.length(); i++) {
            JSONObject comment = comments.getJSONObject(i);
            NativeStyle.row(body, comment.getString("text"), comment.optString("authorName", comment.optString("author")) + " · " + comment.optString("at"));
        }
        if (comments.length() == 0) NativeStyle.row(body, "Start the discussion", "Add a comment to a plan you can edit.");
        List<JSONObject> plans = new ArrayList<>(), departments = new ArrayList<>();
        JSONArray scenarios = array(state, "scenarios"), sourceDepartments = array(state, "departments"); JSONObject me = state.getJSONObject("me");
        for (int i = 0; i < scenarios.length(); i++) {
            JSONObject scenario = scenarios.getJSONObject(i);
            if (!scenario.optString("effectiveAccess").equals("read") && !scenario.optString("status").equals("closed")) plans.add(scenario);
        }
        for (int i = 0; i < sourceDepartments.length(); i++) {
            JSONObject department = sourceDepartments.getJSONObject(i);
            if (me.optString("role").equals("finance") || array(me, "departments").toString().contains("\"" + department.getString("id") + "\"")) departments.add(department);
        }
        if (plans.isEmpty() || departments.isEmpty()) return;
        body.addView(NativeStyle.text(activity, "Plan", 14)); Spinner plan = picker(plans, "comment-plan"); body.addView(plan);
        body.addView(NativeStyle.text(activity, "Department", 14)); Spinner department = picker(departments, "comment-department"); body.addView(department);
        EditText text = NativeStyle.field(activity, "Write a comment", "comment-text", false);
        text.setSingleLine(false); text.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE);
        body.addView(text);
        body.addView(NativeStyle.button(activity, "Post comment", "post-comment", () -> {
            String message = text.getText().toString();
            activity.request(() -> activity.api.post("/api/easel/command/comment", Api.object("scenario", plans.get(plan.getSelectedItemPosition()).getString("id"),
                "department", departments.get(department.getSelectedItemPosition()).getString("id"), "text", message)), result -> activity.showTab("Comments"));
        }));
    }
    Spinner picker(List<JSONObject> choices, String tag) {
        Spinner view = NativeStyle.tagged(new Spinner(activity), tag);
        List<String> names = new ArrayList<>(); for (JSONObject item : choices) names.add(item.optString("name"));
        ArrayAdapter<String> adapter = new ArrayAdapter<>(activity, android.R.layout.simple_spinner_dropdown_item, names);
        view.setAdapter(adapter); view.setMinimumHeight(NativeStyle.dp(activity, 48)); return view;
    }
    void settings() {
        title("Settings"); body.addView(NativeStyle.text(activity, activity.session.origin, 15));
        NativeStyle.row(body, "Push notifications", "Alerts, tasks, approvals and mentions. Notifications contain no plan details.");
        body.addView(NativeStyle.button(activity, "Enable push notifications", "enable-push", () -> activity.push.requestConsent()));
        body.addView(NativeStyle.button(activity, "Disable push notifications", "disable-push", () -> activity.push.revoke()));
        body.addView(NativeStyle.tagged(NativeStyle.text(activity, activity.session.pushConsent ? "Push enabled" : "Push disabled", 15), "push-status"));
        body.addView(NativeStyle.button(activity, "Sign out", "sign-out", () -> activity.signOut()));
    }
}
