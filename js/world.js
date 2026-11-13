/* ============================================================
   Kharidaar — the 3D bazaar
   A small walkable world built with three.js (vendored).
   ============================================================ */
(function () {
  const D = window.KHARIDAAR_DATA;
  if (!D) return;

  const overlay = document.getElementById('world');
  const canvas = document.getElementById('worldCanvas');
  const loading = document.getElementById('worldLoading');
  const prompt = document.getElementById('worldPrompt');
  const promptCat = document.getElementById('worldPromptCat');
  const browseBtn = document.getElementById('worldBrowse');
  const shelf = document.getElementById('worldShelf');
  const shelfTitle = document.getElementById('worldShelfTitle');
  const shelfBody = document.getElementById('worldShelfBody');
  const shelfFoot = document.getElementById('worldShelfFoot');
  const pad = document.getElementById('worldPad');
  const padKnob = pad ? pad.querySelector('i') : null;
  const cartBtn = document.getElementById('worldCartBtn');
  const cartCount = document.getElementById('worldCartCount');
  const helpBtn = document.getElementById('worldHelpBtn');
  const helpPop = document.getElementById('worldHelp');
  const exitBtn = document.getElementById('worldExit');
  if (!overlay || !canvas) return;

  const t = (key, vars) => (window.t ? window.t(key, vars) : key);
  const L = () => window.KharidaarL10n;
  const basket = () => window.KharidaarBasket;
  const lang = () => document.documentElement.dataset.lang || 'en';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let THREE = null;
  let threePromise = null;
  let active = false;
  let built = false;
  let raf = 0;
  let last = 0;
  let time = 0;

  let renderer, scene, camera, clock;
  let player = null;
  const pos = { x: 0, z: 12.4 };
  let yaw = 0;
  let pitch = -0.02;
  let moveSpeed = 0;
  let bob = 0;

  let nightMix = document.documentElement.dataset.theme === 'dark' ? 1 : 0;
  let nightTarget = nightMix;
  let tab = 0;

  const stalls = [];
  const people = [];
  const clouds = [];
  const lampMats = [];
  const signs = [];
  let cart = null;
  let cartOn = false;
  let cartItems = [];
  let stars = null;
  let fireflies = null;
  let sun = null;
  let moon = null;
  let sky = null;
  let hemi = null;
  let dir = null;
  const laneLights = [];
  let nearest = null;
  let shelfStall = null;

  const keys = Object.create(null);
  const joy = { x: 0, y: 0, live: false, id: null };

  /* ---------------- helpers ---------------- */
  function hexColor(hex) { return new THREE.Color(hex); }
  function disposeGroup(obj) {
    obj.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
      }
    });
  }
  function catName(key) {
    const c = D.categories[key] || {};
    return lang() === 'hi' ? (c.hi || c.en || key) : (c.en || key);
  }
  function itemName(it) {
    return lang() === 'hi' ? (it.hi || it.name) : it.name;
  }
  function itemEmoji(it) {
    return window.KharidaarL10n ? window.KharidaarL10n.itemEmoji(it) : '🛒';
  }
  function money(n) {
    if (n == null) return '₹—';
    return '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n);
  }

  /* ---------------- textures ---------------- */
  const emojiCache = new Map();
  function emojiTexture(char) {
    if (emojiCache.has(char)) return emojiCache.get(char);
    const size = 128;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '92px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
    ctx.fillText(char, size / 2, size / 2 + 4);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    emojiCache.set(char, tex);
    return tex;
  }

  function signTexture(emoji, label, accent) {
    const w = 1024, h = 256;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#f7e8ce';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, w, 16);
    ctx.fillRect(0, h - 16, w, 16);
    ctx.strokeStyle = 'rgba(72,50,30,.32)';
    ctx.lineWidth = 6;
    ctx.strokeRect(10, 10, w - 20, h - 20);
    ctx.textBaseline = 'middle';
    ctx.font = '104px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(emoji, 54, h / 2 + 4);
    ctx.fillStyle = '#3b2c20';
    ctx.font = '700 84px Fraunces, Georgia, serif';
    ctx.fillText(label.toUpperCase(), 196, h / 2 - 8);
    ctx.fillStyle = 'rgba(59,44,32,.55)';
    ctx.font = '600 26px Outfit, sans-serif';
    ctx.fillText('KHARIDAAR · LIVE PRICE BAZAAR', 200, h / 2 + 62);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }

  function archTexture() {
    const w = 1024, h = 220;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#1d1712'); g.addColorStop(1, '#2c231a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,190,110,.65)';
    ctx.lineWidth = 5;
    ctx.strokeRect(12, 12, w - 24, h - 24);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffe0a8';
    ctx.font = '700 78px Fraunces, Georgia, serif';
    ctx.fillText('KHARIDAAR BAZAAR', w / 2, h / 2 - 8);
    ctx.fillStyle = 'rgba(255,224,168,.62)';
    ctx.font = '600 24px Outfit, sans-serif';
    ctx.fillText('EVERY RUPEE HAS A STORY · WALK IN', w / 2, h / 2 + 62);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }

  function floorTexture() {
    const s = 256;
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#d9c3a3';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 220; i++) {
      ctx.fillStyle = `rgba(120,86,52,${Math.random() * .05})`;
      ctx.fillRect(Math.random() * s, Math.random() * s, 2 + Math.random() * 5, 2 + Math.random() * 5);
    }
    ctx.strokeStyle = 'rgba(110,78,48,.18)';
    ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, s, s);
    ctx.beginPath();
    ctx.moveTo(s / 2, 0); ctx.lineTo(s / 2, s);
    ctx.strokeStyle = 'rgba(110,78,48,.1)';
    ctx.stroke();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(16, 16);
    tex.anisotropy = 4;
    return tex;
  }

  /* ---------------- build ---------------- */
  function build() {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    scene = new THREE.Scene();
    scene.background = hexColor('#eadcc4');
    scene.fog = new THREE.Fog(0xeadcc4, 20, 52);

    camera = new THREE.PerspectiveCamera(58, 1, 0.08, 140);
    camera.rotation.order = 'YXZ';

    clock = new THREE.Clock();

    buildSky();
    buildGround();
    buildArch();
    buildLights();
    buildStalls();
    buildPeople();
    buildCart();
    bindWorldEvents();

    player = { pos };
    nightTarget = document.documentElement.dataset.theme === 'dark' ? 1 : 0;
    nightMix = nightTarget;
    updateNight(0, true);
  }

  function buildSky() {
    sky = new THREE.Mesh(
      new THREE.SphereGeometry(90, 28, 18),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          topColor: { value: hexColor('#bcd9e6') },
          bottomColor: { value: hexColor('#f7e4c2') },
          offset: { value: 12 },
          exponent: { value: 0.82 },
        },
        vertexShader: `varying vec3 vWorld; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vWorld = w.xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 topColor; uniform vec3 bottomColor; uniform float offset; uniform float exponent; varying vec3 vWorld; void main(){ float h = normalize(vWorld + vec3(0.0, offset, 0.0)).y; float f = pow(max(h, 0.0), exponent); gl_FragColor = vec4(mix(bottomColor, topColor, f), 1.0); }`,
      })
    );
    scene.add(sky);

    sun = new THREE.Mesh(
      new THREE.CircleGeometry(3.4, 40),
      new THREE.MeshBasicMaterial({ color: 0xfff0c2, transparent: true, fog: false })
    );
    sun.position.set(-19, 25, -62);
    scene.add(sun);

    moon = new THREE.Mesh(
      new THREE.CircleGeometry(2.2, 32),
      new THREE.MeshBasicMaterial({ color: 0xf4f0ff, transparent: true, opacity: 0, fog: false })
    );
    moon.position.set(20, 24, -62);
    scene.add(moon);

    const starGeo = new THREE.BufferGeometry();
    const pts = [];
    for (let i = 0; i < 420; i++) {
      const a = Math.random() * Math.PI * 2;
      const y = 8 + Math.random() * 62;
      const r = 74;
      pts.push(Math.cos(a) * r, y, Math.sin(a) * r);
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
      color: 0xfff4dc, size: 0.42, transparent: true, opacity: 0, depthWrite: false, fog: false,
    }));
    scene.add(stars);

    // fireflies near the lane at night
    const ffGeo = new THREE.BufferGeometry();
    const ff = [];
    for (let i = 0; i < 70; i++) {
      ff.push((Math.random() - .5) * 11, .4 + Math.random() * 2.4, 8 - Math.random() * 34);
    }
    ffGeo.setAttribute('position', new THREE.Float32BufferAttribute(ff, 3));
    fireflies = new THREE.Points(ffGeo, new THREE.PointsMaterial({
      color: 0xffd27a, size: 0.12, transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    scene.add(fireflies);

    // clouds
    const cloudMat = new THREE.MeshLambertMaterial({ color: 0xfff6e8, transparent: true, opacity: .85 });
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Group();
      const n = 3 + Math.floor(Math.random() * 3);
      for (let j = 0; j < n; j++) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), i === 0 ? cloudMat : cloudMat.clone());
        m.scale.set(2.6 + Math.random() * 2.4, .55 + Math.random() * .3, 1.5);
        m.position.set((j - n / 2) * 2.4, Math.random() * .4, Math.random() * 1.4);
        g.add(m);
      }
      g.position.set(-28 + Math.random() * 56, 17 + Math.random() * 9, -34 - Math.random() * 20);
      scene.add(g);
      clouds.push(g);
    }
  }

  function buildGround() {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(76, 76),
      new THREE.MeshLambertMaterial({ map: floorTexture(), color: 0xffffff })
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    const lane = new THREE.Mesh(
      new THREE.PlaneGeometry(7.2, 44),
      new THREE.MeshLambertMaterial({ color: 0xc9ad87 })
    );
    lane.rotation.x = -Math.PI / 2;
    lane.position.set(0, 0.012, -8);
    scene.add(lane);

    const edgeMat = new THREE.MeshLambertMaterial({ color: 0xb08c62 });
    [-3.7, 3.7].forEach(x => {
      const curb = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 44), edgeMat);
      curb.position.set(x, 0.06, -8);
      scene.add(curb);
    });

    // faint pools of light / wear on the lane
    const stainMat = new THREE.MeshBasicMaterial({ color: 0x8e6c48, transparent: true, opacity: .08, depthWrite: false });
    for (let i = 0; i < 9; i++) {
      const s = new THREE.Mesh(new THREE.CircleGeometry(0.5 + Math.random() * 0.9, 18), stainMat);
      s.rotation.x = -Math.PI / 2;
      s.position.set((Math.random() - .5) * 6, 0.016, 6 - Math.random() * 32);
      scene.add(s);
    }
  }

  function buildArch() {
    const wood = new THREE.MeshLambertMaterial({ color: 0x6f4a2c });
    const dark = new THREE.MeshLambertMaterial({ color: 0x3f2c1c });
    [-4.3, 4.3].forEach(x => {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.62, 4.4, 0.62), wood);
      p.position.set(x, 2.2, 9.6);
      scene.add(p);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.18, 0.86), dark);
      cap.position.set(x, 4.48, 9.6);
      scene.add(cap);
    });
    const beam = new THREE.Mesh(new THREE.BoxGeometry(9.3, 0.55, 0.62), wood);
    beam.position.set(0, 4.55, 9.6);
    scene.add(beam);

    const signMat = new THREE.MeshBasicMaterial({ map: archTexture() });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 1.38), signMat);
    sign.position.set(0, 5.35, 9.72);
    scene.add(sign);

    const signBack = new THREE.Mesh(new THREE.BoxGeometry(6.6, 1.55, 0.16), dark);
    signBack.position.set(0, 5.35, 9.54);
    scene.add(signBack);

    // marigold garland
    const garlandMat = new THREE.MeshBasicMaterial({ color: 0xff9d2e });
    const geo = new THREE.SphereGeometry(0.075, 6, 5);
    for (let i = 0; i < 46; i++) {
      const p = new THREE.Mesh(geo, garlandMat);
      const x = -4 + (i / 45) * 8;
      p.position.set(x, 4.12 - Math.sin((i / 45) * Math.PI) * .55, 9.25);
      scene.add(p);
    }
  }

  function buildLights() {
    hemi = new THREE.HemisphereLight(0xfff2d8, 0x7a5a3a, 1.15);
    scene.add(hemi);

    dir = new THREE.DirectionalLight(0xfff0cc, 1.45);
    dir.position.set(14, 22, 10);
    scene.add(dir);

    const fill = new THREE.DirectionalLight(0xffd9a8, 0.35);
    fill.position.set(-12, 8, -16);
    scene.add(fill);

    [-3, 1, -9, -17, -24].forEach(z => {
      const l = new THREE.PointLight(0xffb060, 0, 16, 2);
      l.position.set(0, 3.1, z);
      scene.add(l);
      laneLights.push(l);
    });
  }

  function makeProduct(item, accent) {
    const g = new THREE.Group();
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.42, 0.22),
      new THREE.MeshLambertMaterial({ color: new THREE.Color(accent).offsetHSL(0, 0, .12) })
    );
    g.add(box);
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(0.34, 0.34),
      new THREE.MeshBasicMaterial({ map: emojiTexture(itemEmoji(item)), transparent: true, depthWrite: false })
    );
    label.position.set(0, 0.02, 0.115);
    g.add(label);
    return g;
  }

  function buildStall(catKey, index, side, z) {
    const cat = D.categories[catKey] || {};
    const accent = cat.color || '#d84a22';
    const items = D.items.filter(it => it.category === catKey);
    const g = new THREE.Group();
    g.position.set(side * 6.15, 0, z);
    g.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;

    const wood = new THREE.MeshLambertMaterial({ color: 0x8a5f3c });
    const woodDark = new THREE.MeshLambertMaterial({ color: 0x65452b });
    const plaster = new THREE.MeshLambertMaterial({ color: 0xf0e3cc });
    const accentMat = new THREE.MeshLambertMaterial({ color: hexColor(accent) });
    const cream = new THREE.MeshLambertMaterial({ color: 0xfff3d9 });

    // platform and walls
    const platform = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.14, 2.7), woodDark);
    platform.position.set(0, 0.07, 0.1);
    g.add(platform);

    const back = new THREE.Mesh(new THREE.BoxGeometry(5.5, 2.9, 0.16), plaster);
    back.position.set(0, 1.47, -1.2);
    g.add(back);

    [-2.7, 2.7].forEach(x => {
      const w = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.9, 1.5), wood);
      w.position.set(x, 1.47, -0.5);
      g.add(w);
    });

    // shelves + goods
    const shelfYs = [1.18, 1.6, 2.02];
    const goods = [];
    for (let s = 0; s < 3; s++) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(5.1, 0.08, 0.62), wood);
      plank.position.set(0, shelfYs[s], -0.92);
      g.add(plank);
      for (let k = 0; k < 3; k++) {
        const it = items[(s * 3 + k) % Math.max(1, items.length)];
        if (!it) continue;
        const product = makeProduct(it, accent);
        product.position.set(-1.7 + k * 1.7, shelfYs[s] + 0.26, -0.9);
        product.rotation.y = (Math.random() - .5) * .25;
        g.add(product);
        goods.push(product);
      }
    }

    // price tickets on the shelf edge
    for (let s = 0; s < 3; s++) {
      const ticket = new THREE.Mesh(
        new THREE.PlaneGeometry(0.5, 0.16),
        new THREE.MeshBasicMaterial({ color: 0xfff6e2 })
      );
      ticket.position.set(1.1, shelfYs[s] - 0.02, -0.58);
      g.add(ticket);
    }

    // counter
    const counter = new THREE.Mesh(new THREE.BoxGeometry(5.5, 1.0, 1.05), wood);
    counter.position.set(0, 0.5, 0.62);
    g.add(counter);
    const counterTop = new THREE.Mesh(new THREE.BoxGeometry(5.7, 0.09, 1.2), woodDark);
    counterTop.position.set(0, 1.05, 0.62);
    g.add(counterTop);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(5.1, 0.66, 0.06), accentMat);
    panel.position.set(0, 0.55, 1.16);
    g.add(panel);

    // counter goods: a crate + two loose products
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.26, 0.5), woodDark);
    crate.position.set(-1.9, 1.22, 0.62);
    g.add(crate);
    for (let k = 0; k < 3; k++) {
      const it = items[(k + 4) % Math.max(1, items.length)];
      if (!it) continue;
      const p = makeProduct(it, accent);
      p.position.set(-2.05 + k * .17, 1.46, .6);
      p.scale.setScalar(.72);
      g.add(p);
    }
    for (let k = 0; k < 2; k++) {
      const it = items[(k + 9) % Math.max(1, items.length)];
      if (!it) continue;
      const p = makeProduct(it, accent);
      p.position.set(1.1 + k * .5, 1.3, 0.62);
      p.rotation.y = .3 - k * .4;
      g.add(p);
    }

    // awning
    const awning = new THREE.Group();
    awning.position.set(0, 2.95, 0.5);
    awning.rotation.x = -0.16;
    const strips = 8;
    for (let i = 0; i < strips; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(5.6 / strips + .01, .07, 2.1), i % 2 ? cream : accentMat);
      m.position.set(-2.8 + (i + .5) * (5.6 / strips), 0, 0);
      awning.add(m);
    }
    for (let i = 0; i < strips; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(5.6 / strips + .01, .22, .06), i % 2 ? cream : accentMat);
      m.position.set(-2.8 + (i + .5) * (5.6 / strips), -.12, 1.06);
      awning.add(m);
    }
    g.add(awning);

    const awningPole = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, 3.2, 6), woodDark);
    awningPole.position.set(0, 1.55, 1.5);
    g.add(awningPole);

    // sign
    const signTex = signTexture(cat.emoji || '🛒', catName(catKey), accent);
    const signMat = new THREE.MeshBasicMaterial({ map: signTex });
    const signBoard = new THREE.Mesh(new THREE.BoxGeometry(4.1, 1.06, .1), woodDark);
    signBoard.position.set(0, 3.62, .1);
    g.add(signBoard);
    const signFace = new THREE.Mesh(new THREE.PlaneGeometry(3.96, .95), signMat);
    signFace.position.set(0, 3.62, .17);
    g.add(signFace);
    signs.push({ mat: signMat, catKey, accent });

    // hanging bulbs
    for (let i = 0; i < 4; i++) {
      const lx = -1.9 + i * 1.26;
      const wire = new THREE.Mesh(
        new THREE.CylinderGeometry(.008, .008, .42, 4),
        new THREE.MeshBasicMaterial({ color: 0x2b2119 })
      );
      wire.position.set(lx, 2.66, 0.35);
      g.add(wire);
      const bulbMat = new THREE.MeshBasicMaterial({ color: 0xd8c39d });
      lampMats.push(bulbMat);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(.09, 10, 8), bulbMat);
      bulb.position.set(lx, 2.43, .35);
      g.add(bulb);
    }

    // shopkeeper behind the counter
    const keeper = makePerson({
      shirt: accent,
      pants: 0x3c332c,
      skin: [0xb97b52, 0x8d5a36, 0xd0996f][index % 3],
      apron: 0xfff3dd,
    });
    keeper.position.set(0.15, 0, -0.42);
    keeper.rotation.y = 0.05;
    g.add(keeper);
    g.userData.keeper = keeper;

    // baskets under the counter
    const basketMat = new THREE.MeshLambertMaterial({ color: 0xb98b56 });
    [-1.6, 1.5].forEach((x, i) => {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(.3, .23, .26, 10), basketMat);
      b.position.set(x, .27, 1.28);
      g.add(b);
    });

    scene.add(g);
    stalls.push({
      group: g, catKey, side, z, x: side * 6.15,
      hx: side * 4.75, hz: z,
      face: side < 0 ? Math.PI / 2 : -Math.PI / 2,
      sign: signMat,
      goods,
    });
  }

  function buildStalls() {
    const keys = Object.keys(D.categories);
    const left = [4.6, -3.6, -11.8, -19.8];
    const right = [0.6, -7.6, -15.8, -23.6];
    keys.slice(0, 8).forEach((key, i) => {
      const isLeft = i % 2 === 0;
      const idx = Math.floor(i / 2);
      buildStall(key, i, isLeft ? -1 : 1, isLeft ? left[idx] : right[idx]);
    });
  }

  function makePerson(opt = {}) {
    const g = new THREE.Group();
    const shirt = new THREE.MeshLambertMaterial({ color: opt.shirt ?? 0xd8733f });
    const pants = new THREE.MeshLambertMaterial({ color: opt.pants ?? 0x4b463d });
    const skin = new THREE.MeshLambertMaterial({ color: opt.skin ?? 0xc78a5d });
    const hair = new THREE.MeshLambertMaterial({ color: opt.hair ?? 0x2c2119 });

    const legGeo = new THREE.BoxGeometry(.15, .5, .18);
    const legL = new THREE.Mesh(legGeo, pants);
    legL.position.set(-.12, .27, 0);
    const legR = legL.clone();
    legR.position.x = .12;
    g.add(legL, legR);

    const torso = new THREE.Mesh(new THREE.BoxGeometry(.44, .6, .26), shirt);
    torso.position.set(0, .82, 0);
    g.add(torso);

    if (opt.apron) {
      const apron = new THREE.Mesh(new THREE.BoxGeometry(.34, .5, .02), new THREE.MeshLambertMaterial({ color: opt.apron }));
      apron.position.set(0, .78, .14);
      g.add(apron);
    }

    const armGeo = new THREE.BoxGeometry(.1, .48, .12);
    const armL = new THREE.Mesh(armGeo, shirt);
    armL.position.set(-.28, .84, 0);
    const armR = armL.clone();
    armR.position.x = .28;
    g.add(armL, armR);

    const head = new THREE.Mesh(new THREE.SphereGeometry(.17, 12, 10), skin);
    head.position.set(0, 1.28, 0);
    g.add(head);

    const hairMesh = new THREE.Mesh(new THREE.SphereGeometry(.175, 12, 10), hair);
    hairMesh.scale.set(1, .72, 1);
    hairMesh.position.set(0, 1.36, -.015);
    g.add(hairMesh);

    const nose = new THREE.Mesh(new THREE.ConeGeometry(.03, .07, 6), skin);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 1.27, .17);
    g.add(nose);

    if (opt.scarf) {
      const scarf = new THREE.Mesh(new THREE.TorusGeometry(.16, .035, 6, 12), new THREE.MeshLambertMaterial({ color: opt.scarf }));
      scarf.rotation.x = Math.PI / 2;
      scarf.position.set(0, 1.11, 0);
      g.add(scarf);
    }

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(.3, 14),
      new THREE.MeshBasicMaterial({ color: 0x2b1c10, transparent: true, opacity: .18, depthWrite: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = .012;
    g.add(shadow);

    g.userData = { legL, legR, armL, armR, torso, head };
    return g;
  }

  function buildPeople() {
    const palette = [0xd8733f, 0x2a9d8f, 0x4a90d9, 0xd1495b, 0x7b6cd9, 0xe08e2b, 0x5b8c5a, 0xc46b2e];
    for (let i = 0; i < 10; i++) {
      const p = makePerson({
        shirt: palette[i % palette.length],
        pants: [0x3d3a34, 0x55483c, 0x2f3a45][i % 3],
        skin: [0xb97b52, 0x8d5a36, 0xd0996f, 0x6f452a][i % 4],
        scarf: i % 3 === 0 ? palette[(i + 2) % palette.length] : null,
      });
      const lane = (Math.random() - .5) * 5.2;
      p.position.set(lane, 0, 8 - Math.random() * 30);
      if (i % 4 === 0) p.scale.setScalar(.82);
      scene.add(p);
      people.push({
        mesh: p,
        baseX: lane,
        z: p.position.z,
        dir: Math.random() > .5 ? 1 : -1,
        speed: .45 + Math.random() * .55,
        phase: Math.random() * 6.28,
        swerve: .35 + Math.random() * .5,
      });
    }
    // two browsers standing near shelves
    for (let i = 0; i < 2; i++) {
      const p = makePerson({ shirt: palette[(i + 4) % palette.length], skin: 0xb97b52 });
      p.position.set(i ? 3.5 : -3.5, 0, i ? -7 : -12);
      p.rotation.y = i ? -Math.PI / 2 : Math.PI / 2;
      scene.add(p);
      people.push({ mesh: p, baseX: p.position.x, z: p.position.z, dir: 0, speed: 0, phase: i * 2, swerve: 0 });
    }
  }

  function buildCart() {
    cart = new THREE.Group();
    const metal = new THREE.MeshLambertMaterial({ color: 0xb9c0c7 });
    const metalDark = new THREE.MeshLambertMaterial({ color: 0x747d86 });
    const accent = new THREE.MeshLambertMaterial({ color: 0xd84a22 });

    const bottom = new THREE.Mesh(new THREE.BoxGeometry(.78, .05, 1.05), metal);
    bottom.position.y = .46;
    cart.add(bottom);
    const sideGeo = new THREE.BoxGeometry(.04, .44, 1.05);
    [-.39, .39].forEach(x => {
      const s = new THREE.Mesh(sideGeo, metal);
      s.position.set(x, .69, 0);
      cart.add(s);
    });
    const endGeo = new THREE.BoxGeometry(.78, .44, .04);
    [-.52, .52].forEach(z => {
      const e = new THREE.Mesh(endGeo, metal);
      e.position.set(0, .69, z);
      cart.add(e);
    });
    // rails
    [-.16, .06].forEach(y => {
      const r = new THREE.Mesh(new THREE.BoxGeometry(.82, .03, .03), metalDark);
      r.position.set(0, .69 + y, .54);
      cart.add(r);
    });
    // wheels
    const wheelGeo = new THREE.CylinderGeometry(.12, .12, .06, 12);
    [[-.33, -.42], [.33, -.42], [-.33, .42], [.33, .42]].forEach(([x, z]) => {
      const w = new THREE.Mesh(wheelGeo, metalDark);
      w.rotation.z = Math.PI / 2;
      w.position.set(x, .13, z);
      cart.add(w);
    });
    // handle
    const handleBar = new THREE.Mesh(new THREE.BoxGeometry(.66, .05, .05), metalDark);
    handleBar.position.set(0, 1.02, -.58);
    cart.add(handleBar);
    [-.3, .3].forEach(x => {
      const h = new THREE.Mesh(new THREE.CylinderGeometry(.022, .022, .4, 6), metalDark);
      h.position.set(x, .84, -.58);
      h.rotation.x = .18;
      cart.add(h);
    });
    // flag so it is easy to spot
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(.34, .2), accent);
    flag.position.set(.42, 1.24, -.1);
    flag.rotation.y = Math.PI / 2;
    cart.add(flag);

    cartItems = [];
    const colors = [0xe4572e, 0x4a90d9, 0x2a9d8f, 0xe0a52b, 0xd1495b, 0x8a5f3c];
    for (let i = 0; i < 6; i++) {
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(.2 + (i % 2) * .08, .18, .18),
        new THREE.MeshLambertMaterial({ color: colors[i] })
      );
      box.position.set((i % 3 - 1) * .22, .58 + Math.floor(i / 3) * .16, .1 - (i % 2) * .3);
      box.visible = false;
      cart.add(box);
      cartItems.push(box);
    }
    cart.position.set(0, 0, 13.6);
    cart.visible = false;
    scene.add(cart);
  }

  /* ---------------- input & UI ---------------- */
  function isTyping() {
    const el = document.activeElement;
    return el && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName);
  }

  function bindWorldEvents() {
    exitBtn.addEventListener('click', () => close());
    browseBtn.addEventListener('click', () => { if (nearest) openShelf(nearest); });
    document.getElementById('worldShelfClose').addEventListener('click', closeShelf);
    cartBtn.addEventListener('click', () => setCart(!cartOn));
    helpBtn.addEventListener('click', () => { helpPop.hidden = !helpPop.hidden; });

    shelfBody.addEventListener('click', e => {
      const btn = e.target.closest('[data-ws-add]');
      if (!btn) return;
      const id = btn.dataset.wsAdd;
      if (window.KharidaarBasket) window.KharidaarBasket.add(id);
      btn.classList.add('is-added');
      btn.innerHTML = '<svg><use href="#i-check"/></svg>';
      if (!cartOn) setCart(true);
      updateCartHud();
    });

    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeShelf();
    });

    // drag to look
    let dragging = false, lastX = 0, lastY = 0, dragId = null;
    canvas.addEventListener('pointerdown', e => {
      if (!shelf.hidden) return;
      dragging = true; dragId = e.pointerId;
      lastX = e.clientX; lastY = e.clientY;
      canvas.classList.add('is-dragging');
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', e => {
      if (!dragging || e.pointerId !== dragId) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      yaw -= dx * 0.0032;
      pitch = Math.max(-0.58, Math.min(0.48, pitch - dy * 0.0024));
    });
    const endDrag = e => {
      if (e.pointerId !== dragId) return;
      dragging = false; dragId = null;
      canvas.classList.remove('is-dragging');
    };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    // joystick
    if (pad) {
      let padId = null, cx = 0, cy = 0;
      pad.addEventListener('pointerdown', e => {
        if (!shelf.hidden) return;
        padId = e.pointerId;
        const r = pad.getBoundingClientRect();
        cx = r.left + r.width / 2; cy = r.top + r.height / 2;
        joy.live = true;
        pad.classList.add('is-live');
        pad.setPointerCapture(e.pointerId);
        movePad(e);
      });
      pad.addEventListener('pointermove', e => { if (e.pointerId === padId) movePad(e); });
      const endPad = e => {
        if (e.pointerId !== padId) return;
        padId = null; joy.live = false; joy.x = 0; joy.y = 0;
        pad.classList.remove('is-live');
        if (padKnob) padKnob.style.transform = '';
      };
      pad.addEventListener('pointerup', endPad);
      pad.addEventListener('pointercancel', endPad);
      function movePad(e) {
        const max = 34;
        let dx = e.clientX - cx, dy = e.clientY - cy;
        const d = Math.hypot(dx, dy) || 1;
        if (d > max) { dx = dx / d * max; dy = dy / d * max; }
        joy.x = dx / max; joy.y = dy / max;
        if (padKnob) padKnob.style.transform = `translate(${dx}px, ${dy}px)`;
      }
    }

    // keyboard (capture so page shortcuts do not fire while walking)
    document.addEventListener('keydown', e => {
      if (!active) return;
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'e', 'c', 'escape'].includes(k)) {
        e.stopPropagation();
        if (k === ' ' || k.startsWith('arrow')) e.preventDefault();
      }
      if (isTyping()) return;
      keys[k] = true;
      if (k === 'e') { if (!nearest) return; shelf.hidden ? openShelf(nearest) : closeShelf(); }
      if (k === 'c') setCart(!cartOn);
      if (k === 'escape') { if (!shelf.hidden) closeShelf(); else close(); }
      if (k === '?') helpPop.hidden = !helpPop.hidden;
    }, true);
    document.addEventListener('keyup', e => {
      if (!active) return;
      keys[e.key.toLowerCase()] = false;
    }, true);
    window.addEventListener('blur', () => {
      for (const k in keys) keys[k] = false;
      joy.x = joy.y = 0; joy.live = false;
    });

    // theme / language sync
    new MutationObserver(() => {
      nightTarget = document.documentElement.dataset.theme === 'dark' ? 1 : 0;
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    new MutationObserver(() => {
      signs.forEach(s => {
        const tex = signTexture(D.categories[s.catKey].emoji || '🛒', catName(s.catKey), s.accent);
        s.mat.map.dispose();
        s.mat.map = tex;
        s.mat.needsUpdate = true;
      });
      if (!shelf.hidden && shelfStall) renderShelf(shelfStall);
      if (nearest) promptCat.textContent = t('world.browse', { cat: catName(nearest.catKey) });
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-lang'] });

    // resize
    window.addEventListener('resize', () => { if (active && renderer) resize(); });
  }

  function setCart(on) {
    cartOn = on;
    if (cart) cart.visible = on;
    cartBtn.classList.toggle('is-on', on);
    cartBtn.setAttribute('aria-pressed', String(on));
    cartBtn.title = t(on ? 'world.cartOn' : 'world.cartOff');
  }

  function updateCartHud() {
    const n = window.KharidaarBasket ? window.KharidaarBasket.count() : 0;
    if (cartCount) cartCount.textContent = n;
    if (cartItems.length) cartItems.forEach((m, i) => { m.visible = i < Math.min(n, 6); });
  }

  function openShelf(stall) {
    shelfStall = stall;
    renderShelf(stall);
    shelf.hidden = false;
    prompt.hidden = true;
    if (window.KharidaarAudio) window.KharidaarAudio.sfx('open');
  }

  function renderShelf(stall) {
    const cat = D.categories[stall.catKey] || {};
    const items = D.items.filter(it => it.category === stall.catKey).slice(0, 6);
    shelfTitle.textContent = `${cat.emoji || '🛒'} ${catName(stall.catKey)}`;
    shelfBody.innerHTML = items.map(it => {
      const has = window.KharidaarBasket && window.KharidaarBasket.has(it.id);
      return `<div class="ws-row">
        <span class="ws-emoji" aria-hidden="true">${itemEmoji(it)}</span>
        <div class="ws-info">
          <h4>${escapeHtml(itemName(it))}</h4>
          <p>${money(it.latest)}${it.unit ? ' / ' + escapeHtml(it.unit) : ''}</p>
        </div>
        <button class="ws-add ${has ? 'is-added' : ''}" type="button" data-ws-add="${escapeHtml(it.id)}" aria-label="${escapeHtml(t('market.add'))}" title="${escapeHtml(t('market.add'))}">
          <svg><use href="#i-${has ? 'check' : 'plus'}"/></svg>
        </button>
      </div>`;
    }).join('');
    shelfFoot.textContent = items.length ? t('basket.note') : t('world.stock');
  }

  function closeShelf() {
    shelf.hidden = true;
    shelfStall = null;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function resize() {
    const w = overlay.clientWidth || window.innerWidth;
    const h = overlay.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  /* ---------------- open / close ---------------- */
  async function open() {
    if (active) return;
    active = true;
    closeShelf();
    prompt.hidden = true;
    helpPop.hidden = true;
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('world-open');
    requestAnimationFrame(() => overlay.classList.add('is-open'));
    loading.classList.remove('is-done');
    loading.style.display = '';
    if (window.KharidaarAudio) window.KharidaarAudio.sfx('open');
    if (!window.KharidaarAudio) { /* no-op */ }

    try {
      if (!threePromise) threePromise = window.THREE ? Promise.resolve(window.THREE) : new Promise((res, rej) => {
        const sc = document.createElement('script');
        sc.src = 'js/vendor/three.classic.js';
        sc.onload = () => (window.THREE ? res(window.THREE) : rej(new Error('THREE missing')));
        sc.onerror = () => rej(new Error('three.js failed to load'));
        document.head.appendChild(sc);
      });
      THREE = await threePromise;
      if (!built) { build(); built = true; }
      resize();
      updateCartHud();
      setCart(cartOn);
      updatePrompt(true);
      last = 0;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(loop);
      setTimeout(() => loading.classList.add('is-done'), 380);
      setTimeout(() => { if (built) loading.style.display = 'none'; }, 1100);
    } catch (err) {
      console.error('Kharidaar 3D: could not start', err);
      loading.innerHTML = '<p style="max-width:34ch;text-align:center;line-height:1.6">The 3D bazaar could not start.<br>You can still browse the price board.</p>';
    }
  }

  function close() {
    if (!active) return;
    active = false;
    cancelAnimationFrame(raf); raf = 0;
    overlay.classList.remove('is-open');
    document.body.classList.remove('world-open');
    closeShelf();
    helpPop.hidden = true;
    for (const k in keys) keys[k] = false;
    joy.x = joy.y = 0; joy.live = false;
    setTimeout(() => {
      if (!active) {
        overlay.hidden = true;
        overlay.setAttribute('aria-hidden', 'true');
      }
    }, 450);
  }

  /* ---------------- update ---------------- */
  function updatePrompt(force) {
    if (active && !shelf.hidden) { prompt.hidden = true; return; }
    let best = null, bestD = 2.9;
    for (const s of stalls) {
      const dx = pos.x - s.hx;
      const dz = pos.z - s.hz;
      const d = Math.hypot(dx, dz);
      if (d < bestD) { bestD = d; best = s; }
    }
    if (best !== nearest || force) {
      nearest = best;
      if (!best) { prompt.hidden = true; }
      else {
        promptCat.textContent = t('world.browse', { cat: catName(best.catKey) });
        prompt.hidden = false;
      }
    }
  }

  function updatePlayer(dt) {
    const f = (keys.w || keys.arrowup ? 1 : 0) - (keys.s || keys.arrowdown ? 1 : 0) - joy.y;
    const r = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0) + joy.x;
    const len = Math.hypot(f, r);
    const sprint = keys.shift ? 1.5 : 1;
    const target = len > 0 ? 3.1 * sprint : 0;
    moveSpeed += (target - moveSpeed) * Math.min(1, dt * 8);
    if (len > 0.01 && shelf.hidden) {
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      const rx = Math.cos(yaw), rz = -Math.sin(yaw);
      const nx = (fx * f + rx * r) / len;
      const nz = (fz * f + rz * r) / len;
      pos.x += nx * moveSpeed * dt;
      pos.z += nz * moveSpeed * dt;
      pos.x = Math.max(-3.45, Math.min(3.45, pos.x));
      pos.z = Math.max(-25.4, Math.min(13.2, pos.z));
      bob += dt * 10 * sprint;
    }
    const sway = Math.sin(bob) * 0.035 * Math.min(1, moveSpeed / 2);
    camera.position.set(pos.x, 1.63 + sway, pos.z);
    camera.rotation.set(pitch, yaw, 0);
  }

  function updatePeople(dt) {
    for (const p of people) {
      if (!p.speed) {
        p.mesh.rotation.z = Math.sin(time * .8 + p.phase) * .015;
        continue;
      }
      p.z += p.dir * p.speed * dt;
      if (p.z > 10) { p.z = -24; p.baseX = (Math.random() - .5) * 5.2; }
      if (p.z < -26) { p.z = 9; p.baseX = (Math.random() - .5) * 5.2; }
      p.mesh.position.x = p.baseX + Math.sin(time * .5 + p.phase) * p.swerve;
      p.mesh.position.z = p.z;
      p.mesh.rotation.y = p.dir > 0 ? Math.PI : 0;
      const swing = Math.sin(time * 7 + p.phase) * .45;
      const u = p.mesh.userData;
      if (u.legL) {
        u.legL.rotation.x = swing;
        u.legR.rotation.x = -swing;
        u.armL.rotation.x = -swing * .7;
        u.armR.rotation.x = swing * .7;
        p.mesh.position.y = Math.abs(Math.sin(time * 7 + p.phase)) * .025;
      }
    }
    // shopkeepers breathe
    for (const s of stalls) {
      const k = s.group.userData.keeper;
      if (k) k.rotation.z = Math.sin(time * 1.1 + s.z) * .018;
    }
  }

  function updateCart(dt) {
    if (!cart || !cart.visible) return;
    const behindX = Math.sin(yaw), behindZ = Math.cos(yaw);
    const tx = pos.x + behindX * 1.7;
    const tz = pos.z + behindZ * 1.7;
    const k = 1 - Math.pow(0.001, dt);
    cart.position.x += (tx - cart.position.x) * k;
    cart.position.z += (tz - cart.position.z) * k;
    cart.rotation.y = yaw + Math.PI;
  }

  function updateNight(dt, force) {
    if (force) nightMix = nightTarget;
    else nightMix += (nightTarget - nightMix) * Math.min(1, dt * 1.7);
    if (Math.abs(nightTarget - nightMix) < .001) nightMix = nightTarget;
    const n = nightMix;

    if (sky) {
      sky.material.uniforms.topColor.value.lerpColors(hexColor('#bcd9e6'), hexColor('#0d1026'), n);
      sky.material.uniforms.bottomColor.value.lerpColors(hexColor('#f7e4c2'), hexColor('#241a25'), n);
    }
    const fogDay = hexColor('#eadcc4'), fogNight = hexColor('#171322');
    scene.background.lerpColors(fogDay, fogNight, n);
    scene.fog.color.lerpColors(fogDay, fogNight, n);

    hemi.intensity = 1.15 - n * .86;
    hemi.color.lerpColors(hexColor('#fff2d8'), hexColor('#8b96bd'), n);
    hemi.groundColor.lerpColors(hexColor('#7a5a3a'), hexColor('#231a2a'), n);
    dir.intensity = 1.45 - n * 1.02;
    dir.color.lerpColors(hexColor('#fff0cc'), hexColor('#aebcff'), n);

    if (sun) sun.material.opacity = Math.max(0, 1 - n * 1.25);
    if (moon) moon.material.opacity = Math.min(1, n * 1.2);
    if (stars) { stars.material.opacity = n * .95; stars.visible = n > .02; }
    if (fireflies) { fireflies.material.opacity = n * .9; fireflies.visible = n > .05; fireflies.rotation.y = time * .05; }
    clouds.forEach((c, i) => {
      c.children.forEach(m => m.material.color.lerpColors(hexColor('#fff6e8'), hexColor('#3b3f5c'), n));
      c.position.x += Math.sin(time * .03 + i) * .0015;
    });
    lampMats.forEach(m => m.color.lerpColors(hexColor('#cbb48e'), hexColor('#ffcf86'), n));
    laneLights.forEach(l => { l.intensity = n * 1.8; });

    document.body.classList.toggle('world-night', n > .55);
  }

  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (!active) return;
    if (!last) last = now;
    let dt = (now - last) / 1000;
    last = now;
    dt = Math.min(dt, .06);
    time += dt;

    updateNight(dt);
    updatePlayer(dt);
    updatePeople(dt);
    updateCart(dt);
    updatePrompt(false);
    if (++tab % 45 === 0) updateCartHud();

    renderer.render(scene, camera);
  }

  window.BazaarWorld = {
    open,
    close,
    isOpen: () => active,
  };

  // deep link: ?world or #world opens the walkable bazaar
  const wantsWorld = /(?:[?&]world(?:=1)?(?:&|$))/.test(location.search) || location.hash === '#world';
  if (wantsWorld) {
    const boot = () => setTimeout(() => window.BazaarWorld.open(), 350);
    if (document.readyState === 'complete') boot();
    else window.addEventListener('load', boot, { once: true });
  }
})();
