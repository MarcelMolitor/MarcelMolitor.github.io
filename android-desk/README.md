# Tetherlume
Your phone. Your desktop.

Free, open-source Windows launcher for scrcpy. Mirror and control one USB-connected Android device, switch off its physical screen, and record MP4 video.

[Download and instructions](https://marcelmolitor.github.io/android-desk/)

## Build
Use Zig 0.13.0 in the android-desk directory:

```sh
zig rc /fo icon.res src/app.rc
zig cc -target x86_64-windows-gnu -Os -s -municode -Wl,--subsystem,windows src/main.c icon.res -lcomdlg32 -ladvapi32 -lshell32 -luser32 -o MOLITOR-Android-Desk.exe
```

The online setup downloads original scrcpy and verifies its pinned SHA-256 checksum. The launcher prefers its local scrcpy directory, then PATH. Setup 0.3 is a preview pending automated build and installation checks and physical USB/recording tests. Older binaries retain their former name and German interface. Existing URLs and internal IDs are retained for compatibility.

MIT license for Tetherlume; scrcpy and dependencies retain their own licenses. Independent software by Marcel Molitor. Android is a trademark of Google LLC. Voluntary support only.
