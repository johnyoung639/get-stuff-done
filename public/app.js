/* Get Stuff Done: front end. Plain JS, no build step. */
(() => {
  'use strict';

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
  };

  const view = $('#view');
  const SLOT_INFO = {
    morning: { label: 'Morning', icon: '🌅' },
    afternoon: { label: 'Afternoon', icon: '☀️' },
    evening: { label: 'Evening', icon: '🌙' },
  };
  const COLOURS = ['#6b3fa0', '#ffd23f', '#ff4d6d', '#1fb85a', '#3fa7ff', '#ff9f1c', '#b388ff'];

  // ---------------- API ----------------
  let parentToken = sessionStorageGet('gsd-parent');
  function sessionStorageGet(k) { try { return sessionStorage.getItem(k); } catch { return null; } }
  function sessionStorageSet(k, v) { try { v ? sessionStorage.setItem(k, v) : sessionStorage.removeItem(k); } catch { /* ignore */ } }

  async function api(path, opts = {}) {
    const headers = { ...(opts.headers || {}) };
    if (opts.body && typeof opts.body !== 'string') { headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(opts.body); }
    if (parentToken && path.startsWith('/api/parent')) headers['X-Parent-Token'] = parentToken;
    const res = await fetch(path, { ...opts, headers });
    if (res.status === 401 && path.startsWith('/api/parent') && !path.endsWith('/login')) {
      parentToken = null; sessionStorageSet('gsd-parent', null);
      route();
      throw new Error('PIN needed');
    }
    const isJson = (res.headers.get('content-type') || '').includes('json');
    const data = isJson ? await res.json() : await res.text();
    if (!res.ok) throw new Error((data && data.error) || `Error ${res.status}`);
    return data;
  }

  function toast(msg, ms = 2600) {
    const el = $('#toast');
    el.textContent = msg; el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (el.hidden = true), ms);
  }

  // ---------------- Logo + splash ----------------
  const logoHTML = $('#logo-tpl').innerHTML;
  $('#header-logo').innerHTML = logoHTML;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  async function runSplash(mode) {
    const today = new Date().toISOString().slice(0, 10);
    const splash = $('#splash');
    if (reduceMotion || (mode === 'daily' && store.get('gsd-splash') === today)) {
      document.body.classList.remove('splashing');
      splash.hidden = true;
      return;
    }
    store.set('gsd-splash', today);

    splash.innerHTML = logoHTML + '<div class="hint">Tap to skip</div>';
    document.body.classList.add('splashing');
    splash.hidden = false;

    const logo = $('.logo', splash);
    const words = [$('.w-get', logo), $('.shit-text', logo), $('.w-done', logo)];
    const scribble = $('.scribble path', logo);
    const stuff = $('.stuff', logo);
    const hint = $('.hint', splash);
    const anims = [];
    let skipped = false;
    const track = (a) => { anims.push(a); return a; };

    words.forEach((w) => (w.style.opacity = '0'));
    // Hide the scribble completely until it is drawn. A left-to-right wipe (clip-path) is used rather than
    // stroke dashes, because vector-effect: non-scaling-stroke makes dash lengths pixel-based (showed as dots).
    const scribbleSvg = scribble.ownerSVGElement;
    scribbleSvg.style.clipPath = 'inset(-20% 110% -20% -10%)';
    stuff.style.opacity = '0';

    const skip = () => {
      skipped = true;
      // Swallow the click that follows this tap, so it does not land on a button under the splash
      const swallow = (e) => { e.stopPropagation(); e.preventDefault(); };
      document.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => document.removeEventListener('click', swallow, { capture: true }), 600);
      anims.forEach((a) => { try { a.finish(); } catch { /* ignore */ } });
    };
    splash.addEventListener('pointerdown', skip, { once: true });

    try {
      await document.fonts.ready.catch(() => {});
      track(hint.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: 1200, fill: 'forwards' }));

      // 1. Words drop in from the top, one by one, with a bounce
      const drops = words.map((w, i) => track(w.animate([
        { opacity: 1, transform: 'translateY(-110vh) rotate(-8deg)' },
        { opacity: 1, transform: 'translateY(0) rotate(0)', offset: 0.7 },
        { opacity: 1, transform: 'translateY(-0.12em) rotate(1deg)', offset: 0.85 },
        { opacity: 1, transform: 'translateY(0) rotate(0)' },
      ], { duration: 700, delay: i * 280, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' })));
      await Promise.all(drops.map((a) => a.finished));
      if (!skipped) await wait(350);

      // 2. Scribble across "Shit"
      const scr = track(scribbleSvg.animate([{ clipPath: 'inset(-20% 110% -20% -10%)' }, { clipPath: 'inset(-20% -10% -20% -10%)' }], { duration: 650, easing: 'ease-in-out', fill: 'forwards' }));
      track(words[1].animate([{ opacity: 1 }, { opacity: 0.55 }], { duration: 650, fill: 'forwards' }));
      await scr.finished;

      // 3. "Stuff" pops in above
      const pop = track(stuff.animate([
        { opacity: 0, transform: 'translateX(-50%) translateY(0.4em) rotate(-30deg) scale(0.2)' },
        { opacity: 1, transform: 'translateX(-50%) translateY(0) rotate(-4deg) scale(1.25)', offset: 0.6 },
        { opacity: 1, transform: 'translateX(-50%) rotate(-9deg) scale(1)' },
      ], { duration: 600, easing: 'cubic-bezier(.34,1.56,.64,1)', fill: 'forwards' }));
      await pop.finished;
      if (!skipped) await wait(750);

      // 4. Fly up into the header
      const target = $('#header-logo .logo').getBoundingClientRect();
      const from = logo.getBoundingClientRect();
      const k = target.width / from.width;
      const dx = target.left - from.left, dy = target.top - from.top;
      const dur = skipped ? 1 : 900;
      const fly = track(logo.animate([
        { transform: 'translate(0,0) scale(1)' },
        { transform: `translate(${dx}px, ${dy}px) scale(${k})` },
      ], { duration: dur, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'forwards' }));
      const toWhite = [{ color: '#6b3fa0' }, { color: '#6b3fa0', offset: 0.55 }, { color: '#ffffff' }];
      track(logo.animate(toWhite, { duration: dur, fill: 'forwards' }));
      track(stuff.animate([{ color: '#ff4d6d' }, { color: '#ff4d6d', offset: 0.55 }, { color: '#ffffff' }], { duration: dur, fill: 'forwards' }));
      track(scribble.animate([{ stroke: '#ff4d6d' }, { stroke: '#ff4d6d', offset: 0.55 }, { stroke: '#ffd23f' }], { duration: dur, fill: 'forwards' }));
      track(splash.animate([{ backgroundColor: 'rgba(255,255,255,1)' }, { backgroundColor: 'rgba(255,255,255,0)' }], { duration: dur * 0.8, delay: dur * 0.2, fill: 'forwards' }));
      hint.remove();
      await fly.finished;
    } catch { /* if anything goes wrong, just show the app */ }

    document.body.classList.remove('splashing');
    splash.hidden = true;
    splash.innerHTML = '';
  }

  // ---------------- Effects ----------------
  function confetti(x, y, n = 40, spread = 1) {
    if (reduceMotion) return;
    const fx = $('#fx');
    for (let i = 0; i < n; i++) {
      const b = document.createElement('div');
      b.className = 'bit';
      b.style.left = x + 'px'; b.style.top = y + 'px';
      b.style.background = COLOURS[i % COLOURS.length];
      if (i % 3 === 0) b.style.borderRadius = '50%';
      fx.appendChild(b);
      const ang = Math.random() * Math.PI * 2;
      const dist = (120 + Math.random() * 260) * spread;
      const tx = Math.cos(ang) * dist, ty = Math.sin(ang) * dist - 160 * spread;
      b.animate([
        { transform: 'translate(0,0) rotate(0)', opacity: 1 },
        { transform: `translate(${tx}px, ${ty}px) rotate(${Math.random() * 720}deg)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${tx * 1.1}px, ${ty + 380}px) rotate(${Math.random() * 1080}deg)`, opacity: 0 },
      ], { duration: 1400 + Math.random() * 700, easing: 'cubic-bezier(.2,.8,.4,1)' }).finished.then(() => b.remove());
    }
  }
  function bigConfetti() {
    const w = innerWidth, h = innerHeight;
    [[w * 0.2, h * 0.4], [w * 0.5, h * 0.3], [w * 0.8, h * 0.4]].forEach(([x, y], i) => setTimeout(() => confetti(x, y, 50, 1.4), i * 180));
  }
  function bump(id) {
    const el = document.getElementById(id);
    el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  }

  function celebrate({ emoji, title, lines = [], plus, button = 'Yay! 🎉' }) {
    const el = $('#celebrate');
    el.innerHTML = `<div class="big">${emoji}</div><h2>${esc(title)}</h2>${lines.map((l) => `<p>${esc(l)}</p>`).join('')}
      ${plus ? `<div class="plus">${esc(plus)}</div>` : ''}<button class="btn" type="button">${esc(button)}</button>`;
    el.hidden = false;
    bigConfetti();
    const close = () => { el.hidden = true; };
    $('button', el).onclick = close;
    el.onclick = (e) => { if (e.target === el) close(); };
  }

  // ---------------- Sheet ----------------
  function openSheet(html, bind) {
    const sheet = $('#sheet'), bd = $('#sheet-backdrop');
    sheet.innerHTML = html;
    sheet.hidden = false; bd.hidden = false;
    bd.onclick = closeSheet;
    $$('[data-close]', sheet).forEach((b) => (b.onclick = closeSheet));
    bind && bind(sheet);
  }
  function closeSheet() { $('#sheet').hidden = true; $('#sheet-backdrop').hidden = true; }

  // ---------------- Header stats ----------------
  function setChips(d) {
    const s = $('#total-stars'), k = $('#streak');
    if (s.textContent !== String(d.totalStars)) { s.textContent = d.totalStars; bump('chip-stars'); }
    if (k.textContent !== String(d.streak)) { k.textContent = d.streak; bump('chip-streak'); }
  }

  // ---------------- TODAY ----------------
  let todayData = null;
  function greeting(now, name) {
    const m = now.minutes;
    const part = m < 12 * 60 ? 'Good morning' : m < 17 * 60 ? 'Good afternoon' : 'Good evening';
    return `${part}${name ? ', ' + name : ''}!`;
  }
  function currentSlot(m) { return m < 12 * 60 ? 'morning' : m < 17 * 60 ? 'afternoon' : 'evening'; }

  async function renderToday(animate = false) {
    const d = await api('/api/today');
    todayData = d;
    setChips(d);
    if (location.hash !== '' && !location.hash.startsWith('#/today')) return;
    const pct = d.total ? Math.round((d.done / d.total) * 100) : 100;
    const C = 2 * Math.PI * 44;
    const left = d.total - d.done;
    const sub = d.total === 0 ? 'No jobs today. Enjoy it!' : left === 0 ? 'Everything is done. Legend! 🏆' : `${left} job${left === 1 ? '' : 's'} to go · ⭐ ${d.starsToday} today`;
    const now = currentSlot(d.now.minutes);

    let html = `<section class="hero">
      <div class="ring ${pct === 100 ? 'full' : ''}"><svg viewBox="0 0 104 104"><circle class="bg" cx="52" cy="52" r="44"/>
        <circle class="fg" cx="52" cy="52" r="44" stroke-dasharray="${C}" stroke-dashoffset="${animate ? C : C * (1 - pct / 100)}"/></svg>
        <div class="pct">${pct}%</div></div>
      <div><h1>${esc(greeting(d.now, d.kidName))}</h1><p>${esc(sub)}</p></div></section>`;

    if (d.summary) {
      const s = d.summary;
      html += `<section class="summary"><h3>🌟 Today's round-up</h3><div class="stats">
        <span>✅ ${s.done}/${s.total} done</span><span>💪 ${s.selfDone} without a reminder</span>
        ${s.extras ? `<span>🦸 ${s.extras} extra</span>` : ''}<span>⭐ ${s.stars} stars</span>${s.streak ? `<span>🔥 ${s.streak} day streak</span>` : ''}</div>
        <p class="line">${esc(s.line)}</p></section>`;
    }

    for (const slot of Object.keys(SLOT_INFO)) {
      const items = d.items.filter((i) => i.slot === slot);
      if (!items.length) continue;
      const doneN = items.filter((i) => i.completion).length;
      html += `<h2 class="section ${slot === now ? 'current' : ''}">${SLOT_INFO[slot].icon} ${SLOT_INFO[slot].label}<span class="count">${doneN}/${items.length}</span></h2><div class="cards">`;
      for (const it of items) html += cardHTML(it);
      html += '</div>';
    }
    if (!d.items.length) html += `<div class="empty"><div class="big">🏖️</div>No jobs on the list today.</div>`;
    view.innerHTML = html;

    if (animate) requestAnimationFrame(() => requestAnimationFrame(() => {
      const fg = $('.ring .fg', view); if (fg) fg.style.strokeDashoffset = C * (1 - pct / 100);
    }));
    $$('.card', view).forEach((c) => (c.onclick = () => onCard(Number(c.dataset.id), c)));
  }

  function cardHTML(it) {
    const stateBadge = { soon: ['state-soon', 'Soon'], due: ['state-due', 'Due now'], late: ['state-late', 'Late!'] }[it.state];
    let meta = '';
    if (it.completion) {
      const t = new Date(it.completion.done_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      meta = `<span>Done ${t}</span>${it.completion.reminded ? '<span class="badge rem">Reminded</span>' : '<span class="badge self">All by myself!</span>'}<span>+${it.completion.stars} ⭐</span>`;
    } else {
      meta = `${it.due_time ? `<span>⏰ by ${esc(it.due_time)}</span>` : ''}<span>${it.stars} ⭐</span>${stateBadge ? `<span class="badge ${stateBadge[0]}">${stateBadge[1]}</span>` : ''}`;
    }
    return `<button class="card ${it.state}" data-id="${it.id}" type="button">
      <div class="emoji">${esc(it.emoji || '⭐')}</div>
      <div class="body"><div class="name">${esc(it.name)}</div><div class="meta">${meta}</div></div>
      <div class="tick"></div></button>`;
  }

  function onCard(id, cardEl) {
    const it = todayData.items.find((i) => i.id === id);
    if (!it) return;
    if (it.completion) {
      openSheet(`<div class="big-emoji">${esc(it.emoji || '⭐')}</div><h3>${esc(it.name)}</h3>
        <p class="sub">Already done! Tapped it by mistake?</p>
        <button class="btn danger" data-undo type="button">↩️ Undo, not done yet</button>
        <button class="btn ghost" data-close type="button">Keep it ticked</button>`, (s) => {
        $('[data-undo]', s).onclick = async () => {
          closeSheet();
          try { await api('/api/undo', { method: 'POST', body: { id: it.completion.id } }); renderToday(); } catch (e) { toast(e.message); }
        };
      });
      return;
    }
    const half = Math.max(1, Math.ceil(it.stars * 0.5));
    openSheet(`<div class="big-emoji">${esc(it.emoji || '⭐')}</div><h3>${esc(it.name)}</h3>
      <p class="sub">Nice one! How did it go?</p>
      <button class="btn primary" data-self type="button">💪 I did it myself! <small>+${it.stars} ⭐</small></button>
      <button class="btn secondary" data-rem type="button">🗣️ Mum or Dad reminded me <small>+${half} ⭐</small></button>
      <button class="btn ghost" data-close type="button">Not yet</button>`, (s) => {
      $('[data-self]', s).onclick = () => tick(it, false, cardEl);
      $('[data-rem]', s).onclick = () => tick(it, true, cardEl);
    });
  }

  async function tick(it, reminded, cardEl) {
    closeSheet();
    try {
      const r = await api('/api/complete', { method: 'POST', body: { chore_id: it.id, reminded } });
      const box = cardEl.getBoundingClientRect();
      confetti(box.left + box.width - 40, box.top + box.height / 2, reminded ? 24 : 44);
      const before = todayData.done;
      await renderToday();
      if (todayData.total && todayData.done === todayData.total && before < todayData.total) {
        setTimeout(() => celebrate({
          emoji: '🏆', title: 'ALL DONE!',
          lines: ['Every job ticked off today.', 'You really did Get Stuff Done!'],
          plus: `⭐ ${todayData.starsToday} stars today`, button: 'Woohoo! 🎉',
        }), 500);
      } else {
        toast(reminded ? `Done! +${r.stars} ⭐ Next time try it without a reminder 😉` : `Smashed it! +${r.stars} ⭐`);
      }
    } catch (e) { toast(e.message); }
  }

  // ---------------- EXTRAS ----------------
  async function renderExtras() {
    const { extras } = await api('/api/extras');
    if (!location.hash.startsWith('#/extras')) return;
    let html = `<h2 class="section">🦸 Extra jobs</h2><p class="extras-intro">Want to help out even more? Do one of these for bonus stars, and Mum and Dad will get a kudos message!</p>`;
    if (!extras.length) html += `<div class="empty"><div class="big">🦸</div>No extra jobs yet. Ask Mum or Dad to add some!</div>`;
    else html += '<div class="tiles">' + extras.map((x) => `<button class="tile" data-id="${x.id}" type="button">
      <div class="emoji">${esc(x.emoji || '⭐')}</div><div class="name">${esc(x.name)}</div><div class="stars">+${x.stars} ⭐</div>
      ${x.doneToday ? `<div class="done-today">✓ Done ${x.doneToday > 1 ? x.doneToday + ' times ' : ''}today</div>` : ''}</button>`).join('') + '</div>';
    view.innerHTML = html;
    $$('.tile', view).forEach((t) => (t.onclick = () => {
      const x = extras.find((e) => e.id === Number(t.dataset.id));
      openSheet(`<div class="big-emoji">${esc(x.emoji || '⭐')}</div><h3>${esc(x.name)}</h3><p class="sub">Did you do this extra job?</p>
        <button class="btn primary" data-yes type="button">🦸 Yes, I did it! <small>+${x.stars} ⭐</small></button>
        <button class="btn ghost" data-close type="button">Not yet</button>`, (s) => {
        $('[data-yes]', s).onclick = async () => {
          closeSheet();
          try {
            const r = await api(`/api/extras/${x.id}/done`, { method: 'POST' });
            celebrate({ emoji: '🦸', title: 'KUDOS!', lines: [`You did: ${x.name}`, 'Mum and Dad have been told. Superstar helper!'], plus: `+${r.stars} ⭐`, button: 'Awesome! 🙌' });
            renderExtras();
            api('/api/today').then(setChips).catch(() => {});
          } catch (e) { toast(e.message); }
        };
      });
    }));
  }

  // ---------------- LACES ----------------
  let laceStep = 0, practice = false, practiceTimer = null;
  function renderLaces() {
    const steps = window.LACE_STEPS;
    const s = steps[laceStep];
    const last = laceStep === steps.length - 1;
    view.innerHTML = `<div class="laces">
      <h2 class="section">👟 Tie your laces</h2>
      <div class="progress">${steps.map((_, i) => `<span class="dot ${i === laceStep ? 'on' : ''}"></span>`).join('')}</div>
      <div class="stage">${s.svg}</div>
      <div class="stepnum">STEP ${laceStep + 1} OF ${steps.length}</div>
      <h2>${esc(s.title)}</h2>
      <p class="tip">${esc(s.tip)}</p>
      <div class="nav">
        <button class="btn secondary" data-back type="button" ${laceStep === 0 ? 'disabled style="opacity:.4"' : ''}>⬅️ Back</button>
        <button class="btn ${last ? 'primary' : 'purple'}" data-next type="button">${last ? 'Start again 🔁' : 'Next ➡️'}</button>
      </div>
      <div class="practice"><span>Practice mode (moves on by itself)</span><button class="switch ${practice ? 'on' : ''}" data-practice type="button" aria-label="Practice mode"></button></div>
    </div>`;
    const svg = $('.stage svg', view); if (svg) svg.classList.add('enter');
    $('[data-back]', view).onclick = () => { if (laceStep > 0) { laceStep--; renderLaces(); } };
    $('[data-next]', view).onclick = () => {
      if (last) { celebrate({ emoji: '🎀', title: 'BOW TIED!', lines: ['Brilliant! Keep practising and it will get easy.'], button: 'Again! 🔁' }); laceStep = 0; }
      else laceStep++;
      renderLaces();
    };
    $('[data-practice]', view).onclick = () => { practice = !practice; schedulePractice(); renderLaces(); };
    schedulePractice();
  }
  function schedulePractice() {
    clearTimeout(practiceTimer);
    if (!practice || !location.hash.startsWith('#/laces')) return;
    practiceTimer = setTimeout(() => { laceStep = (laceStep + 1) % window.LACE_STEPS.length; renderLaces(); }, 6000);
  }

  // ---------------- PARENTS ----------------
  let parentTab = 'today';
  function renderPin() {
    let pin = '';
    view.innerHTML = `<div class="pin-wrap"><h2>🔒 Parents only</h2><p class="muted">Enter the parent PIN</p>
      <div class="pin-dots">${'<span></span>'.repeat(4)}</div>
      <div class="pinpad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'].map((k) => k === '' ? '<span></span>' : `<button type="button" data-k="${k}">${k}</button>`).join('')}</div></div>`;
    const dots = $('.pin-dots', view);
    const paint = () => $$('span', dots).forEach((s, i) => s.classList.toggle('on', i < pin.length));
    $$('.pinpad button', view).forEach((b) => (b.onclick = async () => {
      const k = b.dataset.k;
      if (k === '⌫') pin = pin.slice(0, -1); else if (pin.length < 8) pin += k;
      paint();
      if (pin.length === 4) {
        try {
          const r = await api('/api/parent/login', { method: 'POST', body: { pin } });
          parentToken = r.token; sessionStorageSet('gsd-parent', r.token);
          renderParents();
        } catch (e) {
          dots.classList.remove('shake'); void dots.offsetWidth; dots.classList.add('shake');
          toast(e.message); pin = ''; setTimeout(paint, 300);
        }
      }
    }));
  }

  async function renderParents() {
    if (!parentToken) return renderPin();
    const tabs = [['today', 'Today'], ['history', 'History'], ['stats', 'Stats'], ['jobs', 'Jobs'], ['settings', 'Settings']];
    view.innerHTML = `<div style="display:flex;align-items:center;gap:10px"><h2 class="section" style="flex:1">👪 Parent view</h2>
      <button class="btn small secondary" data-lock type="button">🔒 Lock</button></div>
      <div class="seg">${tabs.map(([k, l]) => `<button type="button" data-t="${k}" class="${k === parentTab ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div id="ptab"></div>`;
    $('[data-lock]', view).onclick = () => { parentToken = null; sessionStorageSet('gsd-parent', null); location.hash = '#/today'; };
    $$('.seg button', view).forEach((b) => (b.onclick = () => { parentTab = b.dataset.t; renderParents(); }));
    const el = $('#ptab', view);
    try { await ({ today: pToday, history: pHistory, stats: pStats, jobs: pJobs, settings: pSettings })[parentTab](el); }
    catch (e) { if (e.message !== 'PIN needed') el.innerHTML = `<div class="panel">⚠️ ${esc(e.message)}</div>`; }
  }

  function pill(it) {
    if (it.completion) return it.completion.reminded ? '<span class="status-pill rem">Done · reminded</span>' : '<span class="status-pill ok">Done · by himself</span>';
    return '<span class="status-pill wait">Not done</span>';
  }
  const hm = (iso) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  async function pToday(el) {
    const d = await api('/api/today');
    const { days } = await api('/api/parent/history?days=1');
    const extras = days[0].extraItems;
    el.innerHTML = `<div class="kpis">
        <div class="kpi"><div class="v">${d.done}/${d.total}</div><div class="l">jobs done</div></div>
        <div class="kpi"><div class="v">${d.items.filter((i) => i.completion && !i.completion.reminded).length}</div><div class="l">without a reminder</div></div>
        <div class="kpi"><div class="v">${extras.length}</div><div class="l">extra jobs</div></div>
        <div class="kpi"><div class="v">⭐ ${d.starsToday}</div><div class="l">stars today</div></div></div>
      <div class="panel"><h3>Today's jobs</h3>${d.items.map((it) => `<div class="row">
        <div class="e">${esc(it.emoji)}</div><div class="n"><b>${esc(it.name)}</b><small>${esc(SLOT_INFO[it.slot]?.label || '')} · due ${esc(it.due_time || '-')}${it.completion ? ' · done ' + hm(it.completion.done_at) : ''}</small></div>
        ${pill(it)}
        ${it.completion
          ? `<button class="icon-btn" title="Toggle reminded" data-rem="${it.completion.id}" data-v="${it.completion.reminded ? 0 : 1}" type="button">🗣️</button>
             <button class="icon-btn" title="Undo" data-undo="${it.completion.id}" type="button">↩️</button>`
          : `<button class="icon-btn" title="Mark done (reminded)" data-done="${it.id}" type="button">✔️</button>`}
        </div>`).join('') || '<p class="muted">No jobs today.</p>'}</div>
      <div class="panel"><h3>Extra jobs today</h3>${extras.map((x) => `<div class="row"><div class="e">${esc(x.emoji)}</div><div class="n"><b>${esc(x.name)}</b><small>${hm(x.done_at)} · +${x.stars_awarded} ⭐</small></div>
        <button class="icon-btn" title="Remove" data-undo="${x.id}" type="button">↩️</button></div>`).join('') || '<p class="muted">None yet today.</p>'}</div>
      <p class="muted">🗣️ switches "reminded" on or off. ✔️ marks a job done as reminded (for when he forgot to tick it).</p>`;
    $$('[data-rem]', el).forEach((b) => (b.onclick = async () => { await api(`/api/parent/completions/${b.dataset.rem}/reminded`, { method: 'POST', body: { reminded: b.dataset.v === '1' } }); pToday(el); }));
    $$('[data-undo]', el).forEach((b) => (b.onclick = async () => { await api(`/api/parent/completions/${b.dataset.undo}/undo`, { method: 'POST' }); pToday(el); }));
    $$('[data-done]', el).forEach((b) => (b.onclick = async () => { await api('/api/parent/complete', { method: 'POST', body: { chore_id: b.dataset.done, reminded: true } }); pToday(el); }));
  }

  const niceDate = (d) => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

  async function pHistory(el) {
    const { days } = await api('/api/parent/history?days=14');
    el.innerHTML = days.map((d) => {
      const missed = d.items.filter((i) => !i.completion);
      const rem = d.items.filter((i) => i.completion && i.completion.reminded);
      return `<div class="panel"><h3>${niceDate(d.date)} <span class="muted" style="font-size:15px">· ${d.done}/${d.total} done · ${d.selfDone} by himself · ⭐ ${d.stars}${d.complete ? ' · 🏆' : ''}</span></h3>
        ${missed.length ? `<div><span class="status-pill miss">Missed</span> ${missed.map((i) => esc(`${i.emoji} ${i.name}`)).join(', ')}</div>` : ''}
        ${rem.length ? `<div style="margin-top:6px"><span class="status-pill rem">Reminded</span> ${rem.map((i) => esc(`${i.emoji} ${i.name}`)).join(', ')}</div>` : ''}
        ${d.extraItems.length ? `<div style="margin-top:6px"><span class="status-pill ok">Extras</span> ${d.extraItems.map((i) => esc(`${i.emoji} ${i.name}`)).join(', ')}</div>` : ''}
        ${!missed.length && !rem.length && !d.extraItems.length ? `<span class="muted">${d.total ? 'Everything done by himself 💪' : 'No jobs'}</span>` : ''}</div>`;
    }).join('');
  }

  async function pStats(el) {
    const s = await api('/api/parent/stats');
    const max = Math.max(1, ...s.week.map((d) => d.total));
    el.innerHTML = `<div class="kpis">
      <div class="kpi"><div class="v">${s.donePct}%</div><div class="l">jobs done (7 days)</div></div>
      <div class="kpi"><div class="v">${s.selfPct}%</div><div class="l">done without a reminder</div></div>
      <div class="kpi"><div class="v">🔥 ${s.streak}</div><div class="l">current streak (best ${s.bestStreak})</div></div>
      <div class="kpi"><div class="v">🦸 ${s.extras}</div><div class="l">extra jobs (7 days)</div></div>
      <div class="kpi"><div class="v">⭐ ${s.stars}</div><div class="l">stars this week</div></div>
      <div class="kpi"><div class="v">⭐ ${s.totalStars}</div><div class="l">stars all time</div></div></div>
      <div class="panel"><h3>Last 7 days</h3><div class="bars">${s.week.map((d) => `<div class="b">
        <div class="col" style="height:${(d.done / max) * 100}%"><div class="self" style="height:${d.done ? (d.selfDone / d.done) * 100 : 0}%"></div></div>
        <div class="lab">${new Date(d.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short' })}<br>${d.done}/${d.total}</div></div>`).join('')}</div>
        <div class="legend"><span><i style="background:var(--purple)"></i>By himself</span><span><i style="background:var(--purple-mid)"></i>Reminded</span></div></div>`;
  }

  async function pJobs(el) {
    const { chores } = await api('/api/parent/chores');
    const groups = [
      ...Object.entries(SLOT_INFO).map(([k, v]) => [`${v.icon} ${v.label}`, chores.filter((c) => c.active && !c.is_extra && c.slot === k)]),
      ['🦸 Extra jobs', chores.filter((c) => c.active && c.is_extra)],
      ['🗄️ Retired', chores.filter((c) => !c.active)],
    ];
    el.innerHTML = `<div class="toolbar">
        <button class="btn small purple" data-add type="button">➕ Add job</button>
        <button class="btn small secondary" data-add-extra type="button">➕ Add extra job</button>
        <button class="btn small secondary" data-import type="button">📥 Import CSV</button>
        <button class="btn small secondary" data-export type="button">📤 Export CSV</button>
        <input type="file" accept=".csv,text/csv" hidden data-file></div>
      ${groups.filter(([, list]) => list.length).map(([title, list]) => `<div class="panel"><h3>${title}</h3>${list.map((c, i) => `
        <div class="row ${c.active ? '' : 'retired'}"><div class="e">${esc(c.emoji)}</div>
          <div class="n"><b>${esc(c.name)}</b><small>${c.is_extra ? `+${c.stars} ⭐` : `${esc(daysLabel(c.days))} · due ${esc(c.due_time || '-')} · remind ${c.remind_before_min} min before · ${c.stars} ⭐`}</small></div>
          ${c.active && c.is_extra ? `<button class="icon-btn" data-up="${c.id}" ${i === 0 ? 'disabled style="opacity:.3"' : ''} type="button">⬆️</button>
            <button class="icon-btn" data-down="${c.id}" ${i === list.length - 1 ? 'disabled style="opacity:.3"' : ''} type="button">⬇️</button>` : ''}
          <button class="icon-btn" data-edit="${c.id}" type="button">✏️</button>
          <button class="icon-btn" data-active="${c.id}" data-v="${c.active ? 0 : 1}" title="${c.active ? 'Retire' : 'Bring back'}" type="button">${c.active ? '🗄️' : '♻️'}</button>
        </div>`).join('')}</div>`).join('')}
      <p class="muted">Jobs are listed in due-time order. Retiring a job hides it but keeps its history. Import adds new jobs and updates ones with the same name.</p>`;

    $('[data-add]', el).onclick = () => jobForm(null, false, () => pJobs(el));
    $('[data-add-extra]', el).onclick = () => jobForm(null, true, () => pJobs(el));
    $$('[data-edit]', el).forEach((b) => (b.onclick = () => jobForm(chores.find((c) => c.id === Number(b.dataset.edit)), null, () => pJobs(el))));
    $$('[data-active]', el).forEach((b) => (b.onclick = async () => { await api(`/api/parent/chores/${b.dataset.active}/active`, { method: 'POST', body: { active: b.dataset.v === '1' } }); pJobs(el); }));
    const move = async (id, dir) => {
      const c = chores.find((x) => x.id === id);
      const list = chores.filter((x) => x.active && x.is_extra === c.is_extra && (c.is_extra || x.slot === c.slot));
      const i = list.findIndex((x) => x.id === id), j = i + dir;
      if (j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      const others = chores.filter((x) => !list.includes(x));
      await api('/api/parent/reorder', { method: 'POST', body: { ids: [...others, ...list].map((x) => x.id) } });
      pJobs(el);
    };
    $$('[data-up]', el).forEach((b) => (b.onclick = () => move(Number(b.dataset.up), -1)));
    $$('[data-down]', el).forEach((b) => (b.onclick = () => move(Number(b.dataset.down), 1)));
    const file = $('[data-file]', el);
    $('[data-import]', el).onclick = () => file.click();
    file.onchange = async () => {
      const f = file.files[0]; if (!f) return;
      try {
        const r = await api('/api/parent/import', { method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: await f.text() });
        toast(`Imported: ${r.added} added, ${r.updated} updated${r.errors.length ? `, ${r.errors.length} problems` : ''}`, 4000);
        if (r.errors.length) alert(r.errors.join('\n'));
        pJobs(el);
      } catch (e) { toast(e.message); }
    };
    $('[data-export]', el).onclick = async () => {
      const text = await api('/api/parent/export');
      const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
      const a = document.createElement('a'); a.href = url; a.download = 'chores.csv'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
  }

  function daysLabel(days) {
    const d = (days || 'daily').toLowerCase();
    if (d === 'daily') return 'Every day';
    if (d === 'weekdays') return 'Weekdays';
    if (d === 'weekends') return 'Weekends';
    return d.split(',').map((x) => x.charAt(0).toUpperCase() + x.slice(1, 3)).join(', ');
  }

  function jobForm(c, extraDefault, done) {
    const isExtra = c ? !!c.is_extra : !!extraDefault;
    const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    const presets = { daily: DAYS, weekdays: DAYS.slice(0, 5), weekends: DAYS.slice(5) };
    let picked = new Set(presets[c?.days] || (c?.days ? c.days.split(',') : DAYS));
    openSheet(`<h3>${c ? 'Edit' : 'Add'} ${isExtra ? 'extra job' : 'job'}</h3><p class="sub">&nbsp;</p>
      <div class="form-grid">
        <label class="f full">Name<input name="name" value="${esc(c?.name || '')}" placeholder="e.g. Make bed" required></label>
        <label class="f">Emoji<input name="emoji" value="${esc(c?.emoji || '')}" placeholder="🛏️" maxlength="8"></label>
        <label class="f">Stars<input name="stars" type="number" min="0" max="50" value="${c?.stars ?? (isExtra ? 5 : 2)}"></label>
        ${isExtra ? '' : `
        <label class="f">Part of day<select name="slot">${Object.entries(SLOT_INFO).map(([k, v]) => `<option value="${k}" ${c?.slot === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></label>
        <label class="f">Due by<input name="due_time" type="time" value="${esc(c?.due_time || '')}"></label>
        <label class="f">Remind him (mins before)<input name="remind_before_min" type="number" min="0" max="240" value="${c?.remind_before_min ?? 15}"></label>
        <div class="f full"><label class="f">Days</label><div class="day-picks" data-days>
          ${DAYS.map((d) => `<button type="button" data-d="${d}">${d.charAt(0).toUpperCase() + d.slice(1)}</button>`).join('')}
          <button type="button" data-p="daily">Every day</button><button type="button" data-p="weekdays">Weekdays</button><button type="button" data-p="weekends">Weekends</button></div></div>`}
      </div>
      <button class="btn purple" data-save type="button">💾 Save</button>
      <button class="btn ghost" data-close type="button">Cancel</button>`, (s) => {
      const paint = () => $$('[data-d]', s).forEach((b) => b.classList.toggle('on', picked.has(b.dataset.d)));
      paint();
      $$('[data-d]', s).forEach((b) => (b.onclick = () => { picked.has(b.dataset.d) ? picked.delete(b.dataset.d) : picked.add(b.dataset.d); paint(); }));
      $$('[data-p]', s).forEach((b) => (b.onclick = () => { picked = new Set(presets[b.dataset.p]); paint(); }));
      $('[data-save]', s).onclick = async () => {
        const get = (n) => $(`[name="${n}"]`, s)?.value;
        const order = DAYS.filter((d) => picked.has(d));
        const days = order.length === 7 ? 'daily' : order.join(',') === 'mon,tue,wed,thu,fri' ? 'weekdays' : order.join(',') === 'sat,sun' ? 'weekends' : order.join(',');
        if (!isExtra && !order.length) return toast('Pick at least one day');
        const body = { name: get('name'), emoji: get('emoji'), stars: get('stars'), is_extra: isExtra ? 1 : 0 };
        if (!isExtra) Object.assign(body, { slot: get('slot'), due_time: get('due_time'), remind_before_min: get('remind_before_min'), days });
        try {
          await api(c ? `/api/parent/chores/${c.id}` : '/api/parent/chores', { method: c ? 'PUT' : 'POST', body });
          closeSheet(); toast('Saved'); done();
        } catch (e) { toast(e.message); }
      };
    });
  }

  async function pSettings(el) {
    const { settings: s, ntfy, tz, now } = await api('/api/parent/settings');
    const { items } = await api('/api/parent/notifications');
    el.innerHTML = `<div class="panel"><h3>General</h3><div class="form-grid">
        <label class="f">Son's name (for greetings)<input name="kid_name" value="${esc(s.kid_name)}"></label>
        <label class="f">Daily round-up time<input name="summary_time" type="time" value="${esc(s.summary_time)}"></label>
        <label class="f">Tell parents if still not done after (mins)<input name="escalate_min" type="number" min="5" max="240" value="${esc(s.escalate_min)}"></label>
        <label class="f">Stars when reminded (share of full)<select name="reminded_star_ratio">
          ${[['0.5', 'Half'], ['0.75', 'Three quarters'], ['1', 'Full'], ['0.34', 'A third']].map(([v, l]) => `<option value="${v}" ${s.reminded_star_ratio === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="f">Opening animation<select name="splash_mode">
          <option value="always" ${s.splash_mode === 'always' ? 'selected' : ''}>Every time the app opens</option>
          <option value="daily" ${s.splash_mode === 'daily' ? 'selected' : ''}>First open of the day</option></select></label>
      </div></div>
      <div class="panel"><h3>Default due times (used when a CSV row has no time)</h3><div class="form-grid">
        <label class="f">Morning<input name="slot_morning" type="time" value="${esc(s.slot_morning)}"></label>
        <label class="f">Afternoon<input name="slot_afternoon" type="time" value="${esc(s.slot_afternoon)}"></label>
        <label class="f">Evening<input name="slot_evening" type="time" value="${esc(s.slot_evening)}"></label></div>
        <button class="btn purple" data-save type="button">💾 Save settings</button></div>
      <div class="panel"><h3>Notifications (ntfy)</h3>
        <p class="muted">${ntfy.enabled ? `On. Son's topic: <b>${esc(ntfy.kidTopic)}</b>, parents' topic: <b>${esc(ntfy.parentTopic)}</b>.` : 'Off. Set NTFY_URL in the .env file to turn it on (messages are only logged for now).'} Time zone ${esc(tz)}, server time ${esc(now.date)} ${esc(now.hhmm)}.</p>
        <div class="toolbar"><button class="btn small secondary" data-test="kid" type="button">📱 Test son's tablet</button><button class="btn small secondary" data-test="parents" type="button">📱 Test parents</button></div>
        <h3 style="margin-top:10px">Recent messages</h3>
        ${items.map((n) => `<div class="notif"><span class="when">${niceDate(n.date)} ${hm(n.sent_at)} · ${esc(n.kind)} → ${esc(n.topic)} ${n.ok ? '' : '⚠️ failed'}</span><br>${esc(n.message)}</div>`).join('') || '<p class="muted">Nothing sent yet.</p>'}
      </div>
      <div class="panel"><h3>Change parent PIN</h3><div class="form-grid"><label class="f">New PIN (4 digits)<input name="pin" type="password" inputmode="numeric" maxlength="4"></label></div>
        <button class="btn secondary" data-pin type="button">Change PIN</button></div>`;
    $('[data-save]', el).onclick = async () => {
      const body = {};
      ['kid_name', 'summary_time', 'escalate_min', 'reminded_star_ratio', 'splash_mode', 'slot_morning', 'slot_afternoon', 'slot_evening']
        .forEach((k) => (body[k] = $(`[name="${k}"]`, el).value));
      await api('/api/parent/settings', { method: 'PUT', body });
      toast('Settings saved');
    };
    $$('[data-test]', el).forEach((b) => (b.onclick = async () => {
      const r = await api('/api/parent/test-ntfy', { method: 'POST', body: { to: b.dataset.test } });
      toast(r.enabled ? (r.ok ? `Sent to ${r.topic}` : `Failed to send to ${r.topic}. Check the logs.`) : 'ntfy is off, message only logged');
      pSettings(el);
    }));
    $('[data-pin]', el).onclick = async () => {
      const pin = $('[name="pin"]', el).value;
      if (!/^\d{4}$/.test(pin)) return toast('PIN must be 4 digits');
      try { await api('/api/parent/pin', { method: 'POST', body: { pin } }); toast('PIN changed'); $('[name="pin"]', el).value = ''; } catch (e) { toast(e.message); }
    };
  }

  // ---------------- Router ----------------
  function route() {
    const tab = (location.hash.match(/^#\/(\w+)/) || [])[1] || 'today';
    $$('#tabs a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
    clearTimeout(practiceTimer);
    closeSheet();
    window.scrollTo(0, 0);
    const fn = { today: () => renderToday(true), extras: renderExtras, laces: renderLaces, parents: renderParents }[tab] || (() => renderToday(true));
    Promise.resolve(fn()).catch((e) => { if (e.message !== 'PIN needed') view.innerHTML = `<div class="empty"><div class="big">😬</div>Could not load: ${esc(e.message)}</div>`; });
  }
  window.addEventListener('hashchange', route);

  // Keep Today fresh (states change as times pass) and when the tablet wakes up
  setInterval(() => { if (!location.hash || location.hash.startsWith('#/today')) { if ($('#sheet').hidden && $('#celebrate').hidden) renderToday().catch(() => {}); } }, 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && (!location.hash || location.hash.startsWith('#/today'))) renderToday().catch(() => {}); });

  // ---------------- Boot ----------------
  (async () => {
    let mode = 'always';
    try { const d = await api('/api/today'); mode = d.splashMode; setChips(d); } catch { /* show app anyway */ }
    const splash = runSplash(mode);
    route();
    await splash;
  })();
})();
