/* ============================================================
   Kharidaar — application
   ============================================================ */
(function () {
  const D = window.KHARIDAAR_DATA;
  if (!D) return;
  const t = window.t;
  const I = window.KharidaarI18n;
  const audio = window.KharidaarAudio;
  const scene = window.BazaarScene;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const store = {
    get(k, fallback) { try { const v = localStorage.getItem(k); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };

  const state = {
    lang: I.lang,
    filters: { q: '', cat: 'all', place: 'all', sort: 'recent' },
    marketShown: 12,
    ledgerPlace: 'all',
    ledgerShown: 8,
    basket: {},
    openItem: null,
    auto: false,
    theme: document.documentElement.dataset.theme || 'light',
    hasInteracted: false,
    receiptText: '',
  };

  const itemsById = new Map(D.items.map(i => [i.id, i]));
  const catKeys = Object.keys(D.categories);
  const catName = key => {
    const c = D.categories[key];
    if (!c) return key;
    return state.lang === 'hi' ? c.hi : c.en;
  };
  const itemName = it => (state.lang === 'hi' ? (it.hi || it.name) : it.name);
  const placeName = p => I.place(p);

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function money(n, forceDecimals) {
    if (n == null || isNaN(n)) return '—';
    const dec = forceDecimals || Math.abs(n % 1) > 0.01 ? 2 : 0;
    return '₹' + new Intl.NumberFormat('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: dec }).format(n);
  }
  function unitLabel(u) {
    if (!u) return '';
    if (u === 'piece') return '/pc';
    if (u === 'pack') return '/pack';
    const m = u.match(/^(\d+(?:\.\d+)?)(kg|g|L|ml|dozen)$/);
    if (m) return '/' + m[1] + ' ' + m[2];
    return '/' + u;
  }
  function locale() { return state.lang === 'hi' ? 'hi-IN' : 'en-IN'; }
  function fmtDate(iso, long) {
    if (!iso) return '';
    const d = new Date(iso + 'T12:00:00');
    return new Intl.DateTimeFormat(locale(), long
      ? { day: 'numeric', month: 'long', year: 'numeric' }
      : { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
  }
  function fmtDateParts(iso) {
    const d = new Date(iso + 'T12:00:00');
    return {
      day: new Intl.DateTimeFormat(locale(), { day: '2-digit' }).format(d),
      rest: new Intl.DateTimeFormat(locale(), { month: 'short', year: 'numeric' }).format(d),
    };
  }
  function deltaFor(item) {
    if (item.change == null) return { cls: 'flat', text: t('market.first'), arrow: '·' };
    if (Math.abs(item.change) < 0.4) return { cls: 'flat', text: t('market.flat'), arrow: '→' };
    const up = item.change > 0;
    return { cls: up ? 'up' : 'down', text: (up ? '▲ ' : '▼ ') + Math.abs(item.change) + '%', arrow: up ? '▲' : '▼' };
  }
  function normCaption(item) {
    if (!item.seriesBasis || item.normValue == null) return '';
    if (item.unit === item.seriesBasis) return '';
    const unit = item.seriesBasis === 'piece' ? 'pc' : item.seriesBasis;
    return t('market.norm', { v: money(item.normValue), u: unit });
  }

  /* ---------------- theme ---------------- */
  function applyTheme(theme, opts = {}) {
    state.theme = theme;
    document.documentElement.dataset.theme = theme;
    store.set('kharidaar.theme', theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'dark' ? '#0d0c12' : '#f6efe2';
    if (scene && opts.moveScene !== false) {
      scene.glideTo(theme === 'dark' ? 21 * 60 + 20 : 8 * 60 + 40, 2200);
    }
    updateSoundUI();
  }

  function toggleTheme(originEvent) {
    const next = state.theme === 'dark' ? 'light' : 'dark';
    const run = () => applyTheme(next);
    if (document.startViewTransition && !reduceMotion) {
      const vt = document.startViewTransition(run);
      vt.ready.then(() => {
        const x = originEvent?.clientX ?? window.innerWidth - 60;
        const y = originEvent?.clientY ?? 40;
        const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
        document.documentElement.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
          { duration: 720, easing: 'cubic-bezier(.22,1,.36,1)', pseudoElement: '::view-transition-new(root)' }
        );
      }).catch(() => {});
    } else run();
    audio.sfx('whoosh');
    toast(t('toast.theme'), '🌗');
  }

  /* ---------------- sound ---------------- */
  const soundPop = $('#soundPop');
  const soundBtn = $('#soundBtn');
  const musicToggle = $('#musicToggle');
  const vol = $('#volume');
  const volLabel = $('#volLabel');
  const sfxToggle = $('#sfxToggle');

  function updateSoundUI() {
    document.body.classList.toggle('music-on', audio.enabled);
    document.body.classList.toggle('music-off', !audio.enabled);
    soundBtn.setAttribute('aria-pressed', String(audio.enabled));
    if (musicToggle) {
      musicToggle.textContent = audio.enabled ? t('sound.pause') : t('sound.play');
      musicToggle.setAttribute('aria-pressed', String(audio.enabled));
    }
    if (vol) { vol.value = Math.round(audio.volume * 100); volLabel.textContent = Math.round(audio.volume * 100) + '%'; }
    if (sfxToggle) sfxToggle.checked = audio.sfxOn;
  }

  function toggleSoundPop(force) {
    const open = force ?? soundPop.hidden;
    soundPop.hidden = !open;
    soundBtn.setAttribute('aria-expanded', String(open));
    if (open) audio.sfx('open');
  }

  function toggleMusic() {
    const on = audio.toggle();
    updateSoundUI();
    toast(on ? t('toast.musicOn') : t('toast.musicOff'), on ? '🎵' : '🔇');
    if (on) audio.sfx('click');
  }

  /* ---------------- toasts & confetti ---------------- */
  function toast(msg, emoji = '') {
    const wrap = $('#toastWrap');
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = (emoji ? `<span class="emoji">${esc(emoji)}</span>` : '') + `<span>${esc(msg)}</span>`;
    wrap.appendChild(el);
    while (wrap.children.length > 3) wrap.firstElementChild.remove();
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 380);
    }, 2800);
  }

  function confetti() {
    if (reduceMotion) return;
    const wrap = $('#confetti');
    const colors = ['#d84a22', '#e8a13c', '#25775f', '#c74a2b', '#7b6cd9', '#fff3d6'];
    for (let i = 0; i < 70; i++) {
      const s = document.createElement('i');
      const size = 5 + Math.random() * 8;
      s.style.left = Math.random() * 100 + 'vw';
      s.style.width = size + 'px';
      s.style.height = size * (0.6 + Math.random()) + 'px';
      s.style.background = colors[Math.floor(Math.random() * colors.length)];
      s.style.setProperty('--dx', (Math.random() * 240 - 120) + 'px');
      s.style.setProperty('--rot', (Math.random() * 1080 - 540) + 'deg');
      s.style.animationDuration = (1.9 + Math.random() * 1.6) + 's';
      s.style.animationDelay = Math.random() * 0.5 + 's';
      s.style.opacity = 0.65 + Math.random() * 0.35;
      wrap.appendChild(s);
    }
    setTimeout(() => { wrap.innerHTML = ''; }, 4300);
  }

  /* ---------------- ticker ---------------- */
  function renderTicker() {
    const track = $('#tickerTrack');
    const latest = [...D.items].filter(i => i.latest != null)
      .sort((a, b) => b.latestDate.localeCompare(a.latestDate) || b.count - a.count)
      .slice(0, 14);
    const one = latest.map(it => {
      const d = deltaFor(it);
      const change = it.change == null ? '' : `<span class="${it.change >= 0 ? 'up' : 'down'}">${it.change >= 0 ? '▲' : '▼'} ${Math.abs(it.change)}%</span>`;
      return `<span class="tick" data-item="${esc(it.id)}" role="button" tabindex="0"><b>${esc(itemName(it))}</b> ${money(it.latest)}${esc(unitLabel(it.unit))} <i>${esc(placeName(it.records[it.records.length - 1].place))} · ${esc(fmtDate(it.latestDate))}</i> ${change}</span>`;
    }).join('');
    track.innerHTML = `<div class="tick-group">${one}</div><div class="tick-group" aria-hidden="true">${one}</div>`;
  }

  /* ---------------- market ---------------- */
  function sparkline(item) {
    const hist = item.history;
    if (!hist.length) return '';
    const w = 100, h = 40, pad = 3;
    let vals = hist.map(p => p.price);
    let min = Math.min(...vals), max = Math.max(...vals);
    if (max - min < .001) { max += 1; min -= 1; }
    const pts = vals.map((v, i) => {
      const x = vals.length === 1 ? w / 2 : pad + (i * (w - pad * 2)) / (vals.length - 1);
      const y = h - pad - ((v - min) / (max - min)) * (h - pad * 2);
      return [x, y];
    });
    const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const area = line + ` L${pts[pts.length - 1][0].toFixed(1)} ${h - pad} L${pts[0][0].toFixed(1)} ${h - pad} Z`;
    const dots = pts.map((p, i) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${i === pts.length - 1 ? 2.2 : 1.3}"><title>${esc(money(vals[i]))} · ${esc(fmtDate(hist[i].date))}</title></circle>`).join('');
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><path class="area" d="${area}"/><path class="line" d="${line}"/>${dots}</svg>`;
  }

  function filteredItems() {
    const f = state.filters;
    const q = f.q.trim().toLowerCase();
    let list = D.items.filter(it => {
      if (f.cat !== 'all' && it.category !== f.cat) return false;
      if (f.place !== 'all' && !it.places.includes(f.place)) return false;
      if (!q) return true;
      const hay = [it.name, it.hi, catName(it.category), ...it.places, ...it.records.map(r => r.desc + ' ' + r.remark)].join(' ').toLowerCase();
      return hay.includes(q);
    });
    const change = it => (it.change == null ? -999 : it.change);
    switch (f.sort) {
      case 'newest': list.sort((a, b) => b.latestDate.localeCompare(a.latestDate)); break;
      case 'priceHigh': list.sort((a, b) => (b.normValue ?? b.latest ?? 0) - (a.normValue ?? a.latest ?? 0)); break;
      case 'priceLow': list.sort((a, b) => (a.normValue ?? a.latest ?? 99e9) - (b.normValue ?? b.latest ?? 99e9)); break;
      case 'rise': list.sort((a, b) => change(b) - change(a)); break;
      case 'fall': list.sort((a, b) => change(a) - change(b)); break;
      case 'az': list.sort((a, b) => itemName(a).localeCompare(itemName(b), locale())); break;
      default: list.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    }
    return list;
  }

  function stallCard(it, index) {
    const cat = D.categories[it.category] || {};
    const d = deltaFor(it);
    const norm = normCaption(it);
    const lastPlace = it.records[it.records.length - 1]?.place;
    const sub = state.lang === 'hi' ? it.name : (it.hi !== it.name ? it.hi : '');
    const inBasket = !!state.basket[it.id];
    return `<article class="stall" data-id="${esc(it.id)}" style="--cat:${cat.color || '#d84a22'}; --i:${index}" tabindex="0" role="button" aria-label="${esc(itemName(it))}">
      <div class="stall-top">
        <span class="stall-emoji" aria-hidden="true">${cat.emoji || '🛒'}</span>
        <span class="stall-place">${esc(placeName(lastPlace || ''))}</span>
        <span class="delta ${d.cls}" title="${esc(d.text)}">${esc(d.text)}</span>
      </div>
      <h3 class="stall-name">${esc(itemName(it))}${sub ? `<small>${esc(sub)}</small>` : ''}</h3>
      <div class="stall-price"><span class="cur">₹</span><span class="val">${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(it.latest ?? 0)}</span><span class="unit">${esc(unitLabel(it.unit))}</span></div>
      <p class="stall-norm">${esc(norm)}</p>
      ${sparkline(it)}
      <div class="stall-foot">
        <span class="stall-date">${esc(t('market.last', { d: fmtDate(it.latestDate) }))}</span>
        <button class="add-btn ${inBasket ? 'is-added' : ''}" type="button" data-add="${esc(it.id)}" aria-label="${esc(t('market.add'))}" title="${esc(t('market.add'))}">
          <svg><use href="#i-${inBasket ? 'check' : 'plus'}"/></svg>
        </button>
      </div>
    </article>`;
  }

  function renderChips() {
    const wrap = $('#categoryChips');
    const counts = {};
    D.items.forEach(it => { counts[it.category] = (counts[it.category] || 0) + 1; });
    wrap.innerHTML = [`<button class="chip ${state.filters.cat === 'all' ? 'is-on' : ''}" type="button" data-cat="all">${esc(t('cat.all'))} <span class="count">${D.items.length}</span></button>`]
      .concat(catKeys.map(k => `<button class="chip ${state.filters.cat === k ? 'is-on' : ''}" type="button" data-cat="${k}">${D.categories[k].emoji} ${esc(catName(k))} <span class="count">${counts[k] || 0}</span></button>`))
      .join('');
  }

  function populateSelects() {
    const placeSel = $('#placeSelect');
    placeSel.innerHTML = `<option value="all">${esc(t('place.all'))}</option>` +
      D.places.map(p => `<option value="${esc(p)}">${esc(placeName(p))}</option>`).join('');
    placeSel.value = state.filters.place;
    const sortSel = $('#sortSelect');
    const opts = [['recent', 'sort.recent'], ['newest', 'sort.newest'], ['priceHigh', 'sort.priceHigh'], ['priceLow', 'sort.priceLow'], ['rise', 'sort.rise'], ['fall', 'sort.fall'], ['az', 'sort.az']];
    sortSel.innerHTML = opts.map(([v, k]) => `<option value="${v}">${esc(t(k))}</option>`).join('');
    sortSel.value = state.filters.sort;
  }

  function renderMarket() {
    renderChips();
    populateSelects();
    const list = filteredItems();
    const f = state.filters;
    const filtered = !!(f.q.trim() || f.cat !== 'all' || f.place !== 'all');
    const shown = filtered ? list : list.slice(0, state.marketShown);
    const grid = $('#stallGrid');
    grid.innerHTML = shown.map(stallCard).join('');
    const count = list.length;
    $('#resultCount').textContent = count === 1 ? t('market.resultsOne') : t('market.results', { n: count });
    $('#emptyState').hidden = count !== 0;
    grid.style.display = count ? '' : 'none';

    const moreWrap = $('#marketMoreWrap');
    const moreBtn = $('#marketMore');
    const moreNote = $('#marketMoreNote');
    if (moreWrap && moreBtn) {
      const remaining = count - shown.length;
      moreWrap.hidden = filtered || remaining <= 0;
      moreBtn.hidden = filtered || remaining <= 0;
      if (moreNote) moreNote.textContent = remaining > 0 ? t('market.moreCount', { shown: shown.length, n: count }) : '';
    }
    observeReveals();
  }

  /* ---------------- ledger ---------------- */
  function renderPlaceChips() {
    const wrap = $('#placeChips');
    const counts = {};
    D.records.forEach(r => { counts[r.place] = (counts[r.place] || 0) + 1; });
    wrap.innerHTML = `<button class="chip ${state.ledgerPlace === 'all' ? 'is-on' : ''}" type="button" data-place="all">${esc(t('place.all'))} <span class="count">${D.records.length}</span></button>` +
      D.places.map(p => `<button class="chip ${state.ledgerPlace === p ? 'is-on' : ''}" type="button" data-place="${esc(p)}">${esc(placeName(p))} <span class="count">${counts[p]}</span></button>`).join('');
  }

  function renderLedger() {
    renderPlaceChips();
    const list = D.records
      .filter(r => state.ledgerPlace === 'all' || r.place === state.ledgerPlace)
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
    const shown = list.slice(0, state.ledgerShown);
    const wrap = $('#ledgerList');
    wrap.innerHTML = shown.map((r, i) => {
      const dp = fmtDateParts(r.date);
      const cat = D.categories[r.category] || {};
      return `<li class="ledger-item" style="animation-delay:${Math.min(i * 35, 300)}ms">
        <div class="ledger-date"><b>${esc(dp.day)}</b>${esc(dp.rest)}</div>
        <div class="ledger-body">
          <div class="ledger-ribbon">
            <span class="ledger-item-name">${cat.emoji || ''} ${esc(state.lang === 'hi' ? (itemsById.get(D.items.find(x => x.name === r.item)?.id)?.hi || r.item) : r.item)}</span>
            <span class="place-badge">${esc(placeName(r.place))}</span>
            <span class="place-badge">${esc(catName(r.category))}</span>
          </div>
          <p class="ledger-desc">${esc(r.desc)}</p>
          ${r.remark ? `<p class="ledger-remark">${esc(r.remark)}</p>` : ''}
        </div>
      </li>`;
    }).join('');
    $('#ledgerMore').disabled = shown.length >= list.length;
    $('#ledgerMore').style.opacity = shown.length >= list.length ? '.4' : '';
    $('#ledgerMore').textContent = shown.length >= list.length
      ? t('ledger.count', { n: list.length })
      : t('ledger.more');
    observeReveals();
  }

  /* ---------------- item dialog ---------------- */
  const itemDialog = $('#itemDialog');
  const itemBody = $('#itemDialogBody');

  function chartSVG(item) {
    const hist = item.history;
    if (!hist.length) return `<p class="chart-note">${esc(t('market.noPrice'))}</p>`;
    const w = 640, h = 170, L = 40, R = 12, T = 14, B = 26;
    const times = hist.map(p => new Date(p.date + 'T12:00:00').getTime());
    const vals = hist.map(p => p.price);
    let min = Math.min(...vals), max = Math.max(...vals);
    if (max - min < .01) { max += Math.max(1, max * .05); min = Math.max(0, min - Math.max(1, min * .05)); }
    const span = max - min;
    const x = i => hist.length === 1 ? (L + w - R) / 2 : L + ((times[i] - times[0]) / Math.max(1, times[times.length - 1] - times[0])) * (w - L - R);
    const y = v => T + (1 - (v - min) / span) * (h - T - B);
    const pts = vals.map((v, i) => [x(i), y(v)]);
    const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const area = line + ` L${pts[pts.length - 1][0].toFixed(1)} ${h - B} L${pts[0][0].toFixed(1)} ${h - B} Z`;
    const grid = [0, .5, 1].map(f => {
      const v = min + span * f;
      const yy = y(v);
      return `<line class="gridline" x1="${L}" x2="${w - R}" y1="${yy}" y2="${yy}"/><text class="axis-label" x="6" y="${yy + 3}">${esc(money(v))}</text>`;
    }).join('');
    const dots = pts.map((p, i) => `<circle class="dot" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${i === pts.length - 1 ? 4 : 2.8}"><title>${esc(money(vals[i]))}${esc(unitLabel(hist[i].unit))} · ${esc(fmtDate(hist[i].date))} · ${esc(placeName(hist[i].place))}</title></circle>`).join('');
    const xl = hist.length === 1
      ? `<text class="axis-label" x="${L}" y="${h - 8}">${esc(fmtDate(hist[0].date))}</text>`
      : `<text class="axis-label" x="${L}" y="${h - 8}">${esc(fmtDate(hist[0].date))}</text><text class="axis-label" x="${w - R}" y="${h - 8}" text-anchor="end">${esc(fmtDate(hist[hist.length - 1].date))}</text>`;
    return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Price history">${grid}<path class="area" d="${area}"/><path class="line" d="${line}"/>${dots}${xl}</svg>`;
  }

  function openItem(id) {
    const it = itemsById.get(id);
    if (!it) return;
    state.openItem = id;
    const cat = D.categories[it.category] || {};
    const d = deltaFor(it);
    const verdict = it.change == null ? t('dialog.verdictFlat') : it.change > 1 ? t('dialog.verdictRise') : it.change < -1 ? t('dialog.verdictFall') : t('dialog.verdictFlat');
    const other = state.lang === 'hi' ? it.name : it.hi;
    const norm = normCaption(it);
    const normNote = norm ? `<p class="modal-meta">${esc(norm)} · ${esc(t('dialog.normalised'))}</p>` : '';
    const records = [...it.records].sort((a, b) => b.date.localeCompare(a.date)).map(r => `<div class="record">
      <time datetime="${esc(r.date)}">${esc(fmtDate(r.date))}</time>
      <p>${esc(r.desc)}${r.remark ? `<em>${esc(r.remark)}</em>` : ''}</p>
      <b>${r.price != null ? esc(money(r.price)) + esc(unitLabel(r.unit)) : '—'}</b>
    </div>`).join('');
    const inBasket = !!state.basket[it.id];
    const places = [...new Set(it.records.map(r => r.place))].map(p => esc(placeName(p))).join(' · ');
    itemBody.innerHTML = `
      <button class="modal-x icon-btn" data-close-dialog type="button" aria-label="Close"><svg><use href="#i-close"/></svg></button>
      <div class="modal-hero" style="--cat:${cat.color || '#d84a22'}">
        <div class="modal-item-top">
          <span class="stall-emoji" aria-hidden="true">${cat.emoji || '🛒'}</span>
          <div>
            <h3>${esc(itemName(it))} <small>${other && other !== itemName(it) ? esc(other) : ''}</small></h3>
            <div class="modal-meta"><span>${esc(catName(it.category))} · ${places}</span></div>
          </div>
          <span class="delta ${d.cls}" style="margin-left:auto">${esc(d.text)}</span>
        </div>
        <div class="modal-price-row">
          <div class="modal-price"><span class="cur">₹</span><span class="val">${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(it.latest ?? 0)}</span><span class="unit">${esc(unitLabel(it.unit))}</span></div>
          <div class="modal-meta"><b>${esc(fmtDate(it.latestDate, true))}</b><span>${esc(places)}</span></div>
          <span class="place-badge" style="margin-left:auto">${esc(verdict)}</span>
        </div>
        ${normNote}
        <div class="modal-facts">
          <div><dt>${esc(t('dialog.min'))}</dt><dd>${esc(money(it.min))}${it.seriesBasis ? '/' + esc(it.seriesBasis === 'piece' ? 'pc' : it.seriesBasis) : ''}</dd></div>
          <div><dt>${esc(t('dialog.max'))}</dt><dd>${esc(money(it.max))}${it.seriesBasis ? '/' + esc(it.seriesBasis === 'piece' ? 'pc' : it.seriesBasis) : ''}</dd></div>
          <div><dt>${esc(t('dialog.avg'))}</dt><dd>${esc(money(it.avg))}${it.seriesBasis ? '/' + esc(it.seriesBasis === 'piece' ? 'pc' : it.seriesBasis) : ''}</dd></div>
        </div>
      </div>
      <div class="chart-wrap">
        <div class="chart-head"><h4>${esc(t('dialog.history'))}</h4><span>${esc(it.seriesBasis ? (t('dialog.normalised') + ' ₹/' + (it.seriesBasis === 'piece' ? 'pc' : it.seriesBasis)) : t('market.asRecorded'))}</span></div>
        ${chartSVG(it)}
      </div>
      <div class="modal-section">
        <h4>${esc(t('dialog.records'))} · ${it.records.length}</h4>
        <div class="records">${records}</div>
      </div>
      <div class="modal-foot">
        <p class="modal-note">${esc(t('about.fine'))}</p>
        <button class="btn btn-solid" type="button" data-add="${esc(it.id)}"><svg><use href="#i-bag"/></svg><span>${esc(inBasket ? t('dialog.inBasket') : t('dialog.addToBasket'))}</span></button>
      </div>`;
    if (!itemDialog.open) itemDialog.showModal();
    itemDialog.querySelector('.modal-inner').scrollTop = 0;
    audio.sfx('open');
  }

  /* ---------------- basket ---------------- */
  const panel = $('#basketPanel');
  const scrim = $('#scrim');

  function basketTotal() {
    let total = 0, first = 0;
    let counted = 0;
    Object.entries(state.basket).forEach(([id, qty]) => {
      const it = itemsById.get(id);
      if (!it || it.latest == null) return;
      total += it.latest * qty;
      const h = it.history;
      const f = h.length ? h[0].price : it.latest;
      first += f * qty;
      if (h.length > 1) counted++;
    });
    return { total, first, inflation: first > 0 ? ((total - first) / first) * 100 : 0, counted };
  }

  function renderBasket() {
    const body = $('#basketBody');
    const ids = Object.keys(state.basket);
    const entries = ids.map(id => itemsById.get(id)).filter(Boolean);
    if (!entries.length) {
      body.innerHTML = `<div class="basket-empty"><span>🧺</span><h4>${esc(t('basket.emptyTitle'))}</h4><p>${esc(t('basket.emptyText'))}</p></div>`;
    } else {
      body.innerHTML = entries.map(it => {
        const cat = D.categories[it.category] || {};
        const qty = state.basket[it.id];
        return `<div class="basket-row">
          <span class="basket-emoji" aria-hidden="true">${cat.emoji || '🛒'}</span>
          <div class="basket-info">
            <h4>${esc(itemName(it))}</h4>
            <p>${esc(placeName(it.records[it.records.length - 1]?.place || ''))} · ${money(it.latest)}${esc(unitLabel(it.unit))}</p>
            <div class="qty">
              <button type="button" data-qty="-1" data-id="${esc(it.id)}" aria-label="Less"><svg><use href="#i-minus"/></svg></button>
              <span>${qty}</span>
              <button type="button" data-qty="1" data-id="${esc(it.id)}" aria-label="More"><svg><use href="#i-plus"/></svg></button>
            </div>
          </div>
          <div class="basket-line">
            <strong>${money((it.latest || 0) * qty)}</strong>
            <button class="remove-btn" type="button" data-remove="${esc(it.id)}">${esc(t('basket.remove'))}</button>
          </div>
        </div>`;
      }).join('');
    }
    const sum = basketTotal();
    $('#basketTotal').textContent = money(sum.total);
    const note = $('#basketNote');
    if (entries.length) {
      if (sum.counted) {
        const up = sum.inflation >= 0;
        note.innerHTML = esc(t('basket.inflation', { p: Math.abs(sum.inflation).toFixed(1), dir: up ? t('basket.up') : t('basket.down') }));
        note.innerHTML = `<span class="${up ? 'up' : 'down'}">${note.innerHTML}</span>`;
      } else {
        note.textContent = t('basket.note');
      }
    } else note.textContent = t('basket.note');
    updateBasketCount();
    saveBasket();
  }

  function updateBasketCount() {
    const n = Object.values(state.basket).reduce((a, b) => a + b, 0);
    $('#basketCount').textContent = n;
    const mob = $('#mobileBasket');
    mob.querySelector('b').textContent = n;
    document.body.classList.toggle('has-basket', n > 0);
  }

  function saveBasket() { store.set('kharidaar.basket', state.basket); }

  function addToBasket(id, qty = 1, opts = {}) {
    const it = itemsById.get(id);
    if (!it) return;
    state.basket[id] = (state.basket[id] || 0) + qty;
    renderBasket();
    audio.sfx('add');
    if (!opts.silent) toast(t('toast.added', { item: itemName(it) }), D.categories[it.category]?.emoji || '🧺');
    if (state.openItem === id) {
      const btn = itemBody.querySelector('[data-add]');
      if (btn && btn.querySelector('span')) btn.querySelector('span').textContent = t('dialog.inBasket');
    }
  }

  function openBasket() {
    panel.classList.add('is-open');
    panel.setAttribute('aria-hidden', 'false');
    scrim.hidden = false;
    document.body.classList.add('no-scroll');
    audio.sfx('open');
    renderBasket();
  }
  function closeBasket() {
    panel.classList.remove('is-open');
    panel.setAttribute('aria-hidden', 'true');
    scrim.hidden = true;
    document.body.classList.remove('no-scroll');
    audio.sfx('close');
  }

  function randomBasket(n = 3) {
    const pool = D.items.filter(i => i.latest != null && !state.basket[i.id]);
    const picked = [];
    while (picked.length < n && pool.length) picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    picked.forEach((it, i) => setTimeout(() => addToBasket(it.id, 1, { silent: true }), i * 160));
    if (picked.length) {
      setTimeout(() => {
        toast(t('toast.addedMany', { n: picked.length }), '🧺');
        audio.sfx('success');
        renderBasket();
      }, picked.length * 160 + 60);
    }
  }

  /* ---------------- receipt ---------------- */
  const receiptDialog = $('#receiptDialog');

  function buildReceipt() {
    const entries = Object.entries(state.basket).map(([id, qty]) => ({ it: itemsById.get(id), qty })).filter(e => e.it && e.it.latest != null);
    if (!entries.length) return null;
    const sum = basketTotal();
    const today = new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date());
    const lines = entries.map(({ it, qty }) => {
      const lineTotal = it.latest * qty;
      return `<div class="receipt-line"><span>${esc(itemName(it))}<small>${qty} × ${money(it.latest)}${esc(unitLabel(it.unit))}</small></span><span>${money(lineTotal)}</span></div>`;
    }).join('');
    const inflation = sum.counted ? t('receipt.inflation', { p: (sum.inflation >= 0 ? '+' : '') + sum.inflation.toFixed(1) }) : '';
    $('#receiptContent').innerHTML = `
      <div class="receipt-stamp">not for sale</div>
      <div class="receipt-top"><h3>${esc(t('receipt.title'))}</h3><p>${esc(t('receipt.sub'))}</p></div>
      <div class="receipt-meta"><span>${esc(t('receipt.date'))}: ${esc(today)}</span><span>${entries.length} ${esc(t('receipt.items'))}</span></div>
      <div class="receipt-lines">${lines}</div>
      <div class="receipt-total"><span>${esc(t('receipt.total'))}</span><strong>${money(sum.total)}</strong></div>
      ${inflation ? `<p class="receipt-inflation">${esc(inflation)}</p>` : ''}
      <div class="receipt-footer">${esc(t('receipt.footer')).replace(/\n/g, '<br>')}<br><br>kharidaar · the living bazaar</div>`;
    state.receiptText = [
      'KHARIDAAR KIRANA',
      'A receipt for things already bought',
      '----------------------------------------',
      'Date: ' + today,
      '----------------------------------------',
      ...entries.map(({ it, qty }) => `${itemName(it)}  ${qty} x ${money(it.latest)}${unitLabel(it.unit)}`.padEnd(40) + money(it.latest * qty)),
      '----------------------------------------',
      `${t('receipt.total')}: ${money(sum.total)}`,
      inflation || '',
      '----------------------------------------',
      'No money changed hands.',
      'This is a diary, not a shop.',
      'kharidaar — the living bazaar',
    ].filter(Boolean).join('\n');
    return true;
  }

  function openReceipt() {
    if (!Object.keys(state.basket).length) {
      audio.sfx('error');
      toast(t('toast.emptyBag'), '🧺');
      openBasket();
      return;
    }
    if (!buildReceipt()) return;
    closeBasket();
    receiptDialog.showModal();
    confetti();
    audio.sfx('success');
    toast(t('toast.receipt'), '🧾');
  }

  function downloadReceipt() {
    if (!state.receiptText) return;
    const blob = new Blob([state.receiptText], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `kharidaar-receipt-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    audio.sfx('coin');
  }

  /* ---------------- duel ---------------- */
  const duelDialog = $('#duelDialog');

  function openDuel() {
    const bases = ['kg', 'kg', 'piece', 'L'];
    let a, b, basis;
    for (const base of bases) {
      const pool = D.items.filter(i => i.seriesBasis === base && i.normValue > 0 && i.count >= 1);
      if (pool.length < 2) continue;
      for (let tries = 0; tries < 30; tries++) {
        const x = pool[Math.floor(Math.random() * pool.length)];
        const y = pool[Math.floor(Math.random() * pool.length)];
        if (x.id === y.id) continue;
        const ratio = Math.max(x.normValue, y.normValue) / Math.min(x.normValue, y.normValue);
        if (ratio > 1.15 && ratio < 14) { a = x; b = y; basis = base; break; }
      }
      if (a) break;
    }
    if (!a) {
      const pool = [...D.items].filter(i => i.latest).sort(() => Math.random() - .5).slice(0, 2);
      a = pool[0]; b = pool[1]; basis = a.seriesBasis || 'kg';
    }
    const va = basis === 'kg' || basis === 'L' || basis === 'piece' ? (a.normValue ?? a.latest) : a.latest;
    const vb = basis === 'kg' || basis === 'L' || basis === 'piece' ? (b.normValue ?? b.latest) : b.latest;
    const max = Math.max(va, vb);
    const ca = D.categories[a.category] || {}, cb = D.categories[b.category] || {};
    const unit = basis === 'piece' ? 'pc' : basis;
    const ratio = Math.min(va, vb) > 0 ? Math.max(va, vb) / Math.min(va, vb) : 1;
    const winner = Math.abs(va - vb) < 0.01 ? t('duel.winnerEven') : t('duel.winner', {
      a: itemName(va >= vb ? a : b), b: itemName(va >= vb ? b : a), u: unit, m: ratio.toFixed(1),
    });
    $('#duelBody').innerHTML = `
      <div class="duel-body">
        <div class="duel-side" style="--cat:${ca.color}">
          <span class="duel-emoji">${ca.emoji || '🛒'}</span>
          <h4>${esc(itemName(a))}</h4>
          <div class="duel-place">${esc(placeName(a.places[0] || ''))}</div>
          <div class="duel-bar"><i style="height:${Math.max(10, (va / max) * 100)}%"></i><i style="height:${Math.max(18, (va / max) * 100 * .82)}%; opacity:.55"></i></div>
          <div class="duel-value">${money(va)} <small>${esc(t('duel.basis', { u: unit }))}</small></div>
        </div>
        <div class="duel-vs">vs</div>
        <div class="duel-side" style="--cat:${cb.color}">
          <span class="duel-emoji">${cb.emoji || '🛒'}</span>
          <h4>${esc(itemName(b))}</h4>
          <div class="duel-place">${esc(placeName(b.places[0] || ''))}</div>
          <div class="duel-bar"><i style="height:${Math.max(10, (vb / max) * 100)}%"></i><i style="height:${Math.max(18, (vb / max) * 100 * .82)}%; opacity:.55"></i></div>
          <div class="duel-value">${money(vb)} <small>${esc(t('duel.basis', { u: unit }))}</small></div>
        </div>
      </div>
      <p class="duel-winner">${winner}</p>`;
    if (!duelDialog.open) duelDialog.showModal();
    audio.sfx('coin');
  }

  /* ---------------- scene UI ---------------- */
  function scenePhaseLabel() {
    if (!scene) return '';
    return t('phase.' + scene.getPhase());
  }

  function updateSceneUI(minutes, phase, cycling) {
    if (minutes == null && scene) minutes = scene.getTime();
    if (minutes == null) return;
    const hh = Math.floor(minutes / 60) % 24;
    const mm = Math.floor(minutes % 60);
    $('#sceneClock').textContent = String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
    $('#scenePhase').textContent = scenePhaseLabel();
    const slider = $('#timeSlider');
    if (document.activeElement !== slider) slider.value = Math.round(minutes);
    const auto = cycling ?? (scene && scene.isCycling());
    state.auto = !!auto;
    const btn = $('#dayNightBtn');
    btn.setAttribute('aria-pressed', String(!!auto));
    btn.textContent = auto ? t('scene.pause') : t('scene.auto');
    const play = $('#playDayBtn');
    play.querySelector('span').textContent = auto ? t('scene.pause') : t('hero.cta2');
  }

  function goToTime(minutes, toastMsg) {
    if (!scene) return;
    scene.glideTo(minutes, 1500);
    audio.sfx(minutes > 18 * 60 || minutes < 6 * 60 ? 'night' : 'whoosh');
    if (toastMsg) toast(toastMsg, minutes > 18 * 60 || minutes < 6 * 60 ? '🌙' : '🌅');
    updateSceneUI(minutes, null, true);
  }

  /* ---------------- explore ---------------- */
  function handleWonder(action) {
    switch (action) {
      case 'dawn': goToTime(5 * 60 + 55, t('toast.dawn')); break;
      case 'night': goToTime(21 * 60 + 20, t('toast.night')); break;
      case 'cycle': {
        if (!scene) return;
        if (scene.isCycling()) { scene.stopCycle(); updateSceneUI(null, null, false); toast(t('toast.autoOff'), '⏸️'); }
        else { scene.startCycle(30); updateSceneUI(null, null, true); toast(t('toast.autoOn'), '⏳'); }
        break;
      }
      case 'duel': openDuel(); break;
      case 'fill': randomBasket(3); openBasket(); break;
      case 'basket': openBasket(); break;
      case 'lang': {
        const order = ['en', 'hi', 'eh'];
        const next = order[(order.indexOf(state.lang) + 1) % order.length];
        setLanguage(next);
        toast(t('toast.lang', { lang: next === 'hi' ? 'हिन्दी' : next === 'eh' ? 'EH (Hinglish)' : 'English' }), '🗣️');
        break;
      }
      case 'melody': audio.melody(); audio.sfx('success'); break;
      case 'sound': toggleSoundPop(true); break;
      case 'gossip': {
        window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
        setTimeout(() => { scene?.gossip(); toast(t('toast.gossip'), '💬'); }, 550);
        break;
      }
      case 'search': {
        $('#bazaar').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
        setTimeout(() => $('#searchInput').focus(), 500);
        break;
      }
    }
  }

  /* ---------------- language ---------------- */
  function setLanguage(lang) {
    state.lang = lang;
    I.setLang(lang);
    store.set('kharidaar.lang', lang);
  }

  function buildThoughts() {
    const pick = [...D.items].filter(i => i.history.length > 1).sort((a, b) => Math.abs(b.change || 0) - Math.abs(a.change || 0)).slice(0, 6);
    const list = pick.map(it => {
      const first = it.history[0];
      const last = it.history[it.history.length - 1];
      const nm = itemName(it);
      if (state.lang === 'hi') return `${nm} ${fmtDate(first.date)} को ${money(first.price)} था, अब ${money(last.price)} — बाज़ार सब याद रखता है।`;
      if (state.lang === 'eh') return `${nm} ${fmtDate(first.date)} pe ${money(first.price)} tha, ab ${money(last.price)}. Bazaar sab yaad rakhta hai.`;
      return `${nm} was ${money(first.price)} on ${fmtDate(first.date)}, now ${money(last.price)}. The bazaar remembers.`;
    });
    const extra = state.lang === 'hi' ? [
      'सिर्फ़ दूध लेने आया था। हाथ में लड्डू है।',
      'लीची का मौसम छोटा होता है। अच्छी चीज़ों की तरह।',
      'बीस मिनट मोल-भाव करके दस रुपये बचाए। फ़ायदा ही है।',
    ] : state.lang === 'eh' ? [
      'Sirf doodh lene aaya tha. Haath mein laddu hai.',
      'Lichi ka season chhota hota hai. Achhi cheezon ki tarah.',
      'Bees minute bargain karke das rupee bachaye. Fayda hi hai.',
    ] : [
      'I only came for milk. I have somehow bought laddoos.',
      'The litchi season is too short. Like all good things.',
      'I bargain for twenty minutes to save ten rupees. Worth it.',
    ];
    scene?.setThoughts([...list, ...extra]);
  }

  function renderFacts() {
    const priced = D.records.filter(r => r.price != null);
    const cheap = priced.reduce((a, b) => (a.price < b.price ? a : b));
    const dear = priced.reduce((a, b) => (a.price > b.price ? a : b));
    const top = [...D.items].sort((a, b) => b.count - a.count)[0];
    const days = Math.round((new Date(D.meta.lastDate) - new Date(D.meta.firstDate)) / 86400000);
    $('#statRecords').textContent = D.meta.recordCount;
    $('#statItems').textContent = D.meta.itemCount;
    $('#statPlaces').textContent = D.meta.placeCount;
    $('#statSpan').textContent = days;
    $('#factFirst').textContent = fmtDate(D.meta.firstDate);
    $('#factLast').textContent = fmtDate(D.meta.lastDate);
    $('#factCheap').textContent = money(cheap.price) + unitLabel(cheap.unit);
    $('#factDear').textContent = money(dear.price) + unitLabel(dear.unit);
    $('#factTop').textContent = itemName(top);
    $('#year').textContent = new Date().getFullYear();
  }

  function renderAll() {
    buildThoughts();
    renderTicker();
    renderMarket();
    renderLedger();
    renderBasket();
    renderFacts();
    updateSceneUI();
    updateSoundUI();
    if (state.openItem && itemDialog.open) openItem(state.openItem);
  }

  /* ---------------- reveal ---------------- */
  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (en.isIntersecting) {
        en.target.classList.add('in');
        revealObserver.unobserve(en.target);
      }
    });
  }, { threshold: .08 });

  function observeReveals() {
    if (reduceMotion) return;
    $$('.stall, .wonder, .about-card, .section-head').forEach(el => {
      if (el.classList.contains('will-reveal') || el.classList.contains('in')) return;
      el.classList.add('will-reveal');
      el.style.transitionDelay = (Math.min(Number(el.style.getPropertyValue('--i')) || 0, 8) * 45) + 'ms';
      revealObserver.observe(el);
    });
  }

  // Safety net: if IntersectionObserver is throttled or a jump skips it,
  // reveal anything that is actually on screen while scrolling.
  function revealInView() {
    if (reduceMotion) return;
    const vh = window.innerHeight;
    $$('.will-reveal:not(.in)').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.top < vh * .98 && r.bottom > -20) {
        el.classList.add('in');
        revealObserver.unobserve(el);
      }
    });
  }

  /* ---------------- events ---------------- */
  function bind() {
    // theme / sound
    $('#themeBtn').addEventListener('click', e => toggleTheme(e));
    soundBtn.addEventListener('click', e => { e.stopPropagation(); toggleSoundPop(); });
    $('#soundClose').addEventListener('click', () => toggleSoundPop(false));
    musicToggle.addEventListener('click', toggleMusic);
    vol.addEventListener('input', () => {
      audio.setVolume(Number(vol.value) / 100);
      volLabel.textContent = vol.value + '%';
    });
    sfxToggle.addEventListener('change', () => {
      audio.setSfx(sfxToggle.checked);
      toast(sfxToggle.checked ? t('toast.sfxOn') : t('toast.sfxOff'), sfxToggle.checked ? '🔔' : '🔕');
    });
    $('#melodyBtn').addEventListener('click', () => { audio.melody(); audio.sfx('success'); });
    document.addEventListener('click', e => {
      if (!soundPop.hidden && !soundPop.contains(e.target) && !soundBtn.contains(e.target)) toggleSoundPop(false);
    });

    // language
    $$('[data-lang-btn]').forEach(btn => btn.addEventListener('click', () => {
      setLanguage(btn.dataset.langBtn);
      audio.sfx('click');
      toast(t('toast.lang', { lang: btn.dataset.langBtn === 'hi' ? 'हिन्दी' : btn.dataset.langBtn === 'eh' ? 'EH (Hinglish)' : 'English' }), '🗣️');
    }));

    // basket
    $('#basketBtn').addEventListener('click', openBasket);
    $('#mobileBasket').addEventListener('click', openBasket);
    $('#basketClose').addEventListener('click', closeBasket);
    scrim.addEventListener('click', closeBasket);
    $('#basketClear').addEventListener('click', () => {
      state.basket = {};
      renderBasket();
      audio.sfx('remove');
      toast(t('toast.cleared'), '🧺');
    });
    $('#basketBody').addEventListener('click', e => {
      const q = e.target.closest('[data-qty]');
      if (q) {
        const id = q.dataset.id;
        const next = (state.basket[id] || 0) + Number(q.dataset.qty);
        if (next <= 0) delete state.basket[id]; else state.basket[id] = next;
        renderBasket();
        audio.sfx(next <= 0 ? 'remove' : 'click');
        return;
      }
      const rm = e.target.closest('[data-remove]');
      if (rm) {
        const it = itemsById.get(rm.dataset.remove);
        delete state.basket[rm.dataset.remove];
        renderBasket();
        audio.sfx('remove');
        if (it) toast(t('toast.removed', { item: itemName(it) }), '🧺');
      }
    });
    $('#checkoutBtn').addEventListener('click', openReceipt);
    $('#downloadReceipt').addEventListener('click', downloadReceipt);
    $('#anotherBasket').addEventListener('click', () => {
      receiptDialog.close();
      state.basket = {};
      renderBasket();
      randomBasket(3);
      setTimeout(openBasket, 500);
    });

    // market
    const grid = $('#stallGrid');
    grid.addEventListener('click', e => {
      const add = e.target.closest('[data-add]');
      if (add) {
        e.stopPropagation();
        addToBasket(add.dataset.add);
        add.classList.add('is-added');
        add.querySelector('use')?.setAttribute('href', '#i-check');
        return;
      }
      const card = e.target.closest('.stall');
      if (card) { openItem(card.dataset.id); }
    });
    grid.addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const card = e.target.closest('.stall');
      if (card) { e.preventDefault(); openItem(card.dataset.id); }
    });
    grid.addEventListener('pointermove', e => {
      const card = e.target.closest('.stall');
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      card.style.setProperty('--my', (e.clientY - r.top) + 'px');
    });
    $('#searchInput').addEventListener('input', e => {
      state.filters.q = e.target.value;
      state.marketShown = 12;
      renderMarket();
    });
    $('#placeSelect').addEventListener('change', e => {
      state.filters.place = e.target.value;
      state.marketShown = 12;
      renderMarket();
      audio.sfx('click');
    });
    $('#sortSelect').addEventListener('change', e => {
      state.filters.sort = e.target.value;
      renderMarket();
      audio.sfx('click');
    });
    $('#categoryChips').addEventListener('click', e => {
      const chip = e.target.closest('[data-cat]');
      if (!chip) return;
      state.filters.cat = chip.dataset.cat;
      state.marketShown = 12;
      renderMarket();
      audio.sfx('click');
    });
    $('#marketMore').addEventListener('click', () => {
      state.marketShown += 12;
      renderMarket();
      audio.sfx('click');
    });
    const reset = () => {
      state.filters = { q: '', cat: 'all', place: 'all', sort: 'recent' };
      state.marketShown = 12;
      $('#searchInput').value = '';
      renderMarket();
      audio.sfx('close');
    };
    $('#resetFilters').addEventListener('click', reset);
    $('#emptyReset').addEventListener('click', reset);

    // ledger
    $('#placeChips').addEventListener('click', e => {
      const chip = e.target.closest('[data-place]');
      if (!chip) return;
      state.ledgerPlace = chip.dataset.place;
      state.ledgerShown = 8;
      renderLedger();
      audio.sfx('click');
    });
    $('#ledgerMore').addEventListener('click', () => {
      state.ledgerShown += 8;
      renderLedger();
      audio.sfx('click');
    });

    // ticker
    $('#tickerTrack').addEventListener('click', e => {
      const tick = e.target.closest('[data-item]');
      if (tick) openItem(tick.dataset.item);
    });
    $('#tickerTrack').addEventListener('keydown', e => {
      const tick = e.target.closest('[data-item]');
      if (tick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openItem(tick.dataset.item); }
    });

    // dialogs
    $$('[data-close-dialog]').forEach(btn => btn.addEventListener('click', () => btn.closest('dialog')?.close()));
    [itemDialog, receiptDialog, duelDialog].forEach(dlg => {
      dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
      dlg.addEventListener('close', () => {
        if (dlg === itemDialog) { state.openItem = null; }
        if (dlg === receiptDialog) { /* keep basket */ }
      });
    });
    itemBody.addEventListener('click', e => {
      if (e.target.closest('[data-close-dialog]')) { itemDialog.close(); return; }
      const add = e.target.closest('[data-add]');
      if (add) {
        addToBasket(add.dataset.add);
        const span = add.querySelector('span');
        if (span) span.textContent = t('dialog.inBasket');
      }
    });

    // explore
    $$('[data-wonder]').forEach(btn => btn.addEventListener('click', () => handleWonder(btn.dataset.wonder)));

    // hero scene controls
    $('#timeSlider').addEventListener('input', e => {
      scene?.setTime(Number(e.target.value), { stop: true });
      state.auto = false;
      updateSceneUI(Number(e.target.value), null, false);
    });
    $('#dayNightBtn').addEventListener('click', () => handleWonder('cycle'));
    $('#playDayBtn').addEventListener('click', () => handleWonder('cycle'));
    $('#crowdBtn').addEventListener('click', () => {
      scene?.spawnCrowd(9);
      audio.sfx('gossip');
      toast(t('toast.rush'), '🚶');
    });

    // stall clicks in canvas -> filter market
    scene?.onStall(cat => {
      state.filters.cat = cat;
      state.filters.q = '';
      $('#searchInput').value = '';
      renderMarket();
      $('#bazaar').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
      toast(catName(cat), D.categories[cat]?.emoji || '🛒');
    });

    // shortcuts
    document.addEventListener('keydown', e => {
      const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName) || document.activeElement.isContentEditable;
      if (e.key === 'Escape') {
        if (!soundPop.hidden) { toggleSoundPop(false); return; }
        if (itemDialog.open) { itemDialog.close(); return; }
        if (receiptDialog.open) { receiptDialog.close(); return; }
        if (duelDialog.open) { duelDialog.close(); return; }
        if (panel.classList.contains('is-open')) { closeBasket(); return; }
      }
      if (typing) return;
      if (e.key === '/') { e.preventDefault(); $('#searchInput').focus(); $('#bazaar').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' }); }
      else if (e.key.toLowerCase() === 'b') { e.preventDefault(); panel.classList.contains('is-open') ? closeBasket() : openBasket(); }
      else if (e.key.toLowerCase() === 't') { e.preventDefault(); toggleTheme(); }
      else if (e.key.toLowerCase() === 'm') { e.preventDefault(); toggleMusic(); }
    });

    // nav
    $('#menuBtn').addEventListener('click', () => {
      const nav = $('#nav');
      const open = nav.classList.toggle('menu-open');
      $('#menuBtn').setAttribute('aria-expanded', String(open));
    });
    $$('.nav-links a').forEach(a => a.addEventListener('click', () => {
      $('#nav').classList.remove('menu-open');
      $('#menuBtn').setAttribute('aria-expanded', 'false');
    }));

    // autoplay music on first gesture
    const armAudio = e => {
      if (state.hasInteracted) return;
      if (e && e.target && e.target.closest && e.target.closest('#soundBtn, #musicToggle')) return;
      state.hasInteracted = true;
      const saved = store.get('kharidaar.sound', null);
      const shouldStart = !saved || saved.enabled !== false;
      if (shouldStart && !audio.enabled) {
        audio.start();
        updateSoundUI();
        setTimeout(() => toast(t('toast.musicOn'), '🎵'), 700);
      }
      document.removeEventListener('pointerdown', armAudio);
      document.removeEventListener('keydown', armAudio);
    };
    document.addEventListener('pointerdown', armAudio);
    document.addEventListener('keydown', armAudio);
  }

  /* ---------------- scroll nav ---------------- */
  function bindScroll() {
    const nav = $('#nav');
    const sections = ['bazaar', 'ledger', 'explore', 'about'].map(id => document.getElementById(id)).filter(Boolean);
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (en.isIntersecting) {
          $$('.nav-links a').forEach(a => a.classList.toggle('is-active', a.dataset.nav === en.target.id));
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach(s => io.observe(s));
    const onScroll = () => { nav.classList.toggle('is-stuck', window.scrollY > 20); revealInView(); };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', revealInView);
    onScroll();
    setTimeout(revealInView, 120);
  }

  /* ---------------- init ---------------- */
  function init() {
    const params = new URLSearchParams(location.search);
    if (params.get('flat')) document.documentElement.classList.add('flat');
    // language from storage (markup already has English)
    const queryLang = params.get('lang');
    const savedLang = queryLang && ['en', 'hi', 'eh'].includes(queryLang) ? queryLang : store.get('kharidaar.lang', I.lang || 'en');
    if (savedLang && savedLang !== I.lang) I.setLang(savedLang);
    state.lang = I.lang;

    // theme
    const queryTheme = params.get('theme');
    const startTheme = queryTheme === 'dark' || queryTheme === 'light' ? queryTheme : (document.documentElement.dataset.theme || 'light');
    applyTheme(startTheme, { moveScene: false });

    // basket
    const savedBasket = store.get('kharidaar.basket', {});
    if (savedBasket && typeof savedBasket === 'object') {
      Object.entries(savedBasket).forEach(([id, qty]) => {
        if (itemsById.has(id) && Number.isFinite(Number(qty)) && Number(qty) > 0) state.basket[id] = Math.min(99, Math.floor(Number(qty)));
      });
    }

    updateSoundUI();

    // scene starts at real local time
    if (scene) {
      const now = new Date();
      let minutes = now.getHours() * 60 + now.getMinutes();
      const queryTime = params.get('time');
      if (queryTime) {
        const m = queryTime.match(/^(\d{1,2}):(\d{2})$/);
        if (m) minutes = (Number(m[1]) * 60 + Number(m[2])) % 1440;
      }
      scene.setTime(minutes);
      updateSceneUI(minutes, null, false);
      scene.onTime((mm, p, c) => updateSceneUI(mm, p, c));
    } else {
      updateSceneUI(920, null, false);
    }

    renderAll();
    bind();
    bindScroll();
    observeReveals();

    I.onChange(() => { renderAll(); });

    // restore basket count only if non-empty
    updateBasketCount();

    const scrollTo = params.get('scroll');
    if (scrollTo) {
      const el = document.getElementById(scrollTo);
      if (el) setTimeout(() => window.scrollTo({ top: el.offsetTop - 72, behavior: 'instant' }), 60);
    } else if (location.hash.length > 1) {
      // deep links: re-scroll after the market/ledger have rendered
      const el = document.getElementById(location.hash.slice(1));
      if (el) setTimeout(() => window.scrollTo({ top: el.offsetTop - 72, behavior: 'instant' }), 140);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
