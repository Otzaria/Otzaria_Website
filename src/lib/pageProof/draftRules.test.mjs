import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DRAFT_META_PREFIX,
  MAX_DRAFT_OPS,
  applyServerDraft,
  changesHe,
  draftPayload,
  inheritedHeadline,
  liveCount,
  matchOps,
  mergeCarried,
  diffDrafts,
  baseKeysOf,
  resolveDraftConflict,
  KEEPALIVE_MAX,
  opKey,
  pickDraft,
  publicDraft,
  readDraftMeta,
  readLocalDraft,
  sameAsMap,
  basedOnDelta,
  sanitizeDraftOps,
  splitInherited,
  writeDraftMeta,
} from './draftRules.js';

// הטיוטה בשרת (docs/63 §2) — הכללים הטהורים: מה נשלח, מה נשמר, מה נשלח לדפדפן, ואיזו טיוטה ממשיכים בפתיחה.

function memStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    get length() {
      return m.size;
    },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

const doc = {
  page: 4,
  size: [1000, 2000],
  lines: [
    { id: 1, bbox: [100, 100, 900, 140], text: 'שורה אחת', stream: 'main' },
    { id: 2, bbox: [100, 160, 900, 200], text: 'שורה שתיים', stream: 'main' },
  ],
};
const TEXT = { kind: 'text', page: 4, ids: [1], value: 'שורה אחת מתוקנת' };

test('draftPayload: הפעולה עצמה, ומשדות-הפנים רק _local / _pa / _cmp', () => {
  const all = [
    { ...TEXT, _g: 'g1', _s: 's1', _c: 'type:1', _t: 5, _from: 'x' },
    { kind: 'seg_ok', page: 4, ids: [2], value: 1, _local: true, _pa: '2:1', _s: 's2' },
    { kind: 'train_text', page: 4, ids: [1], value: 0, _cmp: true, _g: 'g1' },
    null,
    { nokind: true },
  ];
  assert.deepEqual(draftPayload(all), [
    TEXT,
    { kind: 'seg_ok', page: 4, ids: [2], value: 1, _local: true, _pa: '2:1' },
    { kind: 'train_text', page: 4, ids: [1], value: 0, _cmp: true },
  ]);
  assert.deepEqual(draftPayload(null), []);
});

test('sanitizeDraftOps: רק פעולות-חוזה תקינות מול העמוד וחצאי-אישור על שורות שבו; השאר יורד ונספר', () => {
  const r = sanitizeDraftOps(doc, [
    { ...TEXT, junk: 1, value: 'שורה אחת מתוקנת' },
    { kind: 'text', page: 4, ids: [99], value: 'שורה שאינה' },
    { kind: 'nope', page: 4 },
    { kind: 'seg_ok', page: 4, ids: [2], value: 3, _local: true, _pa: '2:3' },
    { kind: 'seg_ok', page: 4, ids: [7], value: 3, _local: true },
    { kind: 'line_ok', page: 4, ids: [2], _local: true },
    { kind: 'train_text', page: 4, ids: [1], value: 0, _cmp: true },
    { kind: 'styles', page: 4, ids: [1], value: { style: 'b', words: [0, 0], on: true, extra: 'x' } },
    'x',
  ]);
  assert.equal(r.dropped, 5);
  assert.deepEqual(r.ops, [
    TEXT,
    { kind: 'seg_ok', page: 4, ids: [2], value: 3, _local: true, _pa: '2:3' },
    { kind: 'train_text', page: 4, ids: [1], value: 0, _cmp: true },
    { kind: 'styles', page: 4, ids: [1], value: { style: 'b', on: true, words: [0, 0] } },
  ]);
  assert.match(sanitizeDraftOps(doc, 'x').error, /חסרה/);
  assert.match(sanitizeDraftOps(doc, new Array(MAX_DRAFT_OPS + 1).fill(TEXT)).error, /גדולה מדי/);
  assert.equal(liveCount(r.ops), 3);
});

