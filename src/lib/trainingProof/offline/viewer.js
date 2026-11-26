// חלון-הסקירה שבתוך קובץ "אישור בלי אינטרנט" (docs/115 §4).
//
// viewerMain נכתבת לתוך הקובץ כמו שהיא (Function.prototype.toString) ורצה בדפדפן בלי רשת —
// ולכן היא **סגורה לגמרי**: אסור לה להשתמש בשום דבר מחוץ לגוף הפונקציה (לא import, לא קבוע
// של המודול). כל התוויות והצבעים מגיעים בנתונים שבקובץ (tp-data).
//
// מה החלון עושה: מציג את מה שממתין לאישור (זיהוי · נתב · גלאי) כמו מסך הסקירה באתר, עם אותם
// מקשים; כל החלטה נשמרת מיד בזיכרון הדפדפן; "שמור קובץ-החלטות" מוריד את קובץ tpd/1 שמעלים
// באתר; "טען קובץ-החלטות" ממשיך מקובץ ששמרתם.

export const VIEWER_CSS = `
:root{--bg:#f6f7f9;--card:#fff;--ink:#1c1f24;--mute:#5b6270;--line:#d9dde3;--acc:#1d4ed8;--ok:#15803d;--bad:#b91c1c;--fix:#a16207;--site:#6d28d9;--del:#fde2e2;--ins:#dcfce7}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 "Segoe UI",Arial,sans-serif}
.loading{padding:40px;text-align:center;color:var(--mute)}
header.top{position:sticky;top:0;z-index:5;background:#fff;border-bottom:1px solid var(--line);padding:10px 16px;display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center}
header.top h1{font-size:17px;margin:0;flex:1 1 260px}
.counts{display:flex;flex-wrap:wrap;gap:6px;font-size:13px}
.pill{display:inline-flex;align-items:center;gap:4px;border-radius:999px;padding:1px 9px;border:1px solid var(--line);background:#fff;font-size:13px;white-space:nowrap}
.pill.approve{border-color:var(--ok);color:var(--ok)}.pill.reject{border-color:var(--bad);color:var(--bad)}.pill.fix{border-color:var(--fix);color:var(--fix)}.pill.site{border-color:var(--site);color:var(--site)}
button{font:inherit;border:1px solid var(--line);background:#fff;color:var(--ink);border-radius:8px;padding:4px 11px;cursor:pointer}
button:hover{background:#eef1f5}button:disabled{opacity:.45;cursor:default}
button.primary{background:var(--acc);border-color:var(--acc);color:#fff}button.primary:hover{background:#1e40af}
button.primary kbd{background:transparent;color:inherit;border-color:rgba(255,255,255,.7)}
button.warn{border-color:var(--fix);color:var(--fix)}
button.on{outline:2px solid var(--acc)}
kbd{font:12px/1.2 Consolas,monospace;border:1px solid var(--line);border-bottom-width:2px;border-radius:4px;padding:0 4px;background:#fff}
main{max-width:1100px;margin:0 auto;padding:12px 16px 80px}
.bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:8px 0}
.bar label{display:inline-flex;gap:6px;align-items:center;font-size:14px}
select{font:inherit;padding:3px 6px;border:1px solid var(--line);border-radius:8px;background:#fff}
.hint{color:var(--mute);font-size:13px}
details.help{background:#fff;border:1px solid var(--line);border-radius:10px;padding:8px 12px;margin:8px 0}
details.help summary{cursor:pointer;font-weight:600}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px 12px;margin:10px 0}
.card.cur{outline:3px solid #93c5fd}
.card.d-approve{border-inline-start:6px solid var(--ok)}.card.d-reject{border-inline-start:6px solid var(--bad)}.card.d-fix{border-inline-start:6px solid var(--fix)}.card.d-site{border-inline-start:6px solid var(--site)}
.meta{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;font-size:13px;color:var(--mute);margin-bottom:6px}
.chip{border-radius:6px;padding:0 7px;color:#fff;font-size:12.5px}
.badge{margin-inline-start:auto;font-weight:700}
.badge.approve{color:var(--ok)}.badge.reject{color:var(--bad)}.badge.fix{color:var(--fix)}.badge.site{color:var(--site)}
.imgbox{position:relative;display:inline-block;max-width:100%;direction:ltr;background:#fff;border:1px solid var(--line)}
.imgbox img{display:block;max-width:100%;height:auto}
.imgbox .box{position:absolute;border:2px solid;pointer-events:none}
.imgbox .box.model{border-style:dashed;opacity:.75}
.imgbox .box span{position:absolute;top:-2px;right:-2px;transform:translateY(-100%);font:11px/1.3 Arial;color:#fff;padding:0 4px;border-radius:3px;white-space:nowrap;direction:rtl}
.imgbox .word{position:absolute;border:2px solid;cursor:pointer;background:rgba(255,255,255,.08)}
.imgbox .hl{position:absolute;border:3px solid #ef4444;pointer-events:none}
.missing{padding:12px;color:var(--bad);font-size:13px}
.texts{margin:8px 0;display:grid;grid-template-columns:auto 1fr;gap:2px 10px;font-size:16px}
.texts .k{color:var(--mute);font-size:13px;padding-top:3px;white-space:nowrap}
del{background:var(--del);text-decoration:line-through;border-radius:3px;padding:0 2px}
ins{background:var(--ins);text-decoration:none;border-radius:3px;padding:0 2px}
textarea{width:100%;font:17px/1.6 "Segoe UI",Arial,sans-serif;padding:6px 8px;border:2px solid var(--acc);border-radius:8px;resize:vertical}
.actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
.ctx{margin-top:8px}
.legend{display:flex;flex-wrap:wrap;gap:4px 10px;font-size:12.5px;margin:6px 0}
.legend i{display:inline-block;width:12px;height:12px;border-radius:3px;margin-inline-end:4px;vertical-align:-1px}
.pager{display:flex;gap:8px;align-items:center;justify-content:center;margin:14px 0}
.toast{position:fixed;bottom:16px;inset-inline-start:16px;z-index:9;background:#111827;color:#fff;padding:10px 14px;border-radius:10px;max-width:520px;box-shadow:0 4px 18px rgba(0,0,0,.25)}
.empty{text-align:center;color:var(--mute);padding:30px}
@media print{header.top,.actions,.bar{display:none}}
`;

