// קובצי-דוגמה סינתטיים לפי חוזה tp/1 — לבדיקות בלבד (כל הסשנים של האתר).
// מחזיר מפת-קבצים כמו של fflate ({נתיב: Uint8Array}); zipSync(entries) = קובץ ZIP אמיתי.
// בלי טקסט מספרים: הטקסטים כאן מילים כלליות.

const enc = new TextEncoder();
// PNG של פיקסל אחד — מספיק לבדיקת "התמונה קיימת בקובץ"
const PNG_1PX = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNgAAAAAgABc3UBGAAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0)
);

const hex = (n, len) => n.toString(16).padStart(len, '0').slice(-len);
export const sigOf = (n) => '9c1e0a7b' + hex(n, 8);
const WORDS = ['אמר', 'רבי', 'לא', 'היה', 'צריך', 'להתחיל', 'את', 'התורה', 'אלא', 'מן', 'החודש', 'הזה'];

export function manifestOf(section, extra = {}) {
  return {
    contract: 'tp/1',
    direction: 'to-site',
    section,
    package_id: 'tp-20261027-1f3a9c2e',
    part: 1,
    parts: 1,
    station_id: 'st-6b1e0d5a',
    created_at: '2026-10-27T21:40:00+02:00',
    label: 'דוגמה',
    counts: { items: 0 },
    note: '',
    ...extra,
  };
}

export function ocrItem(i, extra = {}) {
  const tracks = ['rashi', 'square', 'mixed', 'latin'];
  return {
    uid: `ocr:lines:${22710 + i}`,
    sig: sigOf(i),
    img: `img/${22710 + i}.png`,
    w: 612,
    h: 38,
    track: tracks[i % tracks.length],
    source: i % 5 === 4 ? 'synth' : 'ocr',
    text: WORDS.slice(i % 6, (i % 6) + 5).join(' '),
    conf: 80 + (i % 20),
    book: `b-${hex(0x5e0c2a91d4 + (i % 3), 10)}`,
    alias: `ספר ${412 + (i % 3)}`,
    page: 17 + (i % 4),
    line_no: 1 + (i % 30),
    ...extra,
  };
}

export function routerItem(i, extra = {}) {
  const preds = ['square', 'rashi', 'mixed', 'latin'];
  const pred = preds[i % preds.length];
  const words = [0, 1, 2, 3].map((k) => ({ k, box: [450 - k * 110, 0, 540 - k * 110, 54], pred: k === 2 ? 'rashi' : 'square' }));
  return {
    uid: `router:rlines:${777 + i}`,
    sig: sigOf(1000 + i),
    img: `img/r${777 + i}.png`,
    w: 540,
    h: 54,
    pred,
    pred_p: 0.71,
    text: WORDS.slice(0, 4).join(' '),
    book: `b-${hex(0xa7f3310c6e + (i % 2), 10)}`,
    alias: `ספר ${388 + (i % 2)}`,
    page: 3,
    ...(i % 3 === 2 ? {} : { words }),
    ...extra,
  };
}

export const BOOKS = [
  {
    book: 'b-a7f3310c6e',
    alias: 'ספר 388',
    kind: 'scan',
    pages_total: 24,
    streams: [
      { id: 's1', name: 'פנים', role: 'body' },
      { id: 's2', name: "פירוש א'", role: 'commentary' },
    ],
  },
];

export function framesItem(i, extra = {}) {
  return {
    uid: `frames:fpages:${79 + i}`,
    sig: sigOf(2000 + i),
    book: 'b-a7f3310c6e',
    page: 1 + i,
    img: `img/p${79 + i}.png`,
    w: 1700,
    h: 2443,
    scale: 1.0,
    ptype: 'scan',
    status: 'proposed',
    frames: [
      { fid: 'f1', kind: 'text', role: 'furniture', box: [474.7, 163.6, 1519.5, 211.7], stream: null, ord: 1, cont: false, src: 'auto' },
      { fid: 'f2', kind: 'text', role: 'body', box: [872.2, 265.5, 1520.8, 2243.5], stream: 's1', ord: 2, cont: true, src: 'auto' },
      { fid: 'f9', kind: 'object', role: 'object', obj: 'figure', box: [100, 300, 600, 700], stream: null, ord: null, cont: false, src: 'auto' },
    ],
    ...extra,
  };
}

const MAKERS = { ocr: ocrItem, router: routerItem, frames: framesItem };

// קובץ שלם: n פריטים בחלק. opts.items — פריטים מוכנים במקום המחולל; opts.manifest — שדות לדריסה
export function sampleEntries(section, { n = 3, items = null, manifest = {}, prefix = '' } = {}) {
  const list = items || Array.from({ length: n }, (_, i) => MAKERS[section](i));
  const m = manifestOf(section, { counts: { items: list.length }, ...manifest });
  const entries = {
    [`${prefix}manifest.json`]: enc.encode(JSON.stringify(m)),
    [`${prefix}items.jsonl`]: enc.encode(list.map((it) => JSON.stringify(it)).join('\n') + '\n'),
  };
  if (section === 'frames') entries[`${prefix}books.json`] = enc.encode(JSON.stringify(BOOKS));
  for (const it of list) {
    entries[prefix + it.img] = PNG_1PX;
    if (it.ctx?.img) entries[prefix + it.ctx.img] = PNG_1PX;
  }
  return entries;
}