test('publicDraft: בלי מזהי-משתמשים — mine, שם, שלב, inherited ו-basedOn; שמות של מתנדבים אחרים — רק למנהל', () => {
  const at = new Date('2026-10-05T10:00:00Z');
  const d = {
    by: 'u1',
    byName: 'ראובן',
    ops: [TEXT, { kind: 'seg_ok', page: 4, ids: [2], value: 1, _local: true }],
    stage: 'text',
    revision: 2,
    updatedAt: at,
    carried: { from: 1, kept: 1, cut: 1, dropped: [] },
    recut: { sentAt: at },
    inherited: { source: 'submission', byName: 'שמעון', at, ops: [TEXT], basedOn: { id: 'abc', byName: 'שמעון', kind: 'submission' }, secret: 1 },
  };
  const p = publicDraft(d, 'u1');
  assert.equal(p.mine, true);
  assert.equal(p.byName, 'ראובן', 'שמו שלו');
  assert.equal(publicDraft(d, 'u2').mine, false);
  assert.equal(publicDraft(d, 'u2').byName, '', 'טיוטה של אחר — בלי שם');
  assert.equal(p.count, 1);
  assert.equal(p.stage, 'text');
  assert.equal(p.updatedAt, at.toISOString());
  assert.deepEqual(p.recut, { sentAt: at.toISOString(), backAt: null });
  // למתנדב: מי היה לפניו ועל ההגשה של מי זה מבוסס — בלי שמות
  assert.deepEqual(p.inherited, { source: 'submission', byName: '', at: at.toISOString(), ops: [TEXT], count: 1, basedOn: { id: 'abc', byName: '', kind: 'submission' } });
  assert.equal(JSON.stringify(p).includes('שמעון'), false, 'שם המתנדב הקודם אינו יוצא למתנדב');
  // למנהל — עם השמות
  const a = publicDraft(d, 'admin1', { admin: true });
  assert.equal(a.byName, 'ראובן');
  assert.deepEqual([a.inherited.byName, a.inherited.basedOn.byName], ['שמעון', 'שמעון']);
  assert.equal(JSON.stringify(p).includes('u1'), false, 'מזהה המשתמש אינו יוצא');
  assert.equal(publicDraft({ ...d, stage: 'weird' }, 'u1').stage, null);
  assert.equal(publicDraft(null, 'u1'), null);
});

test('pickDraft: בלי מקומית — השרת; טיוטת-השרת שלא השתנתה מאז הסנכרון — המקומית; אחרת החדשה מבין השתיים', () => {
  const server = { ops: [TEXT], updatedAt: '2026-10-05T10:00:00.000Z' };
  const t = Date.parse(server.updatedAt);
  assert.equal(pickDraft({ local: null, server: null }), null);
  assert.equal(pickDraft({ local: { ops: [TEXT], at: 1 }, server: null }), 'local');
  assert.equal(pickDraft({ local: null, server }), 'server');
  assert.equal(pickDraft({ local: { ops: [], at: t + 999 }, server }), 'server', 'מקומית ריקה — אין מה לשמור ממנה');
  assert.equal(pickDraft({ local: { ops: [TEXT], at: t - 10 }, server, meta: { srv: server.updatedAt } }), 'local', 'סונכרנה — אולי יש בה שינויים שעוד לא נשלחו');
  assert.equal(pickDraft({ local: { ops: [TEXT], at: t + 1000 }, server, meta: { srv: 'אחר' } }), 'local');
  assert.equal(pickDraft({ local: { ops: [TEXT], at: t - 1000 }, server }), 'server');
  // שעון הדפדפן מאחר בשעה: זמן מקומי + הפרש-השעונים
  assert.equal(pickDraft({ local: { ops: [TEXT], at: t - 3600e3 + 500 }, server, skewMs: 3600e3 }), 'local');
});

