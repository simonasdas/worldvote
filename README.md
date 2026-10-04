# 🎮 WorldVote

Live-Quiz- und Voting-Spiel für Freunde – ganz ohne Installation.
Ein Gastgeber erstellt ein Spiel (Name, Design, Fragen), bekommt einen
**Zugangscode + QR-Code**, und alle anderen treten vom Handy aus bei.
Alles läuft in **Echtzeit** (Server-Sent Events).

## Features

- ✅ Anmelden / Registrieren (Konten liegen auf dem Server → auf jedem Gerät nutzbar)
- ✅ Spiel erstellen: Name → Design (Classic / Neon / Dark) → Fragen-Editor
- ✅ Fragen-Editor: 4 farbige Antworten, richtige Antwort markieren, Zeitlimit (10–90 s)
- ✅ Zugangscode (6 Ziffern) groß & auffällig + **QR-Code** (wird vom Server erzeugt)
- ✅ Beitreten per Code **oder per Link** `https://DEINE-DOMÄNE/?join=123456`
- ✅ Live-Lobby: Spielerzahl & Teilnehmer aktualisieren sich sofort bei allen
- ✅ Spielfläche: Frage, Timer, Abstimmung, automatische Auflösung
- ✅ Punkte (richtig = 100 + Zeitbonus), Ergebnis-Ansicht, Finale-Platzierung

## Lokal starten

```bash
npm install
npm start
```

Dann öffnen: http://localhost:8765

## Weltweit online mit GitHub + Render

### 1. Code auf GitHub laden

Das Repository ist bereits angelegt (siehe `git remote -v`). Push:

```bash
git push -u origin main
```

### 2. Bei Render deployen

1. [render.com](https://render.com) kostenlos registrieren (auch mit GitHub-Konto möglich)
2. **New → Web Service** → dein Repository `worldvote` verbinden
3. Einstellungen:
   - **Name:** z. B. `worldvote`
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
4. **Create Web Service** → fertig

Nach dem Deploy läuft die App unter einer Adresse wie
`https://worldvote-xxxx.onrender.com` – QR-Code und `?join=`-Links
nutzen automatisch diese Adresse.

> **Hinweis (kostenloser Plan):** Render schläft nach ~15 Min. Inaktivität ein
> und wacht beim nächsten Aufruf in ~50 s wieder auf. Außerdem wird die
> `data.json` bei jedem Redeploy gelöscht (Konten/Spiele gehen verloren).
> Für Dauerbetrieb: paid Plan oder eine echte Datenbank (z. B. Postgres).

## Spielablauf

1. **Gastgeber:** Anmelden → *Spiel erstellen* → Name, Design, Fragen → *Spiel starten*
2. Code/QR-Code zeigen → Spieler treten bei → *▶️ Spiel starten*
3. pro Frage: alle stimmen ab → Auflösung (automatisch bei allen Stimmen oder manuell)
4. nach der letzten Frage: **Finale Platzierung** → *Spiel beenden*

## Technik

- Node.js ohne Framework (`http`-Modul), nur Abhängigkeit: [`qrcode`](https://www.npmjs.com/package/qrcode)
- Echtzeit: **Server-Sent Events** (`/api/games/:code/events`) – funktioniert zuverlässig auf Render
- Daten: `data.json` (einfach, ohne Datenbank)
- Frontend: eine einzige HTML-Datei (`public/index.html`), Vanilla JS
