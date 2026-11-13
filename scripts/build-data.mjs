// Fetches the public "Price" sheet and turns it into js/data.js
import { writeFile, mkdir } from 'node:fs/promises';

const SHEET_ID = '1hwVcnyeRMP8Zh_G32qj-9qftLvwJ8308KE55PD9148c';
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`;

const CATEGORIES = {
  fruits:   { emoji: '🍎', hi: 'फल और सब्ज़ी', en: 'Fruits & Veg',     color: '#e4572e' },
  dairy:    { emoji: '🥛', hi: 'दूध और बेकरी', en: 'Dairy & Bakery',   color: '#4a90d9' },
  staples:  { emoji: '🌾', hi: 'राशन और मेवे',  en: 'Staples & Nuts',   color: '#b07d3a' },
  snacks:   { emoji: '🍬', hi: 'मिठाई और नमकीन', en: 'Sweets & Snacks', color: '#d1495b' },
  health:   { emoji: '🩺', hi: 'सेहत और देखभाल', en: 'Health & Care',   color: '#2a9d8f' },
  home:     { emoji: '🏠', hi: 'घर और तकनीक',   en: 'Home & Tech',     color: '#7b6cd9' },
  travel:   { emoji: '🚌', hi: 'सफ़र',          en: 'Travel',          color: '#e08e2b' },
  meals:    { emoji: '🍽️', hi: 'खाना',         en: 'Meals',           color: '#c46b2e' },
};

const ITEM_CATEGORY = {
  'General': 'fruits', 'Metro': 'travel', 'Food': 'meals', 'Milk': 'dairy',
  'Litchi': 'fruits', 'Vegetables': 'fruits', 'Mango': 'fruits', 'Egg': 'meals',
  'Saloon': 'health', 'Fruits': 'fruits', 'Library': 'home', 'Pear': 'fruits',
  'Almonds': 'staples', 'Apples': 'fruits', 'Kaju': 'staples', 'Petha': 'snacks',
  'Sona Papdi': 'snacks', 'Teeth': 'health', 'Moongfali': 'staples', 'Bus': 'travel',
  'Medical': 'health', 'Curd': 'dairy', 'Bread': 'dairy', 'Hajmola': 'snacks',
  'Papaya': 'fruits', 'Bulb': 'home', 'Airtel': 'home', 'Sprouts': 'staples',
  'Eggs': 'meals', 'Butter': 'dairy', 'Earphones': 'home', 'Oranges': 'fruits',
  'RO': 'home', 'Carrots': 'fruits', 'Black Chickpea': 'staples', 'Onions': 'fruits',
  'Medicine': 'health', 'Beetroot': 'fruits', 'Paneer': 'dairy', 'Rice': 'staples',
  'Tomatoes': 'fruits', 'Lip Balm': 'health', 'Brush': 'health', 'Laddu': 'snacks',
  'Battery': 'home', 'Wheat': 'staples', 'Besan': 'staples', 'Spray': 'health',
  'Hotel': 'travel', 'Mask': 'health', 'Lentils': 'staples', 'Gift': 'home',
  'Peas': 'fruits',
};

const HI_NAMES = {
  Apples: 'सेब', Oranges: 'संतरा', Banana: 'केला', Carrot: 'गाजर', Carrots: 'गाजर',
  Lemon: 'नींबू', Milk: 'दूध', Curd: 'दही', Paneer: 'पनीर', Butter: 'मक्खन',
  Bread: 'ब्रेड', Litchi: 'लीची', Mango: 'आम', Pear: 'नाशपाती', Papaya: 'पपीता',
  Petha: 'पेठा', Kaju: 'काजू', Almonds: 'बादाम', Moongfali: 'मूंगफली',
  Rice: 'चावल', Wheat: 'गेहूँ', Besan: 'बेसन', Lentils: 'मसूर दाल',
  'Black Chickpea': 'काला चना', Sprouts: 'अंकुरित', Onions: 'प्याज़',
  Tomatoes: 'टमाटर', Peas: 'मटर', Beetroot: 'चुकंदर', Vegetables: 'सब्ज़ियाँ',
  Fruits: 'फल', Eggs: 'अंडे', Egg: 'अंडा', Food: 'खाना', Metro: 'मेट्रो',
  Bus: 'बस', Hotel: 'होटल', Saloon: 'सैलून', Teeth: 'दाँत', Medical: 'इलाज',
  Medicine: 'दवाई', 'Lip Balm': 'लिप बाम', Brush: 'ब्रश', Mask: 'मास्क',
  Spray: 'स्प्रे', Bulb: 'बल्ब', Battery: 'बैटरी', Airtel: 'एयरटेल',
  Earphones: 'ईयरफ़ोन', Library: 'लाइब्रेरी', RO: 'आरओ', Hajmola: 'हाजमोला',
  Laddu: 'लड्डू', 'Sona Papdi': 'सोना पापड़ी', Gift: 'गिफ़्ट', General: 'आम बाज़ार',
};

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

function parseCSV(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function isoDate(s) {
  const m = s.trim().match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/);
  if (!m) return null;
  const month = MONTHS[m[2].slice(0, 3).toLowerCase()];
  if (month === undefined) return null;
  const d = new Date(Date.UTC(+m[3], month, +m[1]));
  return d.toISOString().slice(0, 10);
}

const UNIT_ALIASES = [
  [/^(kgs?|kilograms?|kilo)$/i, 'kg'],
  [/^(gms?|grams?|g)$/i, 'g'],
  [/^(ml|millilitres?)$/i, 'ml'],
  [/^(l|litres?|liters?)$/i, 'L'],
  [/^(dozen|doz)$/i, 'dozen'],
  [/^(piece|pieces|pc|pcs)$/i, 'piece'],
  [/^(packet|pack|packet of)$/i, 'pack'],
];

function normaliseUnit(raw) {
  if (!raw) return null;
  const u = raw.trim().replace(/\s+/g, '').toLowerCase();
  let m = u.match(/^(\d+(?:\.\d+)?)(kgs?|gms?|grams?|g|ml|l|litres?|liters?)$/);
  if (m) {
    for (const [re, label] of UNIT_ALIASES) if (re.test(m[2])) return m[1] + label;
  }
  for (const [re, label] of UNIT_ALIASES) if (re.test(u)) return label;
  return null;
}

function extractPrice(desc) {
  if (!desc) return { price: null, unit: null, norm: null, basis: null };
  const re = /(?:₹|Rs\.?|INR)\s*(\d+(?:\.\d+)?)/i;
  const m = desc.match(re);
  if (!m) return { price: null, unit: null, norm: null, basis: null };
  const price = parseFloat(m[1]);
  const after = desc.slice(m.index + m[0].length);
  let unit = null;
  const u = after.match(/^\s*(?:\/|per\s+|a\s+)\s*([0-9.]*\s*(?:kgs?|kilograms?|gms?|grams?|g|ml|l|litres?|liters?|dozen|pieces?|pcs?|packets?|packs?))\b/i);
  if (u) unit = normaliseUnit(u[1]);
  if (!unit) {
    const u2 = after.match(/^\s*\/\s*([0-9.]+\s*(?:kg|gm|g|ml|l|litre|liter))\b/i);
    if (u2) unit = normaliseUnit(u2[1]);
  }

  // Normalise price to a comparable base: ₹/kg, ₹/L or ₹/piece
  let norm = price, basis = null;
  if (unit) {
    const p = unit.match(/^(\d+(?:\.\d+)?)?(kg|g|L|ml|dozen|piece|pack)$/);
    if (p) {
      const qty = p[1] ? parseFloat(p[1]) : 1;
      const kind = p[2];
      if (kind === 'kg') { norm = (price * 1000) / (qty * 1000); basis = 'kg'; }
      else if (kind === 'g') { norm = (price * 1000) / qty; basis = 'kg'; }
      else if (kind === 'L') { norm = (price * 1000) / (qty * 1000); basis = 'L'; }
      else if (kind === 'ml') { norm = (price * 1000) / qty; basis = 'L'; }
      else if (kind === 'dozen') { norm = price / (12 * qty); basis = 'piece'; }
      else if (kind === 'piece') { norm = price / qty; basis = 'piece'; }
      else { norm = price; basis = null; }
    }
  }
  norm = Math.round(norm * 100) / 100;
  return { price, unit, norm, basis };
}

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

const res = await fetch(CSV_URL);
if (!res.ok) throw new Error('Sheet fetch failed: ' + res.status);
const csv = await res.text();
await mkdir('data', { recursive: true });
await writeFile('data/price-sheet.csv', csv, 'utf8');

const rows = parseCSV(csv);
const header = rows[0].map(h => h.trim().toLowerCase());
const col = name => header.indexOf(name);
const iDate = col('date'), iPlace = col('place'), iItem = col('item'), iDesc = col('description'), iRemark = col('remark');

const records = [];
for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  const date = isoDate(r[iDate] || '');
  const item = (r[iItem] || '').trim();
  if (!date || !item) continue;
  const desc = (r[iDesc] || '').trim();
  const remark = (r[iRemark] || '').trim();
  const place = (r[iPlace] || '').trim() || 'Delhi';
  const { price, unit, norm, basis } = extractPrice(desc);
  const cat = ITEM_CATEGORY[item] || 'staples';
  records.push({
    id: `r${i}`,
    date,
    place,
    item,
    desc,
    remark,
    price,
    unit,
    norm,
    basis,
    category: cat,
  });
}

records.sort((a, b) => a.date.localeCompare(b.date) || a.item.localeCompare(b.item));

const byItem = new Map();
for (const rec of records) {
  if (!byItem.has(rec.item)) byItem.set(rec.item, []);
  byItem.get(rec.item).push(rec);
}

const items = [...byItem.entries()].map(([name, recs]) => {
  const priced = recs.filter(r => typeof r.price === 'number');
  const basisCount = priced.reduce((acc, r) => {
    if (r.basis) acc[r.basis] = (acc[r.basis] || 0) + 1;
    return acc;
  }, {});
  const dominant = Object.entries(basisCount).sort((a, b) => b[1] - a[1])[0];
  const seriesBasis = dominant && dominant[1] >= 2 ? dominant[0] : null;
  const series = seriesBasis
    ? priced.filter(r => r.basis === seriesBasis)
    : priced;

  const last = series[series.length - 1] || null;
  const prev = last
    ? [...series].reverse().find(r => r !== last && (seriesBasis || r.place === last.place)) || null
    : null;
  const priceValue = r => (seriesBasis ? r.norm : r.price);
  const change = last && prev && priceValue(prev)
    ? ((priceValue(last) - priceValue(prev)) / priceValue(prev)) * 100
    : null;
  const values = series.map(priceValue);
  const places = [...new Set(recs.map(r => r.place))];

  return {
    id: slug(name),
    name,
    hi: HI_NAMES[name] || name,
    category: recs[0].category,
    unit: last?.unit || null,
    latest: last?.price ?? null,
    latestDate: last?.date ?? recs[recs.length - 1].date,
    prev: prev ? priceValue(prev) : null,
    change: change === null ? null : Math.round(change * 10) / 10,
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
    avg: values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null,
    count: recs.length,
    seriesBasis,
    normValue: last?.norm ?? null,
    places,
    history: series.map(r => ({
      date: r.date,
      price: priceValue(r),
      raw: r.price,
      unit: r.unit,
      place: r.place,
      desc: r.desc,
    })),
    records: recs,
  };
}).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

const places = [...new Set(records.map(r => r.place))].sort();
const dates = records.map(r => r.date).sort();
const allPrices = records.filter(r => typeof r.price === 'number').map(r => r.price);

const payload = {
  meta: {
    sheetId: SHEET_ID,
    sheetUrl: `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`,
    generatedAt: new Date().toISOString(),
    firstDate: dates[0],
    lastDate: dates[dates.length - 1],
    recordCount: records.length,
    itemCount: items.length,
    placeCount: places.length,
    pricedCount: allPrices.length,
    medianPrice: (() => {
      const s = [...allPrices].sort((a, b) => a - b);
      return s.length ? s[Math.floor(s.length / 2)] : 0;
    })(),
  },
  categories: CATEGORIES,
  places,
  items,
  records,
};

const js = `/* Generated from the Kharidaar price sheet on ${payload.meta.generatedAt}. Do not edit by hand. */\nwindow.KHARIDAAR_DATA = ${JSON.stringify(payload)};\n`;
await writeFile('js/data.js', js, 'utf8');
console.log(`OK ${records.length} records · ${items.length} items · ${places.length} places · ${dates[0]} → ${dates[dates.length - 1]}`);