test('applyServerDraft: השרת חדש יותר ← נכתב למפתח (העורך קורא משם) ו-meta מתעדכן; המקומית חדשה ← נשארת', () => {
  const key = 'page-proof-draft:P:1:abc';
  const server = { ops: [TEXT], updatedAt: '2026-10-05T10:00:00.000Z', stage: 'structure' };
  const s = memStorage({ [key]: JSON.stringify({ ops: [{ kind: 'line_ok', page: 4, ids: [1] }], at: 5 }) });
  const r = applyServerDraft(s, { pageId: 'P', draftKey: key, server });
  assert.deepEqual(r, { source: 'server', stage: 'structure', srv: server.updatedAt, merged: 0 });
  assert.deepEqual(readLocalDraft(s, key).ops, [TEXT]);
  assert.deepEqual(readDraftMeta(s, 'P'), { key, srv: server.updatedAt, stage: 'structure', base: baseKeysOf(server.ops) });
  assert.ok(s.getItem(`${DRAFT_META_PREFIX}P`));

  // המקומית חדשה יותר (נערכה כאן אחרי הסנכרון) — נשארת; השלב — מה שנשמר מקומית
  const newer = { ops: [TEXT, { kind: 'line_ok', page: 4, ids: [2] }], at: Date.parse(server.updatedAt) + 60e3 };
  s.setItem(key, JSON.stringify(newer));
  writeDraftMeta(s, 'P', { stage: 'text' });
  const r2 = applyServerDraft(s, { pageId: 'P', draftKey: key, server });
  assert.equal(r2.source, 'local');
  assert.equal(r2.stage, 'text');
  assert.equal(readLocalDraft(s, key).ops.length, 2);

  // טיוטה בשרת שהתרוקנה ("התחל מאפס") ומאוחרת מהמקומית — המפתח נמחק
  const empty = { ops: [], updatedAt: new Date(newer.at + 60e3).toISOString(), stage: 'structure' };
  assert.equal(applyServerDraft(s, { pageId: 'P', draftKey: key, server: empty }).source, 'server');
  assert.equal(s.getItem(key), null);

  // העמוד חזר מזיהוי-מחדש והטיוטה בשרת עברה עכשיו לגרסה החדשה — היא קובעת
  s.setItem(key, JSON.stringify({ ops: [TEXT, TEXT], at: Date.now() + 1e9 }));
  const carried = { ops: [TEXT], updatedAt: '2026-10-05T09:00:00.000Z', stage: 'text', carried: { from: 1, kept: 1, cut: 1, dropped: [] } };
  assert.equal(applyServerDraft(s, { pageId: 'P', draftKey: key, server: carried }).source, 'server');
  assert.deepEqual(readLocalDraft(s, key).ops, [TEXT]);

  // בלי טיוטה בשרת — המקומית כמות-שהיא; בלי אחסון — כלום
  assert.equal(applyServerDraft(memStorage({ [key]: JSON.stringify({ ops: [TEXT], at: 1 }) }), { pageId: 'P', draftKey: key, server: null }).source, 'local');
  assert.equal(applyServerDraft(null, { pageId: 'P', draftKey: key, server }).source, null);
});

