# MOLITOR FotoLimit
Lokales Windows-Werkzeug für JPEG- und PNG-Fotos bis 36 Megapixel. Erst sinkt die JPEG-Qualität schrittweise, anschließend bei Bedarf die Auflösung. Transparenz wird auf Weiß gelegt. Kameradaten und EXIF-Drehangaben werden nicht übernommen. Bitte die Ausrichtung der Kopie kontrollieren. Vorhandene Dateien werden nicht überschrieben.
## Build
Mit Zig 0.13.0 in diesem Verzeichnis:
```sh
git clone https://github.com/nothings/stb.git stb
git -C stb checkout 6b5799bae8a1fe3792691ef4b72ae26434c3e799
zig cc -target x86_64-windows-gnu -O2 -s -municode -Wl,--subsystem,windows -Istb fotolimit.c -lcomdlg32 -luser32 -o MOLITOR-FotoLimit.exe
```
