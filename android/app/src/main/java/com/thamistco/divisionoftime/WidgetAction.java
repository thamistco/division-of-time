package com.thamistco.divisionoftime;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Records a widget tap without opening the app, updates the widget straight away, and queues it for the app.
 * Types: start (a category chip), toggle (play / pause), stop, reset (discard the current session).
 * Pause logs the time so far and remembers the category; play resumes it, and the timer carries on from where it was.
 */
public class WidgetAction extends BroadcastReceiver {
  @Override public void onReceive(Context c, Intent intent) {
    try {
      long now = System.currentTimeMillis();
      String type = intent.getStringExtra("type"), catId = intent.getStringExtra("cat");
      JSONObject st = Store.state(c);
      JSONObject run = st.optJSONObject("running"), paused = st.optJSONObject("paused");
      JSONObject act = new JSONObject().put("at", now);

      if ("toggle".equals(type)) {
        if (run != null) { // pause
          long acc = run.optLong("acc", 0) + Math.max(0, now - run.optLong("start", now));
          st.put("paused", new JSONObject().put("catId", run.optString("catId")).put("name", run.optString("name")).put("color", run.optString("color")).put("acc", acc).put("sess", run.optLong("sess", run.optLong("start", now))));
          st.remove("running");
          act.put("t", "pause").put("cat", run.optString("catId")).put("acc", acc).put("sess", run.optLong("sess", run.optLong("start", now)));
        } else if (paused != null) { // resume
          st.put("running", new JSONObject().put("catId", paused.optString("catId")).put("name", paused.optString("name")).put("color", paused.optString("color")).put("start", now).put("acc", paused.optLong("acc")).put("sess", paused.optLong("sess", now)));
          st.remove("paused");
          act.put("t", "play").put("cat", paused.optString("catId")).put("acc", paused.optLong("acc")).put("sess", paused.optLong("sess", now));
        } else { // start the last-used category, or the first one
          JSONObject last = st.optJSONObject("lastCat");
          String id = last != null ? last.optString("id") : null;
          JSONArray cats = st.optJSONArray("cats");
          if ((id == null || id.isEmpty()) && cats != null && cats.length() > 0) id = cats.getJSONObject(0).optString("id");
          if (id == null || id.isEmpty()) return;
          startCat(st, id, last, now);
          act.put("t", "start").put("cat", id);
        }
      } else if ("stop".equals(type)) {
        st.remove("running"); st.remove("paused");
        act.put("t", "stop").put("cat", "");
      } else if ("reset".equals(type)) {
        JSONObject cur = run != null ? run : paused;
        if (cur == null) return;
        act.put("t", "reset").put("cat", cur.optString("catId")).put("sess", cur.optLong("sess", cur.optLong("start", now)));
        st.remove("running"); st.remove("paused");
      } else { // a category chip
        if (run != null && catId != null && catId.equals(run.optString("catId"))) { // tapping the running category stops it
          st.remove("running"); st.remove("paused");
          act.put("t", "stop").put("cat", catId);
        } else {
          startCat(st, catId, null, now);
          act.put("t", "start").put("cat", catId == null ? "" : catId);
        }
      }
      Store.addPending(c, act);
      Store.setState(c, st.toString());
      TimerWidget.render(c);
      MainActivity.pokePending();
    } catch (Exception ignored) { }
  }

  private static void startCat(JSONObject st, String catId, JSONObject fallback, long now) throws Exception {
    JSONObject k = null;
    JSONArray cats = st.optJSONArray("cats");
    for (int i = 0; cats != null && i < cats.length(); i++) if (cats.getJSONObject(i).optString("id").equals(catId)) k = cats.getJSONObject(i);
    if (k == null) k = fallback;
    if (k == null) return;
    st.remove("paused");
    st.put("running", new JSONObject().put("catId", catId).put("name", k.optString("name")).put("color", k.optString("color")).put("start", now).put("acc", 0).put("sess", now));
    st.put("lastCat", new JSONObject().put("id", catId).put("name", k.optString("name")).put("color", k.optString("color")));
  }
}
