// Tetherlume Web v5 – Android im Browser per WebUSB (ADB + scrcpy Live-Video)
// Created by Marcel Molitor
const VERSION = "5.0";
const SERVER_VERSION = "3.3.3";
const SERVER_FILE = "scrcpy-server-v3.3.3";
const LIBS = {
  adb: "https://esm.sh/@yume-chan/adb@2.6.4",
  webusb: "https://esm.sh/@yume-chan/adb-daemon-webusb@2.3.2",
  cred: "https://esm.sh/@yume-chan/adb-credential-web@2.1.0",
  adbScrcpy: "https://esm.sh/@yume-chan/adb-scrcpy@2.3.2",
  scrcpy: "https://esm.sh/@yume-chan/scrcpy@2.3.0",
  decoder: "https://esm.sh/@yume-chan/scrcpy-decoder-webcodecs@2.5.3",
};

const $ = (id) => document.getElementById(id);
const ui = {
  connect: $("connect"), disconnect: $("disconnect"), state: $("connection-state"),
  note: $("direct-note"), screen: $("screen"), placeholder: $("placeholder"),
  stage: $("stage"), fallbackImg: $("fallback-img"), info: $("device-info"),
  fps: $("fps"), help: $("help-box"), quality: $("quality"), drop: $("drop-hint"),
};
const controls = [...document.querySelectorAll("[data-needs-device]")];

let L;                       // geladene Bibliotheken
let manager, device, adb, client, decoder, canvas;
let mode = "none";           // "live" | "fallback" | "none"
let epoch = 0;
const log = [];

