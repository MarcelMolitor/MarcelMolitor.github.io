# QR-Brücke

Webadresse am Windows-PC einfügen und am Smartphone scannen. Erzeugt den QR-Code vollständig offline.

## Build mit Zig 0.13.0

```sh
zig rc /fo qr.res dialog.rc
zig cc -target x86_64-windows-gnu -Os -s -municode -Wl,--subsystem,windows app.c qrcodegen.c qr.res -lgdi32 -luser32 -o QR-Bruecke.exe
```

QR-Bibliothek: Project Nayuki, MIT-Lizenz im Quelltext, Commit 9a217d443937f60cc56c1458c39a211d7f2d3af5.
