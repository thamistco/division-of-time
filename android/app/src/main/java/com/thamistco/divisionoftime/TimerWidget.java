package com.thamistco.divisionoftime;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.os.SystemClock;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.ForegroundColorSpan;
import android.view.View;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;

public class TimerWidget extends AppWidgetProvider {
  private static final int[] CHIPS = { R.id.c0, R.id.c1, R.id.c2, R.id.c3 };

  @Override public void onUpdate(Context c, AppWidgetManager m, int[] ids) { render(c); }

  static void render(Context c) {
    AppWidgetManager m = AppWidgetManager.getInstance(c);
    int[] ids = m.getAppWidgetIds(new ComponentName(c, TimerWidget.class));
    if (ids.length == 0) return;
    JSONObject st = Store.state(c);
    RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget);
    JSONObject run = st.optJSONObject("running");

    if (run != null) {
      long startWall = run.optLong("start");
      long base = SystemClock.elapsedRealtime() - (System.currentTimeMillis() - startWall);
      v.setChronometer(R.id.chrono, base, null, true);
      v.setViewVisibility(R.id.chrono, View.VISIBLE);
      v.setViewVisibility(R.id.idle, View.GONE);
      v.setTextViewText(R.id.label, dot(run.optString("name"), run.optString("color")));
      v.setViewVisibility(R.id.stop, View.VISIBLE);
      v.setOnClickPendingIntent(R.id.stop, action(c, "stop", "", 99));
    } else {
      v.setChronometer(R.id.chrono, SystemClock.elapsedRealtime(), null, false);
      v.setViewVisibility(R.id.chrono, View.GONE);
      v.setViewVisibility(R.id.idle, View.VISIBLE);
      v.setTextViewText(R.id.label, st.has("cats") ? "Not tracking" : "Open the app once to set up");
      v.setViewVisibility(R.id.stop, View.GONE);
    }

    JSONArray cats = st.optJSONArray("cats");
    for (int i = 0; i < CHIPS.length; i++) {
      JSONObject cat = cats != null ? cats.optJSONObject(i) : null;
      if (cat == null) { v.setViewVisibility(CHIPS[i], View.INVISIBLE); continue; }
      v.setViewVisibility(CHIPS[i], View.VISIBLE);
      v.setTextViewText(CHIPS[i], dot(cat.optString("short", cat.optString("name")), cat.optString("color")));
      v.setOnClickPendingIntent(CHIPS[i], action(c, "start", cat.optString("id"), i));
    }

    Intent open = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    v.setOnClickPendingIntent(R.id.open, PendingIntent.getActivity(c, 100, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
    m.updateAppWidget(ids, v);
  }

  private static CharSequence dot(String name, String color) {
    SpannableString s = new SpannableString("● " + name);
    try { s.setSpan(new ForegroundColorSpan(Color.parseColor(color)), 0, 1, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE); } catch (Exception ignored) { }
    return s;
  }

  private static PendingIntent action(Context c, String type, String catId, int rc) {
    Intent i = new Intent(c, WidgetAction.class).putExtra("type", type).putExtra("cat", catId);
    return PendingIntent.getBroadcast(c, rc, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
  }
}
