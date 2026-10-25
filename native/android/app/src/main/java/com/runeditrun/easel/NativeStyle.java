package com.runeditrun.easel;

import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.view.View;
import android.widget.*;

final class NativeStyle {
    static final int PAPER = Color.rgb(244, 241, 232), INK = Color.rgb(41, 51, 42), GREEN = Color.rgb(53, 88, 62);
    static int dp(Context c, float n) { return (int) (c.getResources().getDisplayMetrics().density * n + .5f); }
    static <T extends View> T tagged(T view, String name) { view.setTag(name); view.setSaveEnabled(false); return view; }
    static LinearLayout column(Context c) {
        LinearLayout view = new LinearLayout(c); view.setOrientation(LinearLayout.VERTICAL);
        view.setPadding(dp(c, 16), dp(c, 8), dp(c, 16), dp(c, 12)); view.setSaveEnabled(false); return view;
    }
    static TextView text(Context c, String value, int size) {
        TextView view = new TextView(c); view.setText(value); view.setTextSize(size); view.setTextColor(INK);
        view.setTypeface(Typeface.MONOSPACE); view.setPadding(0, dp(c, 7), 0, dp(c, 7)); view.setSaveEnabled(false); return view;
    }
    static EditText field(Context c, String hint, String tag, boolean secret) {
        EditText view = tagged(new EditText(c), tag); view.setHint(hint); view.setTextSize(15); view.setTextColor(INK);
        view.setTypeface(Typeface.MONOSPACE); view.setPadding(dp(c, 12), dp(c, 10), dp(c, 12), dp(c, 10));
        view.setBackground(outline(c)); view.setSingleLine(!secret);
        view.setInputType(secret ? android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD
            : android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_URI);
        view.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);
        LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(-1, -2); layout.setMargins(0, dp(c, 5), 0, dp(c, 8));
        view.setLayoutParams(layout); return view;
    }
    static GradientDrawable outline(Context c) {
        GradientDrawable shape = new GradientDrawable(); shape.setColor(Color.rgb(251, 249, 243));
        shape.setCornerRadius(dp(c, 5)); shape.setStroke(dp(c, 1), Color.rgb(143, 154, 140)); return shape;
    }
    static Button button(Context c, String title, String tag, Runnable action) {
        Button view = tagged(new Button(c), tag); view.setText(title); view.setTextSize(14); view.setAllCaps(false);
        view.setTypeface(Typeface.MONOSPACE); view.setTextColor(GREEN); view.setMinHeight(dp(c, 46));
        view.setOnClickListener(v -> action.run()); return view;
    }
    static void row(LinearLayout parent, String title, String detail) {
        Context c = parent.getContext(); LinearLayout row = column(c); row.setPadding(0, dp(c, 6), 0, dp(c, 6));
        TextView name = text(c, title, 16); name.setTypeface(Typeface.MONOSPACE, Typeface.BOLD); row.addView(name);
        if (!detail.isEmpty()) row.addView(text(c, detail, 14)); parent.addView(row);
    }
}
