/* ============================================================
   Kharidaar — the living bazaar (canvas 2D)
   A day-to-night market with wandering NCP shoppers.
   ============================================================ */
(function () {
  const canvas = document.getElementById('bazaarCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const STALLS = [
    { cat: 'fruits', emoji: '🍎', color: '#c74a2b', back: true },
    { cat: 'dairy', emoji: '🥛', color: '#3f77a8', back: true },
    { cat: 'snacks', emoji: '🍬', color: '#b84353', back: true },
    { cat: 'staples', emoji: '🌾', color: '#9a6a30', back: true },
    { cat: 'fruits', emoji: '🍋', color: '#b9862a' },
    { cat: 'health', emoji: '🩺', color: '#2a8a7b' },
    { cat: 'meals', emoji: '🍽️', color: '#b85f2a' },
  ];

  const STOPS = [
    { h: 0, top: [8, 7, 20], mid: [18, 14, 34], bot: [40, 27, 46] },
    { h: 4.5, top: [16, 14, 37], mid: [44, 32, 60], bot: [80, 49, 64] },
    { h: 6.1, top: [66, 48, 86], mid: [158, 96, 92], bot: [241, 172, 122] },
    { h: 7.6, top: [126, 174, 203], mid: [214, 204, 181], bot: [246, 225, 183] },
    { h: 12, top: [118, 177, 214], mid: [203, 226, 232], bot: [244, 238, 216] },
    { h: 16.6, top: [126, 171, 203], mid: [228, 208, 176], bot: [245, 214, 162] },
    { h: 18.1, top: [80, 74, 120], mid: [206, 121, 97], bot: [242, 165, 104] },
    { h: 19.6, top: [31, 25, 60], mid: [74, 45, 83], bot: [123, 64, 78] },
    { h: 21, top: [11, 10, 26], mid: [20, 16, 38], bot: [32, 24, 44] },
    { h: 24, top: [8, 7, 20], mid: [18, 14, 34], bot: [40, 27, 46] },
  ];

  const THOUGHTS = [
    'Apples at ₹120/kg? Last July they were ₹200. Patience, my friend.',
    'I only came for milk. I have somehow bought laddoos.',
    'The litchi season is too short. Like all good things.',
    'Two rupees more for paneer, and my dinner plans change.',
    'I walked past the salon. My hair said no.',
    '₹10 for a bus to Varanasi is not a price, it is a rumour.',
    'I bargain for twenty minutes to save ten rupees. Worth it.',
    'Kaju is expensive, but have you tried being happy without it?',
    'The ledger remembers what the market forgets.',
    'Someone wrote “leads to loose motion” next to mangoes. I still bought them.',
  ];

  const CHATTER = [
    { name: 'Sunita', color: '#c9556b' }, { name: 'Ravi', color: '#3d7a68' },
    { name: 'Meena', color: '#d9a441' }, { name: 'Aslam', color: '#4f7fb5' },
    { name: 'Poonam', color: '#8a6bb1' }, { name: 'Jaggi', color: '#b06a3b' },
    { name: 'Nisha', color: '#6b8f4e' }, { name: 'Bittu', color: '#c74a2b' },
  ];

  const state = {
    w: 0, h: 0, dpr: 1, u: 1,
    minutes: 15 * 60 + 20,
    auto: false, autoDur: 32,
    glide: null,
    last: 0, t: 0,
    pointer: { x: .5, y: .5 }, cam: { x: 0, y: 0 },
    hoverStall: null, bubble: null,
    crowdUntil: 0, lastHour: -1,
    thoughts: THOUGHTS,
    reducing: reduceMotion,
    npcs: [], stalls: [], stars: [], buildings: [], fireflies: [], clouds: [], birds: [],
  };

  const listeners = { time: [], stall: [] };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  function hexRgb(hex) {
    const h = String(hex).replace('#', '');
    return [parseInt(h.slice(0, 2), 16) || 200, parseInt(h.slice(2, 4), 16) || 80, parseInt(h.slice(4, 6), 16) || 50];
  }

  function rr(x, y, w, h, r) {
    const rad = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }

  function seeded(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /* ---------------- sky ---------------- */
  function palette(minutes) {
    const hour = minutes / 60;
    let i = 0;
    while (i < STOPS.length - 2 && STOPS[i + 1].h <= hour) i++;
    const a = STOPS[i], b = STOPS[Math.min(i + 1, STOPS.length - 1)];
    const t = clamp((hour - a.h) / Math.max(.001, b.h - a.h), 0, 1);
    return {
      top: mix(a.top, b.top, t),
      mid: mix(a.mid, b.mid, t),
      bot: mix(a.bot, b.bot, t),
    };
  }

  function darknessOf(p) {
    const lum = .299 * p.mid[0] + .587 * p.mid[1] + .114 * p.mid[2];
    return clamp(1 - lum / 185, 0, 1);
  }

  function phaseOf(minutes) {
    const h = minutes / 60;
    if (h < 5.5) return 'night';
    if (h < 7.5) return 'dawn';
    if (h < 11.5) return 'morning';
    if (h < 16) return 'afternoon';
    if (h < 18.8) return 'evening';
    return 'night';
  }

  /* ---------------- build world ---------------- */
  function buildWorld() {
    const w = state.w, h = state.h, u = state.u;
    const rnd = seeded(20260409);

    state.stars = Array.from({ length: 110 }, () => ({
      x: rnd(), y: rnd() * .52, r: .5 + rnd() * 1.3, p: rnd() * 6.28,
    }));
    state.clouds = Array.from({ length: 5 }, (_, i) => ({
      x: rnd(), y: .1 + rnd() * .26, s: .5 + rnd() * .9, v: .002 + rnd() * .003, o: .18 + rnd() * .2,
    }));
    state.birds = Array.from({ length: 5 }, () => ({
      x: rnd(), y: .15 + rnd() * .22, s: .5 + rnd() * .6, v: .008 + rnd() * .01, p: rnd() * 6.28,
    }));
    state.fireflies = Array.from({ length: 22 }, () => ({
      x: rnd(), y: .55 + rnd() * .38, p: rnd() * 6.28, s: .4 + rnd() * .8, v: .1 + rnd() * .2,
    }));

    // skyline silhouettes
    state.buildings = [];
    let x = 0;
    while (x < w) {
      const bw = 24 * u + rnd() * 52 * u;
      const bh = (22 + rnd() * 74) * u;
      state.buildings.push({ x, w: bw, h: bh, win: rnd(), seed: rnd() });
      x += bw + 3 * u;
    }

    // stalls: back row + front row
    state.stalls = [];
    const back = STALLS.filter(s => s.back);
    back.forEach((s, i) => {
      const sw = Math.min(150 * u, w * .22);
      const cx = w * (0.16 + i * 0.225);
      state.stalls.push({ ...s, x: cx - sw / 2, y: h * .642, w: sw, h: 104 * u, scale: .7, lane: 0 });
    });
    const front = STALLS.filter(s => !s.back);
    front.forEach((s, i) => {
      const sw = Math.min(190 * u, w * .27);
      const cx = w * (0.22 + i * 0.28);
      state.stalls.push({ ...s, x: cx - sw / 2, y: h * .8, w: sw, h: 172 * u, scale: 1, lane: 1 });
    });

    buildNpcs();
  }

  function buildNpcs() {
    const target = state.reducing ? 8 : (state.w < 720 ? 10 : 15);
    const rnd = seeded(77);
    state.npcs = Array.from({ length: target }, (_, i) => makeNpc(rnd, i));
  }

  function makeNpc(rnd, i) {
    const chatter = CHATTER[i % CHATTER.length];
    return {
      lane: i % 2,
      x: rnd(),
      dir: rnd() > .5 ? 1 : -1,
      speed: (.012 + rnd() * .016) * (state.reducing ? 0 : 1),
      color: chatter.color,
      skin: ['#c98a5e', '#a9693f', '#e0a878', '#8a5230'][i % 4],
      name: chatter.name,
      phase: rnd() * 6.28,
      hasBag: rnd() > .55,
      lantern: rnd() > .5,
      extra: false,
      thought: THOUGHTS[i % THOUGHTS.length],
    };
  }

  /* ---------------- resize ---------------- */
  function resize() {
    const hero = canvas.parentElement;
    const rect = hero.getBoundingClientRect();
    const w = Math.max(320, rect.width);
    const h = Math.max(420, rect.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    state.w = w; state.h = h; state.dpr = dpr;
    state.u = clamp(Math.min(w / 1280, h / 760), .62, 1.25);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildWorld();
    draw();
  }

  /* ---------------- drawing ---------------- */
  function draw() {
    const { w, h, u } = state;
    const p = palette(state.minutes);
    const dark = darknessOf(p);
    const hour = state.minutes / 60;
    const horizon = h * .545;
    const camX = state.cam.x, camY = state.cam.y;

    ctx.clearRect(0, 0, w, h);

    // sky
    const sky = ctx.createLinearGradient(0, 0, 0, horizon + h * .1);
    sky.addColorStop(0, rgba(p.top));
    sky.addColorStop(.62, rgba(p.mid));
    sky.addColorStop(1, rgba(p.bot));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, horizon + h * .1);

    // sun / moon
    drawCelestial(hour, w, h, horizon, dark, camX);

    // stars
    const starA = smooth(.55, .95, dark);
    if (starA > .01) {
      state.stars.forEach((s, i) => {
        const tw = .55 + .45 * Math.sin(state.t * 1.4 + s.p);
        ctx.globalAlpha = starA * tw * .9;
        ctx.fillStyle = '#fff6e2';
        ctx.beginPath();
        ctx.arc(s.x * w + camX * .4, s.y * h + camY * .2, s.r, 0, 6.283);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    }

    // clouds
    state.clouds.forEach(c => {
      if (!state.reducing) c.x += c.v * .0016;
      if (c.x > 1.2) c.x = -.25;
      const cx = c.x * w + camX * .5, cy = c.y * h;
      const col = mix(p.mid, [255, 250, 242], .5);
      ctx.globalAlpha = c.o * (1 - dark * .55);
      ctx.fillStyle = rgba(col);
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.ellipse(cx + (i - 1.5) * 28 * u * c.s, cy + Math.sin(i * 1.7) * 5 * u, 30 * u * c.s, 12 * u * c.s, 0, 0, 6.283);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    });

    // birds by day
    const birdA = 1 - smooth(.2, .5, dark);
    if (birdA > .05 && !state.reducing) {
      ctx.strokeStyle = `rgba(38,34,42,${.32 * birdA})`;
      ctx.lineWidth = 1.2;
      state.birds.forEach(b => {
        b.x += b.v * .0016;
        if (b.x > 1.15) b.x = -.1;
        const bx = b.x * w, by = b.y * h + Math.sin(state.t * 2 + b.p) * 3;
        const s = 4 * u * b.s;
        ctx.beginPath();
        ctx.moveTo(bx - s, by);
        ctx.quadraticCurveTo(bx - s * .4, by - s * .7, bx, by);
        ctx.quadraticCurveTo(bx + s * .4, by - s * .7, bx + s, by);
        ctx.stroke();
      });
    }

    // distant skyline
    drawSkyline(w, horizon, dark, u, camX);

    // haze band at horizon
    const haze = ctx.createLinearGradient(0, horizon - 40 * u, 0, horizon + 30 * u);
    haze.addColorStop(0, rgba(p.bot, 0));
    haze.addColorStop(.55, rgba(mix(p.bot, [255, 240, 214], .3), .55));
    haze.addColorStop(1, rgba(p.bot, 0));
    ctx.fillStyle = haze;
    ctx.fillRect(0, horizon - 40 * u, w, 70 * u);

    // ground
    const groundTop = mix([203, 173, 130], [26, 20, 36], dark * .94);
    const groundBot = mix([155, 121, 82], [16, 13, 25], dark * .96);
    const g = ctx.createLinearGradient(0, horizon, 0, h);
    g.addColorStop(0, rgba(groundTop));
    g.addColorStop(.32, rgba(mix(groundTop, groundBot, .55)));
    g.addColorStop(1, rgba(groundBot));
    ctx.fillStyle = g;
    ctx.fillRect(0, horizon, w, h - horizon);

    // bazaar wall
    drawWall(w, horizon, dark, u, camX);

    // ground perspective lines
    ctx.save();
    ctx.strokeStyle = rgba(mix(groundBot, [255, 245, 225], .35), .1 + (1 - dark) * .1);
    ctx.lineWidth = 1;
    for (let i = 0; i < 12; i++) {
      const t = i / 12;
      const y = horizon + Math.pow(t, 2.1) * (h - horizon) + 2;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.restore();

    drawGroundDetail(horizon, w, h, u, dark);

    // back stall row
    state.stalls.filter(s => s.lane === 0).forEach(s => drawStall(s, dark, false));

    // back lane shoppers
    drawNpcs(0, dark);

    // mid stalls
    state.stalls.filter(s => s.lane === 1).forEach(s => drawStall(s, dark, true));

    // lamps
    drawLamps(w, h, dark, u);

    // front lane shoppers
    drawNpcs(1, dark);

    // fireflies at night
    if (dark > .5) {
      state.fireflies.forEach(f => {
        if (!state.reducing) f.p += .012;
        const fx = f.x * w + Math.sin(f.p) * 18 * u;
        const fy = (f.y + Math.sin(f.p * .6) * .012) * h;
        const a = (0.3 + 0.7 * Math.abs(Math.sin(f.p * .8))) * smooth(.5, .9, dark);
        ctx.fillStyle = `rgba(255,214,120,${a * .7})`;
        ctx.beginPath();
        ctx.arc(fx, fy, 1.4 * u * f.s, 0, 6.283);
        ctx.fill();
        ctx.fillStyle = `rgba(255,214,120,${a * .12})`;
        ctx.beginPath();
        ctx.arc(fx, fy, 7 * u * f.s, 0, 6.283);
        ctx.fill();
      });
    }

    // dust / vignette
    const vg = ctx.createRadialGradient(w * .5, h * .58, Math.min(w, h) * .25, w * .5, h * .58, Math.max(w, h) * .8);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, `rgba(5,4,9,${.22 + dark * .28})`);
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);

    drawBubble(dark);

    publishInk(p, dark);
  }

  function drawCelestial(hour, w, h, horizon, dark, camX) {
    let body = null;
    if (hour >= 5.4 && hour <= 18.6) body = { p: (hour - 5.4) / 13.2, sun: true };
    else {
      const hh = hour < 5.4 ? hour + 24 : hour;
      body = { p: (hh - 18.6) / 10.8, sun: false };
    }
    const bx = w * (.1 + .8 * clamp(body.p, 0, 1)) + camX * .35;
    const by = horizon - Math.sin(Math.PI * clamp(body.p, 0, 1)) * (horizon * .74);
    const rad = (body.sun ? 22 : 17) * state.u;
    const glowR = rad * (body.sun ? 6 : 4.5);
    const col = body.sun ? [255, 195, 96] : [236, 236, 218];

    const glow = ctx.createRadialGradient(bx, by, 0, bx, by, glowR);
    glow.addColorStop(0, rgba(col, body.sun ? .55 : .35));
    glow.addColorStop(.4, rgba(col, body.sun ? .13 : .1));
    glow.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(bx, by, glowR, 0, 6.283); ctx.fill();

    ctx.fillStyle = body.sun ? 'rgba(255,240,196,.98)' : 'rgba(245,243,226,.97)';
    ctx.beginPath(); ctx.arc(bx, by, rad, 0, 6.283); ctx.fill();

    if (!body.sun) {
      ctx.fillStyle = rgba(mix(palette(state.minutes).mid, [255, 255, 255], .18), .55);
      [[-.28, -.22, .32], [.24, .18, .2], [.05, .38, .14]].forEach(([dx, dy, s]) => {
        ctx.beginPath();
        ctx.arc(bx + dx * rad, by + dy * rad, rad * s, 0, 6.283);
        ctx.fill();
      });
    }
  }

  function drawSkyline(w, horizon, dark, u, camX) {
    const base = mix([122, 104, 108], [15, 13, 26], smooth(.1, .8, dark));
    state.buildings.forEach((b, i) => {
      const bh = b.h * (1 + Math.sin(i * 1.7) * .15);
      ctx.fillStyle = rgba(mix(base, [0, 0, 0], .08), .9);
      ctx.fillRect(b.x + camX * .55, horizon - bh, b.w, bh + 2);
      if (dark > .25) {
        const rnd = seeded(Math.floor(b.seed * 1e6));
        const cols = Math.max(1, Math.floor(b.w / (10 * u)));
        const rows = Math.max(1, Math.floor(bh / (13 * u)));
        for (let c = 0; c < cols; c++) {
          for (let r = 0; r < rows; r++) {
            if (rnd() > .62) continue;
            ctx.fillStyle = `rgba(255,198,112,${(.18 + rnd() * .5) * smooth(.25, .8, dark)})`;
            ctx.fillRect(b.x + camX * .55 + 4 * u + c * 10 * u, horizon - bh + 6 * u + r * 13 * u, 2.2 * u, 3.4 * u);
          }
        }
      }
    });
  }

  function drawWall(w, horizon, dark, u, camX) {
    const wallTop = horizon + 4 * u;
    const wallBot = state.h * .625;
    const base = mix([205, 176, 140], [33, 26, 44], smooth(.1, .85, dark) * .94);
    ctx.fillStyle = rgba(base, .92);
    ctx.fillRect(0, wallTop, w, wallBot - wallTop);
    ctx.fillStyle = rgba(mix(base, [255, 246, 224], .28), .5);
    ctx.fillRect(0, wallTop, w, 2.5 * u);
    ctx.fillStyle = rgba(mix(base, [0, 0, 0], .18), .5);
    ctx.fillRect(0, wallBot - 2 * u, w, 2 * u);

    // arches along the wall
    const count = Math.max(4, Math.round(w / (210 * u)));
    const step = w / count;
    const rnd = seeded(4242);
    for (let i = 0; i < count; i++) {
      const cx = step * (i + .5) + camX * .3;
      const aw = Math.min(74 * u, step * .44);
      const ah = (wallBot - wallTop) * (.62 + rnd() * .12);
      const ax = cx - aw / 2;
      const ay = wallBot - ah;
      ctx.fillStyle = rgba(mix(base, [12, 10, 18], .55 + dark * .2), .55);
      ctx.beginPath();
      ctx.moveTo(ax, wallBot);
      ctx.lineTo(ax, ay + aw * .35);
      ctx.quadraticCurveTo(ax, ay, ax + aw / 2, ay);
      ctx.quadraticCurveTo(ax + aw, ay, ax + aw, ay + aw * .35);
      ctx.lineTo(ax + aw, wallBot);
      ctx.closePath();
      ctx.fill();

      // hanging cloth stripes
      const cols = ['#b84a33', '#c9923b', '#3f7768', '#8a5b7a', '#b06a3b'];
      ctx.globalAlpha = .35 - dark * .12;
      ctx.fillStyle = cols[i % cols.length];
      const bx = cx - aw * .18;
      ctx.beginPath();
      ctx.moveTo(bx, wallTop + 4 * u);
      ctx.lineTo(bx + aw * .36, wallTop + 4 * u);
      ctx.lineTo(bx + aw * .3, wallTop + ah * .42);
      ctx.lineTo(bx + aw * .18, wallTop + ah * .34);
      ctx.lineTo(bx + aw * .06, wallTop + ah * .43);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // little lanterns along the wall
    const on = smooth(.35, .85, dark);
    if (on > .04) {
      for (let i = 0; i < count; i++) {
        const lx = step * (i + 1) + camX * .3;
        const ly = wallTop + 9 * u;
        ctx.fillStyle = rgba([255, 205, 120], .35 + .55 * on);
        ctx.beginPath(); ctx.arc(lx, ly, 2 * u, 0, 6.283); ctx.fill();
      }
    }
  }

  function drawGroundDetail(horizon, w, h, u, dark) {
    const rnd = seeded(991);
    const top = horizon + 4 * u;
    // paving strip in front of the wall
    const pave = mix([190, 156, 114], [29, 23, 38], smooth(.1, .9, dark) * .92);
    ctx.fillStyle = rgba(mix(pave, [255, 240, 208], .12), .16);
    ctx.fillRect(0, h * .625, w, h * .375);
    // scattered stones & leaves
    for (let i = 0; i < 90; i++) {
      const x = rnd() * w;
      const y = h * (.66 + rnd() * .3);
      const rr2 = (.7 + rnd() * 2.2) * u;
      const light = rnd() > .5;
      ctx.fillStyle = rgba(light ? mix(pave, [255, 244, 218], .5) : mix(pave, [20, 14, 24], .4), .1 + rnd() * .14);
      ctx.beginPath();
      ctx.ellipse(x, y, rr2, rr2 * .42, rnd() * 3, 0, 6.283);
      ctx.fill();
    }
    // a soft rug / lane under the front row
    const laneY = h * .835;
    const laneGrad = ctx.createLinearGradient(0, laneY - 26 * u, 0, laneY + 26 * u);
    laneGrad.addColorStop(0, rgba(mix(pave, [255, 246, 220], .16), 0));
    laneGrad.addColorStop(.5, rgba(mix(pave, [255, 246, 220], .2), .22));
    laneGrad.addColorStop(1, rgba(mix(pave, [255, 246, 220], .16), 0));
    ctx.fillStyle = laneGrad;
    ctx.fillRect(0, laneY - 26 * u, w, 52 * u);
  }

  function drawStall(s, dark, front) {
    const x = s.x, y = s.y, w = s.w, h = s.h, u = state.u;
    const dim = 1 - dark * .42;
    const shade = c => `rgba(${(c[0] * dim) | 0},${(c[1] * dim) | 0},${(c[2] * dim) | 0},1)`;
    const aw = shade([247, 233, 205]);
    const color = s.color;
    const rgb = hexRgb(s.color);
    const hovered = state.hoverStall === s;
    const lift = hovered ? -3 * u : 0;

    // shadow
    ctx.fillStyle = `rgba(10,8,12,${.18 + dark * .18})`;
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + 6 * u, w * .55, 14 * u, 0, 0, 6.283);
    ctx.fill();

    // posts
    ctx.fillStyle = shade([96, 68, 44]);
    ctx.fillRect(x + 6 * u, y - h * .82 + lift, 5 * u, h * .82);
    ctx.fillRect(x + w - 11 * u, y - h * .82 + lift, 5 * u, h * .82);

    // counter
    const counterH = h * .38;
    ctx.fillStyle = shade([124, 84, 52]);
    rr(x + 2 * u, y - counterH + lift, w - 4 * u, counterH, 4 * u);
    ctx.fill();
    ctx.fillStyle = shade([151, 107, 68]);
    rr(x + 6 * u, y - counterH - 5 * u + lift, w - 12 * u, 9 * u, 3 * u);
    ctx.fill();

    // goods on counter
    const rnd = seeded(Math.floor(w + h + s.x));
    const produce = [
      [214, 92, 62], [232, 168, 62], [128, 158, 74],
      [196, 76, 84], [230, 200, 140], [150, 110, 62],
    ];
    for (let i = 0; i < 9; i++) {
      const gx = x + 16 * u + i * (w - 32 * u) / 8;
      const gy = y - counterH - 8 * u + lift;
      const r = (2.6 + rnd() * 2.2) * u;
      ctx.fillStyle = shade(produce[i % produce.length]);
      ctx.beginPath(); ctx.arc(gx, gy - r, r, 0, 6.283); ctx.fill();
    }

    // awning
    const awTop = y - h * .98 + lift, awH = h * .3;
    ctx.fillStyle = aw;
    ctx.beginPath();
    ctx.moveTo(x - 4 * u, awTop + 6 * u);
    ctx.lineTo(x + w + 4 * u, awTop + 6 * u);
    ctx.lineTo(x + w + 12 * u, awTop + awH);
    ctx.lineTo(x - 12 * u, awTop + awH);
    ctx.closePath();
    ctx.fill();

    // stripes
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x - 4 * u, awTop + 6 * u);
    ctx.lineTo(x + w + 4 * u, awTop + 6 * u);
    ctx.lineTo(x + w + 12 * u, awTop + awH);
    ctx.lineTo(x - 12 * u, awTop + awH);
    ctx.closePath();
    ctx.clip();
    const stripes = 7;
    for (let i = 0; i < stripes; i += 2) {
      const sx = x - 12 * u + i * (w + 24 * u) / stripes;
      ctx.fillStyle = hovered ? shade([255, 215, 170]) : shade([rgb[0] * .95, rgb[1] * .95, rgb[2] * .95]);
      ctx.beginPath();
      ctx.moveTo(sx, awTop + 5 * u);
      ctx.lineTo(sx + (w + 24 * u) / stripes, awTop + 5 * u);
      ctx.lineTo(sx + (w + 24 * u) / stripes + 8 * u, awTop + awH);
      ctx.lineTo(sx + 8 * u, awTop + awH);
      ctx.closePath();
      ctx.fill();
    }
    // scalloped edge
    ctx.fillStyle = aw;
    for (let i = 0; i < 9; i++) {
      const cx = x - 8 * u + i * (w + 16 * u) / 8;
      ctx.beginPath();
      ctx.arc(cx, awTop + awH, (w + 16 * u) / 20, 0, Math.PI);
      ctx.fill();
    }
    ctx.restore();

    // sign board
    const signW = w * .52, signH = 24 * u;
    ctx.fillStyle = shade([54, 42, 34]);
    rr(x + (w - signW) / 2, awTop - signH * .82 + lift, signW, signH, 3 * u);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,248,232,.9)';
    ctx.font = `${12 * u * (s.scale + .1)}px "Outfit", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(s.emoji + '  ' + s.cat.toUpperCase(), x + w / 2, awTop - signH * .32 + lift);

    // hanging bulbs
    const lampsOn = smooth(.35, .85, dark);
    for (let i = 0; i < 3; i++) {
      const lx = x + w * (.22 + i * .28);
      const ly = awTop + awH + 12 * u;
      ctx.strokeStyle = `rgba(40,30,26,${.4 + .2 * dim})`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(lx, awTop + awH); ctx.lineTo(lx, ly); ctx.stroke();
      if (lampsOn > .05) {
        const gl = ctx.createRadialGradient(lx, ly, 0, lx, ly, 26 * u);
        gl.addColorStop(0, `rgba(255,200,110,${.4 * lampsOn})`);
        gl.addColorStop(1, 'rgba(255,200,110,0)');
        ctx.fillStyle = gl;
        ctx.beginPath(); ctx.arc(lx, ly, 26 * u, 0, 6.283); ctx.fill();
      }
      ctx.fillStyle = `rgba(255,214,140,${.4 + .6 * lampsOn})`;
      ctx.beginPath(); ctx.arc(lx, ly, 2.4 * u, 0, 6.283); ctx.fill();
    }

    // price tag
    ctx.save();
    ctx.translate(x + w * .78, awTop + awH + 26 * u);
    ctx.rotate(-.08);
    ctx.fillStyle = 'rgba(255,250,236,.9)';
    rr(-13 * u, -8 * u, 26 * u, 19 * u, 2 * u);
    ctx.fill();
    ctx.fillStyle = 'rgba(60,45,38,.75)';
    ctx.font = `600 ${8.5 * u}px "Outfit", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('₹ —', 0, 1 * u);
    ctx.restore();

    // hitbox
    s.hit = { x: x - 10 * u, y: awTop - 30 * u, w: w + 20 * u, h: h * 1.1 + 30 * u };
  }

  function drawLamps(w, h, dark, u) {
    const on = smooth(.3, .8, dark);
    const spots = [[.08, .79], [.5, .8], [.92, .81]];
    spots.forEach(([px, py], i) => {
      const x = px * w + state.cam.x, y = py * h;
      ctx.strokeStyle = `rgba(52,38,30,${.35 + .3 * (1 - dark)})`;
      ctx.lineWidth = 2.2 * u;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 54 * u); ctx.stroke();
      if (on > .04) {
        const gl = ctx.createRadialGradient(x, y - 58 * u, 0, x, y - 58 * u, 68 * u);
        gl.addColorStop(0, `rgba(255,196,104,${.3 * on})`);
        gl.addColorStop(.5, `rgba(255,175,90,${.1 * on})`);
        gl.addColorStop(1, 'rgba(255,175,90,0)');
        ctx.fillStyle = gl;
        ctx.beginPath(); ctx.arc(x, y - 58 * u, 68 * u, 0, 6.283); ctx.fill();
      }
      ctx.fillStyle = `rgba(255,218,150,${.35 + .65 * on})`;
      ctx.beginPath(); ctx.arc(x, y - 58 * u, 4.2 * u, 0, 6.283); ctx.fill();
      ctx.fillStyle = `rgba(255,218,150,${.1 * on})`;
      ctx.beginPath(); ctx.arc(x, y - 58 * u, 9 * u, 0, 6.283); ctx.fill();
    });
  }

  function drawNpcs(lane, dark) {
    const w = state.w, h = state.h, u = state.u;
    const list = state.npcs.filter(n => n.lane === lane);
    const baseY = lane === 0 ? .705 : .835;
    list.forEach(n => {
      const scale = (lane === 0 ? .72 : 1) * u;
      const x = n.x * w + state.cam.x;
      const y = baseY * h;
      const bob = state.reducing ? 0 : Math.sin(state.t * 3 + n.phase) * 1.6 * scale;
      drawPerson(x, y + bob, scale, n, dark);
      n.screen = { x, y: y + bob, r: 30 * scale };
    });
  }

  function drawPerson(x, y, s, n, dark) {
    const swing = state.reducing ? 0 : Math.sin(state.t * 5.5 + n.phase);
    const dir = n.dir;

    // shadow
    ctx.fillStyle = `rgba(8,6,10,${.16 + dark * .2})`;
    ctx.beginPath(); ctx.ellipse(x, y + 2, 11 * s, 3.4 * s, 0, 0, 6.283); ctx.fill();

    // legs
    ctx.strokeStyle = n.skin;
    ctx.lineWidth = 3 * s;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - 2 * s, y - 17 * s);
    ctx.lineTo(x - 3 * s + swing * 3 * s, y - 1 * s);
    ctx.moveTo(x + 2 * s, y - 17 * s);
    ctx.lineTo(x + 3 * s - swing * 3 * s, y - 1 * s);
    ctx.stroke();

    // body
    const bodyCol = n.color;
    const mul = 1 - dark * .32;
    ctx.fillStyle = `rgba(${(parseInt(bodyCol.slice(1, 3), 16) * mul) | 0},${(parseInt(bodyCol.slice(3, 5), 16) * mul) | 0},${(parseInt(bodyCol.slice(5, 7), 16) * mul) | 0},1)`;
    rr(x - 6.5 * s, y - 31 * s, 13 * s, 17 * s, 5 * s);
    ctx.fill();

    // arm
    ctx.strokeStyle = n.skin;
    ctx.lineWidth = 2.2 * s;
    ctx.beginPath();
    ctx.moveTo(x + 5 * s * dir, y - 27 * s);
    ctx.lineTo(x + (7 * s + swing * 2 * s) * dir, y - 18 * s);
    ctx.stroke();

    // head
    ctx.fillStyle = n.skin;
    ctx.beginPath(); ctx.arc(x, y - 37 * s, 6.5 * s, 0, 6.283); ctx.fill();
    // hair / dupatta
    ctx.fillStyle = `rgba(32,24,22,${.85 - dark * .1})`;
    ctx.beginPath(); ctx.arc(x, y - 39 * s, 6.6 * s, Math.PI * .98, Math.PI * 2.02); ctx.fill();
    if (n.hasBag) {
      // little bag swinging
      ctx.fillStyle = 'rgba(232,196,132,.95)';
      rr(x - 10 * s, y - 21 * s, 6 * s, 8 * s, 1.5 * s);
      ctx.fill();
    }

    // lantern at night
    const on = smooth(.4, .9, dark);
    if (n.lantern && on > .05) {
      const lx = x + 9 * s * dir, ly = y - 15 * s;
      const gl = ctx.createRadialGradient(lx, ly, 0, lx, ly, 22 * s);
      gl.addColorStop(0, `rgba(255,206,120,${.45 * on})`);
      gl.addColorStop(1, 'rgba(255,206,120,0)');
      ctx.fillStyle = gl;
      ctx.beginPath(); ctx.arc(lx, ly, 22 * s, 0, 6.283); ctx.fill();
      ctx.fillStyle = `rgba(255,224,160,${.85 * on})`;
      ctx.beginPath(); ctx.arc(lx, ly, 2.4 * s, 0, 6.283); ctx.fill();
    }
  }

  function drawBubble(dark) {
    const b = state.bubble;
    if (!b) return;
    const age = (performance.now() - b.born) / 1000;
    if (age > 6) { state.bubble = null; return; }
    const alpha = Math.min(1, age * 4) * (age > 5.2 ? Math.max(0, (6 - age) / .8) : 1);
    if (alpha <= 0) return;
    const npc = b.npc;
    const pos = npc.screen;
    if (!pos) return;
    const s = clamp(state.u * 1.5, .82, 1.2);
    const maxW = Math.min(240 * s, state.w - 40);
    ctx.font = `${11.5 * s}px "Outfit", "Noto Sans Devanagari", sans-serif`;
    const words = b.text.split(' ');
    const lines = [];
    let line = '';
    words.forEach(word => {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxW - 22 * s && line) {
        lines.push(line); line = word;
      } else line = test;
    });
    if (line) lines.push(line);
    const lh = 16 * s;
    const bw = Math.max(...lines.map(l => ctx.measureText(l).width)) + 22 * s;
    const bh = lines.length * lh + 16 * s;
    let bx = clamp(pos.x - bw / 2, 8, state.w - bw - 8);
    let by = pos.y - bh - 50 * s;
    if (by < 8) by = pos.y + 12 * s;

    // connector
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = 'rgba(30,24,20,.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(clamp(pos.x, bx + 12, bx + bw - 12), by + bh);
    ctx.lineTo(pos.x, pos.y - 34 * s);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,250,238,.96)';
    rr(bx, by, bw, bh, 10 * s);
    ctx.fill();
    ctx.strokeStyle = 'rgba(30,24,20,.22)';
    ctx.stroke();

    // little name tag
    ctx.fillStyle = 'rgba(216,74,34,.9)';
    ctx.font = `600 ${8 * s}px "Outfit", sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(npc.name.toUpperCase(), bx + 11 * s, by + 13 * s);

    ctx.fillStyle = 'rgba(38,31,26,.92)';
    ctx.font = `${11.5 * s}px "Outfit", "Noto Sans Devanagari", sans-serif`;
    lines.forEach((l, i) => ctx.fillText(l, bx + 11 * s, by + 30 * s + i * lh));
    ctx.globalAlpha = 1;
  }

  function publishInk(p, dark) {
    const t = smooth(.34, .72, dark);
    const ink = mix([30, 25, 20], [247, 238, 223], t);
    const veil = mix([248, 242, 231], [10, 8, 18], smooth(.42, .82, dark));
    const root = document.documentElement.style;
    root.setProperty('--scene-ink', rgba(ink));
    root.setProperty('--scene-veil', `rgba(${veil[0] | 0},${veil[1] | 0},${veil[2] | 0},.9)`);
    canvas.dataset.phase = phaseOf(state.minutes);
    canvas.dataset.dark = String(dark > .55);
    document.body.classList.toggle('scene-night', dark > .55);
    document.body.classList.toggle('scene-day', dark <= .55);
  }

  /* ---------------- loop ---------------- */
  function tick(now) {
    if (!state.last) state.last = now;
    let dt = Math.min(120, now - state.last) / 1000;
    state.last = now;
    state.t += dt;

    if (state.glide) {
      const g = state.glide;
      const t = clamp((now - g.start) / g.dur, 0, 1);
      const e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      state.minutes = (g.from + g.delta * e + 1440) % 1440;
      if (t >= 1) state.glide = null;
      emitTime();
    } else if (state.auto) {
      state.minutes = (state.minutes + dt * (1440 / state.autoDur)) % 1440;
      emitTime();
    }

    // camera easing
    const tx = (state.pointer.x - .5) * 14, ty = (state.pointer.y - .5) * 8;
    state.cam.x += (tx - state.cam.x) * Math.min(1, dt * 2.2);
    state.cam.y += (ty - state.cam.y) * Math.min(1, dt * 2.2);

    // NPC walk
    if (!state.reducing) {
      state.npcs.forEach(n => {
        if (!n.speed) return;
        n.x += n.dir * n.speed * dt;
        if (n.x > 1.1) { n.x = -0.1; n.dir = 1; }
        if (n.x < -0.1) { n.x = 1.1; n.dir = -1; }
      });
    }

    const hour = Math.floor(state.minutes / 60);
    if (hour !== state.lastHour) {
      state.lastHour = hour;
      if (window.KharidaarAudio) window.KharidaarAudio.setMood(state.minutes / 60);
    }

    if (state.visible !== false) draw();
    if (state.bubble && performance.now() - state.bubble.born > 6100) state.bubble = null;
    requestAnimationFrame(tick);
  }

  let lastEmitted = -1;
  function emitTime() {
    const m = Math.round(state.minutes) % 1440;
    if (m === lastEmitted) return;
    lastEmitted = m;
    listeners.time.forEach(fn => { try { fn(m, phaseOf(m), state.auto || !!state.glide); } catch (e) {} });
  }

  /* ---------------- interaction ---------------- */
  function point(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function hitNpc(pt) {
    let best = null, bestD = Infinity;
    state.npcs.forEach(n => {
      if (!n.screen) return;
      const dx = pt.x - n.screen.x, dy = pt.y - n.screen.y;
      const d = Math.hypot(dx, dy * .8);
      if (d < n.screen.r && d < bestD) { best = n; bestD = d; }
    });
    return best;
  }

  function hitStall(pt) {
    return state.stalls.find(s => s.hit && pt.x >= s.hit.x && pt.x <= s.hit.x + s.hit.w && pt.y >= s.hit.y && pt.y <= s.hit.y + s.hit.h) || null;
  }

  canvas.addEventListener('pointermove', e => {
    const r = canvas.getBoundingClientRect();
    state.pointer.x = clamp((e.clientX - r.left) / r.width, 0, 1);
    state.pointer.y = clamp((e.clientY - r.top) / r.height, 0, 1);
    const pt = point(e);
    const npc = hitNpc(pt);
    const st = npc ? null : hitStall(pt);
    const next = st ? st.cat + st.x : null;
    const prev = state.hoverStall ? state.hoverStall.cat + state.hoverStall.x : null;
    if (next !== prev) state.hoverStall = st;
    canvas.style.cursor = npc || st ? 'pointer' : 'default';
  });

  canvas.addEventListener('pointerdown', e => {
    const pt = point(e);
    const npc = hitNpc(pt);
    if (npc) {
      const thought = state.thoughts[Math.floor(Math.random() * state.thoughts.length)] || THOUGHTS[0];
      state.bubble = { npc, text: thought, born: performance.now() };
      if (window.KharidaarAudio) window.KharidaarAudio.sfx('gossip');
      return;
    }
    const st = hitStall(pt);
    if (st) {
      if (window.KharidaarAudio) window.KharidaarAudio.sfx('click');
      listeners.stall.forEach(fn => { try { fn(st.cat); } catch (err) {} });
      return;
    }
    state.bubble = null;
  });

  canvas.addEventListener('pointerleave', () => { state.hoverStall = null; });

  /* ---------------- public API ---------------- */
  const api = {
    setTime(minutes, opts = {}) {
      state.glide = null;
      state.minutes = ((minutes % 1440) + 1440) % 1440;
      if (opts.stop) stopCycle();
      emitTime();
      draw();
    },
    glideTo(minutes, ms = 1800) {
      const target = ((minutes % 1440) + 1440) % 1440;
      let delta = target - state.minutes;
      if (delta < -720) delta += 1440;
      if (delta > 720) delta -= 1440;
      state.auto = false;
      state.glide = { from: state.minutes, delta, start: performance.now(), dur: ms };
    },
    startCycle(seconds = 32) {
      state.autoDur = seconds;
      state.auto = true;
      state.glide = null;
    },
    stopCycle() {
      state.auto = false;
      state.glide = null;
    },
    isCycling() { return state.auto || !!state.glide; },
    getTime() { return state.minutes; },
    getPhase() { return phaseOf(state.minutes); },
    phaseLabelKey() { return 'phase.' + phaseOf(state.minutes); },
    spawnCrowd(n = 8) {
      const rnd = seeded(Date.now());
      const start = state.npcs.length;
      for (let i = 0; i < n; i++) {
        const npc = makeNpc(rnd, start + i);
        npc.extra = true;
        npc.x = rnd();
        npc.speed = .02 + rnd() * .02;
        state.npcs.push(npc);
      }
      clearTimeout(this._crowdTimer);
      this._crowdTimer = setTimeout(() => {
        state.npcs = state.npcs.filter(n => !n.extra);
      }, 22000);
    },
    gossip() {
      const npc = state.npcs[Math.floor(Math.random() * state.npcs.length)];
      if (!npc) return null;
      const thought = state.thoughts[Math.floor(Math.random() * state.thoughts.length)] || THOUGHTS[0];
      state.bubble = { npc, text: thought, born: performance.now() };
      if (window.KharidaarAudio) window.KharidaarAudio.sfx('gossip');
      return thought;
    },
    setThoughts(list) {
      if (Array.isArray(list) && list.length) state.thoughts = list;
    },
    onTime(fn) { listeners.time.push(fn); },
    onStall(fn) { listeners.stall.push(fn); },
    getShoppers() { return state.npcs.length; },
    refresh: resize,
  };

  window.BazaarScene = api;

  canvas.addEventListener('dblclick', () => api.spawnCrowd(6));

  resize();
  const io = new IntersectionObserver(entries => {
    entries.forEach(en => { state.visible = en.isIntersecting; if (en.isIntersecting) draw(); });
  }, { threshold: 0 });
  io.observe(canvas);
  window.addEventListener('resize', () => { clearTimeout(window._bzR); window._bzR = setTimeout(resize, 160); });
  requestAnimationFrame(tick);
})();
