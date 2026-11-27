# Tetherlume
Your phone. Your desktop.

Free, open-source Windows launcher for scrcpy. Mirror and control one USB-connected Android device, switch off its physical screen, and record MP4 video.

**[Download Tetherlume for Windows (setup, Windows 10/11, 64-bit)](https://github.com/MarcelMolitor/MarcelMolitor.github.io/releases/download/tetherlume-windows-latest/Tetherlume-Setup.exe)** – includes scrcpy. [SHA-256 checksum](https://github.com/MarcelMolitor/MarcelMolitor.github.io/releases/download/tetherlume-windows-latest/SHA256.txt)

Windows SmartScreen may warn about new programs: choose "More info" → "Run anyway".

`MOLITOR-Android-Desk.exe` in this folder is only the launcher and needs scrcpy; use the setup above.

No installation? Try [Tetherlume Web in your browser](https://marcelmolitor.github.io/tetherlume/web/).

[Instructions](https://marcelmolitor.github.io/android-desk/) · [Anleitung auf Deutsch](https://marcelmolitor.github.io/android-desk/de.html)

## Build
Use Zig 0.13.0 in the android-desk directory:

```sh
zig rc /fo icon.res src/app.rc
zig cc -target x86_64-windows-gnu -Os -s -municode -Wl,--subsystem,windows src/main.c icon.res -lcomdlg32 -ladvapi32 -lshell32 -luser32 -o MOLITOR-Android-Desk.exe
```

The online setup downloads original scrcpy and verifies its pinned SHA-256 checksum. The launcher prefers its local scrcpy directory, then PATH. Setup 0.3 is a preview pending automated build and installation checks and physical USB/recording tests. Older binaries retain their former name and German interface. Existing URLs and internal IDs are retained for compatibility.

MIT license for Tetherlume; scrcpy and dependencies retain their own licenses. Independent software by Marcel Molitor. Android is a trademark of Google LLC. Voluntary support only.
