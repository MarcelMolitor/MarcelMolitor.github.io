package com.molitor.tetherlume;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.BroadcastReceiver;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.media.projection.MediaProjectionManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.Gravity;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.util.Locale;

public class MainActivity extends Activity {
    static final String ACTION_CHANGED = "com.molitor.tetherlume.CHANGED";
    private static final int REQ_CAPTURE = 42;
    private static final String WEB = "https://marcelmolitor.github.io/tetherlume/web/";

    private TextView status, shareState;
    private Button shareButton, copyButton, openButton;
    private boolean de;

    private final BroadcastReceiver receiver = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent i) { refresh(); }
    };

    String t(String a, String b) { return de ? a : b; }
    int dp(int n) { return (int) (n * getResources().getDisplayMetrics().density); }

    @Override
    public void onCreate(Bundle b) {
        super.onCreate(b);
        de = Locale.getDefault().getLanguage().equals("de");
        ScrollView s = new ScrollView(this);
        s.setBackgroundColor(0xff070d18);
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.VERTICAL);
        l.setPadding(dp(22), dp(18), dp(22), dp(28));
        s.addView(l);
        setContentView(s);
        s.setOnApplyWindowInsetsListener((v, i) -> {
            //noinspection deprecation
            v.setPadding(0, i.getSystemWindowInsetTop(), 0, i.getSystemWindowInsetBottom());
            return i;
        });
        s.requestApplyInsets();

        TextView brand = label(l, "◈ TETHERLUME", 15, 0xff8abfff);
        brand.setTypeface(Typeface.DEFAULT_BOLD);
        TextView h = label(l, t("Dein Handy.\nLive im Browser.", "Your phone.\nLive in the browser."), 32, Color.WHITE);
        h.setTypeface(Typeface.DEFAULT_BOLD);

        // --- Bildschirm teilen (WLAN) ---
        section(l, t("📡 Bildschirm im WLAN teilen", "📡 Share screen over Wi-Fi"));
        label(l, t("Ohne Kabel und ohne USB-Debugging: Dein Bildschirm erscheint live in jedem Browser im selben WLAN – am PC, Tablet oder sogar hier am Handy.",
                "No cable, no USB debugging: your screen appears live in any browser on the same Wi-Fi – PC, tablet or even this phone."), 15, 0xffc7d6ec);
        shareState = label(l, "", 16, Color.WHITE);
        shareButton = button(l, "", this::toggleShare, 0xff347ff5);
        openButton = button(l, t("Im Browser ansehen", "View in browser"), () -> { if (ScreenShareService.shareUrl != null) open(ScreenShareService.shareUrl); }, 0xff1f3e6b);
        copyButton = button(l, t("Link kopieren / an PC senden", "Copy / send link to PC"), () -> shareText(ScreenShareService.shareUrl), 0xff1f3e6b);

        // --- USB-Steuerung ---
        section(l, t("🖱 Per USB am PC steuern", "🖱 Control via USB from your PC"));
        status = label(l, "", 16, Color.WHITE);
        label(l, t("1. USB-Debugging einschalten\n2. Handy per USB-Datenkabel an den PC\n3. Am PC in Chrome/Edge Tetherlume Web öffnen, „Android verbinden“ klicken und hier „Zulassen“ tippen.",
                "1. Enable USB debugging\n2. Connect the phone to your PC with a USB data cable\n3. Open Tetherlume Web in Chrome/Edge on your PC, click “Connect Android” and tap “Allow” here."), 15, 0xffc7d6ec);
        button(l, t("Entwickleroptionen öffnen", "Open developer options"), () -> openSettings(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS), 0xff1f3e6b);
        button(l, t("Geräteinfo (7× Build-Nummer)", "About phone (tap Build number 7×)"), () -> openSettings(Settings.ACTION_DEVICE_INFO_SETTINGS), 0xff1f3e6b);
        button(l, t("Link zu Tetherlume Web an den PC senden", "Send Tetherlume Web link to your PC"), () -> shareText(WEB), 0xff1f3e6b);

        // --- Unterstützen ---
        section(l, t("☕ Tetherlume unterstützen", "☕ Support Tetherlume"));
        label(l, t("Kostenlos, ohne Werbung, ohne Tracking. Wenn dir Tetherlume hilft, freue ich mich über einen Kaffee.",
                "Free, no ads, no tracking. If Tetherlume helps you, a coffee keeps it going."), 15, 0xffc7d6ec);
        button(l, t("Mit PayPal unterstützen", "Support via PayPal"), () -> open("https://www.paypal.biz/molitormarcel93"), 0xffd99a00);

        label(l, t("Datenschutz: Die App sammelt keine Daten. Beim Teilen läuft das Bild nur in deinem WLAN, mit einem zufälligen Zugriffsschlüssel im Link; HTTP ist nicht verschlüsselt, nur in vertrauenswürdigen privaten Netzwerken nutzen. Teilen jederzeit über die Benachrichtigung beenden. USB-Debugging nur an vertrauenswürdigen PCs erlauben.",
                "Privacy: the app collects no data. When sharing, the picture stays in your Wi-Fi, with a random access token in the link; HTTP is not encrypted, use trusted private networks only. Stop anytime from the notification. Allow USB debugging only on trusted PCs."), 13, 0xff9fb1ca);
        TextView by = label(l, "" + t("Marcel Molitor · Entwickelt in Deutschland", "Marcel Molitor · Made in Germany"), 13, 0xff6ba5ff);
        by.setOnClickListener(v -> open(WEB));

        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1);
        refresh();
    }

    private void toggleShare() {
        if (ScreenShareService.shareUrl != null) {
            startService(new Intent(this, ScreenShareService.class).setAction(ScreenShareService.ACTION_STOP));
            shareState.postDelayed(this::refresh, 400);
            return;
        }
        if (ScreenShareService.localIp() == null) {
            Toast.makeText(this, t("Bitte zuerst mit einem WLAN verbinden.", "Please connect to Wi-Fi first."), Toast.LENGTH_LONG).show();
            return;
        }
        MediaProjectionManager mpm = (MediaProjectionManager) getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        //noinspection deprecation
        startActivityForResult(mpm.createScreenCaptureIntent(), REQ_CAPTURE);
    }

    @Override
    @SuppressWarnings("deprecation")
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req != REQ_CAPTURE) return;
        if (res != RESULT_OK || data == null) {
            Toast.makeText(this, t("Teilen abgebrochen.", "Sharing cancelled."), Toast.LENGTH_SHORT).show();
            return;
        }
        Intent i = new Intent(this, ScreenShareService.class).setAction(ScreenShareService.ACTION_START)
                .putExtra(ScreenShareService.EXTRA_CODE, res).putExtra(ScreenShareService.EXTRA_DATA, data);
        if (Build.VERSION.SDK_INT >= 26) startForegroundService(i); else startService(i);
        shareState.postDelayed(this::refresh, 700);
    }

    void refresh() {
        if (status == null) return;
        boolean adb = Settings.Global.getInt(getContentResolver(), Settings.Global.ADB_ENABLED, 0) == 1;
        boolean dev = Settings.Global.getInt(getContentResolver(), Settings.Global.DEVELOPMENT_SETTINGS_ENABLED, 0) == 1;
        Intent bat = registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        int plugged = bat == null ? 0 : bat.getIntExtra("plugged", 0);
        status.setText((adb ? t("✓ USB-Debugging ist an", "✓ USB debugging is on")
                : dev ? t("✗ USB-Debugging ist aus – unten einschalten", "✗ USB debugging is off – enable it below")
                : t("✗ Entwickleroptionen fehlen – 7× auf Build-Nummer tippen", "✗ Developer options missing – tap Build number 7×"))
                + "\n" + ((plugged & 2) != 0 ? t("✓ USB-Kabel erkannt", "✓ USB cable detected") : t("✗ Kein USB-Kabel erkannt", "✗ No USB cable detected")));
        String url = ScreenShareService.shareUrl;
        boolean on = url != null;
        shareState.setText(on ? t("● Live – öffne im Browser:\n", "● Live – open in a browser:\n") + url : t("○ Teilen ist aus", "○ Sharing is off"));
        shareState.setTextColor(on ? 0xff3ccf8e : 0xff9fb1ca);
        shareButton.setText(on ? t("■ Teilen beenden", "■ Stop sharing") : t("▶ Bildschirm teilen starten", "▶ Start sharing screen"));
        openButton.setEnabled(on); openButton.setAlpha(on ? 1f : .45f);
        copyButton.setEnabled(on); copyButton.setAlpha(on ? 1f : .45f);
    }

    private void shareText(String text) {
        if (text == null) return;
        ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        cm.setPrimaryClip(ClipData.newPlainText("Tetherlume", text));
        Intent i = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text);
        try { startActivity(Intent.createChooser(i, "Tetherlume")); } catch (ActivityNotFoundException ignored) { }
    }

    void open(String u) {
        try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(u))); }
        catch (ActivityNotFoundException e) { Toast.makeText(this, t("Kein Browser verfügbar", "No browser available"), Toast.LENGTH_SHORT).show(); }
    }

    void openSettings(String a) {
        try { startActivity(new Intent(a)); } catch (Exception e) { startActivity(new Intent(Settings.ACTION_SETTINGS)); }
    }

    TextView label(LinearLayout l, String text, int size, int color) {
        TextView v = new TextView(this);
        v.setText(text); v.setTextSize(size); v.setTextColor(color);
        v.setPadding(0, dp(6), 0, dp(10));
        v.setTextIsSelectable(size == 16);
        l.addView(v);
        return v;
    }

    void section(LinearLayout l, String text) {
        TextView v = label(l, text, 19, Color.WHITE);
        v.setTypeface(Typeface.DEFAULT_BOLD);
        v.setPadding(0, dp(22), 0, dp(4));
    }

    Button button(LinearLayout l, String text, Runnable action, int color) {
        Button b = new Button(this);
        b.setText(text); b.setAllCaps(false); b.setTextColor(Color.WHITE); b.setTextSize(16);
        b.setGravity(Gravity.CENTER);
        GradientDrawable g = new GradientDrawable(); g.setColor(color); g.setCornerRadius(dp(14));
        b.setBackground(g);
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        b.setMinHeight(dp(54)); p.bottomMargin = dp(10);
        l.addView(b, p);
        b.setOnClickListener(v -> action.run());
        return b;
    }

    @Override
    protected void onResume() {
        super.onResume();
        IntentFilter f = new IntentFilter(Intent.ACTION_BATTERY_CHANGED);
        f.addAction(ACTION_CHANGED);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(receiver, f, Context.RECEIVER_NOT_EXPORTED);
        else registerReceiver(receiver, f);
        refresh();
    }

    @Override
    protected void onPause() {
        unregisterReceiver(receiver);
        super.onPause();
    }
}
