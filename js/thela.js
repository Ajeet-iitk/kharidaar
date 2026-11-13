/* ============================================================
   Kharidaar — "Thela Rush"
   Push a handcart down a crowded bazaar lane. Memsahib's shopping
   list is ticking: grab the right items, dodge cows & rickshaws,
   honk the sleepy ones aside, and chug chai for a speed boost.
   Pseudo-3D road, sprite-cached emoji, fixed-cost HUD updates.
   ============================================================ */
(function () {
  const D = window.KHARIDAAR_DATA;
  const stage = document.getElementById('thelaStage');
  const canvas = document.getElementById('thelaCanvas');
  if (!D || !stage || !canvas) return;
  const ctx = canvas.getContext('2d', { alpha: false });
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
    en: { go: 'GO GO GO!', done: 'List done! +50', late: 'Memsahib is angry!', chai: 'CHAI POWER! 🔥', wrong: 'Not on the list', over: 'Thela toppled!', dist: 'm', best: 'Best',
      hit: { cow: 'Moo! Sacred cow!', rickshaw: 'Rickshaw!', auto: 'Auto bhaiya!', puddle: 'Splash!' }, combo: 'x{n} streak!' },
    hi: { go: 'चलो चलो!', done: 'सूची पूरी! +50', late: 'मेमसाहब नाराज़!', chai: 'चाय का जोश! 🔥', wrong: 'सूची में नहीं', over: 'ठेला पलट गया!', dist: 'मी', best: 'सर्वश्रेष्ठ',
      hit: { cow: 'गाय माता!', rickshaw: 'रिक्शा!', auto: 'ऑटो भैया!', puddle: 'छपाक!' }, combo: 'x{n} लगातार!' },
  };
  const tr = () => T[hi() ? 'hi' : 'en'];

  const S = {
    w: 800, h: 520, dpr: 1, running: false, paused: false, raf: 0, last: 0,
    time: 0, dist: 0, speed: 26, score: 0, lives: 3, best: 0, lane: 1, laneX: 1, laneV: 0, inv: 0, chai: 0, horn: 0, hornCd: 0,
    ents: [], props: [], pops: [], rings: [], parts: [], stack: [], need: [], listT: 0, listMax: 1, listN: 0,
    nextRow: 6, shake: 0, flash: 0, banner: null, collected: 0, streak: 0, scroll: 0, wheel: 0, hudKey: '',
  };
  try { S.best = Number(localStorage.getItem('kharidaar.thela.best')) || 0; } catch (e) {}
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const K = .26, FAR = 40, FLOW = .6;             // perspective, spawn distance, world-units per speed-unit
  const proj = d => 1 / (1 + Math.max(-2, d) * K);

  /* ---------------- sprite cache (emoji drawn once per size bucket) ---------------- */
  const sprites = new Map();
  function sprite(txt, size) {
    const px = Math.max(12, Math.round(size / 8) * 8);
    const key = txt + '|' + px;
    let s = sprites.get(key);
    if (!s) {
      const c = document.createElement('canvas');
      const r = Math.ceil(px * 1.3 * S.dpr);
      c.width = c.height = r;
      const x = c.getContext('2d');
      x.font = `${Math.round(px * S.dpr)}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(txt, r / 2, r / 2 + px * S.dpr * .04);
      s = { c, r: r / S.dpr };
      sprites.set(key, s);
      if (sprites.size > 400) sprites.delete(sprites.keys().next().value);
    }
    return s;
  }
  function emojiAt(txt, x, y, size, alpha) {
    const s = sprite(txt, size), k = size / (Math.max(12, Math.round(size / 8) * 8)) ;
    const w = s.r * k;
    if (alpha != null) ctx.globalAlpha = alpha;
    ctx.drawImage(s.c, x - w / 2, y - w / 2, w, w);
    if (alpha != null) ctx.globalAlpha = 1;
  }

  function resize() {
    const r = stage.getBoundingClientRect();
    S.w = Math.max(280, r.width); S.h = Math.max(320, r.height);
    S.dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(S.w * S.dpr); canvas.height = Math.round(S.h * S.dpr);
    ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    sprites.clear();
    if (!S.running) draw();
  }
  const G = () => ({ hy: S.h * .34, py: S.h * .86, cx: S.w / 2, half: p => S.w * .035 + S.w * .43 * p });
  const laneX = (lane, p, g) => g.cx + (lane - 1) * g.half(p) * .6;
  const sy = (p, g) => g.hy + (g.py - g.hy) * p;

  /* ---------------- HUD (touch the DOM only when something changed) ---------------- */
  function renderList() {
    $('thelaList').innerHTML = S.need.map(n => `<span class="tl-chip ${n.got >= n.n ? 'is-done' : ''}"><b>${emoji(n.it)}</b>${n.got}/${n.n}<small>${nameOf(n.it)}</small></span>`).join('');
  }
  function hud(force) {
    const key = [Math.floor(S.score), Math.floor(S.dist), S.lives, Math.max(S.best, Math.floor(S.score))].join('|');
    if (!force && key === S.hudKey) return;
    S.hudKey = key;
    $('thelaScore').textContent = Math.floor(S.score);
    $('thelaBest').textContent = Math.max(S.best, Math.floor(S.score));
    $('thelaDist').textContent = Math.floor(S.dist) + tr().dist;
    $('thelaLives').innerHTML = Array.from({ length: 3 }, (_, i) => `<i class="${i < S.lives ? 'on' : ''}">🫓</i>`).join('');
  }
  let lastTimerVal = -1, lastCool = -1;
  function bars() {
    const tv = Math.round(Math.max(0, S.listT / S.listMax) * 100);
    if (tv !== lastTimerVal) { lastTimerVal = tv; $('thelaTimer').style.setProperty('--t', tv / 100); }
    const cv = Math.round((1 - S.hornCd / 3) * 20);
    if (cv !== lastCool) { lastCool = cv; const hn = $('thelaHorn'); hn.classList.toggle('is-cool', S.hornCd > 0); hn.style.setProperty('--c', cv / 20); }
  }

  /* ---------------- list ---------------- */
  function newList() {
    const pool = FOODS.slice().sort(() => Math.random() - .5);
    const kinds = Math.min(3, 2 + Math.floor(S.listN / 3));
    S.need = pool.slice(0, kinds).map(it => ({ it, n: 1 + Math.floor(Math.random() * 2), got: 0 }));
    S.listMax = S.listT = Math.max(18, 32 - S.listN * 1.5);
    S.listN++;
    renderList();
  }

  /* ---------------- spawning ---------------- */
  const HAZ = [
    { k: 'cow', e: '🐄', v: 0, s: 1.5, wander: true },
    { k: 'rickshaw', e: '🛺', v: 10, s: 1.25 },
    { k: 'auto', e: '🛵', v: 16, s: 1.1 },
    { k: 'puddle', e: '💦', v: 0, s: 1.1, ground: true },
  ];
  function spawnRow() {
    const lanes = [0, 1, 2].sort(() => Math.random() - .5);
    const hazards = Math.random() < .3 + Math.min(.32, S.time / 180) ? 2 : 1;
    for (let i = 0; i < hazards; i++) {
      const h = HAZ[Math.floor(Math.random() * HAZ.length)];
      S.ents.push({ type: 'haz', ...h, lane: lanes[i], d: FAR, cur: lanes[i], flee: 0 });
    }
    const free = lanes[hazards];
    if (Math.random() < .1) S.ents.push({ type: 'chai', e: '☕', lane: free, d: FAR, cur: free });
    else {
      const wanted = S.need.filter(n => n.got < n.n);
      const useList = wanted.length && Math.random() < .6;
      const it = useList ? wanted[Math.floor(Math.random() * wanted.length)].it : FOODS[Math.floor(Math.random() * FOODS.length)];
      for (let j = 0; j < 3; j++) S.ents.push({ type: 'item', it, e: emoji(it), lane: free, d: FAR + j * 2.2, cur: free });
    }
  }
  const CATS = Object.keys(D.categories);
  function spawnProp(d) {
    const side = Math.random() < .5 ? -1 : 1;
    const cat = CATS[Math.floor(Math.random() * CATS.length)];
    const c = D.categories[cat] || {};
    S.props.push({ side, d, kind: Math.random() < .72 ? 'stall' : (Math.random() < .5 ? 'lamp' : 'tree'), col: c.color || '#d84a22', e: c.emoji || '🛒', seed: Math.random() });
  }

  /* ---------------- flow ---------------- */
  function start() {
    Object.assign(S, { running: true, time: 0, dist: 0, speed: 26, score: 0, lives: 3, lane: 1, laneX: 1, laneV: 0, inv: 0, chai: 0, horn: 0, hornCd: 0,
      ents: [], props: [], pops: [], rings: [], parts: [], stack: [], nextRow: 5, shake: 0, flash: 0, banner: null, listN: 0, collected: 0, streak: 0, hudKey: '' });
    for (let d = 1; d < FAR + 6; d += 4.2) spawnProp(d);
    newList(); hud(true);
    $('thelaStart').hidden = true; $('thelaOver').hidden = true;
    stage.classList.add('is-playing');
    say(tr().go, '#ffd77a');
    if (A()) A().sfx('whoosh');
    if (!S.raf) S.raf = requestAnimationFrame(frame);
  }
  function endGame() {
    S.running = false; stage.classList.remove('is-playing');
    const isBest = Math.floor(S.score) > S.best;
    if (isBest) { S.best = Math.floor(S.score); try { localStorage.setItem('kharidaar.thela.best', String(S.best)); } catch (e) {} }
    hud(true);
    $('thelaOverTitle').textContent = tr().over;
    $('thelaOverStats').innerHTML = `<b>${Math.floor(S.score)}</b> pts · ${Math.floor(S.dist)}${tr().dist} · ${S.collected} 🧺<br>${tr().best}: <b>${S.best}</b>${isBest ? '<br><span class="game-best">🏆 New best!</span>' : ''}`;
    setTimeout(() => { $('thelaOver').hidden = false; if (A()) A().sfx(isBest ? 'success' : 'close'); }, 450);
  }
  function say(text, col) { S.banner = { text, col: col || '#fff', life: 1.5 }; }
  function pop(text, x, y, col) { S.pops.push({ text, x, y, col: col || '#fff', life: 1 }); }

  function hurt(e) {
    if (S.inv > 0) return;
    S.lives--; S.inv = 1.5; S.shake = 1; S.flash = .55; S.streak = 0;
    S.speed = Math.max(24, S.speed * .82);
    for (let i = 0; i < 4 && S.stack.length; i++) S.stack.pop();
    say(tr().hit[e.k] || 'Oops!', '#ff9a7a');
    if (A()) { A().sfx(e.k === 'cow' ? 'moo' : e.k === 'puddle' ? 'whoosh' : 'rickshaw'); A().sfx('error'); }
    hud(true);
    if (S.lives <= 0) endGame();
  }

  function honk() {
    if (!S.running || S.hornCd > 0) return;
    S.horn = .5; S.hornCd = 3;
    S.rings.push({ r: 20, life: 1 });
    if (A()) A().sfx('rickshaw');
    for (const e of S.ents) {
      if (e.type === 'haz' && e.wander && e.d > 0 && e.d < 18) e.flee = e.lane === 0 ? 1 : e.lane === 2 ? -1 : (Math.random() < .5 ? 1 : -1);
    }
  }

  function update(dt) {
    S.time += dt;
    S.speed = Math.min(52, S.speed + dt * .5);
    const boost = S.chai > 0 ? 1.4 : 1;
    const sp = S.speed * boost;
    const adv = sp * dt * FLOW;                    // world units advanced this frame
    S.dist += adv * .5; S.score += adv * .22; S.scroll += adv; S.wheel += adv * 1.6;
    S.inv = Math.max(0, S.inv - dt); S.chai = Math.max(0, S.chai - dt);
    S.horn = Math.max(0, S.horn - dt); S.hornCd = Math.max(0, S.hornCd - dt);
    // critically-damped spring toward the target lane: snappy but never stuttery
    const k = 220, c = 2 * Math.sqrt(k);
    S.laneV += ((S.lane - S.laneX) * k - S.laneV * c) * dt;
    S.laneX += S.laneV * dt;
    S.shake = Math.max(0, S.shake - dt * 2.4); S.flash = Math.max(0, S.flash - dt * 2);
    if (S.banner) { S.banner.life -= dt; if (S.banner.life <= 0) S.banner = null; }

    S.listT -= dt;
    if (S.listT <= 0) {
      say(tr().late, '#ff9a7a'); S.lives--; S.flash = .5; S.streak = 0;
      if (A()) A().sfx('error');
      hud(true);
      if (S.lives <= 0) { endGame(); return; }
      newList();
    }
    bars();

    S.nextRow -= adv;
    if (S.nextRow <= 0) { spawnRow(); S.nextRow = Math.max(7, 13 - S.time / 25); }

    for (const e of S.ents) {
      e.d -= adv - (e.v || 0) * dt * FLOW * .5;
      if (e.type === 'haz' && e.wander) {
        if (e.flee) { e.lane = clamp(e.lane + e.flee, 0, 2); e.flee = 0; }
        else if (e.d > 8 && Math.random() < dt * .1) e.lane = clamp(e.lane + (Math.random() < .5 ? -1 : 1), 0, 2);
      }
      e.cur += (e.lane - e.cur) * Math.min(1, dt * 6);
      if (!e.dead && e.d < 1.1 && e.d > -1.4 && Math.abs(e.cur - S.laneX) < .6) {
        if (e.type === 'haz') {
          e.dead = true;
          if (S.chai > 0) { burst(e, '#ffb15d', 14); S.score += 8; pop('+8 💥', S.w / 2, S.h * .62, '#ffd77a'); S.shake = .4; }
          else hurt(e);
        } else if (e.type === 'chai') {
          e.dead = true; S.chai = 6; S.inv = Math.max(S.inv, 6); say(tr().chai, '#ffd77a');
          if (A()) A().sfx('success');
        } else if (e.type === 'item') { e.dead = true; collect(e); }
      }
    }
    S.ents = S.ents.filter(e => !e.dead && e.d > -3);
    for (const p of S.props) p.d -= adv;
    S.props = S.props.filter(p => p.d > -5);
    while (S.props.length < 12) spawnProp(Math.max(FAR, ...S.props.map(p => p.d)) + rnd(3.2, 5));
    for (const p of S.pops) { p.y -= 46 * dt; p.life -= dt * 1.3; }
    S.pops = S.pops.filter(p => p.life > 0);
    for (const r of S.rings) { r.r += dt * 520; r.life -= dt * 2.2; }
    S.rings = S.rings.filter(r => r.life > 0);
    for (const q of S.parts) { q.vy += 700 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.life -= dt * 1.6; }
    S.parts = S.parts.filter(q => q.life > 0);
    // dust behind the wheels
    if (S.running && Math.random() < dt * 40) {
      const g = G(), x = laneX(S.laneX, 1, g);
      S.parts.push({ x: x + rnd(-34, 34), y: g.py + 22, vx: rnd(-40, 40), vy: rnd(-90, -30), life: .5, col: 'rgba(230,200,160,.55)', r: rnd(2, 5) });
    }
    hud();
  }

  function burst(e, col, n) {
    const g = G(), p = proj(e.d), x = laneX(e.cur + 1, p, g) - g.half(p) * .6, y = sy(p, g);
    for (let i = 0; i < n; i++) { const a = rnd(0, 6.28), v = rnd(100, 340); S.parts.push({ x, y: y - 40 * p, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, life: 1, col, r: rnd(2, 6) }); }
  }
  function collect(e) {
    const need = S.need.find(n => n.it.id === e.it.id && n.got < n.n);
    const g = G();
    S.collected++;
    if (S.stack.length < 8) S.stack.push(e.e);
    burst(e, '#aef0c8', 7);
    if (need) {
      need.got++; S.streak++;
      const bonus = S.streak > 2 ? S.streak : 0;
      S.score += 12 + bonus;
      pop(`+${12 + bonus} ${e.e}`, g.cx + (S.laneX - 1) * g.half(1) * .6, g.py - 110, '#aef0c8');
      if (S.streak > 2) pop(tr().combo.replace('{n}', S.streak), g.cx, g.py - 150, '#ffd77a');
      if (A()) A().sfx('add');
      renderList();
      if (S.need.every(n => n.got >= n.n)) {
        S.score += 50; S.speed += 2; S.listT = 0; say(tr().done, '#ffd77a'); S.flash = .0;
        if (A()) { A().sfx('success'); A().sfx('coin'); }
        S.stack.length = 0; newList();
      }
    } else { S.streak = 0; S.score += 2; pop(tr().wrong, g.cx + (S.laneX - 1) * g.half(1) * .6, g.py - 110, '#ffd9b0'); if (A()) A().sfx('click'); }
  }

  /* ---------------- drawing ---------------- */
  const SKY = [[[255, 205, 140], [244, 130, 90]], [[120, 190, 240], [255, 232, 180]], [[255, 150, 100], [160, 70, 120]], [[22, 18, 54], [76, 42, 74]]];
  const lerpC = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const css = (c, a) => a == null ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  function skyAt(t) { const i = Math.floor(t) % 4, f = t - Math.floor(t), j = (i + 1) % 4; return [lerpC(SKY[i][0], SKY[j][0], f), lerpC(SKY[i][1], SKY[j][1], f)]; }
  const skyline = (() => { const a = []; for (let i = 0; i < 26; i++) a.push({ w: .05 + ((i * 37) % 7) / 100, h: .06 + ((i * 53) % 11) / 110 }); return a; })();

  function quad(x1a, x1b, y1, x2a, x2b, y2, col) {
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x1a, y1); ctx.lineTo(x1b, y1); ctx.lineTo(x2b, y2); ctx.lineTo(x2a, y2); ctx.closePath(); ctx.fill();
  }

  function draw() {
    const { w, h } = S, g = G();
    ctx.save();
    if (S.shake > 0) ctx.translate(rnd(-1, 1) * S.shake * 10, rnd(-1, 1) * S.shake * 8);
    const phase = (S.time / 26) % 4;
    const [top, bot] = skyAt(phase);
    const night = clamp(phase < 2 ? 0 : phase < 2.6 ? (phase - 2) / .6 : phase < 3.6 ? 1 : (4 - phase) / .4, 0, 1);

    // sky
    const sk = ctx.createLinearGradient(0, 0, 0, g.hy + 20);
    sk.addColorStop(0, css(top)); sk.addColorStop(1, css(bot));
    ctx.fillStyle = sk; ctx.fillRect(-20, -20, w + 40, g.hy + 60);
    if (night > .03) { ctx.fillStyle = `rgba(255,246,226,${night * .85})`; for (let i = 0; i < 50; i++) ctx.fillRect((i * 97.3 + 13) % w, (i * 53.1 + 7) % (g.hy - 30), i % 7 === 0 ? 2.2 : 1.3, i % 7 === 0 ? 2.2 : 1.3); }
    // sun / moon with glow
    const ang = (phase / 4) * Math.PI * 2 - 1.2;
    const bx = w * .5 + Math.cos(ang) * w * .36, by = g.hy - 8 - Math.sin(ang) * g.hy * .7;
    const gl = ctx.createRadialGradient(bx, by, 4, bx, by, 90);
    gl.addColorStop(0, night > .5 ? 'rgba(220,225,255,.5)' : 'rgba(255,230,160,.65)'); gl.addColorStop(1, 'rgba(255,230,160,0)');
    ctx.fillStyle = gl; ctx.fillRect(bx - 100, by - 100, 200, 200);
    ctx.fillStyle = night > .5 ? '#f1eedd' : '#fff3c4'; ctx.beginPath(); ctx.arc(bx, by, 24, 0, 6.283); ctx.fill();
    // clouds drift
    ctx.fillStyle = `rgba(255,255,255,${.35 - night * .25})`;
    for (let i = 0; i < 4; i++) { const cx = ((i * 330 + S.time * 6) % (w + 240)) - 120, cy = 50 + i * 26; ctx.beginPath(); ctx.ellipse(cx, cy, 70, 14, 0, 0, 6.283); ctx.ellipse(cx + 38, cy - 6, 44, 12, 0, 0, 6.283); ctx.fill(); }
    // two parallax skylines with lit windows
    for (let layer = 0; layer < 2; layer++) {
      const sc = layer ? 1 : .7, off = (S.scroll * (layer ? 1.4 : .6)) % (w * 1.3);
      ctx.fillStyle = layer ? css(lerpC([62, 36, 58], [20, 14, 36], night)) : css(lerpC([150, 100, 110], [40, 28, 56], night), 1);
      let x = -off;
      for (let i = 0; x < w + 80; i++) {
        const b = skyline[(i + layer * 7) % skyline.length], bw = w * b.w * (layer ? 1.1 : .9), bh = h * b.h * (layer ? 1.3 : 1) * sc + 10;
        ctx.fillRect(x, g.hy - bh, bw, bh + 3);
        if (night > .2) { ctx.fillStyle = `rgba(255,214,120,${night * .85})`; for (let wy = g.hy - bh + 8; wy < g.hy - 6; wy += 13) for (let wx = x + 6; wx < x + bw - 6; wx += 12) if (((wx + wy) | 0) % 3 === 0) ctx.fillRect(wx, wy, 4, 5); ctx.fillStyle = layer ? css(lerpC([62, 36, 58], [20, 14, 36], night)) : css(lerpC([150, 100, 110], [40, 28, 56], night)); }
        x += bw + 2;
      }
    }

    // ground + road drawn as scrolling perspective strips
    const dayGround = [[190, 128, 84], [176, 118, 78]], nightGround = [[58, 38, 52], [50, 33, 46]];
    const roadA = lerpC([122, 90, 72], [44, 36, 54], night), roadB = lerpC([132, 98, 78], [50, 41, 60], night);
    const STEP = 1.6, base = S.scroll % (STEP * 2);
    for (let d = FAR + STEP * 2; d > -3; d -= STEP) {
      const dd = d - base, d2 = dd - STEP;
      const idx = Math.floor((d + S.scroll - base) / STEP) & 1;
      const p1 = proj(dd), p2 = proj(d2);
      const y1 = sy(p1, g), y2 = sy(Math.max(p2, p1), g);
      const gc = lerpC(dayGround[idx], nightGround[idx], night);
      ctx.fillStyle = css(gc); ctx.fillRect(0, y1, w, Math.max(1, y2 - y1 + 1));
      quad(g.cx - g.half(p1), g.cx + g.half(p1), y1, g.cx - g.half(p2), g.cx + g.half(p2), y2 + 1, css(idx ? roadA : roadB));
      // curb stripes (red/white)
      const cw1 = g.half(p1) * .07, cw2 = g.half(p2) * .07;
      const cc = idx ? '#d6336c' : '#fff0d6';
      quad(g.cx - g.half(p1) - cw1, g.cx - g.half(p1), y1, g.cx - g.half(p2) - cw2, g.cx - g.half(p2), y2 + 1, cc);
      quad(g.cx + g.half(p1), g.cx + g.half(p1) + cw1, y1, g.cx + g.half(p2), g.cx + g.half(p2) + cw2, y2 + 1, cc);
    }
    // lane dashes
    ctx.strokeStyle = 'rgba(255,244,210,.6)'; ctx.lineCap = 'butt';
    for (let l = .5; l < 2.5; l += 1) for (let d = -base * 1.0; d < FAR; d += STEP * 2) {
      const a = d + STEP * .25, b = d + STEP * 1.1;
      const pa = proj(a), pb = proj(b);
      ctx.lineWidth = Math.max(1, 7 * pa);
      ctx.beginPath(); ctx.moveTo(laneX(l, pa, g), sy(pa, g)); ctx.lineTo(laneX(l, pb, g), sy(pb, g)); ctx.stroke();
    }
    // haze at the horizon
    const hz = ctx.createLinearGradient(0, g.hy - 12, 0, g.hy + 70);
    hz.addColorStop(0, css(bot, 0)); hz.addColorStop(.35, css(bot, .55)); hz.addColorStop(1, css(bot, 0));
    ctx.fillStyle = hz; ctx.fillRect(0, g.hy - 12, w, 82);

    // depth-sorted scene
    const list = [];
    for (const p of S.props) if (p.d < FAR + 4) list.push({ d: p.d, f: () => drawProp(p, g, night) });
    for (const e of S.ents) list.push({ d: e.d, f: () => drawEnt(e, g) });
    list.sort((a, b) => b.d - a.d);
    for (const o of list) o.f();

    drawCart(g, night);

    for (const r of S.rings) { ctx.strokeStyle = `rgba(255,235,170,${Math.max(0, r.life)})`; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(laneX(S.laneX, 1, g), g.py - 60, r.r, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
    for (const q of S.parts) { ctx.globalAlpha = clamp(q.life, 0, 1); ctx.fillStyle = q.col; ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, 6.283); ctx.fill(); }
    ctx.globalAlpha = 1;

    // speed lines
    const spd = clamp((S.speed * (S.chai > 0 ? 1.4 : 1) - 28) / 26, 0, 1);
    if (S.running && spd > 0) {
      ctx.strokeStyle = `rgba(255,255,255,${.18 * spd + (S.chai > 0 ? .1 : 0)})`; ctx.lineWidth = 2;
      for (let i = 0; i < 14; i++) { const t = (i * .137 + S.scroll * .08) % 1, side = i % 2 ? 1 : -1, x = g.cx + side * (w * (.18 + t * .36)), y = g.hy + t * t * (h - g.hy); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + side * 14 * t, y + 40 * t); ctx.stroke(); }
    }
    // vignette
    const vg = ctx.createRadialGradient(w / 2, h * .55, h * .35, w / 2, h * .55, h * .95);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(20,6,12,${.35 + night * .2})`);
    ctx.fillStyle = vg; ctx.fillRect(-20, -20, w + 40, h + 40);

    // toran
    for (let x = 0, i = 0; x < w; x += 32, i++) { ctx.fillStyle = ['#f4a300', '#d6336c', '#0f8b8d'][i % 3]; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 32, 0); ctx.lineTo(x + 16, 17 + (i % 2) * 8 + Math.sin(S.time * 3 + i) * 1.5); ctx.fill(); }

    // pops, banner
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    for (const p of S.pops) { ctx.globalAlpha = clamp(p.life * 1.3, 0, 1); ctx.font = '800 18px Outfit, system-ui, sans-serif'; ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(40,10,0,.6)'; ctx.fillStyle = p.col; ctx.strokeText(p.text, p.x, p.y); ctx.fillText(p.text, p.x, p.y); }
    ctx.globalAlpha = 1;
    if (S.banner) {
      const age = 1.5 - S.banner.life, kk = clamp(age * 6, 0, 1), sc = 1 + (1 - kk) * .5 + Math.sin(age * 9) * .02 * (1 - kk);
      ctx.save(); ctx.translate(w / 2, h * .27); ctx.scale(sc, sc); ctx.globalAlpha = clamp(S.banner.life * 2.5, 0, 1);
      ctx.font = `800 ${Math.max(24, Math.min(44, w / 15))}px Fraunces, Georgia, serif`; ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(40,10,0,.65)'; ctx.fillStyle = S.banner.col;
      ctx.strokeText(S.banner.text, 0, 0); ctx.fillText(S.banner.text, 0, 0); ctx.restore();
    }
    if (S.chai > 0) { const k2 = S.chai < 1 ? S.chai : 1; ctx.fillStyle = `rgba(255,170,60,${(.08 + .05 * Math.sin(S.time * 16)) * k2})`; ctx.fillRect(0, 0, w, h); }
    if (S.flash > 0) { ctx.fillStyle = `rgba(255,70,50,${S.flash * .4})`; ctx.fillRect(0, 0, w, h); }
    ctx.restore();
  }

  function drawProp(p, g, night) {
    const pr = proj(p.d);
    if (pr < .04 || pr > 1.6) return;
    const y = sy(pr, g), off = p.kind === 'stall' ? .5 : .12;
    const x = g.cx + p.side * (g.half(pr) * (1.12) + w2(off) * pr);
    if (p.kind === 'lamp') {
      ctx.strokeStyle = '#3b2c26'; ctx.lineWidth = Math.max(1, 5 * pr);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 150 * pr); ctx.lineTo(x - p.side * 28 * pr, y - 156 * pr); ctx.stroke();
      const lx = x - p.side * 30 * pr, ly = y - 150 * pr;
      const gl = ctx.createRadialGradient(lx, ly, 1, lx, ly, 46 * pr + 2);
      gl.addColorStop(0, `rgba(255,220,130,${.55 + night * .4})`); gl.addColorStop(1, 'rgba(255,220,130,0)');
      ctx.fillStyle = gl; ctx.fillRect(lx - 50 * pr, ly - 50 * pr, 100 * pr, 100 * pr);
      ctx.fillStyle = '#ffd77a'; ctx.beginPath(); ctx.arc(lx, ly, 6 * pr, 0, 6.283); ctx.fill();
      return;
    }
    if (p.kind === 'tree') { ctx.fillStyle = '#5a3b26'; ctx.fillRect(x - 5 * pr, y - 80 * pr, 10 * pr, 80 * pr); ctx.fillStyle = '#2f7a4a'; ctx.beginPath(); ctx.arc(x, y - 110 * pr, 42 * pr, 0, 6.283); ctx.arc(x - 22 * pr, y - 90 * pr, 30 * pr, 0, 6.283); ctx.arc(x + 22 * pr, y - 92 * pr, 30 * pr, 0, 6.283); ctx.fill(); return; }
    // market stall: counter, back wall, striped awning, hanging goods & lantern
    const bw = 200 * pr, bh = 128 * pr, sx = x + p.side * bw * .35;
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(sx, y, bw * .62, 9 * pr, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#5a3d28'; ctx.fillRect(sx - bw / 2, y - bh, bw, bh);
    ctx.fillStyle = '#7b5334'; ctx.fillRect(sx - bw / 2, y - bh * .38, bw, bh * .38);            // counter
    ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(sx - bw / 2, y - bh * .38, bw, 4 * pr);
    const aw = bw * 1.16, ay = y - bh - 26 * pr;
    for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? '#fff0d6' : p.col; ctx.beginPath(); ctx.moveTo(sx - aw / 2 + i * aw / 8, ay); ctx.lineTo(sx - aw / 2 + (i + 1) * aw / 8, ay); ctx.lineTo(sx - aw / 2 + (i + 1) * aw / 8 + 2 * pr, ay + 34 * pr); ctx.lineTo(sx - aw / 2 + i * aw / 8 + 2 * pr, ay + 34 * pr); ctx.fill(); }
    emojiAt(p.e, sx, y - bh * .62, 52 * pr);
    emojiAt(['🧅', '🍅', '🥭', '🍎', '🥕', '🍋'][Math.floor(p.seed * 6)], sx - bw * .3, y - bh * .3, 30 * pr);
    emojiAt(['🥕', '🍌', '🍇', '🥔', '🌽', '🍊'][Math.floor(p.seed * 6)], sx + bw * .3, y - bh * .3, 30 * pr);
    ctx.fillStyle = `rgba(255,214,120,${.5 + night * .5})`; ctx.beginPath(); ctx.arc(sx, ay + 40 * pr, 5 * pr, 0, 6.283); ctx.fill();
  }
  const w2 = f => S.w * f * .24;

  function drawEnt(e, g) {
    const p = proj(e.d);
    if (p < .05 || p > 1.7) return;
    const x = laneX(e.cur, p, g), y = sy(p, g), size = (e.type === 'haz' ? 100 : 70) * p * (e.s || 1);
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(x, y, size * .46, size * .1, 0, 0, 6.283); ctx.fill();
    if (e.type === 'haz') {
      if (e.d > 3 && e.d < 16) { const a = .5 + .5 * Math.sin(S.time * 16); ctx.fillStyle = `rgba(255,70,50,${.7 * a})`; ctx.beginPath(); ctx.moveTo(x, y - size * 1.25 - 16 * p); ctx.lineTo(x - 11 * p - 4, y - size * 1.25 + 4); ctx.lineTo(x + 11 * p + 4, y - size * 1.25 + 4); ctx.fill(); }
      const wob = e.k === 'cow' ? Math.sin(S.time * 3 + e.lane) * .02 : Math.sin(S.time * 12) * .012;
      ctx.save(); ctx.translate(x, y - (e.ground ? size * .18 : size * .5)); ctx.rotate(wob);
      emojiAt(e.e, 0, 0, size, e.ground ? .85 : 1);
      ctx.restore();
    } else if (e.type === 'chai') {
      ctx.save(); ctx.shadowColor = '#ffb15d'; ctx.shadowBlur = 24;
      emojiAt(e.e, x, y - size * .55 + Math.sin(S.time * 7) * 5 * p, size * 1.1);
      ctx.restore();
    } else {
      const wanted = S.need.some(n => n.it.id === e.it.id && n.got < n.n);
      const cy = y - size * .55 + Math.sin(S.time * 7 + e.d) * 5 * p;
      if (wanted) { ctx.fillStyle = `rgba(174,240,200,${.25 + .15 * Math.sin(S.time * 8)})`; ctx.beginPath(); ctx.arc(x, cy, size * .7, 0, 6.283); ctx.fill(); ctx.strokeStyle = 'rgba(174,240,200,.95)'; ctx.lineWidth = 2.5 * p + 1; ctx.stroke(); }
      emojiAt(e.e, x, cy, size);
    }
  }

  function drawCart(g, night) {
    const x = laneX(S.laneX, 1, g), y = g.py;
    if (S.inv > 0 && S.chai <= 0 && Math.floor(S.time * 14) % 2 === 0) return;
    const bounce = Math.sin(S.wheel * 1.4) * 2.2 + (S.chai > 0 ? Math.sin(S.time * 40) * 1.2 : 0);
    const tilt = clamp((S.lane - S.laneX) * .16 - S.laneV * .004, -.3, .3);
    ctx.save(); ctx.translate(x, y + bounce); ctx.rotate(tilt);
    if (S.chai > 0) { ctx.shadowColor = '#ffb15d'; ctx.shadowBlur = 30; }
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,.32)'; ctx.beginPath(); ctx.ellipse(0, 30 - bounce, 84, 13, 0, 0, 6.283); ctx.fill();
    // pusher (seen from behind)
    const stride = Math.sin(S.wheel * 1.4);
    ctx.fillStyle = '#2a2430'; ctx.fillRect(-14 + stride * 5, 12, 11, 26); ctx.fillRect(3 - stride * 5, 12, 11, 26);
    ctx.fillStyle = '#e0a82e'; ctx.fillRect(-20, -26, 40, 42);
    ctx.fillStyle = '#9a6a44'; ctx.beginPath(); ctx.arc(0, -36, 13, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#d6336c'; ctx.beginPath(); ctx.ellipse(0, -44, 15, 9, 0, Math.PI, 0); ctx.fill();         // turban
    ctx.fillStyle = '#c42a5f'; ctx.fillRect(-15, -45, 30, 4);
    ctx.shadowBlur = 0;
    // cart: bed + planks + side rails
    ctx.fillStyle = '#7a4f2e'; ctx.fillRect(-72, -16, 144, 26);
    ctx.fillStyle = '#9b6a3f'; ctx.fillRect(-72, -16, 144, 7);
    ctx.fillStyle = '#d6336c'; ctx.fillRect(-72, 2, 144, 5);
    ctx.fillStyle = '#f4a300'; for (let i = -66; i < 66; i += 18) ctx.fillRect(i, 2, 8, 5);
    ctx.strokeStyle = '#3f2814'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-62, -2); ctx.lineTo(-30, -14); ctx.moveTo(62, -2); ctx.lineTo(30, -14); ctx.stroke();       // handles to the pusher
    // load
    S.stack.forEach((em, i) => emojiAt(em, -52 + (i % 4) * 35, -34 - Math.floor(i / 4) * 26 + Math.sin(S.wheel * 1.4 + i) * 1.6, 36));
    // wheels with spokes
    [-48, 48].forEach(wx => {
      ctx.save(); ctx.translate(wx, 14); ctx.rotate(S.wheel);
      ctx.fillStyle = '#26201a'; ctx.beginPath(); ctx.arc(0, 0, 21, 0, 6.283); ctx.fill();
      ctx.strokeStyle = '#c9a86a'; ctx.lineWidth = 2.4; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-17, 0); ctx.lineTo(17, 0); ctx.stroke(); ctx.rotate(Math.PI / 4); }
      ctx.restore();
    });
    // hanging lantern on the cart
    ctx.fillStyle = `rgba(255,214,120,${.7 + night * .3})`; ctx.beginPath(); ctx.arc(62, -26 + Math.sin(S.time * 5) * 2, 6, 0, 6.283); ctx.fill();
    ctx.restore();
  }

  /* ---------------- loop ---------------- */
  function frame(now) {
    S.raf = requestAnimationFrame(frame);
    if (!S.last) S.last = now;
    const dt = Math.min(.034, (now - S.last) / 1000);     // clamp so a hitch never teleports the cart
    S.last = now;
    if (S.paused) return;
    if (S.running) update(dt);
    else { S.time += dt * .3; S.flash = Math.max(0, S.flash - dt); S.shake = Math.max(0, S.shake - dt * 2); S.scroll += dt * 4; }
    draw();
  }

  /* ---------------- input ---------------- */
  const move = d => { if (S.running) { const n = clamp(S.lane + d, 0, 2); if (n !== S.lane) { S.lane = n; if (A()) A().sfx('hover'); } } };
  document.addEventListener('keydown', e => {
    if (!S.running || S.paused || e.repeat) return;
    const k = e.key.toLowerCase();
    if (k === 'arrowleft' || k === 'a') { move(-1); e.preventDefault(); }
    else if (k === 'arrowright' || k === 'd') { move(1); e.preventDefault(); }
    else if (k === ' ' || k === 'h' || k === 'arrowup') { honk(); e.preventDefault(); }
  });
  let sx = 0, sy0 = 0, swiped = false, pid = null;
  canvas.addEventListener('pointerdown', e => { sx = e.clientX; sy0 = e.clientY; swiped = false; pid = e.pointerId; });
  canvas.addEventListener('pointermove', e => {                         // react mid-swipe, not on release: far less laggy
    if (pid !== e.pointerId || swiped) return;
    const dx = e.clientX - sx, dy = e.clientY - sy0;
    if (Math.abs(dx) > 22 && Math.abs(dx) > Math.abs(dy)) { move(dx > 0 ? 1 : -1); sx = e.clientX; }
    else if (dy < -46) { swiped = true; honk(); }
  });
  canvas.addEventListener('pointerup', e => {
    if (pid !== e.pointerId) return;
    if (!swiped && Math.abs(e.clientX - sx) < 10 && Math.abs(e.clientY - sy0) < 10) { const r = canvas.getBoundingClientRect(); move(e.clientX - r.left < r.width / 2 ? -1 : 1); }
    pid = null;
  });
  $('thelaPlay').addEventListener('click', start);
  $('thelaAgain').addEventListener('click', start);
  $('thelaHorn').addEventListener('click', honk);
  $('thelaLeft').addEventListener('pointerdown', e => { e.preventDefault(); move(-1); });
  $('thelaRight').addEventListener('pointerdown', e => { e.preventDefault(); move(1); });
  document.addEventListener('visibilitychange', () => { S.paused = document.hidden; S.last = 0; });
  if ('IntersectionObserver' in window) new IntersectionObserver(es => { S.paused = !es[0].isIntersecting; S.last = 0; }, { threshold: .1 }).observe(stage);
  window.addEventListener('resize', () => { clearTimeout(window._tlR); window._tlR = setTimeout(resize, 120); });

  document.querySelectorAll('[data-game-tab]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.gameTab;
    document.querySelectorAll('[data-game-tab]').forEach(x => { x.classList.toggle('is-on', x === b); x.setAttribute('aria-selected', String(x === b)); });
    document.querySelectorAll('.game-panel').forEach(p => { p.hidden = p.dataset.panel !== k; });
    setTimeout(() => window.dispatchEvent(new Event('resize')), 30);
  }));

  window.KharidaarThela = { state: S, update, honk, start, draw };
  resize(); hud(true);
  S.raf = requestAnimationFrame(frame);
})();
