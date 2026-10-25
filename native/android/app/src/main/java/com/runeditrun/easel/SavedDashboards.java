package com.runeditrun.easel;

import android.widget.LinearLayout;
import org.json.*;
import java.math.BigDecimal;

final class SavedDashboards {
    final MainActivity activity;
    final LinearLayout body;
    SavedDashboards(MainActivity activity, LinearLayout body) { this.activity = activity; this.body = body; }
    interface Done { void run() throws Exception; }
    void load(Done done) {
        activity.request(() -> activity.api.get("/api/easel/dashboards"), list -> {
            JSONArray dashboards = Screens.array(list, "items");
            loadNext(dashboards, 0, done);
        });
    }
    void loadNext(JSONArray dashboards, int index, Done done) throws Exception {
        if (index >= dashboards.length()) { done.run(); return; }
        JSONObject definition = dashboards.getJSONObject(index);
        activity.request(() -> activity.api.get("/api/easel/dashboards/" + Api.encode(definition.getString("id"))), view -> {
            NativeStyle.row(body, view.getJSONObject("dashboard").getString("name"), view.optString("scenarioName") + " · " + view.optString("departmentName"));
            String currency = view.getString("currency"); JSONArray rows = Screens.array(view, "rows"), widgets = Screens.array(view, "widgets");
            if (!view.isNull("blocked")) NativeStyle.row(body, "Dashboard unavailable", view.optString("blocked"));
            for (int i = 0; i < rows.length(); i++) {
                JSONObject row = rows.getJSONObject(i); StringBuilder detail = new StringBuilder();
                for (int j = 0; j < widgets.length(); j++) {
                    String metric = widgets.getJSONObject(j).getString("metric");
                    if (j > 0) detail.append("\n"); detail.append(label(metric)).append(": ").append(format(metric, row.opt(metric), currency));
                }
                NativeStyle.row(body, row.getString("month"), detail.toString());
            }
            loadNext(dashboards, index + 1, done);
        });
    }
    static String label(String metric) {
        switch (metric) {
            case "revenue": return "Revenue";
            case "grossMargin": return "Gross margin";
            case "headcount": return "Headcount";
            case "arr": return "ARR";
            case "burn": return "Net burn";
            case "runway": return "Runway";
            default: return "Closing cash";
        }
    }
    static String format(String metric, Object value, String currency) {
        if (value == null || value == JSONObject.NULL) return "Unavailable";
        if (metric.equals("headcount")) return new BigDecimal(value.toString()).stripTrailingZeros().toPlainString() + " people";
        if (metric.equals("runway")) return new BigDecimal(value.toString()).movePointLeft(2).stripTrailingZeros().toPlainString() + " months";
        return Screens.money(value, currency);
    }
}
