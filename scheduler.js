// Checks every 30 seconds whether a reminder, a parent heads-up or the daily summary is due.
const db = require('./db');
const t = require('./time');
const ntfy = require('./ntfy');

const LINES = {
  perfect: [
    'Every single job done. Absolute legend! 🏆',
    'Perfect day! You really did Get Stuff Done. 💪',
    'All done, all by yourself. That is how champions do it. 🌟',
    'Clean sweep! Mum and Dad are proud of you. 🎉',
  ],
  great: [
    'Brilliant effort today. Nearly a perfect score! 🚀',
    'So close to a full house. Tomorrow is yours! ⭐',
    'Great work. A couple more and it is a perfect day. 👏',
  ],
  ok: [
    'Good going. Every job you finish makes the house better. 🙌',
    'Halfway there is still a win. Let us go for more tomorrow! 💫',
    'Nice work today. Small steps add up to big things. 🧱',
  ],
  low: [
    'Tomorrow is a fresh start. You have got this! 🌅',
    'Not every day is easy. Have a good sleep and smash it tomorrow. 💤',
    'Even superheroes have off days. Tomorrow you go again! 🦸',
  ],
};

function pick(arr, seed) {
  // Same line all day (stable), different line each day
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return arr[h % arr.length];
}

function summary(date = t.parts().date) {
  const s = db.dayStatus(date);
  const settings = db.getSettings();
  const name = settings.kid_name || '';
  const ratio = s.total ? s.done / s.total : 1;
  const bucket = s.total === 0 ? 'ok' : ratio === 1 ? 'perfect' : ratio >= 0.75 ? 'great' : ratio >= 0.4 ? 'ok' : 'low';
  const streak = db.streak();
  const missed = s.items.filter((i) => !i.completion).map((i) => `${i.emoji || '•'} ${i.name}`);
  return {
    date,
    ...s,
    streak,
    bucket,
    line: pick(LINES[bucket], date),
    missed,
    title: `${name ? name + "'s" : 'Your'} day: ${s.done}/${s.total} jobs done`,
  };
}

function summaryText(sm) {
  const bits = [
    `✅ ${sm.done} of ${sm.total} jobs done`,
    `💪 ${sm.selfDone} done without a reminder`,
  ];
  if (sm.extras) bits.push(`🦸 ${sm.extras} extra job${sm.extras === 1 ? '' : 's'}`);
  bits.push(`⭐ ${sm.stars} stars today`);
  if (sm.streak) bits.push(`🔥 ${sm.streak} day streak`);
  return bits.join('\n') + '\n\n' + sm.line;
}

async function notify(choreId, date, kind, topic, payload) {
  if (db.wasSent(choreId, date, kind)) return;
  const ok = await ntfy.send(topic, payload);
  db.logSent(choreId, date, kind, topic, `${payload.title}: ${payload.message}`, ok);
}

let running = false;
async function tick() {
  if (running) return;
  running = true;
  try {
    const { date, minutes } = t.parts();
    const settings = db.getSettings();
    const escalate = Number(settings.escalate_min) || 30;
    const status = db.dayStatus(date);

    // Work out what each unfinished job needs right now. Each message only fires inside its own
    // window, so a restart never sends a pile of old reminders.
    const groups = new Map(); // "kind|due_time|mins" -> jobs, so jobs due together share one message
    for (const item of status.items) {
      if (item.completion) continue;
      const due = t.toMinutes(item.due_time);
      if (due === null) continue;
      const pre = item.remind_before_min > 0 ? due - item.remind_before_min : null;
      let kind = null;
      if (pre !== null && minutes >= pre && minutes < due) kind = 'pre';
      else if (minutes >= due && minutes < due + escalate) kind = 'due';
      else if (minutes >= due + escalate && minutes < due + escalate + 60) kind = 'escalate';
      if (!kind || db.wasSent(item.id, date, kind)) continue;
      const key = `${kind}|${item.due_time}|${kind === 'pre' ? item.remind_before_min : ''}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }

    const who = settings.kid_name || 'He';
    for (const [key, items] of groups) {
      const [kind, dueTime] = key.split('|');
      const labels = items.map((i) => `${i.emoji ? i.emoji + ' ' : ''}${i.name}`);
      const one = items.length === 1;
      const list = labels.map((l) => `• ${l}`).join('\n');
      let topic, payload;
      if (kind === 'pre') {
        topic = ntfy.KID_TOPIC;
        payload = {
          title: `⏰ ${items[0].remind_before_min} mins to go`,
          message: one ? `Time to do: ${labels[0]} (due ${dueTime})` : `Time to do these (due ${dueTime}):\n${list}`,
          tags: ['alarm_clock'], priority: 3,
        };
      } else if (kind === 'due') {
        topic = ntfy.KID_TOPIC;
        payload = {
          title: one ? '🔔 Job due now!' : `🔔 ${items.length} jobs still to do!`,
          message: one ? `${labels[0]} is due now. Go go go!` : `These are due now. Go go go!\n${list}`,
          tags: ['bell'], priority: 4,
        };
      } else {
        topic = ntfy.PARENT_TOPIC;
        payload = {
          title: one ? 'Job not done yet' : `${items.length} jobs not done yet`,
          message: one ? `${who} has not ticked off ${labels[0]} yet (due ${dueTime}).` : `${who} has not ticked these off yet (due ${dueTime}):\n${list}`,
          tags: ['hourglass'], priority: 3,
        };
      }
      const ok = await ntfy.send(topic, payload);
      for (const i of items) db.logSent(i.id, date, kind, topic, `${payload.title}: ${payload.message}`, ok);
    }

    const sumAt = t.toMinutes(settings.summary_time);
    if (sumAt !== null && minutes >= sumAt && minutes < sumAt + 60 && !db.wasSent(0, date, 'summary')) {
      const sm = summary(date);
      const payload = { title: sm.title, message: summaryText(sm), tags: ['star'], priority: 3 };
      const okKid = await ntfy.send(ntfy.KID_TOPIC, payload);
      const okParents = await ntfy.send(ntfy.PARENT_TOPIC, payload);
      db.logSent(0, date, 'summary', `${ntfy.KID_TOPIC}+${ntfy.PARENT_TOPIC}`, `${payload.title}: ${payload.message}`, okKid && okParents);
    }
  } catch (e) {
    console.error('[scheduler]', e);
  } finally {
    running = false;
  }
}

function start() {
  tick();
  return setInterval(tick, 30 * 1000);
}

async function kudos(chore, stars) {
  const settings = db.getSettings();
  const who = settings.kid_name || 'He';
  const { date } = t.parts();
  const payload = {
    title: '⭐ Kudos time!',
    message: `${who} did an extra job: ${chore.emoji ? chore.emoji + ' ' : ''}${chore.name} (+${stars} stars). Say well done!`,
    tags: ['tada'], priority: 3,
  };
  const ok = await ntfy.send(ntfy.PARENT_TOPIC, payload);
  db.logSent(chore.id, date, 'kudos', ntfy.PARENT_TOPIC, `${payload.title}: ${payload.message}`, ok);
}

module.exports = { start, tick, summary, summaryText, kudos };
