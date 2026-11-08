package com.thamistco.divisionoftime;

import android.annotation.SuppressLint;
import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.os.Build;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.provider.MediaStore;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.common.api.Scope;
import java.io.OutputStream;
import java.lang.ref.WeakReference;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONObject;

public class MainActivity extends Activity {
  static final String HOME = "https://thamistco.github.io/division-of-time/";
  private static final int RC_AUTH = 7, RC_FILE = 8, RC_NOTIF = 9;
  private static WeakReference<MainActivity> live = new WeakReference<>(null);
  private WebView web;
  private ValueCallback<Uri[]> fileCb;

  @SuppressLint("SetJavaScriptEnabled")
  @Override protected void onCreate(Bundle b) {
    super.onCreate(b);
    web = new WebView(this);
    WebSettings s = web.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true);
    s.setDatabaseEnabled(true);
    s.setUserAgentString(s.getUserAgentString() + " DoTAndroid/1");
    web.addJavascriptInterface(new Bridge(), "DotNative");
    web.setWebViewClient(new WebViewClient() {
      @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
        Uri u = r.getUrl();
        if (u.toString().startsWith(HOME) && !u.getPath().endsWith(".apk")) return false; // app updates download in the browser
        try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
        return true;
      }
    });
    web.setWebChromeClient(new WebChromeClient() {
      @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
        if (fileCb != null) fileCb.onReceiveValue(null);
        fileCb = cb;
        Intent i = new Intent(Intent.ACTION_GET_CONTENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
        startActivityForResult(Intent.createChooser(i, "Choose a backup"), RC_FILE);
        return true;
      }
    });
    if (b != null) web.restoreState(b); else web.loadUrl(HOME);
    setContentView(web);
    live = new WeakReference<>(this);
    askNotificationsOnce();
  }

  /** Android 13+: ask once (first launch) for permission to show the running-timer notification. */
  private void askNotificationsOnce() {
    if (Build.VERSION.SDK_INT < 33) return;
    if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return;
    android.content.SharedPreferences p = getSharedPreferences("dot", MODE_PRIVATE);
    if (p.getBoolean("askedNotif", false)) return;
    p.edit().putBoolean("askedNotif", true).apply();
    requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS }, RC_NOTIF);
  }

  @Override public void onRequestPermissionsResult(int rc, String[] perms, int[] res) {
    super.onRequestPermissionsResult(rc, perms, res);
    if (rc == RC_NOTIF) TimerNotification.update(this);
  }

  @Override protected void onSaveInstanceState(Bundle o) { super.onSaveInstanceState(o); web.saveState(o); }
  @Override protected void onResume() { super.onResume(); live = new WeakReference<>(this); js("window.__dotNativePending&&__dotNativePending()"); }
  @Override protected void onNewIntent(Intent i) { super.onNewIntent(i); js("window.__dotNativePending&&__dotNativePending()"); }
  @Override public void onBackPressed() { if (web.canGoBack()) web.goBack(); else super.onBackPressed(); }

  static void pokePending() {
    MainActivity a = live.get();
    if (a != null) a.js("window.__dotNativePending&&__dotNativePending()");
  }

  private void js(String code) { if (web != null) runOnUiThread(() -> web.evaluateJavascript(code, null)); }

  private void authorize(String scopes, boolean silent) {
    List<Scope> list = new ArrayList<>();
    for (String sc : scopes.trim().split("\\s+")) if (!sc.isEmpty()) list.add(new Scope(sc));
    Identity.getAuthorizationClient(this)
      .authorize(AuthorizationRequest.builder().setRequestedScopes(list).build())
      .addOnSuccessListener(r -> {
        if (r.hasResolution()) {
          if (silent) { js("window.__dotGoogleToken&&__dotGoogleToken(null,0,'needs-consent')"); return; }
          try { startIntentSenderForResult(r.getPendingIntent().getIntentSender(), RC_AUTH, null, 0, 0, 0); }
          catch (Exception e) { js("window.__dotGoogleToken&&__dotGoogleToken(null,0,'error')"); }
        } else deliver(r);
      })
      .addOnFailureListener(e -> js("window.__dotGoogleToken&&__dotGoogleToken(null,0," + JSONObject.quote(String.valueOf(e.getMessage())) + ")"));
  }

  private void deliver(AuthorizationResult r) {
    String t = r.getAccessToken();
    js("window.__dotGoogleToken&&__dotGoogleToken(" + JSONObject.quote(t == null ? "" : t) + ",3300,null)");
  }

  @Override protected void onActivityResult(int rc, int res, Intent data) {
    super.onActivityResult(rc, res, data);
    if (rc == RC_AUTH) {
      try { deliver(Identity.getAuthorizationClient(this).getAuthorizationResultFromIntent(data)); }
      catch (Exception e) { js("window.__dotGoogleToken&&__dotGoogleToken(null,0,'cancelled')"); }
    } else if (rc == RC_FILE && fileCb != null) {
      Uri u = res == RESULT_OK && data != null ? data.getData() : null;
      fileCb.onReceiveValue(u == null ? null : new Uri[] { u });
      fileCb = null;
    }
  }

  private class Bridge {
    @JavascriptInterface public void sync(String json) { Store.setState(MainActivity.this, json); TimerWidget.render(MainActivity.this); }
    @JavascriptInterface public int versionCode() {
      try { return (int) getPackageManager().getPackageInfo(getPackageName(), 0).getLongVersionCode(); } catch (Exception e) { return 0; }
    }
    @JavascriptInterface public String takePending() { return Store.takePending(MainActivity.this); }
    @JavascriptInterface public void googleAuth(String scopes, boolean silent) { runOnUiThread(() -> authorize(scopes, silent)); }
    @JavascriptInterface public void saveFile(String name, String text, String mime) {
      try {
        ContentValues cv = new ContentValues();
        cv.put(MediaStore.Downloads.DISPLAY_NAME, name);
        cv.put(MediaStore.Downloads.MIME_TYPE, mime);
        Uri u = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
        try (OutputStream o = getContentResolver().openOutputStream(u)) { o.write(text.getBytes(StandardCharsets.UTF_8)); }
        runOnUiThread(() -> Toast.makeText(MainActivity.this, "Saved to Downloads", Toast.LENGTH_SHORT).show());
      } catch (Exception e) {
        runOnUiThread(() -> Toast.makeText(MainActivity.this, "Couldn’t save the file", Toast.LENGTH_SHORT).show());
      }
    }
  }
}
