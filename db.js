const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');
const t = require('./time');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'gsd.db'));

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS chores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  emoji TEXT DEFAULT '',
  slot TEXT DEFAULT 'morning',
  days TEXT DEFAULT 'daily',
  due_time TEXT,
  remind_before_min INTEGER DEFAULT 15,
  stars INTEGER DEFAULT 1,
  is_extra INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  sort INTEGER DEFAULT 0,
  created_date TEXT,
  retired_date TEXT
);
CREATE TABLE IF NOT EXISTS completions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chore_id INTEGER NOT NULL REFERENCES chores(id),
  date TEXT NOT NULL,
  done_at TEXT NOT NULL,
  reminded INTEGER DEFAULT 0,
  stars_awarded INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_comp_date ON completions(date);
CREATE TABLE IF NOT EXISTS notifications_sent (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chore_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  kind TEXT NOT NULL,
  topic TEXT,
  message TEXT,
  sent_at TEXT,
  ok INTEGER DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_notif ON notifications_sent(date, chore_id, kind);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
`);

const SLOTS = ['morning', 'afternoon', 'evening'];

const DEFAULT_SETTINGS = {
  kid_name: process.env.KID_NAME || '',
  summary_time: '20:30', // after the last job of the day (Put tablet away, 20:15)
  escalate_min: '30',
  splash_mode: 'always', // always | daily
  slot_morning: '08:30',
  slot_afternoon: '16:30',
  slot_evening: '19:30',
  reminded_star_ratio: '0.5',
};

function hashPin(pin) {
  return crypto.createHash('sha256').update('gsd:' + String(pin)).digest('hex');
}

// Seed settings that are missing
for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
  db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run(k, v);
}
db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run(
  'pin_hash', hashPin(process.env.PARENT_PIN || '1234')
);

function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}
function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, String(value));
}

function checkPin(pin) {
  return hashPin(pin) === getSettings().pin_hash;
}

// ---------- chores ----------
function normaliseChore(c) {
  const s = getSettings();
  const isExtra = c.is_extra === true || c.is_extra === 1 || /^(y|yes|true|1)$/i.test(String(c.is_extra ?? c.extra ?? ''));
  let slot = String(c.slot || '').toLowerCase().trim();
  if (!SLOTS.includes(slot)) slot = isExtra ? '' : 'morning';
  // Accepts 7:00, 07:00 and Excel's 07:00:00
  let due = String(c.due_time || '').trim();
  const m = due.match(/^(\d{1,2}):(\d{2})(:\d{2})?$/);
  if (m) due = `${m[1].padStart(2, '0')}:${m[2]}`;
  else due = isExtra ? '' : s['slot_' + slot] || '';
  // "Weekday" -> weekdays, "Sunday, Monday" -> sun,mon
  let days = String(c.days || 'daily').trim().toLowerCase().replace(/\s+/g, '');
  if (days === 'weekday') days = 'weekdays';
  else if (days === 'weekend') days = 'weekends';
  else if (days === 'everyday' || days === 'anytime' || days === '') days = 'daily';
  else if (!['daily', 'weekdays', 'weekends'].includes(days)) {
    const list = days.split(/[,;|/]/).map((d) => d.slice(0, 3)).filter((d) => ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].includes(d));
    if (!list.length) throw new Error(`Do not understand days "${c.days}"`);
    days = list.join(',');
  }
  return {
    name: String(c.name || '').trim().replace(/\s+/g, ' '),
    emoji: String(c.emoji || '').trim(),
    slot,
    days: isExtra ? '' : days,
    due_time: due || null,
    remind_before_min: Number.isFinite(Number(c.remind_before_min)) && String(c.remind_before_min).trim() !== ''
      ? Number(c.remind_before_min) : 15,
    stars: Math.max(0, Number(c.stars) || 1),
    is_extra: isExtra ? 1 : 0,
  };
}

function listChores({ includeRetired = false } = {}) {
  const sql = `SELECT * FROM chores ${includeRetired ? '' : 'WHERE active = 1'}
    ORDER BY is_extra, CASE slot WHEN 'morning' THEN 0 WHEN 'afternoon' THEN 1 WHEN 'evening' THEN 2 ELSE 3 END,
    COALESCE(due_time, '99:99'), sort, id`;
  return db.prepare(sql).all();
}

function getChore(id) {
  return db.prepare('SELECT * FROM chores WHERE id = ?').get(id);
}

function createChore(input) {
  const c = normaliseChore(input);
  if (!c.name) throw new Error('Name is required');
  const max = db.prepare('SELECT COALESCE(MAX(sort), 0) AS m FROM chores').get().m;
  const r = db.prepare(`INSERT INTO chores (name, emoji, slot, days, due_time, remind_before_min, stars, is_extra, active, sort, created_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`).run(
    c.name, c.emoji, c.slot, c.days, c.due_time, c.remind_before_min, c.stars, c.is_extra, max + 1, t.parts().date
  );
  return getChore(r.lastInsertRowid);
}

function updateChore(id, input) {
  const existing = getChore(id);
  if (!existing) throw new Error('Not found');
  const c = normaliseChore({ ...existing, ...input });
  if (!c.name) throw new Error('Name is required');
  db.prepare(`UPDATE chores SET name=?, emoji=?, slot=?, days=?, due_time=?, remind_before_min=?, stars=?, is_extra=? WHERE id=?`)
    .run(c.name, c.emoji, c.slot, c.days, c.due_time, c.remind_before_min, c.stars, c.is_extra, id);
  if (input.active !== undefined) setActive(id, !!Number(input.active));
  return getChore(id);
}

function setActive(id, active) {
  if (active) db.prepare('UPDATE chores SET active = 1, retired_date = NULL WHERE id = ?').run(id);
  else db.prepare('UPDATE chores SET active = 0, retired_date = ? WHERE id = ?').run(t.parts().date, id);
}

function reorder(ids) {
  const stmt = db.prepare('UPDATE chores SET sort = ? WHERE id = ?');
  ids.forEach((id, i) => stmt.run(i + 1, id));
}

// Upsert by name. Never deletes anything.
function importChores(rows) {
  let added = 0, updated = 0;
  const errors = [];
  const seen = new Set();
  for (const [i, row] of rows.entries()) {
    try {
      if (!String(row.name || '').trim()) continue;
      const key = String(row.name).trim().replace(/\s+/g, ' ').toLowerCase();
      if (seen.has(key)) throw new Error(`"${row.name.trim()}" appears twice. Give each job its own name (e.g. "after breakfast" / "after dinner").`);
      seen.add(key);
      const existing = db.prepare('SELECT id FROM chores WHERE lower(name) = lower(?)').get(String(row.name).trim());
      if (existing) { updateChore(existing.id, { ...row, active: 1 }); updated++; }
      else { createChore(row); added++; }
    } catch (e) {
      errors.push(`Row ${i + 2}: ${e.message}`);
    }
  }
  return { added, updated, errors };
}

// ---------- day logic ----------
// Chores that were scheduled on a given day (uses created/retired dates so history stays fair).
function scheduledFor(date) {
  const dow = t.dowOf(date);
  return db.prepare(`SELECT * FROM chores WHERE is_extra = 0
      AND (created_date IS NULL OR created_date <= ?)
      AND (active = 1 OR (retired_date IS NOT NULL AND retired_date > ?))
      ORDER BY COALESCE(due_time, '99:99'), sort, id`)
    .all(date, date)
    .filter((c) => t.dayMatches(c.days, dow));
}

function completionsFor(date) {
  return db.prepare('SELECT * FROM completions WHERE date = ? ORDER BY done_at').all(date);
}

function dayStatus(date) {
  const chores = scheduledFor(date);
  const comps = completionsFor(date);
  const byChore = new Map();
  for (const c of comps) if (!byChore.has(c.chore_id)) byChore.set(c.chore_id, c);
  const items = chores.map((c) => ({ ...c, completion: byChore.get(c.id) || null }));
  const done = items.filter((i) => i.completion);
  const extraIds = new Set(db.prepare('SELECT id FROM chores WHERE is_extra = 1').all().map((r) => r.id));
  const extras = comps.filter((c) => extraIds.has(c.chore_id));
  return {
    date,
    items,
    total: items.length,
    done: done.length,
    selfDone: done.filter((i) => !i.completion.reminded).length,
    reminded: done.filter((i) => i.completion.reminded).length,
    extras: extras.length,
    stars: comps.reduce((a, c) => a + c.stars_awarded, 0),
    complete: items.length > 0 && done.length === items.length,
  };
}

function totalStars() {
  return db.prepare('SELECT COALESCE(SUM(stars_awarded), 0) AS s FROM completions').get().s;
}

// Consecutive days with every job done. Today counts once it is complete; days with no jobs are skipped.
function streak() {
  const today = t.parts().date;
  const first = db.prepare('SELECT MIN(date) AS d FROM completions').get().d;
  if (!first) return 0;
  let n = 0;
  const todayStatus = dayStatus(today);
  if (todayStatus.complete) n++;
  let d = t.addDays(today, -1);
  for (let i = 0; i < 400 && d >= first; i++, d = t.addDays(d, -1)) {
    const s = dayStatus(d);
    if (s.total === 0) continue;
    if (!s.complete) break;
    n++;
  }
  return n;
}

function bestStreak() {
  const first = db.prepare('SELECT MIN(date) AS d FROM completions').get().d;
  if (!first) return 0;
  let best = 0, cur = 0;
  const today = t.parts().date;
  for (let d = first; d <= today; d = t.addDays(d, 1)) {
    const s = dayStatus(d);
    if (s.total === 0) continue;
    if (s.complete) { cur++; best = Math.max(best, cur); }
    else if (d !== today) cur = 0;
  }
  return best;
}

function complete(choreId, reminded) {
  const chore = getChore(choreId);
  if (!chore || !chore.active) throw new Error('Job not found');
  const { date } = t.parts();
  if (!chore.is_extra) {
    const existing = db.prepare('SELECT id FROM completions WHERE chore_id = ? AND date = ?').get(choreId, date);
    if (existing) throw new Error('Already done today');
  }
  const ratio = Number(getSettings().reminded_star_ratio) || 0.5;
  const stars = reminded ? Math.max(1, Math.ceil(chore.stars * ratio)) : chore.stars;
  const r = db.prepare('INSERT INTO completions (chore_id, date, done_at, reminded, stars_awarded) VALUES (?, ?, ?, ?, ?)')
    .run(choreId, date, t.now().toISOString(), reminded ? 1 : 0, stars);
  return { id: Number(r.lastInsertRowid), chore, stars };
}

function undo(completionId) {
  const { date } = t.parts();
  const c = db.prepare('SELECT * FROM completions WHERE id = ?').get(completionId);
  if (!c) throw new Error('Not found');
  if (c.date !== date) throw new Error('You can only undo today');
  db.prepare('DELETE FROM completions WHERE id = ?').run(completionId);
}

function setReminded(completionId, reminded) {
  const c = db.prepare('SELECT * FROM completions WHERE id = ?').get(completionId);
  if (!c) throw new Error('Not found');
  const chore = getChore(c.chore_id);
  const ratio = Number(getSettings().reminded_star_ratio) || 0.5;
  const stars = reminded ? Math.max(1, Math.ceil(chore.stars * ratio)) : chore.stars;
  db.prepare('UPDATE completions SET reminded = ?, stars_awarded = ? WHERE id = ?').run(reminded ? 1 : 0, stars, completionId);
}

function history(days = 14) {
  const today = t.parts().date;
  const out = [];
  for (let i = 0; i < days; i++) {
    const d = t.addDays(today, -i);
    const s = dayStatus(d);
    const extraRows = db.prepare(`SELECT c.*, ch.name, ch.emoji FROM completions c JOIN chores ch ON ch.id = c.chore_id
      WHERE c.date = ? AND ch.is_extra = 1 ORDER BY c.done_at`).all(d);
    out.push({ ...s, extraItems: extraRows });
  }
  return out;
}

function stats() {
  const today = t.parts().date;
  const week = [];
  for (let i = 6; i >= 0; i--) week.push(dayStatus(t.addDays(today, -i)));
  const total = week.reduce((a, d) => a + d.total, 0);
  const done = week.reduce((a, d) => a + d.done, 0);
  const self = week.reduce((a, d) => a + d.selfDone, 0);
  return {
    week: week.map((d) => ({ date: d.date, total: d.total, done: d.done, selfDone: d.selfDone, extras: d.extras, stars: d.stars })),
    donePct: total ? Math.round((done / total) * 100) : 0,
    selfPct: done ? Math.round((self / done) * 100) : 0,
    extras: week.reduce((a, d) => a + d.extras, 0),
    stars: week.reduce((a, d) => a + d.stars, 0),
    streak: streak(),
    bestStreak: bestStreak(),
    totalStars: totalStars(),
  };
}

// ---------- notifications log ----------
// True once it has been sent, or once 3 attempts have failed (so a dead ntfy does not cause endless retries).
function wasSent(choreId, date, kind) {
  const r = db.prepare('SELECT SUM(ok) AS good, COUNT(*) AS tries FROM notifications_sent WHERE chore_id = ? AND date = ? AND kind = ?')
    .get(choreId, date, kind);
  return (r.good || 0) > 0 || (r.tries || 0) >= 3;
}
function logSent(choreId, date, kind, topic, message, ok) {
  db.prepare('INSERT INTO notifications_sent (chore_id, date, kind, topic, message, sent_at, ok) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(choreId, date, kind, topic, message, t.now().toISOString(), ok ? 1 : 0);
}
function recentNotifications(limit = 50) {
  return db.prepare('SELECT * FROM notifications_sent ORDER BY id DESC LIMIT ?').all(limit);
}

module.exports = {
  db, DATA_DIR, SLOTS, getSettings, setSetting, hashPin, checkPin,
  listChores, getChore, createChore, updateChore, setActive, reorder, importChores,
  scheduledFor, dayStatus, complete, undo, setReminded, totalStars, streak, history, stats,
  wasSent, logSent, recentNotifications,
};
