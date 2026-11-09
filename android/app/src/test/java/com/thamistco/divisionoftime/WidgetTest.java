package com.thamistco.divisionoftime;

import static org.junit.Assert.*;
import static org.robolectric.Shadows.shadowOf;

import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.view.View;
import android.widget.TextView;
import androidx.test.core.app.ApplicationProvider;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.ConscryptMode;
import org.robolectric.shadows.ShadowAppWidgetManager;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
@ConscryptMode(ConscryptMode.Mode.OFF) // no ARM build of Conscrypt in the test sandbox
public class WidgetTest {
  Context c; ShadowAppWidgetManager sm; int wid;

  @Before public void setUp() throws Exception {
    c = ApplicationProvider.getApplicationContext();
    sm = shadowOf(AppWidgetManager.getInstance(c));
    wid = sm.createWidget(TimerWidget.class, R.layout.widget);
    JSONArray cats = new JSONArray();
    String[][] k = { {"c1","Surgery & clinics","Surgery","#0D6ABB"}, {"c2","Results & letters","Results","#3E6A8A"}, {"c3","Family time","Family","#B4532A"}, {"c4","Self-study & exams","Self-study","#5B57B5"} };
    for (String[] x : k) cats.put(new JSONObject().put("id", x[0]).put("name", x[1]).put("short", x[2]).put("color", x[3]));
    Store.setState(c, new JSONObject().put("running", JSONObject.NULL).put("cats", cats).toString());
    Store.takePending(c);
    TimerWidget.render(c);
  }

  View view() { return sm.getViewFor(wid); }
  String text(int id) { return ((TextView) view().findViewById(id)).getText().toString(); }
  void tap(String type, String cat) { new WidgetAction().onReceive(c, new Intent(c, WidgetAction.class).putExtra("type", type).putExtra("cat", cat)); }

  float alpha(int id) { return view().findViewById(id).getAlpha(); }
  JSONArray pending() throws Exception { return new JSONArray(Store.takePending(c)); }

  @Test public void idleShowsChipsAndDimmedControls() {
    assertEquals("● Surgery", text(R.id.c0));
    assertEquals("● Self-study", text(R.id.c3));
    assertEquals("Not tracking", text(R.id.label));
    assertEquals(0.35f, alpha(R.id.stop), 0.01);
    assertEquals(0.35f, alpha(R.id.reset), 0.01);
    assertEquals("Start", view().findViewById(R.id.toggle).getContentDescription());
  }

  @Test public void chipStartsTimerWithoutApp() throws Exception {
    long before = System.currentTimeMillis();
    tap("start", "c3");
    JSONObject run = Store.state(c).getJSONObject("running");
    assertEquals("c3", run.getString("catId"));
    assertTrue(run.getLong("start") >= before);
    assertEquals("● Family time", text(R.id.label));
    assertEquals(1f, alpha(R.id.stop), 0.01);
    assertEquals("Pause", view().findViewById(R.id.toggle).getContentDescription());
    JSONArray p = pending();
    assertEquals(1, p.length());
    assertEquals("start", p.getJSONObject(0).getString("t"));
    assertEquals("[]", Store.takePending(c));
  }

  @Test public void tappingRunningCategoryStopsIt() throws Exception {
    tap("start", "c1"); tap("start", "c1");
    assertFalse(Store.state(c).has("running"));
    assertEquals("stop", pending().getJSONObject(1).getString("t"));
    assertEquals("Not tracking", text(R.id.label));
  }

  @Test public void switchingAndStopButton() throws Exception {
    tap("start", "c1"); tap("start", "c2");
    assertEquals("c2", Store.state(c).getJSONObject("running").getString("catId"));
    tap("stop", "");
    assertFalse(Store.state(c).has("running"));
    assertEquals(3, pending().length());
  }

  @Test public void pauseKeepsElapsedAndPlayResumes() throws Exception {
    tap("start", "c2");
    JSONObject st = Store.state(c); JSONObject r = st.getJSONObject("running");
    r.put("start", System.currentTimeMillis() - 600_000); r.put("sess", r.getLong("start")); Store.setState(c, st.toString());
    tap("toggle", "");
    JSONObject pz = Store.state(c).getJSONObject("paused");
    assertFalse(Store.state(c).has("running"));
    assertTrue(pz.getLong("acc") >= 600_000 && pz.getLong("acc") < 605_000);
    assertTrue(text(R.id.label).contains("Paused"));
    assertEquals("Resume", view().findViewById(R.id.toggle).getContentDescription());
    assertTrue(text(R.id.chrono).startsWith("10:0"));
    tap("toggle", "");
    JSONObject run = Store.state(c).getJSONObject("running");
    assertEquals("c2", run.getString("catId"));
    assertEquals(pz.getLong("acc"), run.getLong("acc"));
    assertEquals(pz.getLong("sess"), run.getLong("sess"));
    assertTrue(text(R.id.chrono).startsWith("10:0"));
    JSONArray p = pending();
    assertEquals("pause", p.getJSONObject(1).getString("t"));
    assertEquals("play", p.getJSONObject(2).getString("t"));
  }

  @Test public void playWhenIdleStartsLastCategory() throws Exception {
    tap("start", "c4"); tap("stop", ""); tap("toggle", "");
    assertEquals("c4", Store.state(c).getJSONObject("running").getString("catId"));
  }

  @Test public void resetDiscardsSession() throws Exception {
    tap("start", "c1"); tap("toggle", ""); tap("reset", "");
    assertFalse(Store.state(c).has("running")); assertFalse(Store.state(c).has("paused"));
    JSONObject a = pending().getJSONObject(2);
    assertEquals("reset", a.getString("t")); assertEquals("c1", a.getString("cat")); assertTrue(a.has("sess"));
    assertEquals("Not tracking", text(R.id.label));
  }

  @Test public void runningStateFromAppShowsElapsed() throws Exception {
    JSONObject st = Store.state(c);
    st.put("running", new JSONObject().put("catId", "c2").put("name", "Admin catch-up").put("color", "#3E6A8A").put("start", System.currentTimeMillis() - 3600_000));
    Store.setState(c, st.toString()); TimerWidget.render(c);
    assertEquals("● Admin catch-up", text(R.id.label));
    assertTrue(text(R.id.chrono).startsWith("1:00") || text(R.id.chrono).startsWith("60:"));
  }

  @Test public void emptyStateAsksToOpenApp() {
    Store.setState(c, "{}"); TimerWidget.render(c);
    assertEquals("Open the app once to set up", text(R.id.label));
    assertEquals(View.INVISIBLE, view().findViewById(R.id.c0).getVisibility());
  }
}