test('mergeCarried: העמוד חזר מזיהוי-מחדש — מה שנעשה כאן אחרי השליחה מצטרף לטיוטה שבשרת, לא נזרק', () => {
  const sentAt = '2026-10-05T10:00:00.000Z';
  const sent = Date.parse(sentAt);
  const LATE = { kind: 'stream', page: 4, ids: [3], value: 'notes' };
  // שינוי-מבנה שנעשה כאן אחרי שהטיוטה נשמרה ולפני שהעמוד חזר — מצטרף (אחרי פעולות השרת)
  assert.deepEqual(mergeCarried([TEXT], { ops: [TEXT, LATE], at: sent + 5e3 }, sentAt), [TEXT, LATE]);
  // מקומית ישנה מהשליחה (או בלי זמן-שליחה) — השרת לבדו
  assert.deepEqual(mergeCarried([TEXT], { ops: [TEXT, LATE], at: sent - 5e3 }, sentAt), [TEXT]);
  assert.deepEqual(mergeCarried([TEXT], { ops: [TEXT, LATE], at: sent + 5e3 }, null), [TEXT]);
  // שעון הדפדפן מקדים בדקה: בזמן-השרת המקומית ישנה
  assert.deepEqual(mergeCarried([TEXT], { ops: [LATE], at: sent + 30e3 }, sentAt, -60e3), [TEXT]);
  // חצאי-אישור מקומיים אינם מצטרפים
  assert.deepEqual(mergeCarried([], { ops: [{ kind: 'seg_ok', page: 4, ids: [2], value: 0, _local: true }], at: sent + 5e3 }, sentAt), []);

  const key = 'page-proof-draft:P:2:abc';
  const s = memStorage({ [key]: JSON.stringify({ ops: [TEXT, LATE], at: sent + 5e3 }) });
  const server = { ops: [TEXT], updatedAt: '2026-10-05T11:00:00.000Z', stage: 'text', carried: { from: 1, kept: 1, cut: 1, dropped: [] }, recut: { sentAt } };
  const r = applyServerDraft(s, { pageId: 'P', draftKey: key, server });
  assert.deepEqual([r.source, r.merged], ['server', 1]);
  assert.deepEqual(readLocalDraft(s, key).ops, [TEXT, LATE]);
});

test('שתי עבודות במקביל: השמירה כאן נדחתה (stale) או שהשרת השתנה מאז הסנכרון — לא לפי שעון: איחוד, או שאלה בסתירה', () => {
  const T1 = Date.parse('2026-10-05T10:00:00Z');
  const E1 = { kind: 'text', page: 1, ids: [1], value: 'E1+e3' };
  const E2 = { kind: 'text', page: 1, ids: [2], value: 'E2 ממחשב אחר' };
  const key = 'page-proof-draft:p:1:x';
  // מחשב 1: נשמר באתר ב-T1, המשיך לעבוד (T3), והשמירה נדחתה כי מחשב 2 שמר ב-T2 — המקומית "חדשה" לפי השעון
  const s = memStorage({ [key]: JSON.stringify({ ops: [E1], at: T1 + 120e3 }) });
  writeDraftMeta(s, 'p', { key, srv: new Date(T1).toISOString(), stage: 'text', stale: true });
  const server = { ops: [E2], updatedAt: new Date(T1 + 60e3).toISOString(), stage: 'text' };
  const r = applyServerDraft(s, { pageId: 'p', draftKey: key, server });
  assert.deepEqual([r.source, r.merged], ['merged', 1]);
  assert.deepEqual(readLocalDraft(s, key).ops, [E2, E1], 'העבודה של המחשב השני לא נדרסה');
  assert.deepEqual(readDraftMeta(s, 'p'), { key, srv: server.updatedAt, stage: 'text', stale: false, base: baseKeysOf(server.ops) });

  // סתירה — אותה שורה, ערכים שונים: לא נכתב דבר, והדף שואל
  const MINE = { kind: 'text', page: 1, ids: [2], value: 'שלי' };
  const s2 = memStorage({ [key]: JSON.stringify({ ops: [MINE], at: T1 + 120e3 }) });
  writeDraftMeta(s2, 'p', { key, srv: new Date(T1).toISOString(), stage: 'text' });
  const c = applyServerDraft(s2, { pageId: 'p', draftKey: key, server });
  assert.equal(c.source, 'conflict');
  assert.deepEqual([c.conflict.n, c.conflict.mine, c.conflict.theirs], [1, 1, 1]);
  assert.deepEqual(readLocalDraft(s2, key).ops, [MINE], 'לפני ההכרעה — כלום לא נכתב');
  for (const [choice, want] of [['merge', [E2, MINE]], ['server', [E2]], ['mine', [MINE]]]) {
    const st = memStorage({ [key]: JSON.stringify({ ops: [MINE], at: 1 }) });
    const res = resolveDraftConflict(st, { pageId: 'p', draftKey: key, server, conflict: c.conflict, choice });
    assert.deepEqual(readLocalDraft(st, key).ops, want, choice);
    assert.equal(res.srv, server.updatedAt);
    assert.equal(readDraftMeta(st, 'p').stale, false);
  }

  // רק צד אחד השתנה באמת — הוא, בלי קשר לשעון; שום שינוי כאן — מה שבאתר
  const s3 = memStorage({ [key]: JSON.stringify({ ops: [E2, E1], at: 1 }) });
  writeDraftMeta(s3, 'p', { key, srv: new Date(T1).toISOString(), stage: 'text' });
  assert.equal(applyServerDraft(s3, { pageId: 'p', draftKey: key, server }).source, 'local');
  const s4 = memStorage({ [key]: JSON.stringify({ ops: [E2], at: T1 + 1e9 }) });
  writeDraftMeta(s4, 'p', { key, srv: new Date(T1).toISOString(), stage: 'text', stale: true });
  assert.equal(applyServerDraft(s4, { pageId: 'p', draftKey: key, server: { ...server, ops: [E2, E1] } }).source, 'server');

  // diffDrafts: סגנון-תו על אותן מילים בערך אחר — סתירה; על מילים אחרות — לא
  const sty = (words, on) => ({ kind: 'styles', page: 1, ids: [1], value: { style: 'b', words, on } });
  assert.equal(diffDrafts([sty([0, 1], true)], [sty([0, 1], false)]).conflicts.length, 1);
  assert.equal(diffDrafts([sty([0, 1], true)], [sty([2, 3], false)]).conflicts.length, 0);
});

