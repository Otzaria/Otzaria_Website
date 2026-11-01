// קובץ-ההחזרה לתחנה (docs/76 §5) — בניה ובדיקה, טהור (crypto של node בלבד).
// נכנסים אליו רק פריטים שהמנהל אישר. אין בו תמונות: manifest.json + results.jsonl.
// מסך ההורדה בניהול (סשן ד') בונה את ה-ZIP כאן, שולח אותו, ורק אחרי שהשליחה
// הסתיימה מוחק את הפריטים (§8.2).

import { createHash, randomBytes } from 'node:crypto';
import { zipSync, strToU8 } from 'fflate';
import {
  CONTRACT,
  DIR_TO_STATION,
  SECTIONS,
  OCR_RETURN_ACTIONS,
  LINE_SCRIPTS,
  WORD_SCRIPTS,
  WORDS_SRC,
  FRAMES_PAGE_STATUS_OUT,
  SIG_RE,
  PACKAGE_ID_RE,
  VOL_RE,
  STATION_ID_RE,
  uidFitsSection,
  validBox,
} from './vocab.js';

// מזהה-מתנדב אטום לתחנה: בלי שם ובלי אימייל (§5.1). יציב לאותו משתמש
export function volId(userId) {
  return 'v-' + createHash('sha1').update(`tp/1:${String(userId)}`).digest('hex').slice(0, 8);
}

const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');

export function newExportId(now = new Date(), rand = randomBytes(3).toString('hex')) {
  return `tpx-${ymd(now)}-${rand}`;
}

const iso = (d) => (d ? new Date(d).toISOString() : null);

// שורה אחת ב-results.jsonl. item = מסמך TrainingProofItem (lean) במצב approved
export function resultLine(item) {
  if (item.status !== 'approved') throw new Error(`פריט שלא אושר: ${item.uid}`);
  const r = item.result || {};
  const head = { uid: item.uid, sig: item.sig, package_id: item.packageId };
  const tail = { vol: item.vol ? volId(item.vol) : null, at: iso(item.submittedAt), approved_at: iso(item.reviewedAt) };
  if (item.section === 'ocr') {
    if (!OCR_RETURN_ACTIONS.includes(r.action)) throw new Error(`פעולה שאינה יוצאת לתחנה: ${r.action}`);
    const line = { ...head, action: r.action };
    if (r.action === 'fixed') line.text = r.text;
    line.admin_fixed = !!item.adminFixed;
    return { ...line, ...tail };
  }
  if (item.section === 'router') {
    const bad = !!r.bad;
    const line = { ...head, label: bad ? '' : r.label, bad, admin_fixed: !!item.adminFixed };
    if (!bad && r.label === 'mixed') {
      line.words_src = r.words_src || 'site';
      line.words = (r.words || []).map((w) => ({ k: w.k, box: w.box, label: w.label }));
    }
    return { ...line, ...tail };
  }
  if (item.section === 'frames') {
    const p = item.payload || {};
    return {
      ...head,
      book: p.book,
      page: p.page,
      status: r.status,
      scale: typeof p.scale === 'number' ? p.scale : 1.0,
      frames: r.frames || [],
      streams_added: r.streams_added || [],
      // שדה רשות (2026-11-01): סוג חדש לזרם שהגיע מהתחנה — {id, role, from}. רק כשיש
      ...(r.streams_changed?.length ? { streams_changed: r.streams_changed } : {}),
      admin_fixed: !!item.adminFixed,
      ...tail,
    };
  }
  throw new Error(`חלק לא מוכר: ${item.section}`);
}

// manifest.json של קובץ-ההחזרה
export function returnManifest({ section, exportId, createdAt = new Date(), stationIds, packages, count }) {
  return {
    contract: CONTRACT,
    direction: DIR_TO_STATION,
    section,
    export_id: exportId,
    created_at: iso(createdAt),
    station_ids: [...new Set(stationIds)].sort(),
    packages: [...new Set(packages)].sort(),
    counts: { items: count },
  };
}

