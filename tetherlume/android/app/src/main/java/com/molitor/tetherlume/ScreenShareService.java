package com.molitor.tetherlume;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.PixelFormat;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.Image;
import android.media.ImageReader;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.SystemClock;
import android.util.DisplayMetrics;
import android.view.WindowManager;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Collections;

/** Teilt den Bildschirm per MJPEG-Stream im lokalen WLAN (http://IP:8080/?k=TOKEN). Keine Cloud. */
public class ScreenShareService extends Service {
    public static final String ACTION_START = "com.molitor.tetherlume.START";
    public static final String ACTION_STOP = "com.molitor.tetherlume.STOP";
    public static final String EXTRA_CODE = "code";
    public static final String EXTRA_DATA = "data";
    static final int PORT = 8080;
    private static final String CHANNEL = "share";
    private static final int NOTIFICATION_ID = 7;

    /** Aktuelle Adresse, solange geteilt wird (sonst null). */
    public static volatile String shareUrl;

    private MediaProjection projection;
    private VirtualDisplay display;
    private ImageReader reader;
    private HandlerThread thread;
    private ServerSocket server;
    private volatile boolean running;
    private final Object frameLock = new Object();
    private byte[] frame;
    private long frameNo;
    private long lastFrame;
    private String key;

    @Override public IBinder onBind(Intent intent) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || ACTION_STOP.equals(intent.getAction())) { stopSelf(); return START_NOT_STICKY; }
        if (running) return START_NOT_STICKY;
        byte[] secret = new byte[24]; new SecureRandom().nextBytes(secret);
        key = android.util.Base64.encodeToString(secret, android.util.Base64.URL_SAFE | android.util.Base64.NO_WRAP | android.util.Base64.NO_PADDING);
        String ip = localIp();
        shareUrl = "http://" + (ip == null ? "IP-ADRESSE" : ip) + ":" + PORT + "/?k=" + key;
        Notification n = notification();
        if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION);
        else startForeground(NOTIFICATION_ID, n);
        try {
            int code = intent.getIntExtra(EXTRA_CODE, 0);
            Intent data = Build.VERSION.SDK_INT >= 33 ? intent.getParcelableExtra(EXTRA_DATA, Intent.class) : legacyData(intent);
            MediaProjectionManager mpm = (MediaProjectionManager) getSystemService(Context.MEDIA_PROJECTION_SERVICE);
            projection = mpm.getMediaProjection(code, data);
            if (projection == null) { stopSelf(); return START_NOT_STICKY; }
            running = true;
            startCapture();
            startServer();
        } catch (Exception e) {
            stopSelf();
        }
        return START_NOT_STICKY;
    }

    @SuppressWarnings("deprecation")
    private static Intent legacyData(Intent i) { return i.getParcelableExtra(EXTRA_DATA); }

    private void startCapture() {
        thread = new HandlerThread("capture");
        thread.start();
        Handler handler = new Handler(thread.getLooper());
        projection.registerCallback(new MediaProjection.Callback() {
            @Override public void onStop() { stopSelf(); }
        }, handler);
        DisplayMetrics m = new DisplayMetrics();
        WindowManager wm = (WindowManager) getSystemService(Context.WINDOW_SERVICE);
        //noinspection deprecation
        wm.getDefaultDisplay().getRealMetrics(m);
        float scale = Math.min(1f, 720f / Math.min(m.widthPixels, m.heightPixels));
        final int w = Math.max(2, Math.round(m.widthPixels * scale) & ~1);
        final int h = Math.max(2, Math.round(m.heightPixels * scale) & ~1);
        reader = ImageReader.newInstance(w, h, PixelFormat.RGBA_8888, 2);
        reader.setOnImageAvailableListener(r -> {
            Image img = null;
            try {
                img = r.acquireLatestImage();
                if (img == null) return;
                long now = SystemClock.uptimeMillis();
                if (now - lastFrame < 66) return; // ca. 15 FPS
                lastFrame = now;
                Image.Plane p = img.getPlanes()[0];
                ByteBuffer buf = p.getBuffer();
                int ps = p.getPixelStride(), rs = p.getRowStride();
                Bitmap bmp = Bitmap.createBitmap(rs / ps, h, Bitmap.Config.ARGB_8888);
                bmp.copyPixelsFromBuffer(buf);
                Bitmap out = bmp.getWidth() == w ? bmp : Bitmap.createBitmap(bmp, 0, 0, w, h);
                ByteArrayOutputStream o = new ByteArrayOutputStream(64 * 1024);
                out.compress(Bitmap.CompressFormat.JPEG, 65, o);
                if (out != bmp) out.recycle();
                bmp.recycle();
                synchronized (frameLock) { frame = o.toByteArray(); frameNo++; frameLock.notifyAll(); }
            } catch (Exception ignored) {
            } finally { if (img != null) img.close(); }
        }, handler);
        display = projection.createVirtualDisplay("Tetherlume", w, h, m.densityDpi,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, reader.getSurface(), null, handler);
    }

    private void startServer() {
        new Thread(() -> {
            try (ServerSocket s = new ServerSocket(PORT, 8, InetAddress.getByName(localIp()))) {
                server = s;
                while (running) {
                    Socket c = s.accept();
                    new Thread(() -> handle(c), "client").start();
                }
            } catch (Exception ignored) { stopSelf(); }
        }, "server").start();
    }

    private void handle(Socket c) {
        try (Socket socket = c; OutputStream out = socket.getOutputStream()) {
            socket.setTcpNoDelay(true);
            socket.setSoTimeout(5000);
            BufferedReader in = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8));
            String line = in.readLine();
            if (line == null) return;
            String path = line.split(" ").length > 1 ? line.split(" ")[1] : "/";
            String query = android.net.Uri.parse(path).getQueryParameter("k");
            if (!key.equals(query)) {
                write(out, "403 Forbidden", "text/html; charset=utf-8", page(false));
                return;
            }
            if (path.startsWith("/stream")) stream(out);
            else if (path.startsWith("/shot")) {
                byte[] f; synchronized (frameLock) { f = frame; }
                if (f == null) f = new byte[0];
                out.write(("HTTP/1.1 200 OK\r\nContent-Type: image/jpeg\r\nContent-Length: " + f.length + "\r\nCache-Control: no-store\r\nReferrer-Policy: no-referrer\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
                out.write(f);
            } else write(out, "200 OK", "text/html; charset=utf-8", page(true));
        } catch (Exception ignored) { }
    }

    private void stream(OutputStream out) throws Exception {
        out.write(("HTTP/1.1 200 OK\r\nContent-Type: multipart/x-mixed-replace; boundary=tl\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
        long seen = -1;
        while (running) {
            byte[] f;
            synchronized (frameLock) {
                while (running && frameNo == seen) frameLock.wait(2000);
                f = frame; seen = frameNo;
            }
            if (f == null) continue;
            out.write(("--tl\r\nContent-Type: image/jpeg\r\nContent-Length: " + f.length + "\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
            out.write(f);
            out.write("\r\n".getBytes(StandardCharsets.US_ASCII));
            out.flush();
        }
    }

    private static void write(OutputStream out, String status, String type, String body) throws Exception {
        byte[] b = body.getBytes(StandardCharsets.UTF_8);
        out.write(("HTTP/1.1 " + status + "\r\nContent-Type: " + type + "\r\nContent-Length: " + b.length + "\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
        out.write(b);
    }

    private String page(boolean ok) {
        String head = "<!doctype html><html lang=de><head><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>Tetherlume Share</title>"
                + "<style>body{margin:0;background:#070d18;color:#ecf3ff;font:15px system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;min-height:100vh}"
                + "header{width:100%;box-sizing:border-box;display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 14px;background:#0e1828;border-bottom:1px solid #243652}"
                + "b{letter-spacing:.06em}a,button{font:inherit;font-weight:650;color:#fff;background:#347ff5;border:0;border-radius:10px;padding:8px 12px;text-decoration:none;cursor:pointer}"
                + "main{flex:1;display:grid;place-items:center;width:100%;padding:10px;box-sizing:border-box}img{max-width:100%;max-height:calc(100vh - 120px);border-radius:12px;box-shadow:0 18px 60px #0009;background:#000}"
                + "footer{padding:10px;color:#9fb1ca;font-size:13px;text-align:center}footer a{background:#ffc439;color:#111;padding:5px 10px}</style></head><body>";
        if (!ok) return head + "<main><p>Falscher oder fehlender Code. Öffne den Link aus der Tetherlume-App.</p></main></body></html>";
        return head + "<header><b>◈ TETHERLUME SHARE</b><span><a href='/shot?k=" + key + "' download='tetherlume.jpg'>📸</a> "
                + "<button onclick=\"document.querySelector('img').requestFullscreen&&document.querySelector('img').requestFullscreen()\">⤢</button></span></header>"
                + "<main><img src='/stream?k=" + key + "' alt='Handy-Bildschirm'></main>"
                + "<footer>Live vom Handy · nur in deinem WLAN · <a href='https://marcelmolitor.github.io/tetherlume/web/#unterstuetzen' target=_blank>☕ Tetherlume unterstützen</a></footer></body></html>";
    }

    private Notification notification() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26) nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Bildschirm teilen", NotificationManager.IMPORTANCE_LOW));
        PendingIntent stop = PendingIntent.getService(this, 1, new Intent(this, ScreenShareService.class).setAction(ACTION_STOP), PendingIntent.FLAG_IMMUTABLE);
        PendingIntent open = PendingIntent.getActivity(this, 2, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : legacyBuilder();
        return b.setSmallIcon(android.R.drawable.ic_menu_share)
                .setContentTitle("Tetherlume teilt deinen Bildschirm")
                .setContentText(shareUrl)
                .setContentIntent(open)
                .setOngoing(true)
                .addAction(new Notification.Action.Builder(null, "Beenden", stop).build())
                .build();
    }

    @SuppressWarnings("deprecation")
    private Notification.Builder legacyBuilder() { return new Notification.Builder(this); }

    static String localIp() {
        try {
            String fallback = null;
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                for (InetAddress a : Collections.list(ni.getInetAddresses())) {
                    if (a instanceof Inet4Address && !a.isLoopbackAddress()) {
                        String ip = a.getHostAddress();
                        if (ni.getName().startsWith("wlan") || ni.getName().startsWith("ap") || ni.getName().startsWith("swlan")) return ip;
                        if (a.isSiteLocalAddress() && fallback == null) fallback = ip;
                    }
                }
            }
            return fallback;
        } catch (Exception e) { return null; }
    }

    @Override
    public void onDestroy() {
        running = false;
        shareUrl = null;
        synchronized (frameLock) { frameLock.notifyAll(); }
        try { if (server != null) server.close(); } catch (Exception ignored) { }
        try { if (display != null) display.release(); } catch (Exception ignored) { }
        try { if (reader != null) reader.close(); } catch (Exception ignored) { }
        try { if (projection != null) projection.stop(); } catch (Exception ignored) { }
        if (thread != null) thread.quitSafely();
        sendBroadcast(new Intent(MainActivity.ACTION_CHANGED).setPackage(getPackageName()));
        super.onDestroy();
    }
}
