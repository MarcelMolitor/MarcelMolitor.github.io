# MOLITOR – Windows-Software

## Finanzierungsmodell
Die vier veröffentlichten Windows-Werkzeuge bleiben kostenlos nutzbar. Keine Pflichtabonnements, keine kostenpflichtige Freischaltung. Freiwillige Unterstützung über den vorhandenen PayPal-Link ist keine Download- oder Nutzungsvoraussetzung. Keine steuerliche Absetzbarkeit versprechen.

## Vorgeschlagene WinGet-Paket-IDs (noch nicht veröffentlicht)

| Anwendung | Paket-ID | Version laut Produktseite |
|---|---|---|
| MOLITOR HandyBrücke | Molitor.AndroidDesk | 0.1 |
| FotoLimit | Molitor.FotoLimit | 1.0 |
| QR-Brücke | Molitor.QRBruecke | 1.0 |
| DisplayFit | Molitor.DisplayFit | 1.0 |

## Gemeinsame Freigabeprüfung
1. MIT-Lizenz für den eigenen Code aller vier Anwendungen festgelegt (siehe jeweilige LICENSE-Datei). Drittkomponenten bleiben unter ihren jeweiligen Lizenzen; deren Hinweise und Weitergabebedingungen vor dem Release prüfen.
2. Windows-x64-Builds in einer sauberen Windows-Umgebung testen.
3. Unveränderliche versionsgebundene Artefakte und SHA-256-Prüfsummen bereitstellen.
4. WinGet-Manifeste mit zutreffendem InstallerType, Publisher, Lizenz und Abhängigkeiten erstellen und validieren. MOLITOR HandyBrücke benötigt Genymobile.scrcpy.
5. Installation, Aktualisierung und Deinstallation prüfen.
6. Pull Request bei microsoft/winget-pkgs einreichen. Paketnamen erst nach Annahme als installierbar bewerben.

Die Paket-IDs sind Vorschläge, keine reservierten oder verfügbaren WinGet-Pakete. Die aktuellen EXE-Dateien wurden im Rahmen dieser Dokumentation nicht geändert oder getestet. Die Website-Downloads bleiben bestehen.

Siehe auch [MOLITOR HandyBrücke – WinGet-Plan](android-desk/WINGET.md) und https://learn.microsoft.com/windows/package-manager/package/.
