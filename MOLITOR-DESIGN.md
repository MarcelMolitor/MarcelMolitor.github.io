# MOLITOR ORBIT — Design System 2027

Eigenständige Produktidentität. Keine fremden Logos oder kopierten Oberflächen.

## Tokens

Space #0B1628; Electric Blue #2563EB; Cyan #38BDF8; Violet #A78BFA; Cloud #F8FAFC; Gold #D4AF69; Research Petrol #0F766E.

Primäraktionen: Blau mit weißem Text. Cyan/Violett als dekorative Signatur, nicht als alleinige Statuscodierung. Gold für freiwillige Unterstützung. Wissenschaftliche Oberflächen behalten ihre fachliche Farbsemantik.

## Komponenten

Systemschrift Segoe UI/system-ui, klare Hierarchie, 44 px Web-Touchziele, 10 px Buttonradius, 16 px Kartenradius, sichtbarer Tastaturfokus. Keine unnötigen Animationen. Reduced Motion und Windows-Hochkontrast respektieren.

## Implementierung

molitor-orbit.css: opt-in Produktseiten und Download-Center. molitor-identity.css: gemeinsame Navigation. molitor-home.css: Hauptseite. Native Apps übernehmen dieselben Farbtokens, behalten native Bedienbarkeit und müssen vor Veröffentlichung gebaut und getestet werden. Android und Desktop-Binärdateien sind durch CSS-Änderungen nicht aktualisiert.

## Freigabe

Mobil- und Desktop-Ansicht, Kontrast, Tastaturnavigation, Funktionsprüfung und Build prüfen. Keine Version als getestet kennzeichnen, solange die Prüfung aussteht.
