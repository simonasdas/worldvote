'use strict';
/* ============================================================
   WorldVote – Live Quiz & Voting Server
   - Kein Framework, nur Node-Standardbibliotheken + qrcode
   - Echtzeit via Server-Sent Events (funktioniert gut auf Render)
   - Daten in data.json (auf Render: Deploy-Verzeichnis, neu bei Redeploy)
   ============================================================ */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const QRCode = require('qrcode');

const PORT = process.env.PORT || 8765;
const PUB = path.join(__dirname, 'public');
const DATA = path.join(__dirname, 'data.json');

/* ---------------- Persistenz ---------------- */
let db = { users: {}, sessions: {}, games: {} };
try {
  const parsed = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  db = Object.assign(db, parsed);
} catch (e) { /* erster Start */ }

let saveT = null;
function save() {
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    try { fs.writeFileSync(DATA, JSON.stringify(db)); } catch (e) {}
  }, 250);
}

const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const newToken = () => crypto.randomBytes(24).toString('hex');

const USERNAME_RE = /^[\wÄÖÜäöüß.\- ]{3,20}$/;
const DESIGNS = ['classic', 'neon', 'dark'];
const MAX_PLAYERS = 30;

const timers = {};            // code -> Timeout (Auto-Auflösung)
const subs = new Map();       // code -> Set({res, user})  SSE-Verbindungen

/* ---------------- Spiel-Logik ---------------- */
function getGame(code) { return db.games[code]; }

function genCode() {
  let c;
  do { c = String(Math.floor(100000 + Math.random() * 900000)); } while (db.games[c]);
  return c;
}

function countVotes(g) {
  const r = [0, 0, 0, 0];
  for (const k in g.votes) {
    const v = g.votes[k];
    if (Number.isInteger(v) && v >= 0 && v < 4) r[v]++;
  }
  return r;
}

function beginQuestion(g, i) {
  g.qIndex = i;
  g.votes = {};
  g.phase = 'question';
  const q = g.questions[i];
  g.questionEndsAt = Date.now() + q.time * 1000;
  clearTimeout(timers[g.code]);
  timers[g.code] = setTimeout(() => reveal(g), q.time * 1000 + 250);
  save();
  broadcast(g.code);
}

function reveal(g) {
  if (g.phase !== 'question') return;
  clearTimeout(timers[g.code]);
  delete timers[g.code];
  const q = g.questions[g.qIndex];
  const remain = Math.max(0, (g.questionEndsAt - Date.now()) / 1000);
  const awarded = {};
  for (const p of g.players) {
    const v = g.votes[p.name];
    const add = (v === q.correct) ? 100 + Math.round(remain * 5) : 0;
    p.score = (p.score || 0) + add;
    awarded[p.name] = add;
  }
  g.lastAwarded = awarded;
  g.phase = 'reveal';
  save();
  broadcast(g.code);
}

function view(g, user) {
  const isHost = user === g.hostName;
  const inPlayers = g.players.some(p => p.name === user);
  const q = g.questions[g.qIndex] || null;
  const out = {
    code: g.code, name: g.name, design: g.design, phase: g.phase,
    qIndex: g.qIndex, questionCount: g.questions.length,
    hostName: g.hostName, isHost: isHost, me: user, inGame: isHost || inPlayers,
    players: g.players.map(p => ({ name: p.name, score: p.score || 0 })),
    answered: Object.keys(g.votes).length, totalPlayers: g.players.length,
    myVote: inPlayers && g.votes[user] !== undefined ? g.votes[user] : null,
    questionEndsAt: g.phase === 'question' ? g.questionEndsAt : 0
  };
  if (q) {
    out.current = { text: q.text, answers: q.answers, time: q.time };
    if (isHost || g.phase !== 'question') out.current.correct = q.correct;
  }
  if (isHost) {
    out.questions = g.questions.map(x => ({ text: x.text, answers: x.answers, time: x.time, correct: x.correct }));
  }
  if (g.phase === 'question' && isHost) out.results = countVotes(g);
  if (g.phase === 'reveal') { out.results = countVotes(g); out.awarded = g.lastAwarded || {}; }
  return out;
}

