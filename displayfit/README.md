# DisplayFit

Erzeugt lokal einen zentrierten 9:16-JPEG-Ausschnitt in 1080 × 1920 Pixeln. Keine automatische EXIF-Drehung. Neue Zieldatei erforderlich.

## Build
Mit Zig 0.13.0 in diesem Verzeichnis:
```sh
git clone https://github.com/nothings/stb.git stb
git -C stb checkout 6b5799bae8a1fe3792691ef4b72ae26434c3e799
zig cc -target x86_64-windows-gnu -O2 -s -municode -Wl,--subsystem,windows -Istb app.c -lcomdlg32 -luser32 -o DisplayFit.exe
```
