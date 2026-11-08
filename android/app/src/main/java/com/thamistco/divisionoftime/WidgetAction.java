package com.thamistco.divisionoftime;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import org.json.JSONArray;
import org.json.JSONObject;

/** Records a widget tap without opening the app, updates the widget straight away, and lets the app apply it. */
public class WidgetAction extends BroadcastReceiver {
  @Override public void onReceive(Context c, Intent intent) {
    try {
      long now = System.currentTimeMillis();
      String type = intent.getStringExtra("type"), catId = intent.getStringExtra("cat");
      JSONObject st = Store.state(c);
      JSONObject run = st.optJSONObject("running");
      if ("start".equals(type) && run != null && catId != null && catId.equals(run.optString("catId"))) type = "stop"; // tapping the running category stops it

      Store.addPending(c, new JSONObject().put("t", type).put("cat", catId == null ? "" : catId).put("at", now));
      if ("stop".equals(type)) st.remove("running");
      else {
        JSONArray cats = st.optJSONArray("cats");
        for (int i = 0; cats != null && i < cats.length(); i++) {
          JSONObject k = cats.getJSONObject(i);
          if (k.optString("id").equals(catId)) {
            st.put("running", new JSONObject().put("catId", catId).put("name", k.optString("name")).put("color", k.optString("color")).put("start", now));
          }
        }
      }
      Store.setState(c, st.toString());
      TimerWidget.render(c);
      MainActivity.pokePending();
    } catch (Exception ignored) { }
  }
}
