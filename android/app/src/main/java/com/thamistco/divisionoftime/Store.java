package com.thamistco.divisionoftime;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;

/** Widget state mirrored from the web app, plus actions taken on the widget that the web app has not applied yet. */
final class Store {
  private static SharedPreferences p(Context c) { return c.getSharedPreferences("dot", Context.MODE_PRIVATE); }

  static JSONObject state(Context c) {
    try { return new JSONObject(p(c).getString("state", "{}")); } catch (Exception e) { return new JSONObject(); }
  }
  static void setState(Context c, String json) { p(c).edit().putString("state", json).apply(); }

  static synchronized void addPending(Context c, JSONObject a) {
    try {
      JSONArray arr = new JSONArray(p(c).getString("pending", "[]"));
      arr.put(a);
      p(c).edit().putString("pending", arr.toString()).commit();
    } catch (Exception ignored) { }
  }
  static synchronized String takePending(Context c) {
    String s = p(c).getString("pending", "[]");
    p(c).edit().putString("pending", "[]").commit();
    return s;
  }
}
