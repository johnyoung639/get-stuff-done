// Tiny CSV reader and writer (handles quotes, commas in quotes, CRLF and a BOM). No dependency needed.
function parse(text) {
  text = String(text || '').replace(/^﻿/, '');
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') q = false;
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const clean = rows.filter((r) => r.some((c) => c.trim() !== ''));
  if (!clean.length) return [];
  const head = clean[0].map((h) => h.trim().toLowerCase());
  return clean.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}

const COLS = ['name', 'emoji', 'slot', 'days', 'due_time', 'remind_before_min', 'stars', 'extra'];

function cell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function write(chores) {
  const lines = [COLS.join(',')];
  for (const c of chores) {
    lines.push([
      c.name, c.emoji, c.is_extra ? '' : c.slot, c.is_extra ? '' : c.days, c.is_extra ? '' : c.due_time || '',
      c.is_extra ? '' : c.remind_before_min, c.stars, c.is_extra ? 'yes' : 'no',
    ].map(cell).join(','));
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}

module.exports = { parse, write, COLS };