/* ---------------- Echtzeit (SSE) ---------------- */
function sendTo(entry, obj) {
  try { entry.res.write('data: ' + JSON.stringify(obj) + '\n\n'); } catch (e) {}
}
function broadcast(code) {
  const set = subs.get(code);
  if (!set) return;
  const g = getGame(code);
  for (const entry of set) sendTo(entry, g ? view(g, entry.user) : { phase: 'closed' });
}
function broadcastClosed(code) {
  const set = subs.get(code);
  if (!set) return;
  for (const entry of set) {
    sendTo(entry, { phase: 'closed' });
    try { entry.res.end(); } catch (e) {}
  }
  subs.delete(code);
}

/* ---------------- HTTP-Helfer ---------------- */
function json(res, code, obj) {
  const b = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(b);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let d = '';
    req.on('data', c => { d += c; if (d.length > 1e6) { reject(new Error('Anfrage zu groß')); req.destroy(); } });
    req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch (e) { reject(new Error('Ungültiges JSON')); } });
    req.on('error', reject);
  });
}
function authOf(req, url) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : (url.searchParams.get('token') || '');
  const name = t ? db.sessions[t] : null;
  return t && name ? { token: t, name: name } : null;
}

/* ---------------- Validierung ---------------- */
function validateGame(body) {
  const name = String(body.name || '').trim();
  if (!name || name.length > 40) throw { code: 400, msg: 'Bitte einen Spielnamen eingeben (max. 40 Zeichen).' };
  const design = DESIGNS.includes(body.design) ? body.design : 'classic';
  const list = Array.isArray(body.questions) ? body.questions : [];
  if (list.length < 1 || list.length > 30) throw { code: 400, msg: 'Es werden 1–30 Fragen benötigt.' };
  const questions = list.map((q, i) => {
    const text = String(q && q.text || '').trim();
    const answers = (Array.isArray(q && q.answers) ? q.answers : []).slice(0, 4).map(a => String(a || '').trim());
    const time = [10, 20, 30, 60, 90].includes(q && q.time) ? q.time : 20;
    const correct = Number.isInteger(q && q.correct) ? q.correct : 0;
    if (!text) throw { code: 400, msg: `Frage ${i + 1}: Fragetext fehlt.` };
    if (answers.some(a => !a)) throw { code: 400, msg: `Frage ${i + 1}: Bitte alle 4 Antworten ausfüllen.` };
    if (correct < 0 || correct > 3) throw { code: 400, msg: `Frage ${i + 1}: Gültige richtige Antwort wählen.` };
    return { text, answers, time, correct };
  });
  return { name, design, questions };
}

