# Tetherlume – Play Store Leitfaden

Stand: 27.11.2026 · App-ID `com.molitor.tetherlume` · Version 0.2.0 (versionCode 2)

## Automatisch erledigt
- Bei jedem Push in `tetherlume/android/` baut GitHub Actions („Tetherlume Android preview“) automatisch Debug-APK + Release-AAB. Download unter **Actions → letzter Lauf → Artifacts** (7 Tage).
- Sobald die vier Secrets gesetzt sind, wird das AAB direkt **signiert** und kann in die Play Console hochgeladen werden.

## Einmalig von dir (kann ich nicht für dich tun)
1. **Play-Console-Konto**: play.google.com/console → Privates Konto → einmalig 25 US-$ → Ausweis-Verifizierung.
2. **Upload-Schlüssel erstellen** (einmal, am PC mit Java):
   ```
   keytool -genkeypair -v -keystore upload.jks -alias tetherlume -keyalg RSA -keysize 2048 -validity 10000
   ```
   Datei + Passwörter sicher aufbewahren (Passwort-Manager, Backup). Nie ins Repo hochladen.
3. **Secrets in GitHub** (Repo → Settings → Secrets and variables → Actions):
   - `TL_KEYSTORE_BASE64` = Inhalt von `base64 -w0 upload.jks` (Windows PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("upload.jks"))`)
   - `TL_KEYSTORE_PASSWORD`, `TL_KEY_ALIAS` (= tetherlume), `TL_KEY_PASSWORD`
4. **Geschlossener Test**: Neue private Konten müssen meist erst einen geschlossenen Test mit ca. 12 Testern über 14 Tage laufen lassen, bevor „Produktion“ freigeschaltet wird. Tester per E-Mail-Liste einladen (Freunde/Familie mit Android).
5. Danach **Produktionszugriff beantragen** und veröffentlichen.

> Hinweis: Google lehnt Apps mit sehr wenig eigener Funktion manchmal ab („Mindestfunktionalität“). Die App prüft USB-Debugging + Kabel, öffnet die Entwickleroptionen und schickt den Link an den PC. Falls Google ablehnt: nächste Ausbaustufe wäre WLAN-Debugging-Assistent oder eine Handy-zu-Handy-Steuerung per USB-OTG.

## Store-Eintrag (Deutsch)

**App-Name (max. 30):** Tetherlume – Handy im Browser

**Kurzbeschreibung (max. 80):** Android per USB live im Browser am PC steuern – ohne Installation am Computer.

**Vollständige Beschreibung:**
```
Tetherlume bringt dein Android-Handy auf den PC – live im Browser, per USB-Kabel, ohne Programm am Computer.

Diese App ist dein Startassistent:
✓ Zeigt sofort, ob USB-Debugging aktiv ist und ein Kabel erkannt wird
✓ Öffnet mit einem Tipp die Entwickleroptionen
✓ Schickt den Link zu Tetherlume Web an deinen PC (Mail, WhatsApp, Notiz …)

Am PC in Chrome oder Edge öffnest du dann Tetherlume Web und bekommst:
⚡ Live-Bild deines Handys mit bis zu 60 FPS
🖱 Steuerung mit Maus und Tastatur (inkl. Umlaute und Emojis)
📦 Fotos, Dateien und APKs per Drag & Drop aufs Handy
🔔 Zurück, Home, Lautstärke, Drehen, Mitteilungen, Screenshot
🔒 Keine Cloud, kein Konto: Bild und Eingaben laufen nur übers Kabel

Ideal, um am PC Nachrichten zu tippen, App-Demos zu zeigen, Support zu geben oder Dateien schnell rüberzuschieben.

Kostenlos, ohne Werbung, ohne Tracking. Entwickelt in Deutschland von Marcel Molitor.
Early Access – Feedback ist sehr willkommen!
```

**Kategorie:** Tools · **Tags:** Bildschirmspiegelung, Fernsteuerung, Produktivität
**Kontakt-E-Mail:** (deine öffentliche Support-Adresse)
**Website:** https://marcelmolitor.github.io/tetherlume/web/
**Datenschutzerklärung-URL:** https://marcelmolitor.github.io/tetherlume/android/privacy.html

## Store-Eintrag (Englisch)
**Name:** Tetherlume – Phone in Browser
**Short:** Mirror & control your Android live in the browser via USB – no PC install.
**Full:** Englische Fassung der obigen Beschreibung (gleiche Punkte).

## Formulare in der Play Console
- **Datensicherheit:** Keine Daten erhoben, keine Daten geteilt. Keine Verschlüsselung relevant (keine Übertragung). Kein Konto nötig.
- **Werbung:** Nein. **In-App-Käufe:** Nein (bis Gewerbe angemeldet ist).
- **Inhaltseinstufung (IARC):** Utility/Tools, keine kritischen Inhalte → USK 0 / PEGI 3.
- **Zielgruppe:** 18+ (wegen Entwickleroptionen/USB-Debugging am sinnvollsten).
- **App-Zugriff:** Alle Funktionen ohne Login verfügbar.
- **Regierungs-/Finanz-/Gesundheits-App:** Nein.
- **Händlerstatus (EU DSA):** „Kein Händler“, solange die App kostenlos ist und nichts verkauft wird.

## Grafiken
- **App-Symbol 512×512 PNG** und **Feature-Grafik 1024×500** → liegen unter `tetherlume/android/store/`.
- **Screenshots (min. 2, Hochformat):** Am Handy die App öffnen und Screenshots machen; zusätzlich Screenshots von Tetherlume Web am PC (ohne private Inhalte).