export function viewerMain() {
  'use strict';
  const D = JSON.parse(document.getElementById('tp-data').textContent);
  const S = D.section;
  const L = D.labels;
  const C = D.colors;
  const items = D.items;
  const byId = new Map(items.map((it) => [it.id, it]));
  const PER = S === 'frames' ? 5 : 40;
  const SKEY = 'tp-offline:' + D.offline_id + ':' + D.part;
  const DL = { approve: 'אושר', reject: 'נדחה', fix: 'תוקן ואושר', site: 'לתקן באתר' };
  const app = document.getElementById('app');
  // חלון אחד בכל דף: הפעלה חוזרת (בבדיקות) מנתקת את המאזינים של הקודמת
  if (window.__tpOffline) window.__tpOffline.abort();
  const life = new AbortController();
  window.__tpOffline = life;
  const on = { signal: life.signal };

  // ---------- תמונות מתוך הקובץ ----------
  const urls = new Map();
  function imgUrl(key) {
    if (!key) return null;
    if (urls.has(key)) return urls.get(key);
    const el = document.querySelector('script[data-img="' + key + '"]');
    let url = null;
    if (el) {
      const b64 = el.textContent.trim();
      const t = el.getAttribute('data-t') || 'image/jpeg';
      if (typeof URL !== 'undefined' && URL.createObjectURL) {
        const bin = atob(b64);
        const u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        url = URL.createObjectURL(new Blob([u8], { type: t }));
      } else url = 'data:' + t + ';base64,' + b64;
    }
    urls.set(key, url);
    return url;
  }

  // ---------- המצב: החלטות + "מה עוד לא נשמר לקובץ" ----------
  let st = { dec: {}, dirty: {} };
  let staleMemory = 0;
  const version = (it) => ({ v: it.v, r: it.r == null ? 0 : it.r });
  const sameVersion = (x, it) => !!x && x.v === it.v && (x.r === undefined ? 0 : x.r) === (it.r == null ? 0 : it.r);
  const validDecision = (x) => x && ['approve', 'reject', 'fix', 'site'].includes(x.d) && (x.d !== 'fix' || (S !== 'frames' && x.mark && typeof x.mark === 'object' && !Array.isArray(x.mark)));
  try {
    const raw = window.localStorage.getItem(SKEY);
    if (raw) {
      const x = JSON.parse(raw);
      if (x && x.dec) {
        for (const id of Object.keys(x.dec)) {
          const it = byId.get(id);
          const d = x.dec[id];
          if (it && sameVersion(d, it) && validDecision(d)) st.dec[id] = d;
          else staleMemory++;
        }
        for (const id of Object.keys(x.dirty || {})) {
          const it = byId.get(id);
          if (it && sameVersion(x.dirty[id], it)) st.dirty[id] = x.dirty[id];
        }
      }
    }
  } catch (e) {
    /* חלון פרטי / זיכרון חסום — עובדים בלי שמירה מעצמה */
  }
  function persist() {
    try {
      window.localStorage.setItem(SKEY, JSON.stringify(st));
    } catch (e) {
      /* אין זיכרון — הקובץ הוא הגיבוי */
    }
  }
  const unsaved = () => Object.keys(st.dirty).length;
  function setDec(it, d, mark) {
    const v = version(it);
    st.dec[it.id] = mark ? { v: v.v, r: v.r, d: d, mark: mark } : { v: v.v, r: v.r, d: d };
    st.dirty[it.id] = v;
  }
  function clearDec(it) {
    if (!st.dec[it.id]) return;
    delete st.dec[it.id];
    st.dirty[it.id] = version(it);
  }

  // ---------- תצוגה ----------
  const view = { f: { status: 'open', track: '', action: '', vol: '', agree: '' }, page: 0, cur: 0, edit: null, ctx: {}, model: false, toast: '' };
  const vols = [];
  const seenVol = new Set();
  for (const it of items) {
    if (it.vol && !seenVol.has(it.vol.id)) {
      seenVol.add(it.vol.id);
      vols.push(it.vol);
    }
  }
  const streams = new Map(((D.book && D.book.streams) || []).map((s) => [s.id, s]));

  function h(tag, attrs) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'style') el.setAttribute('style', v);
        else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
        else if (k === 'text') el.textContent = v;
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (let i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach((x) => add(el, x));
    else el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  const kbd = (k) => h('kbd', null, k);
  const fmt = (n) => Number(n || 0).toLocaleString('he-IL');

  // הבדל ברמת מילה (כמו wordDiff באתר)
  function wordDiff(a, b) {
    const A = String(a || '').split(/\s+/).filter(Boolean);
    const B = String(b || '').split(/\s+/).filter(Boolean);
    const n = A.length;
    const m = B.length;
    if (n > 400 || m > 400) return A.map((t) => ({ t: t, op: 'del' })).concat(B.map((t) => ({ t: t, op: 'ins' })));
    const T = [];
    for (let i = 0; i <= n; i++) T.push(new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) T[i][j] = A[i] === B[j] ? T[i + 1][j + 1] + 1 : Math.max(T[i + 1][j], T[i][j + 1]);
    const out = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (A[i] === B[j]) {
        out.push({ t: A[i], op: 'same' });
        i++;
        j++;
      } else if (T[i + 1][j] >= T[i][j + 1]) out.push({ t: A[i++], op: 'del' });
      else out.push({ t: B[j++], op: 'ins' });
    }
    while (i < n) out.push({ t: A[i++], op: 'del' });
    while (j < m) out.push({ t: B[j++], op: 'ins' });
    return out;
  }
  function diffEl(a, b, dir) {
    const span = h('span', { dir: dir });
    wordDiff(a, b).forEach((d, i) => {
      if (i) add(span, ' ');
      add(span, d.op === 'same' ? d.t : h(d.op === 'del' ? 'del' : 'ins', null, d.t));
    });
    return span;
  }
  const norm = (s) => String(s == null ? '' : s).normalize('NFC').replace(/[\t ]/g, ' ').replace(/ {2,}/g, ' ').trim();
  const dirOf = (track) => (track === 'latin' ? 'ltr' : 'rtl');
  const chip = (text, color) => h('span', { class: 'chip', style: 'background:' + (color || '#6b7280') }, text);

  // ---------- סינון ----------
  function volLabel(it) {
    const r = it.result || {};
    if (r.bad) return 'bad';
    return r.label || '';
  }
  function matches(it) {
    const f = view.f;
    const d = st.dec[it.id] ? st.dec[it.id].d : null;
    if (f.status === 'open' && d && d !== 'site') return false;
    if (f.status !== 'open' && f.status !== 'all' && d !== f.status) return false;
    if (f.vol && (!it.vol || it.vol.id !== f.vol)) return false;
    if (S === 'ocr') {
      if (f.track && it.track !== f.track) return false;
      if (f.action && (!it.result || it.result.action !== f.action)) return false;
    }
    if (S === 'router') {
      if (f.track && volLabel(it) !== f.track) return false;
      if (f.agree === '1' && !it.agrees) return false;
      if (f.agree === '0' && it.agrees) return false;
    }
    return true;
  }
  const visible = () => items.filter(matches);

  function counts() {
    const c = { approve: 0, reject: 0, fix: 0, site: 0 };
    for (const id in st.dec) if (byId.has(id) && c[st.dec[id].d] != null) c[st.dec[id].d]++;
    c.open = items.length - c.approve - c.reject - c.fix;
    return c;
  }

  // ---------- פעולות ----------
  let list = [];
  // פעולות בעכבר ובמקלדת חייבות להצביע על אותו כרטיס, גם כשעורכים כרטיס שאינו הראשון.
  function selectItem(it) {
    const index = list.findIndex((x) => x.id === it.id);
    if (index < 0) return;
    view.page = Math.floor(index / PER);
    view.cur = index % PER;
  }
  function move(delta) {
    const n = Math.max(1, Math.ceil(list.length / PER));
    let cur = view.page * PER + view.cur + delta;
    cur = Math.max(0, Math.min(list.length - 1, cur));
    view.page = Math.min(n - 1, Math.floor(cur / PER));
    view.cur = cur - view.page * PER;
  }
  function after(it) {
    // אחרי החלטה: השורה הבאה. במסנן "עוד לא החלטתי" השורה יוצאת מהרשימה והבאה תופסת את מקומה
    view.edit = null;
    if (matches(it)) move(1);
    render(true);
  }
  function decide(it, d, mark) {
    selectItem(it);
    setDec(it, d, mark);
    persist();
    after(it);
  }
  function undo(it) {
    selectItem(it);
    clearDec(it);
    persist();
    view.edit = null;
    render(true);
  }

  function bulk(label, pick, d) {
    const targets = list.filter((it) => !st.dec[it.id] && pick(it));
    if (!targets.length) return toast('אין מה לסמן');
    if (!window.confirm(label + ' — ' + fmt(targets.length) + ' ' + (S === 'frames' ? 'עמודים' : 'שורות') + '. להמשיך?')) return;
    targets.forEach((it) => setDec(it, d));
    persist();
    toast(fmt(targets.length) + ' סומנו "' + DL[d] + '"');
    render();
  }
  function bulkUndo() {
    const targets = list.filter((it) => st.dec[it.id]);
    if (!targets.length) return toast('אין החלטות במוצגות');
    if (!window.confirm('לבטל ' + fmt(targets.length) + ' החלטות במוצגות?')) return;
    targets.forEach(clearDec);
    persist();
    render();
  }

  function saveFile() {
    const decisions = [];
    const later = [];
    for (const it of items) {
      const x = st.dec[it.id];
      if (!x) continue;
      if (x.d === 'site') later.push(it.id);
      else decisions.push(x.mark ? { id: it.id, v: x.v, r: x.r, d: x.d, mark: x.mark } : { id: it.id, v: x.v, r: x.r, d: x.d });
    }
    if (!decisions.length) return toast('עוד אין החלטות לשמור');
    const body = {
      contract: 'tpd/1',
      section: S,
      offline_id: D.offline_id,
      part: D.part,
      parts: D.parts,
      created_at: new Date().toISOString(),
      site: D.site,
      decisions: decisions,
      later: later,
    };
    const blob = new Blob([JSON.stringify(body)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL ? URL.createObjectURL(blob) : '#', download: 'tp-decisions-' + S + '-' + D.offline_id + '-p' + D.part + '.json' });
    document.body.appendChild(a);
    a.click();
    a.remove();
    st.dirty = {};
    persist();
    toast('נשמר קובץ עם ' + fmt(decisions.length) + ' החלטות (בתיקיית ההורדות). את הקובץ הזה מעלים באתר: ניהול ← סקירה ← "העלה החלטות".');
    render();
  }

  function loadFile(file) {
    const r = new FileReader();
    r.onload = () => {
      let x;
      try {
        x = JSON.parse(String(r.result));
      } catch (e) {
        return toast('הקובץ אינו קובץ-החלטות');
      }
      if (!x || x.contract !== 'tpd/1' || !Array.isArray(x.decisions)) return toast('הקובץ אינו קובץ-החלטות (tpd/1)');
      if (x.section !== S) return toast('הקובץ שייך לחלק אחר (' + (L.sections[x.section] || x.section) + ')');
      let ok = 0;
      let stale = 0;
      let foreign = 0;
      for (const one of x.decisions) {
        const it = one && byId.get(one.id);
        if (!it) {
          foreign++;
          continue;
        }
        if (!sameVersion(one, it) || !validDecision(one) || one.d === 'site') {
          stale++;
          continue;
        }
        const revision = one.r == null ? 0 : one.r;
        st.dec[it.id] = one.mark ? { v: one.v, r: revision, d: one.d, mark: one.mark } : { v: one.v, r: revision, d: one.d };
        delete st.dirty[it.id];
        ok++;
      }
      for (const id of Array.isArray(x.later) ? x.later : []) if (byId.has(id) && !st.dec[id]) {
        const v = version(byId.get(id));
        st.dec[id] = { v: v.v, r: v.r, d: 'site' };
      }
      persist();
      toast('נטענו ' + fmt(ok) + ' החלטות' + (foreign ? ' · ' + fmt(foreign) + ' של פריטים שאינם בקובץ הזה' : '') + (stale ? ' · ' + fmt(stale) + ' של הגשה אחרת או גרסה אחרת — לא נטענו' : ''));
      render();
    };
    r.readAsText(file);
  }

  let toastTimer = null;
  function toast(msg) {
    view.toast = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      view.toast = '';
      const t = document.querySelector('.toast');
      if (t) t.remove();
    }, 6000);
    const old = document.querySelector('.toast');
    if (old) old.remove();
    document.body.appendChild(h('div', { class: 'toast', role: 'status' }, msg));
  }

  // ---------- תמונה עם תיבות ----------
  function imageBox(key, w, h0, overlays, extraClass) {
    const url = imgUrl(key);
    if (!url) return h('div', { class: 'missing' }, 'התמונה חסרה בקובץ');
    const box = h('div', { class: 'imgbox' + (extraClass ? ' ' + extraClass : '') });
    const im = h('img', { src: url, alt: '' });
    box.appendChild(im);
    const place = (W, H) => {
      (overlays || []).forEach((o) => {
        const b = o.box;
        if (!Array.isArray(b) || b.length !== 4 || !W || !H) return;
        const el = h(o.tag || 'div', {
          class: o.cls,
          style:
            'left:' + (b[0] / W) * 100 + '%;top:' + (b[1] / H) * 100 + '%;width:' + ((b[2] - b[0]) / W) * 100 + '%;height:' + ((b[3] - b[1]) / H) * 100 + '%;' + (o.color ? 'border-color:' + o.color + ';' : ''),
          title: o.title || null,
          onclick: o.onclick || null,
        });
        if (o.label) el.appendChild(h('span', { style: 'background:' + (o.color || '#111') }, o.label));
        box.appendChild(el);
      });
    };
    if (w && h0) place(w, h0);
    else im.addEventListener('load', () => place(im.naturalWidth, im.naturalHeight));
    return box;
  }
  function ctxPanel(it) {
    if (!it.ctx || !view.ctx[it.id]) return null;
    const url = imgUrl(it.ctx.img);
    if (!url) return h('div', { class: 'missing' }, 'העמוד המלא לא נכלל בקובץ');
    const wrap = h('div', { class: 'ctx' });
    const box = h('div', { class: 'imgbox' });
    const im = h('img', { src: url, alt: '' });
    box.appendChild(im);
    im.addEventListener('load', () => {
      const b = it.ctx.bbox;
      const W = im.naturalWidth;
      const H = im.naturalHeight;
      box.appendChild(h('div', { class: 'hl', style: 'left:' + (b[0] / W) * 100 + '%;top:' + (b[1] / H) * 100 + '%;width:' + ((b[2] - b[0]) / W) * 100 + '%;height:' + ((b[3] - b[1]) / H) * 100 + '%' }));
      if (wrap.dataset.scroll) box.scrollIntoView({ block: 'nearest' });
    });
    wrap.appendChild(box);
    return wrap;
  }
  const ctxBtn = (it) =>
    it.ctx
      ? h('button', { onclick: () => { selectItem(it); view.ctx[it.id] = !view.ctx[it.id]; render(); }, class: view.ctx[it.id] ? 'on' : null }, view.ctx[it.id] ? 'הסתר עמוד מלא' : 'עמוד מלא')
      : null;

  function metaRow(it, extra) {
    const d = st.dec[it.id];
    return h(
      'div',
      { class: 'meta' },
      h('b', null, it.alias || ''),
      it.page != null ? 'עמ\' ' + it.page : null,
      it.line != null ? 'שורה ' + it.line : null,
      extra,
      it.vol ? h('span', null, '✎ ' + it.vol.name) : null,
      it.rejected ? h('span', { title: 'כמה פעמים הגשה לשורה הזו נדחתה' }, 'נדחתה ' + it.rejected + ' פעמים') : null,
      d ? h('span', { class: 'badge ' + d.d }, DL[d.d]) : null
    );
  }

  // ---------- זיהוי טקסט ----------
  function ocrCard(it, isCur) {
    const r = it.result || {};
    const dec = st.dec[it.id];
    const dir = dirOf(it.track);
    const editing = view.edit && view.edit.id === it.id;
    const texts = h('div', { class: 'texts' });
    const row = (k, v) => add(texts, [h('div', { class: 'k' }, k), h('div', null, v)]);
    if (r.action === 'fixed') {
      row('המתנדב:', diffEl(it.text, r.text, dir));
    } else row('הטקסט:', h('span', { dir: dir }, it.text || '—'));
    if (dec && dec.d === 'fix' && dec.mark) {
      if (dec.mark.action === 'fixed') row('התיקון שלך:', diffEl(it.text, dec.mark.text, dir));
      else row('התיקון שלך:', h('b', null, L.actions[dec.mark.action] || dec.mark.action));
    }
    let editor = null;
    if (editing) {
      editor = h('textarea', { dir: dir, rows: 2, 'aria-label': 'הטקסט המתוקן' });
      editor.value = view.edit.text;
      editor.addEventListener('input', () => (view.edit.text = editor.value));
      editor.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          view.edit = null;
          render(true);
        } else if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          saveOcrEdit(it);
        }
      });
    }
    const B = (label, key, fn, cls) => h('button', { onclick: fn, class: cls || null }, label, key ? [' ', kbd(key)] : null);
    return h(
      'div',
      { class: 'card' + (isCur ? ' cur' : '') + (dec ? ' d-' + dec.d : ''), 'data-id': it.id },
      metaRow(it, [
        it.track ? chip(L.scripts[it.track] || it.track, C.scripts[it.track]) : null,
        it.source === 'synth' ? h('span', null, 'סינתטית') : null,
        h('b', null, 'המתנדב: ' + (L.actions[r.action] || r.action || '—')),
        it.conf != null ? h('span', { title: 'ביטחון המודל' }, Math.round(it.conf) + '%') : null,
      ]),
      imageBox(it.img, it.w, it.h, null),
      texts,
      editor,
      editing
        ? h('div', { class: 'actions' }, B('שמור ואשר', 'Enter', () => saveOcrEdit(it), 'primary'), B('ביטול', 'Esc', () => { view.edit = null; render(true); }))
        : h(
            'div',
            { class: 'actions' },
            B('אשר', '1', () => decide(it, 'approve'), 'primary'),
            B('תקן ואשר', '2', () => startOcrEdit(it)),
            B('דחה', '3', () => decide(it, 'reject')),
            B('לא קריא', '4', () => decide(it, 'fix', { action: 'bad' })),
            B('לנתב', '5', () => decide(it, 'fix', { action: 'router' })),
            dec ? B('בטל החלטה', 'Backspace', () => undo(it)) : null,
            ctxBtn(it)
          ),
      ctxPanel(it)
    );
  }
  function startOcrEdit(it) {
    selectItem(it);
    const r = it.result || {};
    const dec = st.dec[it.id];
    const text = dec && dec.mark && dec.mark.action === 'fixed' ? dec.mark.text : r.action === 'fixed' ? r.text : it.text;
    view.edit = { id: it.id, text: text || '' };
    render();
  }
  function saveOcrEdit(it) {
    const text = norm(view.edit && view.edit.text);
    if (!text) return toast('הטקסט ריק — אם השורה לא קריאה, לחצו "לא קריא" (4)');
    const r = it.result || {};
    const volText = r.action === 'fixed' ? r.text : it.text;
    // טקסט זהה למה שהמתנדב שמר = אישור רגיל
    if (text === norm(volText) && (r.action === 'fixed' || r.action === 'ok')) decide(it, 'approve');
    else decide(it, 'fix', { action: 'fixed', text: text });
  }

  // ---------- נתב הכתב ----------
  const WORD_CYCLE = ['square', 'rashi', 'latin', 'neutral'];
  function routerWords(it) {
    const r = it.result || {};
    if (Array.isArray(r.words) && r.words.length) return r.words.map((w) => ({ k: w.k, box: w.box, label: w.label }));
    if (Array.isArray(it.words) && it.words.length) return it.words.map((w) => ({ k: w.k, box: w.box, label: w.pred || 'square' }));
    return null;
  }
  function routerState(it) {
    if (view.edit && view.edit.id === it.id) return view.edit;
    const dec = st.dec[it.id];
    const src = dec && dec.mark ? dec.mark : it.result || {};
    return { id: it.id, label: src.bad ? 'bad' : src.label || '', words: src.words ? src.words.map((w) => ({ k: w.k, box: w.box, label: w.label })) : routerWords(it) };
  }
  function setRouterLabel(it, label) {
    const s = routerState(it);
    if (label === 'mixed' && !s.words) return toast('אין בקובץ תיבות-מילים לשורה הזו — את "מעורבת" מסמנים באתר');
    selectItem(it);
    view.edit = { id: it.id, label: label, words: s.words };
    render(true);
  }
  function routerMark(s) {
    if (s.label === 'bad') return { label: '', bad: true };
    if (s.label === 'mixed') return { label: 'mixed', bad: false, words: s.words.map((w) => ({ k: w.k, box: w.box, label: w.label })) };
    return { label: s.label, bad: false };
  }
  function sameRouter(a, r) {
    if (!r) return false;
    if (a.label === 'bad') return !!r.bad;
    if (!!r.bad || a.label !== r.label) return false;
    if (a.label !== 'mixed') return true;
    const rw = r.words || [];
    return rw.length === a.words.length && a.words.every((w, i) => w.label === rw[i].label);
  }
  function confirmRouter(it) {
    const s = routerState(it);
    if (!s.label) return toast('בחרו כתב (1–4) או פסול (0)');
    if (sameRouter(s, it.result)) decide(it, 'approve');
    else decide(it, 'fix', routerMark(s));
  }
  function routerCard(it, isCur) {
    const r = it.result || {};
    const dec = st.dec[it.id];
    const s = routerState(it);
    const editing = view.edit && view.edit.id === it.id;
    const overlays =
      s.label === 'mixed' && s.words
        ? s.words.map((w, i) => ({
            tag: 'div',
            cls: 'word',
            box: w.box,
            color: C.scripts[w.label],
            title: (L.scripts[w.label] || w.label) + ' — לחיצה מחליפה',
            onclick: () => {
              selectItem(it);
              const words = s.words.map((x) => ({ k: x.k, box: x.box, label: x.label }));
              words[i].label = WORD_CYCLE[(WORD_CYCLE.indexOf(words[i].label) + 1) % WORD_CYCLE.length];
              view.edit = { id: it.id, label: 'mixed', words: words };
              render(true);
            },
          }))
        : null;
    const volTxt = r.bad ? 'פסול' : L.scripts[r.label] || r.label || '—';
    const labelBtn = (lab, key) =>
      h('button', { class: s.label === lab ? 'on' : null, style: lab !== 'bad' ? 'color:' + C.scripts[lab] : null, onclick: () => setRouterLabel(it, lab) }, lab === 'bad' ? 'פסול' : L.scripts[lab], ' ', kbd(key));
    return h(
      'div',
      { class: 'card' + (isCur ? ' cur' : '') + (dec ? ' d-' + dec.d : ''), 'data-id': it.id },
      metaRow(it, [
        it.pred ? h('span', null, 'הצעת הנתב: ', chip(L.scripts[it.pred] || it.pred, C.scripts[it.pred]), it.predP != null ? ' ' + Math.round(it.predP * 100) + '%' : '') : h('span', null, 'אין הצעה'),
        h('b', null, 'המתנדב: ', r.bad ? 'פסול' : chip(volTxt, C.scripts[r.label])),
        it.agrees ? h('span', { class: 'pill approve' }, 'הסכים עם הנתב') : null,
      ]),
      imageBox(it.img, it.w, it.h, overlays),
      it.text ? h('div', { class: 'hint', dir: 'rtl' }, it.text) : null,
      s.label === 'mixed' ? h('div', { class: 'hint' }, 'לחיצה על מילה מחליפה את הכתב שלה: מרובע ← רש"י ← לועזית ← ניטרלי') : null,
      h(
        'div',
        { class: 'actions' },
        h('button', { class: 'primary', onclick: () => confirmRouter(it) }, editing && !sameRouter(s, r) ? 'שמור תיקון ואשר' : 'אשר', ' ', kbd('Enter')),
        labelBtn('square', '1'),
        labelBtn('rashi', '2'),
        labelBtn('latin', '3'),
        labelBtn('mixed', '4'),
        labelBtn('bad', '0'),
        h('button', { onclick: () => decide(it, 'reject') }, 'דחה ', kbd('Delete')),
        editing ? h('button', { onclick: () => { view.edit = null; render(true); } }, 'בטל שינוי ', kbd('Esc')) : null,
        dec ? h('button', { onclick: () => undo(it) }, 'בטל החלטה ', kbd('Backspace')) : null,
        ctxBtn(it)
      ),
      ctxPanel(it)
    );
  }

  // ---------- גלאי האזורים ----------
  function frameOverlays(frames, model) {
    return (frames || []).map((f) => {
      const role = f.kind === 'object' ? 'object' : f.role;
      const st0 = f.stream && streams.get(f.stream);
      const name = (L.roles[role] || role) + (st0 && st0.name ? ' · ' + st0.name : '') + (f.ord != null ? ' · ' + f.ord : '') + (f.cont ? ' ↩' : '');
      return { cls: 'box' + (model ? ' model' : ''), box: f.box, color: C.roles[role] || '#111', label: model ? null : name, title: name };
    });
  }
  function framesCard(it, isCur) {
    const r = it.result || {};
    const dec = st.dec[it.id];
    const overlays = (view.model ? frameOverlays(it.frames, true) : []).concat(frameOverlays(r.frames, false));
    const B = (label, key, fn, cls) => h('button', { onclick: fn, class: cls || null }, label, key ? [' ', kbd(key)] : null);
    return h(
      'div',
      { class: 'card' + (isCur ? ' cur' : '') + (dec ? ' d-' + dec.d : ''), 'data-id': it.id },
      metaRow(it, [
        h('b', null, r.status === 'skip' ? 'המתנדב: דלג — לא לאימון' : 'המתנדב: סימן ' + fmt((r.frames || []).length) + ' מסגרות'),
        it.changes ? h('span', null, fmt(it.changes) + ' שינויים מהצעת המודל') : h('span', null, 'בלי שינוי מהצעת המודל'),
        r.streams_added && r.streams_added.length ? h('span', null, 'זרמים חדשים: ' + r.streams_added.map((x) => x.name).join(', ')) : null,
      ]),
      imageBox(it.img, it.w, it.h, overlays),
      h(
        'div',
        { class: 'actions' },
        B('אשר', '1', () => decide(it, 'approve'), 'primary'),
        B('לתקן באתר', '2', () => decide(it, 'site'), 'warn'),
        B('דחה', '3', () => decide(it, 'reject')),
        dec ? B('בטל החלטה', 'Backspace', () => undo(it)) : null
      )
    );
  }

  // ---------- המסך ----------
  function select(label, key, options) {
    const s = h('select', { 'aria-label': label });
    options.forEach((o) => {
      const op = h('option', { value: o[0] }, o[1]);
      if (view.f[key] === o[0]) op.selected = true;
      s.appendChild(op);
    });
    s.addEventListener('change', () => {
      view.f[key] = s.value;
      view.page = 0;
      view.cur = 0;
      view.edit = null;
      render();
    });
    return h('label', null, label + ':', s);
  }

  function render(keepScroll) {
    list = visible();
    const pages = Math.max(1, Math.ceil(list.length / PER));
    view.page = Math.max(0, Math.min(view.page, pages - 1));
    const slice = list.slice(view.page * PER, view.page * PER + PER);
    view.cur = Math.max(0, Math.min(view.cur, slice.length - 1));
    const c = counts();
    const un = unsaved();
    const fileInput = h('input', { type: 'file', accept: '.json,application/json', style: 'display:none' });
    fileInput.addEventListener('change', () => fileInput.files[0] && loadFile(fileInput.files[0]));
    const unit = S === 'frames' ? 'עמודים' : 'שורות';

    const top = h(
      'header',
      { class: 'top' },
      h('h1', null, 'אישור בלי אינטרנט — ' + (L.sections[S] || S) + (D.book ? ' · ' + D.book.alias : '') + (D.parts > 1 ? ' · חלק ' + D.part + ' מתוך ' + D.parts : '')),
      h(
        'div',
        { class: 'counts' },
        h('span', { class: 'pill' }, fmt(items.length) + ' ' + unit),
        h('span', { class: 'pill' }, 'עוד לא הוחלט: ' + fmt(c.open)),
        h('span', { class: 'pill approve' }, 'אושרו: ' + fmt(c.approve)),
        S !== 'frames' ? h('span', { class: 'pill fix' }, 'תוקנו: ' + fmt(c.fix)) : null,
        h('span', { class: 'pill reject' }, 'נדחו: ' + fmt(c.reject)),
        S === 'frames' ? h('span', { class: 'pill site' }, 'לתקן באתר: ' + fmt(c.site)) : null
      ),
      h('button', { class: un ? 'primary' : null, onclick: saveFile, title: 'מוריד את הקובץ שמעלים באתר' }, 'שמור קובץ-החלטות', un ? ' (' + fmt(un) + ' לא נשמרו)' : ''),
      h('button', { onclick: () => fileInput.click() }, 'טען קובץ-החלטות'),
      fileInput
    );

    const filters = h(
      'div',
      { class: 'bar' },
      select('מה להציג', 'status', [
        ['open', 'עוד לא החלטתי'],
        ['all', 'הכול'],
        ['approve', 'אושרו'],
        ['fix', 'תוקנו'],
        ['reject', 'נדחו'],
      ].concat(S === 'frames' ? [['site', 'לתקן באתר']] : [])),
      S === 'ocr' ? select('כתב', 'track', [['', 'כל הכתבים']].concat(['square', 'rashi', 'latin', 'mixed'].map((s) => [s, L.scripts[s]]))) : null,
      S === 'ocr' ? select('מה המתנדב עשה', 'action', [['', 'הכול']].concat(['ok', 'fixed', 'seg', 'bad', 'router'].map((a) => [a, L.actions[a]]))) : null,
      S === 'router' ? select('המתנדב סימן', 'track', [['', 'הכול']].concat(['square', 'rashi', 'latin', 'mixed'].map((s) => [s, L.scripts[s]])).concat([['bad', 'פסול']])) : null,
      S === 'router' ? select('מול הנתב', 'agree', [['', 'הכול'], ['1', 'הסכים עם ההצעה'], ['0', 'שונה מההצעה']]) : null,
      vols.length > 1 ? select('מתנדב', 'vol', [['', 'כולם']].concat(vols.map((v) => [v.id, v.name]))) : null,
      S === 'frames'
        ? h('label', null, (() => {
            const cb = h('input', { type: 'checkbox' });
            cb.checked = view.model;
            cb.addEventListener('change', () => { view.model = cb.checked; render(true); });
            return cb;
          })(), 'הצג גם את הצעת המודל (מקווקו)')
        : null
    );

    const open = list.filter((it) => !st.dec[it.id]);
    const bulkBar = h(
      'div',
      { class: 'bar' },
      h('span', { class: 'hint' }, 'על כל המוצגות (' + fmt(list.length) + '):'),
      S === 'ocr'
        ? h('button', { disabled: !open.some((it) => it.result && it.result.action === 'ok'), onclick: () => bulk('לאשר את כל ה"נכון" שעוד לא הוחלט עליהן', (it) => it.result && it.result.action === 'ok', 'approve') }, 'אשר כל ה"נכון" (' + fmt(open.filter((it) => it.result && it.result.action === 'ok').length) + ')')
        : null,
      S === 'router'
        ? h('button', { disabled: !open.some((it) => it.agrees), onclick: () => bulk('לאשר את כל מה שהמתנדב הסכים בו עם הנתב', (it) => it.agrees, 'approve') }, 'אשר כל מה שהסכים עם הנתב (' + fmt(open.filter((it) => it.agrees).length) + ')')
        : null,
      h('button', { disabled: !open.length, onclick: () => bulk('לאשר את כל המוצגות שעוד לא הוחלט עליהן', () => true, 'approve') }, 'אשר את כל המוצגות (' + fmt(open.length) + ')'),
      h('button', { disabled: !open.length, onclick: () => bulk('לדחות את כל המוצגות שעוד לא הוחלט עליהן', () => true, 'reject') }, 'דחה את כל המוצגות'),
      h('button', { disabled: !list.some((it) => st.dec[it.id]), onclick: bulkUndo }, 'בטל החלטות במוצגות')
    );

    const keys =
      S === 'ocr'
        ? ['מקשים: ', kbd('1'), ' אשר · ', kbd('2'), ' תקן ואשר (', kbd('Enter'), ' שומר, ', kbd('Esc'), ' מבטל) · ', kbd('3'), '/', kbd('Delete'), ' דחה · ', kbd('4'), ' לא קריא · ', kbd('5'), ' לנתב · ', kbd('Backspace'), ' בטל החלטה · ', kbd('↓'), '/', kbd('↑'), ' שורה אחרת · ', kbd('Ctrl+S'), ' שמור קובץ']
        : S === 'router'
          ? ['מקשים: ', kbd('1'), '–', kbd('4'), ' כתב השורה · ', kbd('0'), ' פסול · ', kbd('Enter'), ' אשר (או שמור תיקון) · ', kbd('Delete'), ' דחה · ', kbd('Backspace'), ' בטל החלטה · ', kbd('↓'), '/', kbd('↑'), ' שורה אחרת · ', kbd('Ctrl+S'), ' שמור קובץ']
          : ['מקשים: ', kbd('1'), ' אשר · ', kbd('2'), ' לתקן באתר · ', kbd('3'), '/', kbd('Delete'), ' דחה · ', kbd('Backspace'), ' בטל החלטה · ', kbd('↓'), '/', kbd('↑'), ' עמוד אחר · ', kbd('Ctrl+S'), ' שמור קובץ'];

    const help = h(
      'details',
      { class: 'help' },
      h('summary', null, 'איך זה עובד'),
      h('p', null, 'עוברים על ' + unit + ' ומחליטים: אשר, דחה' + (S === 'frames' ? ', או "לתקן באתר" (תיקון מסגרות נעשה רק באתר)' : ' או תקן ואשר') + '. כל החלטה נשמרת מיד בדפדפן הזה — אפשר לסגור ולפתוח את הקובץ שוב ולהמשיך.'),
      h('p', null, 'בסוף (או מדי פעם) לוחצים "שמור קובץ-החלטות". יורד קובץ קטן לתיקיית ההורדות. כשיש אינטרנט — באתר: ניהול "הגהה לאימון" ← סקירה ← "העלה החלטות", ובוחרים את הקובץ.'),
      h('p', null, 'מה שמישהו כבר אישר או דחה באתר בינתיים — ההחלטה מהקובץ עליו מדולגת ולא דורסת. הזיכרון של הדפדפן יכול להימחק (ניקוי היסטוריה, חלון פרטי), ולכן כדאי לשמור קובץ-החלטות מדי פעם. "טען קובץ-החלטות" ממשיך ממנו.'),
      h('p', { class: 'hint' }, 'הקובץ נוצר ' + new Date(D.created_at).toLocaleString('he-IL') + ' · מזהה ' + D.offline_id + ' · הקובץ אינו פונה לשום אתר.')
    );

    const cards = slice.map((it, i) => (S === 'ocr' ? ocrCard(it, i === view.cur) : S === 'router' ? routerCard(it, i === view.cur) : framesCard(it, i === view.cur)));
    const pager =
      pages > 1
        ? h(
            'div',
            { class: 'pager' },
            h('button', { disabled: view.page === 0, onclick: () => { view.page--; view.cur = 0; render(); window.scrollTo(0, 0); } }, 'הקודם'),
            h('span', null, 'עמוד ' + (view.page + 1) + ' מתוך ' + pages),
            h('button', { disabled: view.page >= pages - 1, onclick: () => { view.page++; view.cur = 0; render(); window.scrollTo(0, 0); } }, 'הבא')
          )
        : null;

    const main = h(
      'main',
      null,
      help,
      filters,
      bulkBar,
      h('p', { class: 'hint' }, keys),
      cards.length ? cards : h('div', { class: 'empty' }, view.f.status === 'open' && !c.open ? 'החלטת על הכול. עכשיו "שמור קובץ-החלטות" והעלה אותו באתר.' : 'אין מה להציג במסנן הזה.'),
      pager
    );
    app.replaceChildren(top, main);
    // אחרי פעולה במקלדת — הכרטיס הנוכחי נגלל לתצוגה (בלי קפיצה כשהוא כבר נראה)
    const curEl = keepScroll ? app.querySelector('.card.cur') : null;
    if (curEl && curEl.scrollIntoView) curEl.scrollIntoView({ block: 'nearest' });
    // תיקון פתוח — הסמן בתיבה, בסוף הטקסט
    const ta = view.edit ? app.querySelector('textarea') : null;
    if (ta) {
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    }
  }

  // ---------- מקלדת ----------
  function typing(el) {
    if (!el) return false;
    if (el.isContentEditable) return true;
    if (el.tagName === 'INPUT') return !['checkbox', 'radio', 'button', 'file'].includes(el.type);
    return el.tagName === 'TEXTAREA' || el.tagName === 'SELECT';
  }
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S' || e.code === 'KeyS')) {
      e.preventDefault();
      saveFile();
      return;
    }
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
    const it = list[view.page * PER + view.cur];
    let done = true;
    if (e.key === 'ArrowDown') { move(1); render(true); }
    else if (e.key === 'ArrowUp') { move(-1); render(true); }
    else if (e.key === 'PageDown') { move(PER); render(true); }
    else if (e.key === 'PageUp') { move(-PER); render(true); }
    else if (!it) done = false;
    else if (e.key === 'Backspace') undo(it);
    else if (S === 'ocr') {
      if (e.key === '1') decide(it, 'approve');
      else if (e.key === '2') startOcrEdit(it);
      else if (e.key === '3' || e.key === 'Delete') decide(it, 'reject');
      else if (e.key === '4') decide(it, 'fix', { action: 'bad' });
      else if (e.key === '5') decide(it, 'fix', { action: 'router' });
      else done = false;
    } else if (S === 'router') {
      if (/^[1-4]$/.test(e.key)) setRouterLabel(it, ['square', 'rashi', 'latin', 'mixed'][+e.key - 1]);
      else if (e.key === '0') setRouterLabel(it, 'bad');
      else if (e.key === 'Enter' && !(e.target && ['BUTTON', 'A'].includes(e.target.tagName))) confirmRouter(it);
      else if (e.key === 'Delete') decide(it, 'reject');
      else if (e.key === 'Escape' && view.edit) { view.edit = null; render(true); }
      else done = false;
    } else {
      if (e.key === '1' || (e.key === 'Enter' && !(e.target && ['BUTTON', 'A'].includes(e.target.tagName)))) decide(it, 'approve');
      else if (e.key === '2') decide(it, 'site');
      else if (e.key === '3' || e.key === 'Delete') decide(it, 'reject');
      else done = false;
    }
    if (done) e.preventDefault();
  }, on);
  window.addEventListener('beforeunload', (e) => {
    if (!unsaved()) return;
    e.preventDefault();
    e.returnValue = '';
  }, on);

  render();
  if (staleMemory) {
    persist();
    toast(fmt(staleMemory) + ' החלטות שמורות אינן מתאימות לגרסה הזאת ולא נטענו. אפשר לטעון קובץ-החלטות תואם או לסקור מחדש.');
  }
}
