# WinGet-Veröffentlichung (in Vorbereitung)

Vorgeschlagene Paket-ID: `Molitor.AndroidDecks` (noch nicht registriert).

Android Decks bleibt kostenlos; freiwillige finanzielle Unterstützung ist keine Voraussetzung für die Nutzung. scrcpy von Genymobile wird separat als offizielle Paketabhängigkeit `Genymobile.scrcpy` installiert. Die jeweilige Lizenz und Hinweise zu Drittkomponenten sind zu beachten. Vor Veröffentlichung muss die Lizenz des eigenen Programms ausdrücklich festgelegt werden.

## Release-Checkliste

- Windows-x64-EXE aus geprüftem Quellcode bauen und unter Windows testen (USB, Aufnahme, sauberes Beenden).
- Versionsgebundenes, unveränderliches Download-Artefakt veröffentlichen.
- SHA-256 mit `winget hash` ermitteln.
- WinGet-Manifeste mit InstallerType `portable`, Architektur `x64`, korrekter Version, Download-URL, Hash, Publisher, Lizenz und PackageDependencies (`Genymobile.scrcpy`) erstellen; Schema und Paket-ID prüfen.
- Lokale Installation, Deinstallation und Aktualisierung in Windows Sandbox testen; sicherstellen, dass scrcpy gefunden wird.
- Manifest mit `winget validate` prüfen und einen Pull Request an https://github.com/microsoft/winget-pkgs einreichen.
- Erst nach Annahme und Verfügbarkeit im Katalog den Installationsbefehl öffentlich bewerben.

Microsoft-Dokumentation: https://learn.microsoft.com/windows/package-manager/package/

Es wurde noch kein Paket bei Microsoft eingereicht. Keine Platzhalter-Hashes oder ungeprüften Download-Artefakte veröffentlichen.
