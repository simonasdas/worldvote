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

### 3. Server nie einschlafen lassen (Wachhalter)

Damit der kostenlose Render-Service **permanent wach** bleibt, pingt ein
GitHub-Actions-Workflow (`/.github/workflows/keep-awake.yml`) die Seite
**alle 7 Minuten** an – das läuft 24/7 auf GitHubs Servern, auch wenn
dein PC aus ist.

Einrichten (einmalig, 1 Minute):

1. Gib mir deine Render-Adresse – oder trage sie selbst ein. Entweder:
   - **Repo-Variable:** GitHub → dein Repo → *Settings* → *Secrets and
     variables* → *Actions* → Tab *Variables* → *New repository variable*
     - Name: `KEEP_AWAKE_URL`, Value: `https://worldvote-xxxx.onrender.com`
   - **oder** in die Datei `keep-awake-url.txt` schreiben (eine Zeile) und pushen
2. Danach unter *Actions* → *🔋 Server wach halten* den ersten Lauf
   manuell mit *Run workflow* testen → grün ✓ = läuft

> ⚠️ Bei **öffentlichen** Repos deaktiviert GitHub geplante Workflows, wenn
> 60 Tage lang nichts im Repo passiert ist. Abhilfe: Repo auf **privat**
> stellen (geht beim kostenlosen Plan) oder alle ~60 Tage etwas pushen.
> Alternativ: [uptimerobot.com](https://uptimerobot.com) (kostenlos, 5-Min-Intervall)
> auf deine Render-Adresse zeigen lassen.

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
