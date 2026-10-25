package com.runeditrun.easel;

import android.app.AlertDialog;
import org.json.*;
import android.widget.Button;

/** The promote action closes over exactly the comparison returned by the server. */
final class ProposalReview {
    final MainActivity activity;
    ProposalReview(MainActivity activity) { this.activity = activity; }
    void open(JSONObject proposal) {
        activity.request(() -> activity.api.get("/api/easel/compare?a=" + Api.encode(proposal.getJSONObject("branchedFrom").getString("scenario"))
            + "&b=" + Api.encode(proposal.getString("id"))), comparison -> show(comparison));
    }
    void show(JSONObject comparison) throws Exception {
        activity.content.removeAllViews(); new Screens(activity).title("Review proposal");
        JSONObject left = comparison.getJSONObject("left"), right = comparison.getJSONObject("right");
        JSONObject target = left.getJSONObject("scenario"), proposal = right.getJSONObject("scenario");
        String currency = right.getJSONObject("workspace").getString("currency");
        NativeStyle.row(activity.content, proposal.getString("name"), target.getString("name") + " revision " + target.getLong("revision")
            + " → proposal revision " + proposal.getLong("revision"));
        String summary = proposal.optString("summary"); if (!summary.isEmpty()) NativeStyle.row(activity.content, "Reason", summary);
        JSONArray inputs = Screens.array(comparison, "changedInputs");
        NativeStyle.row(activity.content, "Changed inputs", inputs.length() + " reviewed changes");
        for (int i = 0; i < inputs.length(); i++) {
            JSONObject input = inputs.getJSONObject(i);
            NativeStyle.row(activity.content, input.optString("name", input.optString("kind")), input.optString("change") + " · " + input.optString("kind")
                + "\nBefore: " + readable(input.optJSONObject("before"), left, currency) + "\nAfter: " + readable(input.optJSONObject("after"), right, currency));
        }
        JSONArray cells = Screens.array(comparison, "changedCells");
        NativeStyle.row(activity.content, "Changed financial cells", cells.length() + " changed cells");
        for (int i = 0; i < cells.length(); i++) {
            JSONObject cell = cells.getJSONObject(i);
            NativeStyle.row(activity.content, cell.getString("month") + " · " + label(right, "lines", cell.getString("line")),
                label(right, "departments", cell.getString("department")) + "\n" + Screens.money(cell.opt("before"), left.getJSONObject("workspace").getString("currency"))
                + " → " + Screens.money(cell.opt("after"), currency) + " · Δ " + Screens.money(cell.opt("difference"), currency));
        }
        showCash(left, right, currency);
        boolean canApprove = activity.session.state != null && activity.session.state.getJSONObject("me").optString("role").equals("finance");
        if (canApprove) {
            Button approve = NativeStyle.button(activity, "Approve revision " + proposal.getLong("revision"), "approve-proposal", () -> {
                AlertDialog dialog = new AlertDialog.Builder(activity).setTitle("Promote reviewed proposal?")
                    .setMessage("Apply revision " + proposal.optLong("revision") + " of “" + proposal.optString("name") + "” to “" + target.optString("name") + "”?")
                    .setNegativeButton("Keep reviewing", null).setPositiveButton("Approve", (d, which) ->
                        activity.request(() -> activity.api.post("/api/easel/command/proposal-promote", Api.object("id", proposal.getString("id"),
                            "revision", proposal.getLong("revision"))), result -> activity.showTab("Approvals"))).create();
                dialog.show(); dialog.getButton(AlertDialog.BUTTON_POSITIVE).setTag("confirm-approval");
            }); activity.content.addView(approve);
        }
    }
    void showCash(JSONObject left, JSONObject right, String currency) throws Exception {
        JSONArray before = Screens.array(left, "cash"), after = Screens.array(right, "cash");
        NativeStyle.row(activity.content, "Cash comparison", "Closing cash by month");
        for (int i = 0; i < after.length(); i++) {
            JSONObject row = after.getJSONObject(i); Object previous = null;
            for (int j = 0; j < before.length(); j++) if (before.getJSONObject(j).optString("month").equals(row.getString("month"))) previous = before.getJSONObject(j).opt("closing");
            NativeStyle.row(activity.content, row.getString("month"), Screens.money(previous, left.getJSONObject("workspace").getString("currency")) + " → " + Screens.money(row.opt("closing"), currency));
        }
    }
    static String label(JSONObject side, String key, String id) throws Exception {
        JSONArray choices = Screens.array(side, key);
        for (int i = 0; i < choices.length(); i++) if (choices.getJSONObject(i).getString("id").equals(id)) return choices.getJSONObject(i).getString("name");
        return id;
    }
    static String readable(JSONObject input, JSONObject side, String currency) throws Exception {
        if (input == null) return "—";
        StringBuilder result = new StringBuilder();
        java.util.Iterator<String> keys = input.keys();
        while (keys.hasNext()) {
            String key = keys.next(); if (key.equals("id") || key.equals("scenario") || key.equals("originId")) continue;
            Object value = input.get(key);
            if (value instanceof JSONObject && ((JSONObject) value).length() == 0) continue;
            String title = key.replaceAll("([a-z])([A-Z])", "$1 $2");
            if (key.equals("line") || key.equals("department")) value = label(side, key.equals("line") ? "lines" : "departments", String.valueOf(value));
            if (key.endsWith("Cents")) { title = title.replace(" Cents", ""); value = Screens.money(value, currency); }
            if (String.valueOf(value).isEmpty()) value = "None";
            if (result.length() > 0) result.append(" · ");
            result.append(Character.toUpperCase(title.charAt(0))).append(title.substring(1)).append(": ").append(value);
        }
        return result.toString();
    }
}
