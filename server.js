const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const db = require('./db');
const t = require('./time');
const csv = require('./csv');
const ntfy = require('./ntfy');
const scheduler = require('./scheduler');

const PORT = Number(process.env.PORT) || 3000;
const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.text({ type: ['text/csv', 'text/plain'], limit: '1mb' }));

// ---------- first run: seed jobs from a CSV if the list is empty ----------
if (db.listChores({ includeRetired: true }).length === 0) {
  const seed = [process.env.SEED_CSV, path.join(db.DATA_DIR, 'jobs.csv'), path.join(db.DATA_DIR, 'chores.csv'), path.join(__dirname, 'chores-template.csv')]
    .filter(Boolean).find((p) => fs.existsSync(p));
  if (seed) {
    const r = db.importChores(csv.parse(fs.readFileSync(seed, 'utf8')));
    console.log(`Seeded jobs from ${seed}: ${r.added} added`, r.errors.length ? r.errors : '');
  }
}

const wrap = (fn) => (req, res) => {
  try {
    const out = fn(req, res);
    if (out instanceof Promise) out.catch((e) => res.status(400).json({ error: e.message }));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

// ---------- kid API ----------
app.get('/health', (req, res) => res.json({ ok: true, time: t.parts() }));

app.get('/api/today', wrap((req, res) => {
  const p = t.parts();
  const settings = db.getSettings();
  const status = db.dayStatus(p.date);
  const escalate = Number(settings.escalate_min) || 30;
  const items = status.items.map((i) => {
    const due = t.toMinutes(i.due_time);
    let state = 'todo';
    if (i.completion) state = 'done';
    else if (due !== null && p.minutes >= due + escalate) state = 'late';
    else if (due !== null && p.minutes >= due) state = 'due';
    else if (due !== null && i.remind_before_min > 0 && p.minutes >= due - i.remind_before_min) state = 'soon';
    return {
      id: i.id, name: i.name, emoji: i.emoji, slot: i.slot, due_time: i.due_time, stars: i.stars, state,
      completion: i.completion && { id: i.completion.id, reminded: !!i.completion.reminded, stars: i.completion.stars_awarded, done_at: i.completion.done_at },
    };
  });
  const sumAt = t.toMinutes(settings.summary_time);
  res.json({
    now: p,
    kidName: settings.kid_name,
    splashMode: settings.splash_mode,
    items,
    total: status.total,
    done: status.done,
    starsToday: status.stars,
    totalStars: db.totalStars(),
    streak: db.streak(),
    summary: sumAt !== null && p.minutes >= sumAt ? scheduler.summary(p.date) : null,
  });
}));

app.post('/api/complete', wrap((req, res) => {
  const { chore_id, reminded } = req.body || {};
  const r = db.complete(Number(chore_id), !!reminded);
  res.json({ ok: true, id: r.id, stars: r.stars });
}));

app.post('/api/undo', wrap((req, res) => {
  db.undo(Number(req.body?.id));
  res.json({ ok: true });
}));

app.get('/api/extras', wrap((req, res) => {
  const { date } = t.parts();
  const comps = db.db.prepare('SELECT chore_id, COUNT(*) AS n FROM completions WHERE date = ? GROUP BY chore_id').all(date);
  const counts = Object.fromEntries(comps.map((c) => [c.chore_id, c.n]));
  const extras = db.listChores().filter((c) => c.is_extra).map((c) => ({
    id: c.id, name: c.name, emoji: c.emoji, stars: c.stars, doneToday: counts[c.id] || 0,
  }));
  res.json({ extras });
}));

app.post('/api/extras/:id/done', wrap(async (req, res) => {
  const chore = db.getChore(Number(req.params.id));
  if (!chore || !chore.is_extra) throw new Error('Not an extra job');
  const r = db.complete(chore.id, false);
  scheduler.kudos(chore, r.stars); // do not make him wait for ntfy
  res.json({ ok: true, id: r.id, stars: r.stars });
}));

// ---------- parent API (PIN) ----------
const sessions = new Map(); // token -> expiry
const SESSION_MS = 12 * 60 * 60 * 1000;
const failures = { count: 0, until: 0 };

app.post('/api/parent/login', wrap((req, res) => {
  if (Date.now() < failures.until) throw new Error('Too many tries. Wait a minute.');
  if (!db.checkPin(String(req.body?.pin || ''))) {
    failures.count++;
    if (failures.count >= 5) { failures.until = Date.now() + 60 * 1000; failures.count = 0; }
    return res.status(401).json({ error: 'Wrong PIN' });
  }
  failures.count = 0;
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, Date.now() + SESSION_MS);
  res.json({ token });
}));

function parent(req, res, next) {
  const tok = req.get('X-Parent-Token');
  const exp = tok && sessions.get(tok);
  if (!exp || exp < Date.now()) { if (tok) sessions.delete(tok); return res.status(401).json({ error: 'PIN needed' }); }
  next();
}
app.use('/api/parent', parent);

app.get('/api/parent/chores', wrap((req, res) => res.json({ chores: db.listChores({ includeRetired: true }) })));
app.post('/api/parent/chores', wrap((req, res) => res.json({ chore: db.createChore(req.body || {}) })));
app.put('/api/parent/chores/:id', wrap((req, res) => res.json({ chore: db.updateChore(Number(req.params.id), req.body || {}) })));
app.post('/api/parent/chores/:id/active', wrap((req, res) => { db.setActive(Number(req.params.id), !!req.body?.active); res.json({ ok: true }); }));
app.post('/api/parent/reorder', wrap((req, res) => { db.reorder((req.body?.ids || []).map(Number)); res.json({ ok: true }); }));

app.get('/api/parent/history', wrap((req, res) => res.json({ days: db.history(Math.min(60, Number(req.query.days) || 14)) })));
app.get('/api/parent/stats', wrap((req, res) => res.json(db.stats())));
app.post('/api/parent/completions/:id/reminded', wrap((req, res) => { db.setReminded(Number(req.params.id), !!req.body?.reminded); res.json({ ok: true }); }));
app.post('/api/parent/completions/:id/undo', wrap((req, res) => {
  db.db.prepare('DELETE FROM completions WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
}));
app.post('/api/parent/complete', wrap((req, res) => {
  const r = db.complete(Number(req.body?.chore_id), !!req.body?.reminded);
  res.json({ ok: true, id: r.id });
}));

const EDITABLE = ['kid_name', 'summary_time', 'escalate_min', 'splash_mode', 'slot_morning', 'slot_afternoon', 'slot_evening', 'reminded_star_ratio'];
app.get('/api/parent/settings', wrap((req, res) => {
  const s = db.getSettings();
  res.json({
    settings: Object.fromEntries(EDITABLE.map((k) => [k, s[k]])),
    ntfy: { enabled: ntfy.enabled, kidTopic: ntfy.KID_TOPIC, parentTopic: ntfy.PARENT_TOPIC },
    tz: t.TZ,
    now: t.parts(),
  });
}));
app.put('/api/parent/settings', wrap((req, res) => {
  for (const [k, v] of Object.entries(req.body || {})) if (EDITABLE.includes(k)) db.setSetting(k, v);
  res.json({ ok: true });
}));
app.post('/api/parent/pin', wrap((req, res) => {
  const pin = String(req.body?.pin || '');
  if (!/^\d{4,8}$/.test(pin)) throw new Error('PIN must be 4 to 8 digits');
  db.setSetting('pin_hash', db.hashPin(pin));
  res.json({ ok: true });
}));

app.get('/api/parent/export', wrap((req, res) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="chores.csv"');
  res.send(csv.write(db.listChores()));
}));
app.post('/api/parent/import', wrap((req, res) => {
  const text = typeof req.body === 'string' ? req.body : req.body?.csv;
  const rows = csv.parse(text);
  if (!rows.length) throw new Error('No rows found in that CSV');
  if (!('name' in rows[0])) throw new Error('CSV needs a "name" column');
  res.json(db.importChores(rows));
}));

app.get('/api/parent/notifications', wrap((req, res) => res.json({ items: db.recentNotifications(50) })));
app.post('/api/parent/test-ntfy', wrap(async (req, res) => {
  const which = req.body?.to === 'parents' ? ntfy.PARENT_TOPIC : ntfy.KID_TOPIC;
  const ok = await ntfy.send(which, { title: '👋 Test from Get Stuff Done', message: 'If you can read this, notifications work!', tags: ['wave'] });
  db.logSent(-1, t.parts().date, 'test', which, 'Test message', ok);
  res.json({ ok, topic: which, enabled: ntfy.enabled });
}));
app.get('/api/parent/summary', wrap((req, res) => {
  const sm = scheduler.summary(req.query.date || t.parts().date);
  res.json({ ...sm, text: scheduler.summaryText(sm) });
}));

// ---------- static ----------
app.use(express.static(path.join(__dirname, 'public'), {
  // no-cache = the browser always checks for a newer version (cheap on a LAN, avoids stale app code after updates)
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache'),
}));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log(`Get Stuff Done on :${PORT} (${t.TZ}, now ${t.parts().date} ${t.parts().hhmm}, ntfy ${ntfy.enabled ? 'on' : 'off'})`);
  scheduler.start();
});