/* ---------------- API ---------------- */
async function api(req, res, url) {
  const p = url.pathname;
  const parts = p.split('/').filter(Boolean);

  /* QR-Code als SVG (serverseitig, kein Fremddienst) */
  if (p === '/api/qr' && req.method === 'GET') {
    const data = url.searchParams.get('data') || '';
    if (!data || data.length > 800) return json(res, 400, { error: 'QR-Daten fehlen.' });
    try {
      const svg = await QRCode.toString(data, { type: 'svg', margin: 2, errorCorrectionLevel: 'M' });
      res.writeHead(200, {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600'
      });
      return res.end(svg);
    } catch (e) { return json(res, 500, { error: 'QR-Code konnte nicht erzeugt werden.' }); }
  }

  /* Registrieren / Anmelden */
  if (p === '/api/register' && req.method === 'POST') {
    const b = await readBody(req);
    const u = String(b.username || '').trim();
    const pw = String(b.password || '');
    if (!USERNAME_RE.test(u)) return json(res, 400, { error: 'Benutzername: 3–20 Zeichen (Buchstaben, Zahlen, Leerzeichen, . _ -).' });
    if (pw.length < 6) return json(res, 400, { error: 'Passwort: mindestens 6 Zeichen.' });
    const key = u.toLowerCase();
    if (db.users[key]) return json(res, 409, { error: 'Benutzername ist schon vergeben.' });
    const salt = crypto.randomBytes(8).toString('hex');
    db.users[key] = { name: u, salt, hash: sha(salt + pw), created: Date.now() };
    const token = newToken();
    db.sessions[token] = u;
    save();
    return json(res, 200, { token, name: u });
  }
  if (p === '/api/login' && req.method === 'POST') {
    const b = await readBody(req);
    const key = String(b.username || '').trim().toLowerCase();
    const pw = String(b.password || '');
    const user = db.users[key];
    if (!user || user.hash !== sha(user.salt + pw)) return json(res, 401, { error: 'Benutzername oder Passwort falsch.' });
    const token = newToken();
    db.sessions[token] = user.name;
    save();
    return json(res, 200, { token, name: user.name });
  }
  if (p === '/api/logout' && req.method === 'POST') {
    const a = authOf(req, url);
    if (a) { delete db.sessions[a.token]; save(); }
    return json(res, 200, { ok: true });
  }
  if (p === '/api/me' && req.method === 'GET') {
    const a = authOf(req, url);
    if (!a) return json(res, 401, { error: 'Nicht angemeldet.' });
    return json(res, 200, { name: a.name });
  }

  /* Spiel erstellen */
  if (p === '/api/games' && req.method === 'POST') {
    const a = authOf(req, url);
    if (!a) return json(res, 401, { error: 'Nicht angemeldet.' });
    const g = validateGame(await readBody(req));
    const code = genCode();
    const game = {
      code, name: g.name, design: g.design, questions: g.questions,
      players: [], hostName: a.name, phase: 'lobby', qIndex: 0,
      votes: {}, questionEndsAt: 0, lastAwarded: {}, createdAt: Date.now()
    };
    db.games[code] = game;
    save();
    return json(res, 201, view(game, a.name));
  }

  /* Einzelnes Spiel */
  if (parts[0] === 'api' && parts[1] === 'games' && parts[2]) {
    const code = parts[2];
    const action = parts[3] || '';
    const a = authOf(req, url);
    if (!a) return json(res, 401, { error: 'Nicht angemeldet.' });
    const g = getGame(code);
    if (!g) return json(res, 404, { error: 'Spiel nicht gefunden (Code prüfen).' });

    if (action === '' && req.method === 'GET') return json(res, 200, view(g, a.name));
    if (action === 'events' && req.method === 'GET') return sse(req, res, code, a.name);
    if (req.method !== 'POST') return json(res, 405, { error: 'Methode nicht erlaubt.' });

    const b = await readBody(req);

    if (action === 'join') {
      if (a.name === g.hostName) return json(res, 409, { error: 'Du bist der Gastgeber dieses Spiels.' });
      if (g.phase !== 'lobby') return json(res, 409, { error: 'Das Spiel läuft bereits – nur in der Lobby beitreten.' });
      if (!g.players.some(pl => pl.name === a.name)) {
        if (g.players.length >= MAX_PLAYERS) return json(res, 409, { error: 'Das Spiel ist voll (max. ' + MAX_PLAYERS + ' Spieler).' });
        g.players.push({ name: a.name, score: 0 });
        save();
      }
      broadcast(code);
      return json(res, 200, view(g, a.name));
    }

    if (action === 'leave') {
      if (a.name === g.hostName) return json(res, 403, { error: 'Der Gastgeber kann nicht austreten – beende das Spiel.' });
      g.players = g.players.filter(pl => pl.name !== a.name);
      delete g.votes[a.name];
      save();
      broadcast(code);
      return json(res, 200, view(g, a.name));
    }

    if (action === 'answer') {
      if (g.phase !== 'question') return json(res, 409, { error: 'Gerade läuft keine Frage.' });
      if (!g.players.some(pl => pl.name === a.name)) return json(res, 403, { error: 'Du spielst nicht mit.' });
      if (g.votes[a.name] !== undefined) return json(res, 409, { error: 'Du hast bereits abgestimmt.' });
      const choice = b.choice;
      if (!Number.isInteger(choice) || choice < 0 || choice > 3) return json(res, 400, { error: 'Ungültige Antwort.' });
      g.votes[a.name] = choice;
      if (Object.keys(g.votes).length >= g.players.length) {
        reveal(g);               // alle haben abgestimmt -> sofort auflösen
      } else {
        save();
        broadcast(code);
      }
      return json(res, 200, view(g, a.name));
    }

    if (action === 'host') {
      if (a.name !== g.hostName) return json(res, 403, { error: 'Nur der Gastgeber darf das Spielen steuern.' });
      const act = b.action;
      if (act === 'start') {
        if (g.phase !== 'lobby') return json(res, 409, { error: 'Das Spiel läuft bereits.' });
        if (g.players.length < 1) return json(res, 409, { error: 'Mindestens 1 Spieler muss beigetreten sein.' });
        beginQuestion(g, 0);
        return json(res, 200, view(g, a.name));
      }
      if (act === 'reveal') {
        if (g.phase !== 'question') return json(res, 409, { error: 'Keine Frage läuft.' });
        reveal(g);
        return json(res, 200, view(g, a.name));
      }
      if (act === 'next') {
        if (g.phase !== 'reveal') return json(res, 409, { error: 'Erst auflösen, dann weiter.' });
        if (g.qIndex + 1 < g.questions.length) {
          beginQuestion(g, g.qIndex + 1);
        } else {
          g.phase = 'final';
          save();
          broadcast(code);
        }
        return json(res, 200, view(g, a.name));
      }
      if (act === 'close') {
        clearTimeout(timers[code]);
        delete timers[code];
        broadcastClosed(code);
        delete db.games[code];
        save();
        return json(res, 200, { ok: true, phase: 'closed' });
      }
      return json(res, 400, { error: 'Unbekannte Aktion.' });
    }

    return json(res, 404, { error: 'Unbekannter Endpunkt.' });
  }

  return json(res, 404, { error: 'Unbekannter Endpunkt.' });
}

