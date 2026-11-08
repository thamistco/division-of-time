package com.thamistco.divisionoftime;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.Icon;
import org.json.JSONArray;
import org.json.JSONObject;

/** Ongoing, silent notification for the running timer, visible on the lock screen, with Stop and Switch actions. */
final class TimerNotification {
  static final String CHANNEL = "timer";
  static final int ID = 1;

  static void update(Context c) {
    try {
      NotificationManager nm = c.getSystemService(NotificationManager.class);
      if (nm == null) return;
      JSONObject st = Store.state(c);
      JSONObject run = st.optJSONObject("running");
      if (run == null || !st.optBoolean("notif", true)) { nm.cancel(ID); return; }

      NotificationChannel ch = new NotificationChannel(CHANNEL, "Running timer", NotificationManager.IMPORTANCE_LOW);
      ch.setSound(null, null);
      ch.enableVibration(false);
      ch.setShowBadge(false);
      ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
      nm.createNotificationChannel(ch);

      Intent open = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      Notification.Builder b = new Notification.Builder(c, CHANNEL)
        .setSmallIcon(R.drawable.ic_timer)
        .setContentTitle(run.optString("name", "Timer running"))
        .setUsesChronometer(true)
        .setWhen(run.optLong("start", System.currentTimeMillis()))
        .setShowWhen(true)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setCategory(Notification.CATEGORY_STOPWATCH)
        .setVisibility(Notification.VISIBILITY_PUBLIC)
        .setContentIntent(PendingIntent.getActivity(c, 101, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
      try { b.setColor(Color.parseColor(run.optString("color"))); } catch (Exception ignored) { }

      Icon none = Icon.createWithResource(c, R.drawable.ic_timer);
      b.addAction(new Notification.Action.Builder(none, "Stop", action(c, "stop", "", 200)).build());
      JSONArray cats = st.optJSONArray("cats");
      String runId = run.optString("catId");
      int added = 0;
      for (int i = 0; cats != null && i < cats.length() && added < 2; i++) {
        JSONObject k = cats.optJSONObject(i);
        if (k == null || k.optString("id").equals(runId)) continue;
        String label = "Switch to " + k.optString("short", k.optString("name"));
        b.addAction(new Notification.Action.Builder(none, label, action(c, "start", k.optString("id"), 201 + added)).build());
        added++;
      }
      nm.notify(ID, b.build());
    } catch (Exception ignored) { } // e.g. notification permission missing: nothing to show
  }

  private static PendingIntent action(Context c, String type, String catId, int rc) {
    Intent i = new Intent(c, WidgetAction.class).putExtra("type", type).putExtra("cat", catId);
    return PendingIntent.getBroadcast(c, rc, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
  }
}
