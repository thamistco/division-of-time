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

/** Home-screen widget: live timer with reset / play-pause / stop, plus four one-tap categories. */
public class TimerWidget extends AppWidgetProvider {
  private static final int[] CHIPS = { R.id.c0, R.id.c1, R.id.c2, R.id.c3 };

  @Override public void onUpdate(Context c, AppWidgetManager m, int[] ids) { render(c); }

  static int colour(String hex, int fallback) { try { return Color.parseColor(hex); } catch (Exception e) { return fallback; } }

  static void render(Context c) {
    TimerNotification.update(c); // keep the lock-screen notification in step with the widget
    AppWidgetManager m = AppWidgetManager.getInstance(c);
    int[] ids = m.getAppWidgetIds(new ComponentName(c, TimerWidget.class));
    if (ids.length == 0) return;
    JSONObject st = Store.state(c);
    RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget);
    JSONObject run = st.optJSONObject("running"), paused = st.optJSONObject("paused");
    long nowR = SystemClock.elapsedRealtime(), now = System.currentTimeMillis();
    String activeCat = null;

    if (run != null) {
      long acc = run.optLong("acc", 0);
      v.setChronometer(R.id.chrono, nowR - (now - run.optLong("start", now)) - acc, null, true);
      v.setTextViewText(R.id.label, dot(run.optString("name"), run.optString("color")));
      v.setTextColor(R.id.chrono, c.getColor(R.color.wtext));
      v.setImageViewResource(R.id.toggleBg, R.drawable.w_circle);
      v.setInt(R.id.toggleBg, "setColorFilter", colour(run.optString("color"), Color.DKGRAY));
      v.setImageViewResource(R.id.toggleIcon, R.drawable.wi_pause);
      v.setContentDescription(R.id.toggle, "Pause");
      activeCat = run.optString("catId");
    } else if (paused != null) {
      v.setChronometer(R.id.chrono, nowR - paused.optLong("acc", 0), null, false);
      v.setTextViewText(R.id.label, dot("Paused · " + paused.optString("name"), paused.optString("color")));
      v.setTextColor(R.id.chrono, c.getColor(R.color.wmuted));
      v.setImageViewResource(R.id.toggleBg, R.drawable.w_circle);
      v.setInt(R.id.toggleBg, "setColorFilter", colour(paused.optString("color"), Color.DKGRAY));
      v.setImageViewResource(R.id.toggleIcon, R.drawable.wi_play);
      v.setContentDescription(R.id.toggle, "Resume");
      activeCat = paused.optString("catId");
    } else {
      v.setChronometer(R.id.chrono, nowR, null, false);
      v.setTextViewText(R.id.label, st.has("cats") ? "Not tracking" : "Open the app once to set up");
      v.setTextColor(R.id.chrono, c.getColor(R.color.wmuted));
      v.setImageViewResource(R.id.toggleBg, R.drawable.w_circle_ink);
      v.setInt(R.id.toggleBg, "setColorFilter", 0);
      v.setImageViewResource(R.id.toggleIcon, R.drawable.wi_play_inv);
      v.setContentDescription(R.id.toggle, "Start");
    }
    boolean live = run != null || paused != null;
    for (int id : new int[] { R.id.stop, R.id.reset }) {
      v.setFloat(id, "setAlpha", live ? 1f : 0.35f);
      v.setOnClickPendingIntent(id, live ? action(c, id == R.id.stop ? "stop" : "reset", "", id == R.id.stop ? 99 : 98) : null);
    }
    v.setOnClickPendingIntent(R.id.toggle, action(c, "toggle", "", 97));

    JSONArray cats = st.optJSONArray("cats");
    for (int i = 0; i < CHIPS.length; i++) {
      JSONObject cat = cats != null ? cats.optJSONObject(i) : null;
      if (cat == null) { v.setViewVisibility(CHIPS[i], View.INVISIBLE); continue; }
      v.setViewVisibility(CHIPS[i], View.VISIBLE);
      v.setTextViewText(CHIPS[i], dot(cat.optString("short", cat.optString("name")), cat.optString("color")));
      v.setInt(CHIPS[i], "setBackgroundResource", cat.optString("id").equals(activeCat) ? R.drawable.w_chip_on : R.drawable.w_chip);
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
