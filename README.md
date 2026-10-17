# FrameMobile

Mobile App (PWA) zum Entdecken von Filmen und Serien, im Stil von frameXTV.

## Online

https://todorovicsasa369-spec.github.io/FrameMobile/ — am Handy öffnen und
"Zum Startbildschirm hinzufügen" (bzw. "App installieren"). Jeder Push auf `main`
aktualisiert die Seite automatisch (GitHub Pages).

## Android-App (APK)

```
npm install
npm run apk
```

Ergebnis: `android/app/build/outputs/apk/debug/app-debug.apk`. Braucht JDK 17 und das
Android SDK (`ANDROID_HOME`). Aufs Handy kopieren und installieren ("Unbekannte Apps
installieren" für Dateimanager/Browser erlauben). Icons neu erzeugen:
`python scripts/make-icons.py`.

## Lokal starten

1. `start.bat` doppelklicken (braucht Python).
2. Am PC öffnet sich `http://localhost:8080`.
3. Am Handy (gleiches WLAN) die "Am Handy"-Adresse aus dem Fenster öffnen,
   z. B. `http://192.168.1.231:8080`, dann im Browser-Menü
   "Zum Startbildschirm hinzufügen".

Beim ersten Start fragt Windows evtl. nach der Firewall: "Private Netzwerke" erlauben,
sonst erreicht das Handy den PC nicht.

## Funktionen

- Suchleiste oben (sucht schon beim Tippen)
- Seitennummern unten auf jeder Liste: ‹ 1 2 3 4 … 3960 ›
- Home, Filme, Serien, Anime, Top bewertet, Neu im Kino
- Detailseite mit Trailer, Beschreibung und Besetzung
- Meine Liste (Merkliste, wird auf dem Gerät gespeichert)

## Daten

- Ohne Schlüssel: nur Serien, von TVmaze.
- Mit kostenlosem TMDB-Schlüssel (themoviedb.org → Einstellungen → API):
  Filme, Serien, Anime, Trailer, Streaming-Anbieter. In der App unter
  "Einstellungen" eintragen.

Die App spielt keine Filme ab. Sie zeigt, wo man sie legal schauen kann.
