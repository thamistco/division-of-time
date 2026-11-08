package com.thamistco.divisionoftime;

import static org.junit.Assert.*;
import static org.robolectric.Shadows.shadowOf;

import android.Manifest;
import android.app.Application;
import android.app.Notification;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import androidx.test.core.app.ApplicationProvider;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.ConscryptMode;
import org.robolectric.shadows.ShadowNotificationManager;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
@ConscryptMode(ConscryptMode.Mode.OFF) // no ARM build of Conscrypt in the test sandbox
public class NotificationTest {
  Context c; NotificationManager nm; ShadowNotificationManager snm; long start;

  @Before public void setUp() throws Exception {
    c = ApplicationProvider.getApplicationContext();
    shadowOf((Application) c).grantPermissions(Manifest.permission.POST_NOTIFICATIONS);
    nm = c.getSystemService(NotificationManager.class);
    snm = shadowOf(nm);
    JSONArray cats = new JSONArray();
    String[][] k = { {"c1","Surgery & clinics","Surgery","#0D6ABB"}, {"c2","Results & letters","Results","#3E6A8A"}, {"c3","Family time","Family","#B4532A"}, {"c4","Self-study & exams","Self-study","#5B57B5"} };
    for (String[] x : k) cats.put(new JSONObject().put("id", x[0]).put("name", x[1]).put("short", x[2]).put("color", x[3]));
    start = System.currentTimeMillis() - 600_000;
    JSONObject run = new JSONObject().put("catId", "c1").put("name", "Surgery & clinics").put("color", "#0D6ABB").put("start", start);
    Store.setState(c, new JSONObject().put("running", run).put("cats", cats).put("notif", true).toString());
    Store.takePending(c);
    TimerWidget.render(c);
  }

  Notification posted() { return snm.getNotification(TimerNotification.ID); }

  @Test public void runningShowsLockScreenChronometerWithStopAndSwitch() {
    Notification n = posted();
    assertNotNull(n);
    assertEquals("Surgery & clinics", n.extras.getCharSequence(Notification.EXTRA_TITLE).toString());
    assertTrue(n.extras.getBoolean(Notification.EXTRA_SHOW_CHRONOMETER));
    assertTrue(n.extras.getBoolean(Notification.EXTRA_SHOW_WHEN));
    assertEquals(start, n.when);
    assertEquals(Notification.VISIBILITY_PUBLIC, n.visibility);
    assertTrue((n.flags & Notification.FLAG_ONGOING_EVENT) != 0);
    assertEquals(0xFF0D6ABB, n.color);
    assertNotNull(n.contentIntent);
    assertEquals(3, n.actions.length);
    assertEquals("Stop", n.actions[0].title.toString());
    assertEquals("Switch to Results", n.actions[1].title.toString());
    assertEquals("Switch to Family", n.actions[2].title.toString());
    assertEquals("timer", n.getChannelId());
    assertEquals(NotificationManager.IMPORTANCE_LOW, nm.getNotificationChannel("timer").getImportance());
    assertNull(nm.getNotificationChannel("timer").getSound());
  }

  @Test public void cancelledWhenStopped() throws Exception {
    assertNotNull(posted());
    JSONObject st = Store.state(c); st.put("running", JSONObject.NULL);
    Store.setState(c, st.toString()); TimerWidget.render(c);
    assertNull(posted());
    assertEquals(0, snm.size());
  }

  @Test public void hiddenWhenNotifOff() throws Exception {
    JSONObject st = Store.state(c); st.put("notif", false);
    Store.setState(c, st.toString()); TimerWidget.render(c);
    assertNull(posted());
  }

  @Test public void stopActionStopsTimerAndQueuesPending() throws Exception {
    Intent i = shadowOf(posted().actions[0].actionIntent).getSavedIntent();
    assertEquals("stop", i.getStringExtra("type"));
    new WidgetAction().onReceive(c, i);
    assertFalse(Store.state(c).has("running"));
    JSONArray p = new JSONArray(Store.takePending(c));
    assertEquals(1, p.length());
    assertEquals("stop", p.getJSONObject(0).getString("t"));
    assertNull(posted());
  }

  @Test public void switchActionStartsOtherCategory() throws Exception {
    Intent i = shadowOf(posted().actions[1].actionIntent).getSavedIntent();
    new WidgetAction().onReceive(c, i);
    assertEquals("c2", Store.state(c).getJSONObject("running").getString("catId"));
    Notification n = posted();
    assertEquals("Results & letters", n.extras.getCharSequence(Notification.EXTRA_TITLE).toString());
    assertEquals("Switch to Surgery", n.actions[1].title.toString());
  }
}
