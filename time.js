// Time helpers. Everything is worked out in the house's time zone (default Europe/London),
// whatever the container or PC clock is set to.
const TZ = process.env.TZ_HOME || 'Europe/London';

// FAKE_NOW lets you pretend it is another time for testing, e.g. FAKE_NOW=2026-11-16T07:50:00Z
// The clock still ticks forward from there.
let offsetMs = 0;
if (process.env.FAKE_NOW) {
  const fake = new Date(process.env.FAKE_NOW);
  if (!isNaN(fake)) offsetMs = fake.getTime() - Date.now();
}

function now() {
  return new Date(Date.now() + offsetMs);
}

const fmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
});

function parts(d = now()) {
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
  const hour = Number(p.hour), minute = Number(p.minute);
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    hhmm: `${p.hour}:${p.minute}`,
    minutes: hour * 60 + minute,
    dow: p.weekday.toLowerCase().slice(0, 3),
  };
}

const DOWS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function dowOf(dateStr) {
  return DOWS[new Date(dateStr + 'T12:00:00Z').getUTCDay()];
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function toMinutes(hhmm) {
  if (!hhmm || !/^\d{1,2}:\d{2}(:\d{2})?$/.test(hhmm)) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// Does a chore's "days" rule include this day of the week?
function dayMatches(rule, dow) {
  const r = (rule || 'daily').toLowerCase().replace(/\s+/g, '');
  if (['daily', 'everyday', 'anytime', ''].includes(r)) return true;
  if (r === 'weekdays' || r === 'weekday') return !['sat', 'sun'].includes(dow);
  if (r === 'weekends' || r === 'weekend') return ['sat', 'sun'].includes(dow);
  return r.split(/[,;|]/).map((s) => s.slice(0, 3)).includes(dow);
}

module.exports = { TZ, now, parts, dowOf, addDays, toMinutes, dayMatches };