function message(text, kind = "info") {
  ui.note.textContent = text;
  ui.note.dataset.kind = kind;
  log.push(new Date().toLocaleTimeString("de-DE") + " " + text);
  if (log.length > 60) log.shift();
  console.info("[Tetherlume]", text);
}
function setState(text, kind) { ui.state.textContent = text; ui.state.dataset.kind = kind || ""; }
function enable(on) {
  controls.forEach((b) => (b.disabled = !on));
  ui.disconnect.disabled = !on;
  ui.connect.disabled = on || !L;
}
function showHelp(key) {
  document.querySelectorAll("[data-help]").forEach((el) => (el.hidden = el.dataset.help !== key));
  ui.help.hidden = !key;
  if (key) ui.help.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// ---------- Bibliotheken laden ----------
async function loadLibs() {
  if (!window.isSecureContext || !navigator.usb) {
    setState("Browser nicht unterstützt", "bad");
    ui.connect.textContent = "USB nicht verfügbar";
    message("WebUSB fehlt. Öffne die Seite in Chrome oder Edge (PC/Mac oder Android-Handy mit OTG).", "bad");
    showHelp("browser");
    return;
  }
  try {
    const [adbM, usbM, credM, asM, sM, dM] = await Promise.all([
      import(LIBS.adb), import(LIBS.webusb), import(LIBS.cred),
      import(LIBS.adbScrcpy), import(LIBS.scrcpy), import(LIBS.decoder),
    ]);
    L = { ...adbM, ...usbM, CredentialStore: credM.default, ...asM, ...sM, ...dM };
    manager = L.AdbDaemonWebUsbDeviceManager.BROWSER;
    if (!manager) throw new Error("WebUSB-Manager nicht verfügbar");
    ui.connect.disabled = false;
    ui.connect.textContent = "Android verbinden";
    setState("Nicht verbunden");
    message("Bereit. Handy per USB anstecken und auf „Android verbinden“ klicken.");
    // Bereits freigegebene Geräte anzeigen
    try {
      const known = await manager.getDevices();
      if (known.length) message(`Bereit. Bekanntes Gerät gefunden: ${known[0].name || known[0].serial}. Klick auf „Android verbinden“.`);
    } catch {}
  } catch (e) {
    ui.connect.textContent = "Laden fehlgeschlagen";
    setState("Fehler", "bad");
    message("Bibliotheken konnten nicht geladen werden (" + e.message + "). Prüfe Internet/Adblocker und lade neu.", "bad");
    showHelp("libs");
  }
}

// ---------- Verbinden ----------
async function connect() {
  ui.connect.disabled = true;
  showHelp(null);
  const token = ++epoch;
  try {
    try {
      device = await manager.requestDevice();
    } catch (e) {
      if (e?.name === "NotFoundError") device = undefined; else throw e;
    }
    if (!device) {
      message("Kein Gerät ausgewählt.", "warn");
      showHelp("notlisted");
      ui.connect.disabled = false;
      return;
    }
    setState("Verbinde …", "busy");
    message("USB-Schnittstelle wird geöffnet …");
    const connection = await device.connect();
    message("Bitte am entsperrten Handy „USB-Debugging zulassen“ bestätigen (Haken bei „Immer zulassen“).", "warn");
    const transport = await L.AdbDaemonTransport.authenticate({
      serial: device.serial,
      connection,
      credentialStore: new L.CredentialStore("Tetherlume"),
    });
    if (token !== epoch) return;
    adb = new L.Adb(transport);
    enable(true);
    setState("Verbunden", "ok");
    message("ADB verbunden. Live-Bild wird gestartet …");
    loadDeviceInfo();
    transport.disconnected?.then?.(() => { if (token === epoch && adb) { stop(); message("Verbindung zum Handy verloren.", "warn"); } });
    await startLive(token);
  } catch (e) {
    console.error(e);
    const msg = String(e?.message || e);
    await stop(true);
    if (/claim|in use|busy|Unable to claim|Access denied/i.test(msg) || e?.name === "NetworkError" || e?.name === "SecurityError") {
      message("USB ist belegt oder gesperrt: " + msg, "bad");
      showHelp("busy");
    } else if (/timeout|timed out|closed unexpectedly/i.test(msg)) {
      message("Keine Antwort vom Handy: " + msg, "bad");
      showHelp("auth");
    } else {
      message("Verbindung fehlgeschlagen: " + msg, "bad");
      showHelp("general");
    }
  }
}

async function loadDeviceInfo() {
  try {
    const run = (c) => adb.subprocess.noneProtocol.spawnWaitText(c).then((t) => t.trim());
    const [brand, model, release, sdk, battery] = await Promise.all([
      adb.getProp("ro.product.manufacturer"), adb.getProp("ro.product.model"),
      adb.getProp("ro.build.version.release"), adb.getProp("ro.build.version.sdk"),
      run("dumpsys battery | grep level").catch(() => ""),
    ]);
    const lvl = (battery.match(/\d+/) || [""])[0];
    ui.info.innerHTML = "";
    const rows = [["Gerät", `${brand} ${model}`], ["Android", `${release} (API ${sdk})`]];
    if (lvl) rows.push(["Akku", lvl + " %"]);
    for (const [k, v] of rows) {
      const dt = document.createElement("dt"); dt.textContent = k;
      const dd = document.createElement("dd"); dd.textContent = v;
      ui.info.append(dt, dd);
    }
    ui.info.hidden = false;
    if (Number(sdk) < 21) message("Android ist zu alt für Live-Video (mind. Android 5). Bild-Modus wird genutzt.", "warn");
  } catch {}
}

// ---------- Live-Video über scrcpy ----------
function qualityOptions() {
  const [maxSize, bitRate, fps] = ui.quality.value.split(",").map(Number);
  return { maxSize, videoBitRate: bitRate, maxFps: fps };
}

async function startLive(token) {
  if (!("VideoDecoder" in window)) {
    message("Dein Browser kann kein Live-Video dekodieren – Bild-Modus wird genutzt.", "warn");
    return startFallback(token);
  }
  try {
    message("Live-Server wird aufs Handy kopiert …");
    const buf = new Uint8Array(await (await fetch(SERVER_FILE)).arrayBuffer());
    if (buf.length < 50000) throw new Error("Server-Datei fehlt");
    await L.AdbScrcpyClient.pushServer(adb, new ReadableStream({ start(c) { c.enqueue(buf); c.close(); } }));
    if (token !== epoch) return;

    const options = new L.AdbScrcpyOptions3_3_3({
      audio: false,
      control: true,
      stayAwake: true,
      clipboardAutosync: false,
      videoCodec: "h264",
      ...qualityOptions(),
    });
    message("Live-Bild wird gestartet …");
    client = await L.AdbScrcpyClient.start(adb, L.DefaultServerPath, options);
    if (token !== epoch) { client.close(); return; }
    // Server-Ausgabe ins Diagnose-Log
    client.output.pipeTo(new WritableStream({ write(line) { log.push("[server] " + line); if (log.length > 60) log.shift(); } })).catch(() => {});

    const video = await client.videoStream;
    if (!video) throw new Error("Kein Videostream");
    const Renderer = L.WebGLVideoFrameRenderer?.isSupported ? L.WebGLVideoFrameRenderer : L.BitmapVideoFrameRenderer;
    const renderer = new Renderer();
    canvas = renderer.canvas;
    canvas.id = "live-canvas";
    canvas.tabIndex = 0;
    canvas.setAttribute("aria-label", "Android-Bildschirm – klicken zum Steuern");
    ui.screen.replaceChildren(canvas);
    decoder = new L.WebCodecsVideoDecoder({ codec: video.metadata.codec, renderer });
    let first = true;
    decoder.sizeChanged(({ width, height }) => {
      ui.stage.classList.toggle("landscape", width > height);
      if (first) { first = false; message(`Live! ${video.metadata.deviceName || "Android"} · ${width} × ${height}. Klicke ins Bild zum Steuern, tippe zum Schreiben.`, "ok"); }
    });
    video.stream.pipeTo(decoder.writable).catch((e) => { if (token === epoch) message("Videostream beendet: " + e.message, "warn"); });
    client.exited.then(() => { if (token === epoch && mode === "live") { message("Live-Server wurde beendet. Klicke „Bild neu starten“.", "warn"); setState("Verbunden · kein Bild", "warn"); } });

    mode = "live";
    ui.placeholder.hidden = true;
    ui.screen.hidden = false;
    ui.fallbackImg.hidden = true;
    setState("Live verbunden", "ok");
    bindInput(canvas);
    fpsMeter(token);
    canvas.focus({ preventScroll: true });
  } catch (e) {
    console.error(e);
    const out = e?.output ? " | " + e.output.slice(-3).join(" / ") : "";
    log.push("Live-Fehler: " + e.message + out);
    try { await client?.close(); } catch {}
    client = undefined;
    if (token !== epoch) return;
    message("Live-Video nicht möglich (" + e.message + "). Wechsle in den Bild-Modus …", "warn");
    await startFallback(token);
  }
}

function fpsMeter(token) {
  let last = 0;
  const t = setInterval(() => {
    if (token !== epoch || !decoder) { clearInterval(t); ui.fps.textContent = ""; return; }
    const n = decoder.framesRendered;
    ui.fps.textContent = (n - last) + " FPS";
    last = n;
  }, 1000);
}

// ---------- Eingaben ----------
function point(e) {
  const r = canvas.getBoundingClientRect();
  const w = canvas.width, h = canvas.height;
  // object-fit: contain berücksichtigen
  const scale = Math.min(r.width / w, r.height / h);
  const ox = (r.width - w * scale) / 2, oy = (r.height - h * scale) / 2;
  const x = Math.round((e.clientX - r.left - ox) / scale);
  const y = Math.round((e.clientY - r.top - oy) / scale);
  return { x: Math.max(0, Math.min(w - 1, x)), y: Math.max(0, Math.min(h - 1, y)), w, h };
}

function touch(action, e) {
  if (!client?.controller || !canvas.width) return;
  const p = point(e);
  const pointerId = e.pointerType === "mouse" ? L.ScrcpyPointerId.Finger : BigInt(e.pointerId);
  client.controller.injectTouch({
    action, pointerId,
    pointerX: p.x, pointerY: p.y, videoWidth: p.w, videoHeight: p.h,
    pressure: action === L.AndroidMotionEventAction.Up ? 0 : 1,
    actionButton: 0, buttons: 0,
  }).catch(() => {});
}

function bindInput(el) {
  const A = L.AndroidMotionEventAction;
  el.addEventListener("pointerdown", (e) => {
    if (e.button === 2) { e.preventDefault(); key(4); return; } // Rechtsklick = Zurück
    if (e.button === 1) { e.preventDefault(); key(3); return; } // Mittelklick = Home
    el.focus({ preventScroll: true });
    el.setPointerCapture(e.pointerId);
    e.preventDefault();
    touch(A.Down, e);
  });
  el.addEventListener("pointermove", (e) => { if (e.buttons || e.pointerType !== "mouse") { if (el.hasPointerCapture(e.pointerId)) touch(A.Move, e); } });
  el.addEventListener("pointerup", (e) => { if (el.hasPointerCapture(e.pointerId)) touch(A.Up, e); });
  el.addEventListener("pointercancel", (e) => touch(A.Cancel ?? 3, e));
  el.addEventListener("contextmenu", (e) => e.preventDefault());
  el.addEventListener("wheel", (e) => {
    if (!client?.controller) return;
    e.preventDefault();
    const p = point(e);
    const clamp = (v) => Math.max(-1, Math.min(1, v));
    client.controller.injectScroll({
      pointerX: p.x, pointerY: p.y, videoWidth: p.w, videoHeight: p.h,
      scrollX: clamp(-e.deltaX / 100), scrollY: clamp(-e.deltaY / 100), buttons: 0,
    }).catch(() => {});
  }, { passive: false });
  el.addEventListener("keydown", onKey);
  el.addEventListener("paste", (e) => { const t = e.clipboardData?.getData("text"); if (t) { e.preventDefault(); sendText(t); } });
}

const KEYMAP = {
  Backspace: 67, Delete: 112, Enter: 66, Tab: 61, Escape: 111,
  ArrowUp: 19, ArrowDown: 20, ArrowLeft: 21, ArrowRight: 22,
  Home: 122, End: 123, PageUp: 92, PageDown: 93,
};
function onKey(e) {
  if (e.ctrlKey && e.key.toLowerCase() === "v") return; // Einfügen über paste-Event
  if (e.ctrlKey || e.metaKey || e.altKey) {
    if (e.ctrlKey && /^[acxzy]$/i.test(e.key)) { e.preventDefault(); keyCombo(e.key.toLowerCase()); }
    return;
  }
  if (KEYMAP[e.key]) { e.preventDefault(); key(KEYMAP[e.key]); return; }
  if (e.key.length === 1) { e.preventDefault(); sendText(e.key); }
}

async function key(code) {
  if (mode === "fallback") return shell("input keyevent " + code);
  if (!client?.controller) return;
  const D = L.AndroidKeyEventAction;
  try {
    await client.controller.injectKeyCode({ action: D.Down, keyCode: code, repeat: 0, metaState: 0 });
    await client.controller.injectKeyCode({ action: D.Up, keyCode: code, repeat: 0, metaState: 0 });
  } catch (e) { message("Taste fehlgeschlagen: " + e.message, "warn"); }
}
async function keyCombo(letter) {
  // Strg + Buchstabe (META_CTRL_ON = 0x1000, KEYCODE_A = 29)
  const code = 29 + letter.charCodeAt(0) - 97;
  const D = L.AndroidKeyEventAction;
  if (!client?.controller) return;
  await client.controller.injectKeyCode({ action: D.Down, keyCode: code, repeat: 0, metaState: 0x1000 }).catch(() => {});
  await client.controller.injectKeyCode({ action: D.Up, keyCode: code, repeat: 0, metaState: 0x1000 }).catch(() => {});
}

async function sendText(text) {
  if (!text) return;
  if (mode === "fallback") return shell("input text " + JSON.stringify(text.replace(/ /g, "%s")));
  if (!client?.controller) return;
  try {
    if (/^[\x20-\x7e]*$/.test(text)) await client.controller.injectText(text);
    else await client.controller.setClipboard({ sequence: 0n, paste: true, content: text }); // Umlaute, Emojis
  } catch (e) { message("Text senden fehlgeschlagen: " + e.message, "warn"); }
}

async function shell(cmd) {
  if (!adb) return "";
  try { return await adb.subprocess.noneProtocol.spawnWaitText(cmd); }
  catch (e) { message("Befehl fehlgeschlagen: " + e.message, "warn"); return ""; }
}

// ---------- Bild-Modus (Fallback ohne Video) ----------
async function capturePng() {
  const valid = (b) => b?.length > 8 && b[0] === 137 && b[1] === 80;
  let bytes;
  try { bytes = await adb.subprocess.noneProtocol.spawnWait(["screencap", "-p"]); } catch {}
  if (!valid(bytes)) {
    const txt = await adb.subprocess.noneProtocol.spawnWaitText("screencap -p | base64");
    bytes = Uint8Array.from(atob(txt.replace(/\s/g, "")), (c) => c.charCodeAt(0));
  }
  if (!valid(bytes)) throw new Error("Kein Bild erhalten – Handy entsperren");
  return new Blob([bytes], { type: "image/png" });
}

async function startFallback(token) {
  mode = "fallback";
  ui.placeholder.hidden = true;
  ui.screen.hidden = true;
  ui.fallbackImg.hidden = false;
  setState("Verbunden · Bild-Modus", "warn");
  let url, fails = 0;
  const img = ui.fallbackImg;
  let down;
  const pt = (e) => {
    const r = img.getBoundingClientRect();
    return [Math.round((e.clientX - r.left) * img.naturalWidth / r.width), Math.round((e.clientY - r.top) * img.naturalHeight / r.height)];
  };
  img.onpointerdown = (e) => { img.setPointerCapture(e.pointerId); down = pt(e); e.preventDefault(); };
  img.onpointerup = (e) => {
    if (!down) return; const a = down, b = pt(e); down = undefined;
    shell(Math.hypot(a[0] - b[0], a[1] - b[1]) < 12 ? `input tap ${b[0]} ${b[1]}` : `input swipe ${a[0]} ${a[1]} ${b[0]} ${b[1]} 300`);
  };
  img.onkeydown = onKey;
  while (token === epoch && mode === "fallback") {
    try {
      const blob = await capturePng();
      if (token !== epoch) return;
      const next = URL.createObjectURL(blob);
      img.src = next;
      await img.decode().catch(() => {});
      if (url) URL.revokeObjectURL(url);
      url = next; fails = 0;
      ui.stage.classList.toggle("landscape", img.naturalWidth > img.naturalHeight);
    } catch (e) {
      if (++fails >= 3) { message("Bild-Modus: " + e.message, "bad"); return; }
    }
    await new Promise((r) => setTimeout(r, 400));
  }
}

// ---------- Trennen ----------
async function stop(silent) {
  epoch++;
  mode = "none";
  try { decoder?.dispose(); } catch {}
  decoder = undefined;
  try { await client?.close(); } catch {}
  client = undefined;
  try { await adb?.close(); } catch {}
  adb = undefined;
  device = undefined;
  ui.screen.replaceChildren();
  ui.screen.hidden = true;
  ui.fallbackImg.hidden = true;
  ui.fallbackImg.removeAttribute("src");
  ui.placeholder.hidden = false;
  ui.info.hidden = true;
  ui.fps.textContent = "";
  ui.stage.classList.remove("landscape");
  setState("Nicht verbunden");
  enable(false);
  if (!silent) message("Getrennt.");
}

// ---------- Dateien & APKs per Drag & Drop ----------
async function pushFile(file) {
  if (!adb) return;
  const isApk = /\.apk$/i.test(file.name);
  const safe = file.name.replace(/[^\w.\-äöüÄÖÜß ]/g, "_");
  const target = isApk ? "/data/local/tmp/tetherlume.apk" : "/sdcard/Download/" + safe;
  message(`${file.name} wird übertragen …`);
  const sync = await adb.sync();
  try {
    const data = new Uint8Array(await file.arrayBuffer());
    await sync.write({ filename: target, file: new ReadableStream({ start(c) { c.enqueue(data); c.close(); } }) });
  } finally { await sync.dispose(); }
  if (isApk) {
    message(`${file.name} wird installiert …`);
    const out = await shell(`pm install -r "${target}"; rm "${target}"`);
    message(/Success/i.test(out) ? `${file.name} installiert ✓` : "Installation: " + out.trim(), /Success/i.test(out) ? "ok" : "warn");
  } else {
    message(`${file.name} liegt jetzt im Ordner „Download“ auf dem Handy ✓`, "ok");
    shell(`am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d "file://${target}"`);
  }
}
ui.stage.addEventListener("dragover", (e) => { if (adb) { e.preventDefault(); ui.drop.hidden = false; } });
ui.stage.addEventListener("dragleave", () => (ui.drop.hidden = true));
ui.stage.addEventListener("drop", async (e) => {
  e.preventDefault(); ui.drop.hidden = true;
  for (const f of e.dataTransfer.files) { try { await pushFile(f); } catch (err) { message("Übertragung fehlgeschlagen: " + err.message, "bad"); } }
});
$("file-input").addEventListener("change", async (e) => {
  for (const f of e.target.files) { try { await pushFile(f); } catch (err) { message("Übertragung fehlgeschlagen: " + err.message, "bad"); } }
  e.target.value = "";
});

// ---------- Buttons ----------
ui.connect.onclick = connect;
ui.disconnect.onclick = () => stop();
document.querySelectorAll("[data-key]").forEach((b) => (b.onclick = () => key(Number(b.dataset.key))));
$("btn-notify").onclick = () => mode === "live" ? client?.controller?.expandNotificationPanel() : shell("cmd statusbar expand-notifications");
$("btn-rotate").onclick = () => mode === "live" ? client?.controller?.rotateDevice() : null;
let screenOff = false;
$("btn-screen").onclick = async () => {
  if (mode !== "live") return;
  screenOff = !screenOff;
  await client.controller.setScreenPowerMode(screenOff ? 0 : 2).catch(() => {});
  $("btn-screen").textContent = screenOff ? "☀ Display an" : "◐ Display aus";
  message(screenOff ? "Handy-Display ist aus, Steuerung läuft weiter (spart Akku)." : "Handy-Display ist wieder an.");
};
$("btn-restart").onclick = async () => {
  if (!adb) return;
  const token = ++epoch;
  try { decoder?.dispose(); } catch {}
  try { await client?.close(); } catch {}
  client = decoder = undefined;
  mode = "none";
  await startLive(token);
};
$("btn-shot").onclick = async () => {
  try {
    let blob;
    if (mode === "live" && decoder) blob = await decoder.snapshot();
    if (!blob && canvas && mode === "live") blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
    if (!blob) blob = await capturePng();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "tetherlume-" + new Date().toISOString().replace(/[:.]/g, "-") + ".png";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    message("Screenshot gespeichert ✓", "ok");
  } catch (e) { message("Screenshot fehlgeschlagen: " + e.message, "warn"); }
};
$("text-form").onsubmit = (e) => {
  e.preventDefault();
  const input = $("text-input");
  sendText(input.value);
  input.value = "";
};
$("shell-form").onsubmit = async (e) => {
  e.preventDefault();
  const cmd = $("shell-input").value.trim();
  if (!cmd) return;
  $("shell-output").textContent = "$ " + cmd + "\n…";
  const out = await shell(cmd);
  $("shell-output").textContent = "$ " + cmd + "\n" + (out || "(keine Ausgabe)");
};
document.querySelectorAll("[data-app]").forEach((b) => (b.onclick = () =>
  shell(`monkey -p ${b.dataset.app} -c android.intent.category.LAUNCHER 1`)));
$("full").onclick = async () => {
  try { document.fullscreenElement ? await document.exitFullscreen() : await ui.stage.requestFullscreen(); canvas?.focus(); }
  catch { message("Vollbild nicht möglich.", "warn"); }
};
document.addEventListener("fullscreenchange", () => ($("full").textContent = document.fullscreenElement ? "⤡ Vollbild beenden" : "⤢ Vollbild"));
ui.quality.onchange = () => { try { localStorage.setItem("tetherlume.quality", ui.quality.value); } catch {} if (mode === "live") $("btn-restart").click(); };
try { const q = localStorage.getItem("tetherlume.quality"); if (q && [...ui.quality.options].some((o) => o.value === q)) ui.quality.value = q; } catch {}

$("diag").onclick = async () => {
  const report = [
    "Tetherlume Web v" + VERSION + " · scrcpy " + SERVER_VERSION,
    "Browser: " + navigator.userAgent,
    "WebUSB: " + Boolean(navigator.usb) + " · HTTPS: " + isSecureContext + " · WebCodecs: " + ("VideoDecoder" in window),
    "Modus: " + mode,
    ...log,
  ].join("\n");
  try { await navigator.clipboard.writeText(report); $("diag").textContent = "✓ Diagnose kopiert"; setTimeout(() => ($("diag").textContent = "Diagnose kopieren"), 2500); }
  catch { window.prompt("Diagnose kopieren:", report); }
};
navigator.usb?.addEventListener("disconnect", (e) => {
  if (device && (device.raw === e.device || device.device === e.device)) { stop(true); message("USB-Kabel getrennt.", "warn"); }
});
window.addEventListener("beforeunload", () => { try { client?.close(); adb?.close(); } catch {} });

enable(false);
loadLibs();