test('מיזוג משולש מול הגרסה המסונכרנת האחרונה (meta.base): מה שצד אחד הוריד אינו חוזר מהצד השני', () => {
  const T1 = Date.parse('2026-10-05T10:00:00Z');
  const X = { kind: 'stream', page: 1, ids: [1], value: 'side' };
  const W = { kind: 'text', page: 1, ids: [3], value: 'W' };
  const Y = { kind: 'text', page: 1, ids: [2], value: 'Y' };
  const Z = { kind: 'text', page: 1, ids: [4], value: 'Z' };
  const key = 'k';
  const server = (ops) => ({ ops, updatedAt: new Date(T1 + 60e3).toISOString(), stage: 'text' });
  const open = (localOps, base, srvOps) => {
    const s = memStorage({ [key]: JSON.stringify({ ops: localOps, at: T1 + 120e3 }) });
    writeDraftMeta(s, 'p', { key, srv: new Date(T1).toISOString(), stale: true, base: baseKeysOf(base) });
    return { r: applyServerDraft(s, { pageId: 'p', draftKey: key, server: server(srvOps) }), ops: readLocalDraft(s, key).ops, meta: readDraftMeta(s, 'p') };
  };
  // 1: מסונכרן [X]; כאן הורד X ונוסף Y; שם נוסף Z — X אינו חוזר
  const c1 = open([Y], [X], [X, Z]);
  assert.equal(c1.r.source, 'merged');
  assert.deepEqual(c1.ops, [Z, Y]);
  assert.deepEqual(c1.meta.base, baseKeysOf([X, Z]), 'הבסיס הבא — מה שבשרת עכשיו');
  // 2: מסונכרן [X, W]; שם הורד X; כאן נוסף Y — ההורדה שם נשמרת
  assert.deepEqual(open([X, W, Y], [X, W], [W]).ops, [W, Y]);
  // הורדה כאן בלבד (שם לא השתנה דבר) — מה שכאן, בלי קשר לשעון
  const c3 = open([W], [X, W], [X, W]);
  assert.equal(c3.r.source, 'local');
  assert.deepEqual(c3.ops, [W]);
  // הורדה שם בלבד — מה שבשרת
  assert.equal(open([X, W], [X, W], [W]).r.source, 'server');
  // שני הצדדים שינו את אותה שורה אחרת — שאלה, כמו קודם
  const Y2 = { kind: 'text', page: 1, ids: [2], value: 'Y אחר' };
  assert.equal(open([X, Y], [X], [X, Y2]).r.source, 'conflict');
  // בלי בסיס (meta מגרסה קודמת) — השוואה של שתי רשימות
  assert.deepEqual(diffDrafts([Y], [X, Z]).merged, [X, Z, Y]);
});

