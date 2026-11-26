# MOLITOR Android Desk
Deutsche Windows-Oberfläche für scrcpy. Eine einzelne USB-Verbindung spiegeln, das physische Display ausschalten und MP4-Aufnahmen an einem gewählten Speicherort ablegen.

[Download und Einrichtung](https://marcelmolitor.github.io/android-desk/)

## Bauen
Im Verzeichnis android-desk mit Zig 0.13.0 für Windows x64 bauen. Das Icon ist als Windows-Ressource eingebettet.

```sh
zig rc /fo icon.res src/app.rc
zig cc -target x86_64-windows-gnu -Os -s -municode -Wl,--subsystem,windows src/main.c icon.res -lcomdlg32 -ladvapi32 -lshell32 -luser32 -o MOLITOR-Android-Desk.exe
```

Die EXE benötigt ein über PATH erreichbares scrcpy. Die Einstellung für das Display steht unter HKCU/Software/Molitor/AndroidDesk. Bei einem Fehler lässt sich das lokale scrcpy-Protokoll öffnen. scrcpy ist ein eigenständiges Projekt von Genymobile und wird separat installiert.