function sse(req, res, code, user) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write('retry: 2000\n\n');
  let set = subs.get(code);
  if (!set) { set = new Set(); subs.set(code, set); }
  const entry = { res, user };
  set.add(entry);
  const g = getGame(code);
  sendTo(entry, g ? view(g, user) : { phase: 'closed' });
  const hb = setInterval(() => { try { res.write(': hb\n\n'); } catch (e) {} }, 20000);
  req.on('close', () => {
    clearInterval(hb);
    set.delete(entry);
    if (!set.size) subs.delete(code);
  });
}

/* ---------------- Statische Dateien ---------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.webp': 'image/webp', '.txt': 'text/plain; charset=utf-8', '.mp3': 'audio/mpeg'
};
function staticFile(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(PUB, rel));
  if (!file.startsWith(PUB)) { res.writeHead(403); return res.end('Verboten'); }
  fs.readFile(file, (err, buf) => {
    if (err) {
      // SPA-Fallback: /?join=123456 und /join ohne Endung -> index.html
      if (!path.extname(file)) {
        return fs.readFile(path.join(PUB, 'index.html'), (e2, b2) => {
          if (e2) { res.writeHead(404); return res.end('Nicht gefunden'); }
          res.writeHead(200, { 'Content-Type': MIME['.html'] });
          res.end(b2);
        });
      }
      res.writeHead(404); return res.end('Nicht gefunden');
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(buf);
  });
}

/* ---------------- Server ---------------- */
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (url.pathname.startsWith('/api/')) {
    api(req, res, url).catch(e => {
      if (!res.headersSent) json(res, e.code && e.msg ? e.code : 500, { error: e.msg || e.message || 'Serverfehler' });
    });
  } else {
    staticFile(req, res, url.pathname);
  }
});

/* Laufende Spiele nach Neustart wiederherstellen (Timer neu setzen) */
for (const code of Object.keys(db.games)) {
  const g = db.games[code];
  if (g.phase === 'question') {
    const left = g.questionEndsAt - Date.now();
    if (left <= 0) setTimeout(() => reveal(g), 150);
    else timers[code] = setTimeout(() => reveal(g), left);
  }
}

server.listen(PORT, () => {
  console.log('WorldVote läuft auf Port ' + PORT);
});
