/* ============================================================
   Kharidaar — "Sabzi Ninja": slice the bazaar's real groceries.
   Canvas game, desi style: swipe to slice, dodge the patakha.
   ============================================================ */
(function () {
  const D = window.KHARIDAAR_DATA;
  const stage = document.getElementById('gameStage');
  const canvas = document.getElementById('gameCanvas');
  if (!D || !stage || !canvas) return;
  const ctx = canvas.getContext('2d');

  const el = id => document.getElementById(id);
  const scoreEl = el('gameScore'), bestEl = el('gameBest'), livesEl = el('gameLives'), worthEl = el('gameWorth');
  const startBox = el('gameStart'), overBox = el('gameOver'), overStats = el('gameOverStats'), overTitle = el('gameOverTitle');
  const L = () => window.KharidaarL10n;
  const t = (k, v) => (window.t ? window.t(k, v) : k);
  const A = () => window.KharidaarAudio;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // tangible, edible things from the price diary (no bus fares or haircuts)
  const NOT_FOOD = new Set(['bus', 'saloon', 'airtel', 'battery', 'brush', 'bulb', 'earphones', 'gift', 'hotel', 'library',
    'lip-balm', 'mask', 'medical', 'medicine', 'metro', 'ro', 'spray', 'teeth', 'general', 'fruits', 'vegetables', 'food']);
  const FOODS = D.items.filter(i => !NOT_FOOD.has(i.id) && (i.latest || 0) > 0);

  const state = {
    w: 800, h: 520, dpr: 1, running: false, over: false, paused: false,
    score: 0, lives: 3, best: 0, worth: 0, sliced: 0, combo: 0, comboT: 0,
    items: [], queue: [], halves: [], parts: [], pops: [], trail: [], spawnT: 0, time: 0, shake: 0, flash: 0, last: 0, raf: 0,
    pointer: { down: false, x: 0, y: 0 },
  };
  try { state.best = Number(localStorage.getItem('kharidaar.ninja.best')) || 0; } catch (e) {}

  const rnd = (a, b) => a + Math.random() * (b - a);
  const money = n => '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n);
  const emojiOf = it => (L() ? L().itemEmoji(it) : '🍎');
  const nameOf = it => (L() ? L().itemName(it) : it.name);
  const lang = () => document.documentElement.dataset.lang || 'en';
  const colorOf = it => ((D.categories[it.category] || {}).color) || '#d84a22';

  function resize() {
    const r = stage.getBoundingClientRect();
    state.w = Math.max(280, r.width); state.h = Math.max(320, r.height);
    state.dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(state.w * state.dpr); canvas.height = Math.round(state.h * state.dpr);
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    if (!state.running) drawIdle();
  }

  /* ---------------- spawning ---------------- */
  function spawn(bombChance) {
    const { w, h } = state;
    const bomb = Math.random() < bombChance;
    const it = bomb ? null : FOODS[Math.floor(Math.random() * FOODS.length)];
    const size = Math.max(46, Math.min(70, w / 11));
    const x = rnd(w * .15, w * .85);
    const target = w / 2 + rnd(-w * .22, w * .22);
    const g = h * 1.35;                       // px / s^2, scales with arena height
    const apex = rnd(h * .55, h * .86);
    const vy = -Math.sqrt(2 * g * apex);
    const air = (-vy / g) * 2;
    state.items.push({
      it, bomb, x, y: h + size, vx: (target - x) / air, vy, g, size,
      rot: 0, spin: rnd(-4, 4), seen: false, sliced: false,
    });
  }

  function wave() {
    const level = Math.min(1, state.time / 90);
    const n = 1 + Math.floor(Math.random() * (1 + level * 3));
    const bombChance = .1 + level * .08;
    for (let i = 0; i < n; i++) state.queue.push({ t: i * .11, bomb: bombChance });
  }

  /* ---------------- slicing ---------------- */
  function sliceItem(o, ang) {
    o.sliced = true;
    const a = A();
    if (o.bomb) { explode(o); return; }
    state.sliced++;
    state.combo++; state.comboT = .5;
    state.worth += o.it.latest || 0;
    state.score += 10 + (state.combo > 2 ? state.combo * 2 : 0);
    const col = colorOf(o.it);
    for (let i = 0; i < 14; i++) {
      const s = rnd(80, 320), d = ang + rnd(-1.4, 1.4);
      state.parts.push({ x: o.x, y: o.y, vx: Math.cos(d) * s, vy: Math.sin(d) * s - 60, life: rnd(.5, 1), r: rnd(2, 5), col });
    }
    [-1, 1].forEach(side => state.halves.push({
      it: o.it, side, x: o.x, y: o.y, size: o.size, rot: o.rot, spin: o.spin + side * 3,
      vx: o.vx * .4 + side * rnd(60, 130), vy: o.vy * .4, g: o.g, life: 1.2, ang,
    }));
    state.pops.push({ x: o.x, y: o.y - o.size * .4, text: '+' + money(o.it.latest || 0), life: 1, big: state.combo > 2 });
    if (state.combo > 2) state.pops.push({ x: o.x, y: o.y - o.size, text: t('game.combo', { n: state.combo }) || `Combo x${state.combo}`, life: 1.2, big: true, col: '#ffcf86' });
    if (a) { a.sfx('slice'); if (state.combo > 2) a.sfx('coin'); }
    updateHud();
  }

  function explode(o) {
    state.flash = 1; state.shake = 1;
    for (let i = 0; i < 40; i++) {
      const d = rnd(0, 6.28), s = rnd(120, 520);
      state.parts.push({ x: o.x, y: o.y, vx: Math.cos(d) * s, vy: Math.sin(d) * s, life: rnd(.4, 1), r: rnd(2, 6), col: ['#ffb15d', '#ff6a2a', '#fff2c4'][i % 3] });
    }
    if (A()) A().sfx('bomb');
    endGame(true);
  }

  function segHit(x1, y1, x2, y2, o) {
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx * dx + dy * dy || 1;
    let tt = ((o.x - x1) * dx + (o.y - y1) * dy) / len2;
    tt = Math.max(0, Math.min(1, tt));
    return Math.hypot(x1 + dx * tt - o.x, y1 + dy * tt - o.y) < o.size * .55;
  }

  function onMove(x, y) {
    const p = state.pointer;
    if (!p.down) return;
    if (state.running) {
      const ang = Math.atan2(y - p.y, x - p.x);
      if (Math.hypot(x - p.x, y - p.y) > 1) {
        for (const o of state.items) {
          if (!o.sliced && o.y < state.h + 10 && segHit(p.x, p.y, x, y, o)) sliceItem(o, ang);
        }
      }
    }
    state.trail.push({ x, y, life: 1 });
    if (state.trail.length > 28) state.trail.shift();
    p.x = x; p.y = y;
  }

  function pt(e) { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    const [x, y] = pt(e);
    state.pointer = { down: true, x, y };
    state.trail.push({ x, y, life: 1 });
  });
  canvas.addEventListener('pointermove', e => { const [x, y] = pt(e); onMove(x, y); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(n => canvas.addEventListener(n, () => { state.pointer.down = false; state.combo = 0; }));

  /* ---------------- loop ---------------- */
  function update(dt) {
    state.time += dt;
    state.comboT -= dt; if (state.comboT <= 0 && !state.pointer.down) state.combo = 0;
    state.spawnT -= dt;
    for (const q of state.queue) q.t -= dt;
    state.queue = state.queue.filter(q => { if (q.t > 0) return true; spawn(q.bomb); return false; });
    if (state.spawnT <= 0) { wave(); state.spawnT = Math.max(.65, 1.5 - state.time / 70); }

    for (const o of state.items) {
      o.vy += o.g * dt; o.x += o.vx * dt; o.y += o.vy * dt; o.rot += o.spin * dt;
      if (!o.seen && o.y < state.h - o.size * .5) o.seen = true;
      if (o.seen && o.y > state.h + o.size && !o.sliced) {
        o.sliced = true;
        if (!o.bomb) loseLife();
      }
    }
    state.items = state.items.filter(o => !o.sliced);
    for (const h of state.halves) { h.vy += h.g * dt; h.x += h.vx * dt; h.y += h.vy * dt; h.rot += h.spin * dt; h.life -= dt * .55; }
    state.halves = state.halves.filter(h => h.life > 0 && h.y < state.h + 120);
    for (const p of state.parts) { p.vy += 700 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt * 1.3; }
    state.parts = state.parts.filter(p => p.life > 0);
    for (const p of state.pops) { p.y -= 34 * dt; p.life -= dt * 1.1; }
    state.pops = state.pops.filter(p => p.life > 0);
    for (const tr of state.trail) tr.life -= dt * 3.2;
    state.trail = state.trail.filter(tr => tr.life > 0);
    state.shake = Math.max(0, state.shake - dt * 2.4);
    state.flash = Math.max(0, state.flash - dt * 1.6);
  }

  function loseLife() {
    state.lives--; state.combo = 0;
    if (A()) A().sfx('error');
    updateHud();
    if (state.lives <= 0) endGame(false);
  }

  function frame(now) {
    state.raf = requestAnimationFrame(frame);
    if (!state.last) state.last = now;
    const dt = Math.min(.05, (now - state.last) / 1000);
    state.last = now;
    if (state.paused) return;
    if (state.running) update(dt);
    else {                                   // keep eased effects alive after game over
      for (const h of state.halves) { h.vy += h.g * dt; h.x += h.vx * dt; h.y += h.vy * dt; h.rot += h.spin * dt; h.life -= dt * .55; }
      for (const p of state.parts) { p.vy += 700 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt * 1.3; }
      state.parts = state.parts.filter(p => p.life > 0);
      state.flash = Math.max(0, state.flash - dt * 1.6); state.shake = Math.max(0, state.shake - dt * 2.4);
      for (const tr of state.trail) tr.life -= dt * 3.2;
      state.trail = state.trail.filter(tr => tr.life > 0);
    }
    draw();
  }

  /* ---------------- drawing ---------------- */
  function bg() {
    const { w, h } = state;
    const dark = document.documentElement.dataset.theme === 'dark';
    const g = ctx.createLinearGradient(0, 0, 0, h);
    if (dark) { g.addColorStop(0, '#1b1230'); g.addColorStop(1, '#3a1d2b'); }
    else { g.addColorStop(0, '#ffd9a0'); g.addColorStop(.55, '#f7a86a'); g.addColorStop(1, '#d9573a'); }
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // jaali / rangoli dots
    ctx.fillStyle = dark ? 'rgba(255,220,160,.07)' : 'rgba(120,40,10,.08)';
    const step = 46;
    for (let y = 0; y < h; y += step) for (let x = ((y / step) % 2) * step / 2; x < w; x += step) {
      ctx.beginPath(); ctx.arc(x + 12, y + 12, 3.2, 0, 6.283); ctx.fill();
    }
    // toran at the top
    for (let x = 0, i = 0; x < w; x += 34, i++) {
      ctx.fillStyle = ['#f4a300', '#d6336c', '#0f8b8d'][i % 3];
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 34, 0); ctx.lineTo(x + 17, 20 + (i % 2) * 8); ctx.fill();
    }
  }

  function drawIdle() { bg(); }

  function emojiAt(txt, x, y, size, rot, clip) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot);
    if (clip) { ctx.beginPath(); ctx.rect(clip < 0 ? -size : 0, -size, size, size * 2); ctx.clip(); }
    ctx.font = `${size}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, 0, 2);
    ctx.restore();
  }

  function draw() {
    const { w, h } = state;
    ctx.save();
    if (state.shake > 0) ctx.translate(rnd(-1, 1) * state.shake * 10, rnd(-1, 1) * state.shake * 10);
    bg();

    for (const h2 of state.halves) {
      ctx.globalAlpha = Math.max(0, Math.min(1, h2.life));
      // each half is the emoji clipped to its side, pushed apart along the slice
      ctx.save(); ctx.translate(h2.x, h2.y); ctx.rotate(h2.rot);
      emojiAt(h2.it ? emojiOf(h2.it) : '', h2.side * 2, 0, h2.size, 0, h2.side);
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    for (const o of state.items) {
      if (o.sliced) continue;
      if (o.bomb) {
        ctx.save(); ctx.shadowColor = '#ff5a2a'; ctx.shadowBlur = 18 + Math.sin(state.time * 14) * 8;
        emojiAt('🧨', o.x, o.y, o.size, o.rot * .3); ctx.restore();
      } else {
        ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 6;
        emojiAt(emojiOf(o.it), o.x, o.y, o.size, o.rot); ctx.restore();
      }
    }

    for (const p of state.parts) {
      ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.col;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // saffron blade trail
    if (state.trail.length > 1) {
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (let i = 1; i < state.trail.length; i++) {
        const a = state.trail[i - 1], b = state.trail[i];
        const k = Math.max(0, Math.min(1, b.life));
        ctx.strokeStyle = `rgba(255, 244, 214, ${k})`; ctx.lineWidth = 2 + 9 * k * (i / state.trail.length);
        ctx.shadowColor = '#ffb15d'; ctx.shadowBlur = 14;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      ctx.shadowBlur = 0;
    }

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const p of state.pops) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
      ctx.font = `700 ${p.big ? 24 : 17}px Outfit, system-ui, sans-serif`;
      ctx.fillStyle = p.col || '#fff'; ctx.strokeStyle = 'rgba(40,10,0,.55)'; ctx.lineWidth = 4;
      ctx.strokeText(p.text, p.x, p.y); ctx.fillText(p.text, p.x, p.y);
    }
    ctx.globalAlpha = 1;
    if (state.flash > 0) { ctx.fillStyle = `rgba(255,240,200,${state.flash * .75})`; ctx.fillRect(0, 0, w, h); }
    ctx.restore();
  }

  /* ---------------- flow ---------------- */
  function updateHud() {
    scoreEl.textContent = state.score;
    bestEl.textContent = Math.max(state.best, state.score);
    worthEl.textContent = money(state.worth);
    livesEl.innerHTML = Array.from({ length: 3 }, (_, i) => `<i class="${i < state.lives ? 'on' : ''}">🫓</i>`).join('');
  }

  function start() {
    Object.assign(state, { running: true, over: false, score: 0, lives: 3, worth: 0, sliced: 0, combo: 0, comboT: 0,
      items: [], queue: [], halves: [], parts: [], pops: [], spawnT: .3, time: 0, shake: 0, flash: 0 });
    startBox.hidden = true; overBox.hidden = true;
    stage.classList.add('is-playing');
    updateHud();
    if (A()) A().sfx('whoosh');
    if (!state.raf) state.raf = requestAnimationFrame(frame);
  }

  function endGame(bombed) {
    if (!state.running) return;
    state.running = false; state.over = true;
    stage.classList.remove('is-playing');
    const isBest = state.score > state.best;
    if (isBest) { state.best = state.score; try { localStorage.setItem('kharidaar.ninja.best', String(state.best)); } catch (e) {} }
    updateHud();
    const hi = lang() !== 'en';
    overTitle.textContent = bombed ? t('game.boom') : t('game.over');
    overStats.innerHTML = `<b>${state.score}</b> ${t('game.points')} · ${state.sliced} ${t('game.slices')}<br>${t('game.worth')}: <b>${money(state.worth)}</b>${isBest ? `<br><span class="game-best">🏆 ${t('game.newBest')}</span>` : ''}`;
    setTimeout(() => { overBox.hidden = false; if (A()) A().sfx(isBest ? 'success' : 'close'); }, bombed ? 650 : 250);
  }

  el('gamePlay').addEventListener('click', start);
  el('gameAgain').addEventListener('click', start);
  document.addEventListener('visibilitychange', () => { state.paused = document.hidden; state.last = 0; });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(es => { state.paused = !es[0].isIntersecting; state.last = 0; }, { threshold: .15 }).observe(stage);
  }
  window.addEventListener('resize', () => { clearTimeout(window._gmR); window._gmR = setTimeout(resize, 120); });
  new MutationObserver(() => { if (!state.running) draw(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  window.KharidaarNinja = { state, update, onMove };
  resize(); updateHud();
  state.raf = requestAnimationFrame(frame);
})();