// הקובץ כולו. items — פריטים מאושרים מחלק אחד; stationOf — packageId → stationId.
// מחזיר {bytes, manifest, lines}
export function buildReturnZip(section, items, { stationOf, exportId = newExportId(), now = new Date() }) {
  if (!SECTIONS.includes(section)) throw new Error('חלק לא מוכר');
  const lines = items.map((it) => {
    if (it.section !== section) throw new Error(`פריט מחלק אחר: ${it.uid}`);
    return resultLine(it);
  });
  const packages = items.map((it) => it.packageId);
  const manifest = returnManifest({
    section,
    exportId,
    createdAt: now,
    stationIds: packages.map((p) => stationOf(p)).filter(Boolean),
    packages,
    count: lines.length,
  });
  const bytes = zipSync(
    {
      'manifest.json': strToU8(JSON.stringify(manifest, null, 1)),
      'results.jsonl': strToU8(lines.map((l) => JSON.stringify(l)).join('\n') + (lines.length ? '\n' : '')),
    },
    { level: 6 }
  );
  return { bytes, manifest, lines };
}

// בדיקת שורה בקובץ-החזרה — לבדיקות, ולמי שבונה את צד-הייבוא בתחנה כהפניה
export function checkReturnLine(section, l) {
  if (!l || typeof l !== 'object') return 'שורה לא תקינה';
  if (!uidFitsSection(l.uid, section)) return 'uid לא תקין';
  if (!SIG_RE.test(String(l.sig || ''))) return 'sig לא תקין';
  if (!PACKAGE_ID_RE.test(String(l.package_id || ''))) return 'package_id לא תקין';
  if (l.vol !== null && !VOL_RE.test(String(l.vol || ''))) return 'vol לא תקין';
  // admin_fixed — חובה בזיהוי ובנתב (§5.1–§5.2); בגלאי הוא רשות (§5.3)
  if (section !== 'frames' && typeof l.admin_fixed !== 'boolean') return 'admin_fixed חסר';
  if (section === 'ocr') {
    if (!OCR_RETURN_ACTIONS.includes(l.action)) return 'action לא תקין';
    if (l.action === 'fixed' && (typeof l.text !== 'string' || !l.text)) return 'fixed בלי טקסט';
  } else if (section === 'router') {
    if (typeof l.bad !== 'boolean') return 'bad חסר';
    if (l.bad ? l.label !== '' : !LINE_SCRIPTS.includes(l.label)) return 'label לא תקין';
    if (l.label === 'mixed') {
      if (!WORDS_SRC.includes(l.words_src)) return 'words_src לא תקין';
      if (!Array.isArray(l.words) || !l.words.length) return 'מעורבת בלי מילים';
      if (!l.words.every((w) => Number.isInteger(w.k) && validBox(w.box) && WORD_SCRIPTS.includes(w.label))) return 'מילה לא תקינה';
    } else if (l.words !== undefined) return 'words רק בשורה מעורבת';
  } else if (section === 'frames') {
    if (!FRAMES_PAGE_STATUS_OUT.includes(l.status)) return 'status לא תקין';
    if (!Array.isArray(l.frames)) return 'frames חסר';
    if (l.streams_changed !== undefined) {
      const ok = (c) => c && typeof c.id === 'string' && c.id && typeof c.role === 'string' && (c.from === undefined || typeof c.from === 'string');
      if (!Array.isArray(l.streams_changed) || !l.streams_changed.every(ok)) return 'streams_changed לא תקין';
    }
  }
  return null;
}

export function checkReturnManifest(m) {
  if (!m || m.contract !== CONTRACT || m.direction !== DIR_TO_STATION) return 'חוזה או כיוון לא תקינים';
  if (!SECTIONS.includes(m.section)) return 'חלק לא מוכר';
  // האתר כותב tpx-YYYYMMDD-xxxxxx (newExportId); בבדיקה מספיק שהמזהה מתחיל ב-tpx-
  if (!/^tpx-[A-Za-z0-9-]{1,40}$/.test(String(m.export_id || ''))) return 'export_id לא תקין';
  if (!Array.isArray(m.station_ids) || !m.station_ids.every((s) => STATION_ID_RE.test(s))) return 'station_ids לא תקין';
  if (!Array.isArray(m.packages) || !Number.isInteger(m.counts?.items)) return 'packages/counts חסרים';
  return null;
}