test('KEEPALIVE_MAX: מתחת לתקרת-הדפדפנים (64KiB) לגוף בקשת keepalive', () => {
  assert.ok(KEEPALIVE_MAX > 0 && KEEPALIVE_MAX < 64 * 1024);
});

test('הנוסחים: "N שינויים", וההודעה לפי מקור הטיוטה — בלי שם המתנדב הקודם', () => {
  assert.equal(changesHe(1), 'שינוי אחד');
  assert.equal(changesHe(4), '4 שינויים');
  const h = inheritedHeadline({ source: 'draft', count: 3, byName: 'ראובן' });
  assert.match(h.title, /ממשיכים מהעבודה של מתנדב קודם \(3 שינויים\)/);
  assert.equal(`${h.title}${h.body}`.includes('ראובן'), false);
  assert.match(inheritedHeadline({ source: 'submission', count: 1 }).body, /מתחילים מההגשה של מתנדב קודם \(שינוי אחד\)/);
  assert.match(inheritedHeadline({ source: 'approved', count: 2 }).body, /מתחילים מהגרסה שאושרה/);
});

test('השוואת פעולות: opKey בצורת-החוזה ובמפתחות ממוינים; matchOps — כל פעולה מותאמת פעם אחת', () => {
  const A = { kind: 'styles', page: 4, ids: [1], value: { words: [0, 1], style: 'b', on: true } };
  const A2 = { page: 4, ids: [1], kind: 'styles', value: { on: true, style: 'b', words: [0, 1] }, _g: 'x' };
  assert.equal(opKey(A), opKey(A2));
  assert.notEqual(opKey(A), opKey({ ...A, ids: [2] }));
  const base = [TEXT, A, TEXT];
  assert.deepEqual(matchOps(base, [A2, TEXT, TEXT, TEXT, { kind: 'seg_ok', page: 4, ids: [1], value: 0, _local: true }]), [1, 0, 2, -1, -1]);
});

test('sameAsMap / basedOnDelta — מה זהה להגשה הקודמת, מה נוסף ומה הוחזר', () => {
  const OK = { kind: 'line_ok', page: 4, ids: [2] };
  const STREAM = { kind: 'stream', page: 4, ids: [2], value: 'notes' };
  const base = [TEXT, STREAM, OK];
  const ops = [TEXT, OK, { kind: 'para', page: 4, ids: [1], value: 'h2' }];
  assert.deepEqual(sameAsMap('abc', base, ops), ['abc:0', 'abc:2', null]);
  assert.deepEqual(sameAsMap(null, base, ops), [null, null, null]);
  assert.deepEqual(basedOnDelta(base, ops), { added: [2], removed: [STREAM] });
});

test('splitInherited — אילו פעולות בטיוטה התקבלו ממישהו אחר, ואילו שורות הן נוגעות בהן', () => {
  const STREAM = { kind: 'stream', page: 4, ids: [2], value: 'notes' };
  const r = splitInherited([TEXT, { kind: 'line_ok', page: 4, ids: [3] }, STREAM], [STREAM, TEXT]);
  assert.deepEqual([...r.idx].sort(), [0, 2]);
  assert.deepEqual([...r.lines].sort(), [1, 2]);
  assert.equal(splitInherited([TEXT], null).idx.size, 0);
});
