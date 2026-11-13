/* ============================================================
   Kharidaar — "Thela Rush"
   Push a handcart down a crowded bazaar lane. Memsahib's shopping
   list is ticking: grab the right items, dodge cows & rickshaws,
   honk the sleepy ones aside, and chug chai for a speed boost.
   ============================================================ */
(function () {
  const D = window.KHARIDAAR_DATA;
  const stage = document.getElementById('thelaStage');
  const canvas = document.getElementById('thelaCanvas');
  if (!D || !stage || !canvas) return;
  const ctx = canvas.getContext('2d');
  const $ = id => document.getElementById(id);
  const A = () => window.KharidaarAudio;
  const L10 = () => window.KharidaarL10n;
  const lang = () => document.documentElement.dataset.lang || 'en';
  const hi = () => lang() === 'hi' || lang() === 'eh';

  const NOT_FOOD = new Set(['bus', 'saloon', 'airtel', 'battery', 'brush', 'bulb', 'earphones', 'gift', 'hotel', 'library',
    'lip-balm', 'mask', 'medical', 'medicine', 'metro', 'ro', 'spray', 'teeth', 'general', 'fruits', 'vegetables', 'food']);
  const FOODS = D.items.filter(i => !NOT_FOOD.has(i.id) && (i.latest || 0) > 0);
  const emoji = it => (L10() ? L10().itemEmoji(it) : '🍎');
  const nameOf = it => (L10() ? L10().itemName(it) : it.name);

  const T = {
    en: { go: 'Go!', list: 'Memsahib wants', done: 'List done! +50', late: 'Memsahib is angry! -1 roti', honk: 'HORN',
      hit: { cow: 'Moo! Sacred cow!', rickshaw: 'Rickshaw!', auto: 'Auto bhaiya!', puddle: 'Splash!' }, chai: 'Chai power! 🔥',
      wrong: 'Not on the list', over: 'Thela toppled!', dist: 'm', best: 'Best', wait: 'Cooling' },
    hi: { go: 'चलो!', list: 'मेमसाहब को चाहिए', done: 'सूची पूरी! +50', late: 'मेमसाहब नाराज़! -1 रोटी', honk: 'हॉर्न',
      hit: { cow: 'गाय माता!', rickshaw: 'रिक्शा!', auto: 'ऑटो भैया!', puddle: 'छपाक!' }, chai: 'चाय का जोश! 🔥',
      wrong: 'सूची में नहीं', over: 'ठेला पलट गया!', dist: 'मी', best: 'सर्वश्रेष्ठ', wait: 'रुको' },
  };
  const tr = () => T[hi() ? 'hi' : 'en'];

  const S = {
    w: 800, h: 520, dpr: 1, running: false, paused: false, raf: 0, last: 0,
    time: 0, dist: 0, speed: 16, score: 0, lives: 3, best: 0, lane: 1, laneX: 1, inv: 0, chai: 0, horn: 0, hornCd: 0,
    ents: [], props: [], pops: [], rings: [], parts: [], stack: [], need: [], listT: 0, listN: 0,
    spawnT: 0, shake: 0, flash: 0, banner: null, collected: 0,
  };
  try { S.best = Number(localStorage.getItem('kharidaar.thela.best')) || 0; } catch (e) {}
  const rnd = (a, b) => a + Math.random() * (b - a);
  const K = .3;                                   // perspective factor
  const FLOW = .5;
  const proj = d => 1 / (1 + Math.max(-2, d) * K);

  function resize() {
    const r = stage.getBoundingClientRect();
    S.w = Math.max(280, r.width); S.h = Math.max(320, r.height);
    S.dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(S.w * S.dpr); canvas.height = Math.round(S.h * S.dpr);
    ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    if (!S.running) draw();
  }
  const geo = () => ({ hy: S.h * .3, py: S.h * .84, cx: S.w / 2, half: p => S.w * .05 + S.w * .4 * p });
  const laneToX = (lane, p) => { const g = geo(); return g.cx + (lane - 1) * g.half(p) * .62; };
  const toScreen = (lane, d) => {
    const g = geo(), p = proj(d);
    return { x: laneToX(lane, p), y: g.hy + (g.py - g.hy) * p, p };
  };

  /* ---------------- list ---------------- */
  function newList() {
    const pool = FOODS.slice().sort(() => Math.random() - .5);
    const kinds = Math.min(3, 2 + Math.floor(S.listN / 3));
    S.need = pool.slice(0, kinds).map(it => ({ it, n: 1 + Math.floor(Math.random() * 2), got: 0 }));
    S.listT = Math.max(16, 30 - S.listN * 1.5);
    S.listMax = S.listT;
    S.listN++;
    renderList();
  }
  function renderList() {
    $('thelaList').innerHTML = S.need.map(n => `<span class="tl-chip ${n.got >= n.n ? 'is-done' : ''}"><b>${emoji(n.it)}</b>${n.got}/${n.n}<small>${nameOf(n.it)}</small></span>`).join('');
  }
  function renderHud() {
    $('thelaScore').textContent = Math.floor(S.score);
    $('thelaBest').textContent = Math.max(S.best, Math.floor(S.score));
    $('thelaDist').textContent = Math.floor(S.dist) + tr().dist;
    $('thelaLives').innerHTML = Array.from({ length: 3 }, (_, i) => `<i class="${i < S.lives ? 'on' : ''}">🫓</i>`).join('');
  }

  /* ---------------- spawning ---------------- */
  const HAZ = [
    { k: 'cow', e: '🐄', v: 0, w: 1.15, wander: true },
    { k: 'rickshaw', e: '🛺', v: 9, w: 1 },
    { k: 'auto', e: '🛵', v: 14, w: .9 },
    { k: 'puddle', e: '💦', v: 0, w: .8, ground: true },
  ];
  function spawnRow() {
    const D0 = 36;
    const lanes = [0, 1, 2].sort(() => Math.random() - .5);
    const hazards = Math.random() < .35 + Math.min(.3, S.time / 200) ? 2 : 1;
    for (let i = 0; i < hazards; i++) {
      const h = HAZ[Math.floor(Math.random() * HAZ.length)];
      S.ents.push({ type: 'haz', ...h, lane: lanes[i], d: D0, cur: lanes[i], flee: 0 });
    }
    const free = lanes[hazards];
    const r = Math.random();
    if (r < .09) S.ents.push({ type: 'chai', e: '☕', lane: free, d: D0, cur: free });
    else {
      const wanted = S.need.filter(n => n.got < n.n);
      const useList = wanted.length && Math.random() < .62;
      const it = useList ? wanted[Math.floor(Math.random() * wanted.length)].it : FOODS[Math.floor(Math.random() * FOODS.length)];
      for (let j = 0; j < 3; j++) S.ents.push({ type: 'item', it, e: emoji(it), lane: free, d: D0 + j * 2.4, cur: free });
    }
  }
  function spawnProp(d) {
    const side = Math.random() < .5 ? -1 : 1;
    const cat = Object.keys(D.categories)[Math.floor(Math.random() * Object.keys(D.categories).length)];
    S.props.push({ side, d, cat, kind: Math.random() < .7 ? 'stall' : 'lamp', col: (D.categories[cat] || {}).color || '#d84a22', e: (D.categories[cat] || {}).emoji || '🛒' });
  }

  /* ---------------- flow ---------------- */
  function start() {
    Object.assign(S, { running: true, time: 0, dist: 0, speed: 16, score: 0, lives: 3, lane: 1, laneX: 1, inv: 0, chai: 0, horn: 0, hornCd: 0,
      ents: [], props: [], pops: [], rings: [], parts: [], stack: [], spawnT: .4, shake: 0, flash: 0, banner: null, listN: 0, collected: 0 });
    for (let d = 2; d < 40; d += 4.5) spawnProp(d);
    newList();
    $('thelaStart').hidden = true; $('thelaOver').hidden = true;
    stage.classList.add('is-playing');
    renderHud();
    say(tr().go, '#ffd77a');
    if (A()) A().sfx('whoosh');
    if (!S.raf) S.raf = requestAnimationFrame(frame);
  }
  function endGame() {
    S.running = false; stage.classList.remove('is-playing');
    const isBest = Math.floor(S.score) > S.best;
    if (isBest) { S.best = Math.floor(S.score); try { localStorage.setItem('kharidaar.thela.best', String(S.best)); } catch (e) {} }
    renderHud();
    $('thelaOverTitle').textContent = tr().over;
    $('thelaOverStats').innerHTML = `<b>${Math.floor(S.score)}</b> pts · ${Math.floor(S.dist)}${tr().dist} · ${S.collected} 🧺<br>${tr().best}: <b>${S.best}</b>${isBest ? '<br><span class="game-best">🏆 New best!</span>' : ''}`;
    setTimeout(() => { $('thelaOver').hidden = false; if (A()) A().sfx(isBest ? 'success' : 'close'); }, 500);
  }
  function say(text, col) { S.banner = { text, col: col || '#fff', life: 1.6 }; }
  function pop(text, x, y, col) { S.pops.push({ text, x, y, col: col || '#fff', life: 1 }); }

  function hurt(e) {
    if (S.inv > 0) return;
    S.lives--; S.inv = 1.6; S.shake = 1; S.flash = .6;
    S.speed = Math.max(14, S.speed * .8);
    for (let i = 0; i < 4 && S.stack.length; i++) S.stack.pop();
    say(tr().hit[e.k] || 'Oops!', '#ff9a7a');
    if (A()) A().sfx(e.k === 'cow' ? 'moo' : e.k === 'puddle' ? 'whoosh' : 'rickshaw');
    if (A()) A().sfx('error');
    renderHud();
    if (S.lives <= 0) endGame();
  }

  function honk() {
    if (!S.running || S.hornCd > 0) return;
    S.horn = .5; S.hornCd = 3.5;
    S.rings.push({ r: 20, life: 1 });
    if (A()) A().sfx('rickshaw');
    for (const e of S.ents) {
      if (e.type === 'haz' && e.wander && e.d > 0 && e.d < 16) e.flee = e.lane === 0 ? 1 : e.lane === 2 ? -1 : (Math.random() < .5 ? 1 : -1);
    }
  }

  function update(dt) {
    S.time += dt;
    S.speed = Math.min(36, S.speed + dt * .35 + (S.chai > 0 ? 0 : 0));
    const sp = S.speed * (S.chai > 0 ? 1.45 : 1);
    S.dist += sp * dt * .25;
    S.score += sp * dt * .12;
    S.inv = Math.max(0, S.inv - dt); S.chai = Math.max(0, S.chai - dt);
    S.horn = Math.max(0, S.horn - dt); S.hornCd = Math.max(0, S.hornCd - dt);
    S.laneX += (S.lane - S.laneX) * Math.min(1, dt * 12);
    S.shake = Math.max(0, S.shake - dt * 2.4); S.flash = Math.max(0, S.flash - dt * 2);
    if (S.banner) { S.banner.life -= dt; if (S.banner.life <= 0) S.banner = null; }

    // list timer
    S.listT -= dt;
    if (S.listT <= 0) { say(tr().late, '#ff9a7a'); S.lives--; S.flash = .5; if (A()) A().sfx('error'); renderHud(); if (S.lives <= 0) { endGame(); return; } newList(); }
    $('thelaTimer').style.setProperty('--t', Math.max(0, S.listT / S.listMax));
    $('thelaHorn').classList.toggle('is-cool', S.hornCd > 0);
    $('thelaHorn').style.setProperty('--c', 1 - S.hornCd / 3.5);

    S.spawnT -= dt;
    if (S.spawnT <= 0) { spawnRow(); S.spawnT = Math.max(.55, 1.5 - S.time / 80) * (22 / Math.max(16, sp)); }

    for (const e of S.ents) {
      e.d -= (sp - (e.v || 0)) * dt * FLOW;
      if (e.type === 'haz' && e.wander) {
        if (e.flee) { e.lane = Math.max(0, Math.min(2, e.lane + e.flee)); e.flee = 0; }
        else if (Math.random() < dt * .12 && e.d > 6) e.lane = Math.max(0, Math.min(2, e.lane + (Math.random() < .5 ? -1 : 1)));
      }
      e.cur += (e.lane - e.cur) * Math.min(1, dt * 5);
      if (!e.dead && e.d < 1.0 && e.d > -1.2 && Math.abs(e.cur - S.laneX) < .62) {
        if (e.type === 'haz') { if (S.chai > 0) { e.dead = true; burst(e, '#ffb15d'); S.score += 8; pop('+8 💥', S.w / 2, S.h * .6, '#ffd77a'); } else { e.dead = true; hurt(e); } }
        else if (e.type === 'chai') { e.dead = true; S.chai = 6; S.inv = Math.max(S.inv, 6); say(tr().chai, '#ffd77a'); if (A()) A().sfx('success'); }
        else if (e.type === 'item') { e.dead = true; collect(e); }
      }
    }
    S.ents = S.ents.filter(e => !e.dead && e.d > -3);
    for (const p of S.props) p.d -= sp * dt * FLOW;
    S.props = S.props.filter(p => p.d > -4);
    while (S.props.length < 11) spawnProp(Math.max(36, ...S.props.map(p => p.d)) + rnd(3, 5));
    for (const p of S.pops) { p.y -= 40 * dt; p.life -= dt * 1.2; }
    S.pops = S.pops.filter(p => p.life > 0);
    for (const r of S.rings) { r.r += dt * 420; r.life -= dt * 2; }
    S.rings = S.rings.filter(r => r.life > 0);
    for (const q of S.parts) { q.vy += 600 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.life -= dt * 1.4; }
    S.parts = S.parts.filter(q => q.life > 0);
    renderHud();
  }

  function burst(e, col) {
    const s = toScreen(e.cur, e.d);
    for (let i = 0; i < 12; i++) { const a = rnd(0, 6.28), v = rnd(80, 300); S.parts.push({ x: s.x, y: s.y - 30 * s.p, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 100, life: 1, col, r: rnd(2, 5) }); }
  }
  function collect(e) {
    const need = S.need.find(n => n.it.id === e.it.id && n.got < n.n);
    const s = toScreen(S.laneX, 0);
    S.collected++;
    if (S.stack.length < 7) S.stack.push(e.e);
    if (need) {
      need.got++; S.score += 12;
      pop(`+12 ${e.e}`, s.x, s.y - 80, '#aef0c8');
      if (A()) A().sfx('add');
      renderList();
      if (S.need.every(n => n.got >= n.n)) {
        S.score += 50; S.speed += 1.5; say(tr().done, '#ffd77a');
        if (A()) { A().sfx('success'); A().sfx('coin'); }
        S.stack.length = 0; newList();
      }
    } else { S.score += 2; pop(tr().wrong, s.x, s.y - 80, '#ffd9b0'); if (A()) A().sfx('click'); }
  }

  /* ---------------- drawing ---------------- */
  const SKY = [[[255, 214, 150], [244, 140, 90]], [[130, 190, 235], [255, 226, 170]], [[255, 160, 110], [150, 70, 120]], [[24, 20, 52], [70, 40, 70]]];
  const lerpC = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  function skyAt(t) {                                      // t in [0,4)
    const i = Math.floor(t) % 4, f = t - Math.floor(t), j = (i + 1) % 4;
    return [lerpC(SKY[i][0], SKY[j][0], f), lerpC(SKY[i][1], SKY[j][1], f)];
  }
  const css = c => `rgb(${c[0]},${c[1]},${c[2]})`;
  function drawFont(txt, x, y, size) {
    ctx.font = `${size}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, x, y);
  }

  function draw() {
    const { w, h } = S, g = geo();
    ctx.save();
    if (S.shake > 0) ctx.translate(rnd(-1, 1) * S.shake * 9, rnd(-1, 1) * S.shake * 9);
    const phase = (S.time / 28) % 4;
    const [top, bot] = skyAt(phase);
    const grad = ctx.createLinearGradient(0, 0, 0, g.hy + 30);
    grad.addColorStop(0, css(top)); grad.addColorStop(1, css(bot));
    ctx.fillStyle = grad; ctx.fillRect(0, 0, w, g.hy + 30);
    const night = Math.max(0, Math.min(1, phase > 2.5 && phase < 3.7 ? 1 : phase >= 3.7 ? (4 - phase) / .3 : (phase - 2) / .5));
    if (night > .02) { ctx.fillStyle = `rgba(255,246,226,${night * .8})`; for (let i = 0; i < 40; i++) ctx.fillRect((i * 97.3) % w, (i * 53.1) % (g.hy - 20), 1.6, 1.6); }
    // sun / moon
    const ang = ((phase % 4) / 4) * Math.PI * 2;
    ctx.globalAlpha = .9; ctx.fillStyle = night > .5 ? '#f4f0dc' : '#fff1b8';
    ctx.beginPath(); ctx.arc(w * .5 + Math.cos(ang - 1.6) * w * .38, g.hy - 20 - Math.sin(ang - 1.6) * g.hy * .65, 26, 0, 6.283); ctx.fill(); ctx.globalAlpha = 1;
    // skyline
    ctx.fillStyle = `rgba(${40 - night * 20},${22},${40},.55)`;
    for (let i = 0; i < 16; i++) { const bw = w / 12, bh = 30 + ((i * 37) % 55); ctx.fillRect(i * bw * .8 - 10 - (S.dist * 2 % bw), g.hy - bh, bw, bh + 2); }
    // ground + road
    ctx.fillStyle = night > .5 ? '#3a2630' : '#b57a4c'; ctx.fillRect(0, g.hy, w, h - g.hy);
    ctx.fillStyle = night > .5 ? '#2c2330' : '#7c5a44';
    ctx.beginPath(); ctx.moveTo(g.cx - g.half(proj(40)), g.hy); ctx.lineTo(g.cx + g.half(proj(40)), g.hy); ctx.lineTo(g.cx + g.half(1.18), h); ctx.lineTo(g.cx - g.half(1.18), h); ctx.fill();
    // lane dashes
    ctx.strokeStyle = 'rgba(255,240,200,.55)';
    const off = (S.dist * 4) % 4;
    for (let l = 0; l < 2; l++) for (let d = -off; d < 38; d += 4) {
      const a = toScreen(l + .5, d + 2.2), b = toScreen(l + .5, d + 3.4);
      ctx.lineWidth = Math.max(1, 5 * a.p); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }

    // depth-sorted world
    const list = [];
    S.props.forEach(p => list.push({ d: p.d, f: () => drawProp(p) }));
    S.ents.forEach(e => list.push({ d: e.d, f: () => drawEnt(e) }));
    list.sort((a, b) => b.d - a.d).forEach(o => o.f());

    drawCart();

    // honk rings
    for (const r of S.rings) { ctx.strokeStyle = `rgba(255,235,170,${Math.max(0, r.life)})`; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(g.cx + (S.laneX - 1) * g.half(1) * .62, g.py - 40, r.r, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); }
    for (const q of S.parts) { ctx.globalAlpha = Math.max(0, q.life); ctx.fillStyle = q.col; ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, 6.283); ctx.fill(); }
    ctx.globalAlpha = 1;
    // toran
    for (let x = 0, i = 0; x < w; x += 34, i++) { ctx.fillStyle = ['#f4a300', '#d6336c', '#0f8b8d'][i % 3]; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 34, 0); ctx.lineTo(x + 17, 18 + (i % 2) * 8); ctx.fill(); }
    // pops & banner
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const p of S.pops) { ctx.globalAlpha = Math.min(1, p.life); ctx.font = '700 17px Outfit, system-ui, sans-serif'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(40,10,0,.55)'; ctx.fillStyle = p.col; ctx.strokeText(p.text, p.x, p.y); ctx.fillText(p.text, p.x, p.y); }
    ctx.globalAlpha = 1;
    if (S.banner) {
      const k = Math.min(1, S.banner.life * 2.2), sc = 1 + (1 - k) * .3;
      ctx.save(); ctx.translate(w / 2, h * .3); ctx.scale(sc, sc); ctx.globalAlpha = k;
      ctx.font = `800 ${Math.max(22, Math.min(40, w / 16))}px Fraunces, Georgia, serif`; ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(40,10,0,.6)'; ctx.fillStyle = S.banner.col;
      ctx.strokeText(S.banner.text, 0, 0); ctx.fillText(S.banner.text, 0, 0); ctx.restore();
    }
    if (S.chai > 0) { ctx.fillStyle = `rgba(255,170,60,${.1 + .06 * Math.sin(S.time * 14)})`; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = 'rgba(255,200,90,.35)'; for (let i = 0; i < 10; i++) { const y = (i * 61 + S.time * 900) % h; ctx.beginPath(); ctx.moveTo(w * .02, y); ctx.lineTo(w * .1, y + 26); ctx.moveTo(w * .98, y); ctx.lineTo(w * .9, y + 26); ctx.stroke(); } }
    if (S.flash > 0) { ctx.fillStyle = `rgba(255,90,60,${S.flash * .45})`; ctx.fillRect(0, 0, w, h); }
    ctx.restore();
  }

  function drawProp(p) {
    const g = geo(), pr = proj(p.d), y = g.hy + (g.py - g.hy) * pr;
    const x = g.cx + p.side * (g.half(pr) + (p.kind === 'stall' ? S.w * .12 : S.w * .02) * pr);
    if (pr < .06) return;
    if (p.kind === 'lamp') {
      ctx.fillStyle = '#4a3a32'; ctx.fillRect(x - 2 * pr * 3, y - 130 * pr, 6 * pr, 130 * pr);
      ctx.fillStyle = '#ffd77a'; ctx.beginPath(); ctx.arc(x, y - 134 * pr, 9 * pr, 0, 6.283); ctx.fill();
      return;
    }
    const bw = 150 * pr, bh = 100 * pr;
    ctx.fillStyle = '#6b4a30'; ctx.fillRect(x - bw / 2, y - bh, bw, bh);
    ctx.fillStyle = p.col; ctx.fillRect(x - bw * .56, y - bh - 20 * pr, bw * 1.12, 22 * pr);
    ctx.fillStyle = 'rgba(255,255,255,.7)'; for (let i = 0; i < 6; i += 2) ctx.fillRect(x - bw * .56 + i * bw * .187, y - bh - 20 * pr, bw * .187, 22 * pr);
    ctx.fillStyle = '#fff'; drawFont(p.e, x, y - bh * .45, 46 * pr);
  }

  function drawEnt(e) {
    const s = toScreen(e.cur, e.d);
    if (s.p < .05) return;
    const size = (e.type === 'haz' ? 96 : 66) * s.p * (e.w || 1);
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(s.x, s.y, size * .5, size * .13, 0, 0, 6.283); ctx.fill();
    if (e.type === 'chai') { ctx.save(); ctx.shadowColor = '#ffb15d'; ctx.shadowBlur = 20; }
    ctx.globalAlpha = 1;
    const bob = e.type === 'item' ? Math.sin(S.time * 6 + e.d) * 4 * s.p : 0;
    if (e.ground) { ctx.globalAlpha = .85; drawFont(e.e, s.x, s.y - size * .15, size * 1.1); ctx.globalAlpha = 1; }
    else drawFont(e.e, s.x, s.y - size * .5 + bob, size);
    if (e.type === 'chai') ctx.restore();
    if (e.type === 'item' && S.need.some(n => n.it.id === e.it.id && n.got < n.n)) {
      ctx.strokeStyle = 'rgba(174,240,200,.9)'; ctx.lineWidth = 2.5 * s.p + 1; ctx.beginPath(); ctx.arc(s.x, s.y - size * .5 + bob, size * .62, 0, 6.283); ctx.stroke();
    }
  }

  function drawCart() {
    const g = geo(), x = g.cx + (S.laneX - 1) * g.half(1) * .62, y = g.py;
    const blink = S.inv > 0 && S.chai <= 0 && Math.floor(S.time * 12) % 2 === 0;
    if (blink) return;
    const bounce = Math.sin(S.time * 18) * 2;
    ctx.save(); ctx.translate(x, y + bounce);
    if (S.chai > 0) { ctx.shadowColor = '#ffb15d'; ctx.shadowBlur = 28; }
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(0, 20, 72, 14, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#8a5a34'; ctx.fillRect(-58, -26, 116, 24);               // bed
    ctx.fillStyle = '#6b4526'; ctx.fillRect(-58, -26, 116, 6);
    ctx.fillStyle = '#d6336c'; ctx.fillRect(-58, -8, 116, 6);                 // painted band
    ctx.strokeStyle = '#4a2f1a'; ctx.lineWidth = 5;                           // handles
    ctx.beginPath(); ctx.moveTo(-52, -20); ctx.lineTo(-70, 20); ctx.moveTo(52, -20); ctx.lineTo(70, 20); ctx.stroke();
    ctx.fillStyle = '#2a2018'; [-40, 40].forEach(wx => { ctx.beginPath(); ctx.arc(wx, 4, 17, 0, 6.283); ctx.fill(); ctx.fillStyle = '#c9a86a'; ctx.beginPath(); ctx.arc(wx, 4, 6, 0, 6.283); ctx.fill(); ctx.fillStyle = '#2a2018'; });
    ctx.shadowBlur = 0;
    S.stack.forEach((em, i) => drawFont(em, -42 + (i % 4) * 28, -42 - Math.floor(i / 4) * 24 + Math.sin(S.time * 10 + i) * 1.5, 30));
    ctx.restore();
  }

  function frame(now) {
    S.raf = requestAnimationFrame(frame);
    if (!S.last) S.last = now;
    const dt = Math.min(.05, (now - S.last) / 1000);
    S.last = now;
    if (S.paused) return;
    if (S.running) update(dt);
    else { S.time += dt * .3; S.flash = Math.max(0, S.flash - dt); S.shake = Math.max(0, S.shake - dt * 2); }
    draw();
  }

  /* ---------------- input ---------------- */
  const move = d => { if (S.running) { S.lane = Math.max(0, Math.min(2, S.lane + d)); if (A()) A().sfx('hover'); } };
  document.addEventListener('keydown', e => {
    if (!S.running || S.paused) return;
    const k = e.key.toLowerCase();
    if (k === 'arrowleft' || k === 'a') { move(-1); e.preventDefault(); }
    else if (k === 'arrowright' || k === 'd') { move(1); e.preventDefault(); }
    else if (k === ' ' || k === 'h' || k === 'arrowup') { honk(); e.preventDefault(); }
  });
  let sx = 0, sy = 0, st = 0;
  canvas.addEventListener('pointerdown', e => { sx = e.clientX; sy = e.clientY; st = performance.now(); });
  canvas.addEventListener('pointerup', e => {
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > 28 && Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 1 : -1);
    else if (dy < -40) honk();
    else if (Math.abs(dx) < 12) { const r = canvas.getBoundingClientRect(); move(e.clientX - r.left < r.width / 2 ? -1 : 1); }
  });
  $('thelaPlay').addEventListener('click', start);
  $('thelaAgain').addEventListener('click', start);
  $('thelaHorn').addEventListener('click', honk);
  $('thelaLeft').addEventListener('click', () => move(-1));
  $('thelaRight').addEventListener('click', () => move(1));
  document.addEventListener('visibilitychange', () => { S.paused = document.hidden; S.last = 0; });
  if ('IntersectionObserver' in window) new IntersectionObserver(es => { S.paused = !es[0].isIntersecting; S.last = 0; }, { threshold: .1 }).observe(stage);
  window.addEventListener('resize', () => { clearTimeout(window._tlR); window._tlR = setTimeout(resize, 120); });

  // tab switcher between the two games
  document.querySelectorAll('[data-game-tab]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.gameTab;
    document.querySelectorAll('[data-game-tab]').forEach(x => { x.classList.toggle('is-on', x === b); x.setAttribute('aria-selected', String(x === b)); });
    document.querySelectorAll('.game-panel').forEach(p => { p.hidden = p.dataset.panel !== k; });
    setTimeout(() => window.dispatchEvent(new Event('resize')), 30);
  }));

  window.KharidaarThela = { state: S, update, honk, start, draw };
  resize(); renderHud();
  S.raf = requestAnimationFrame(frame);
})();
