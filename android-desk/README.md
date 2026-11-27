# MOLITOR HandyBrücke
Deutsche Windows-Oberfläche für scrcpy. Eine einzelne USB-Verbindung spiegeln, das physische Display ausschalten und MP4-Aufnahmen an einem gewählten Speicherort ablegen.

[Download und Einrichtung](https://marcelmolitor.github.io/android-desk/)

## Bauen
Im Verzeichnis android-desk mit Zig 0.13.0 für Windows x64 bauen. Das Icon ist als Windows-Ressource eingebettet.

```sh
zig rc /fo icon.res src/app.rc
zig cc -target x86_64-windows-gnu -Os -s -municode -Wl,--subsystem,windows src/main.c icon.res -lcomdlg32 -ladvapi32 -lshell32 -luser32 -o MOLITOR-Android-Desk.exe
```

Die EXE benötigt ein über PATH erreichbares scrcpy. Die Einstellung für das Display steht unter HKCU/Software/Molitor/AndroidDesk. Bei einem Fehler lässt sich das lokale scrcpy-Protokoll öffnen. scrcpy ist ein eigenständiges Projekt von Genymobile und wird separat installiert.

## Setup 0.2 (in Vorbereitung)
Der Online-Installer lädt das unveränderte scrcpy von Genymobile direkt herunter und prüft dessen fest hinterlegte SHA-256-Prüfsumme. Der neue Launcher sucht zuerst im eigenen Unterordner `scrcpy`. Internetzugang während der Installation erforderlich. Siehe `installer/Android-Desk.iss` und `installer/THIRD-PARTY.txt`. Die GitHub Action `MOLITOR HandyBrücke Setup` kann manuell gestartet werden; sie baut und testet den Installer. Erst nach bestandenem Test und manuellem USB-/MP4-Test wird der öffentliche Download ersetzt. Die bisherige Version 0.1 bleibt verfügbar.

Namenswechsel: MOLITOR HandyBrücke (bisher Android Desk). Bestehende URLs, Dateinamen und interne IDs bleiben vorerst aus Kompatibilitätsgründen erhalten. Ältere EXE-Dateien zeigen noch den früheren Namen.
