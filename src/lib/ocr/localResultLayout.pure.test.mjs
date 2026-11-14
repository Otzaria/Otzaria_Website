// נרמול נתוני פריסה/עזר מהעובד המקומי (localResultLayout.pure.js) — מול הפיקסצ'ר המשותף של החוזה
// (fixtures/localResultLayout.result.json + .envelope.json, מועתקים בלי עריכה מהמפרט).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  BOOK_METADATA_MAX_BYTES,
  bookMetadataJson,
  layoutV1Problems,
  MAX_PAGE_WARNINGS,
  normalizePageLayout,
  normalizeWarnings,
  PAGE_METADATA_MAX_BYTES,
  pageMetadataJson,
  resultMetadataView,
  SITE_LAYOUT_PAGE_MAX_BYTES,
  textSha256Hex,
} from './localResultLayout.pure.js';
import { OCR_WARNING_LABELS, ocrWarningLabel } from './ocrWarningLabels.js';

const RESULT = JSON.parse(fs.readFileSync(new URL('./fixtures/localResultLayout.result.json', import.meta.url), 'utf8'));
const ENVELOPE = JSON.parse(fs.readFileSync(new URL('./fixtures/localResultLayout.envelope.json', import.meta.url), 'utf8'));
const entry = (i) => ENVELOPE.pageMap.find((e) => e.pdfPageIndex === i);
const layoutOf = (i) => structuredClone(RESULT.pages.find((p) => p.pdfPageIndex === i).layout);

test('הפיקסצ\'ר: עמודים 1 ו-2 → ok (layoutJson כמות שהוא); עמוד 3 בלי layout → absent', () => {
  for (const i of [1, 2]) {
    const raw = layoutOf(i);
    const r = normalizePageLayout(raw, entry(i));
    assert.equal(r.status, 'ok', JSON.stringify(r.errors));
    assert.equal(r.version, 1);
    assert.deepEqual(JSON.parse(r.layoutJson), raw);
    assert.equal(r.bytes, Buffer.byteLength(JSON.stringify(raw)));
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.warnings, []);
    assert.equal(r.rejectedJson, null);
  }
  const absent = normalizePageLayout(undefined, entry(3));
  assert.equal(absent.status, 'absent');
  assert.equal(absent.layoutJson, null);
  assert.deepEqual(absent.warnings, []);
  assert.equal(normalizePageLayout(null, entry(3)).status, 'absent');
});

test('layoutVersion 2 → unsupported_version, rejectedJson שמור + אזהרה', () => {
  const raw = { ...layoutOf(1), layoutVersion: 2 };
  const r = normalizePageLayout(raw, entry(1));
  assert.equal(r.status, 'unsupported_version');
  assert.equal(r.version, 2);
  assert.equal(r.layoutJson, null);
  assert.deepEqual(JSON.parse(r.rejectedJson), raw);
  assert.deepEqual(r.warnings.map((w) => [w.code, w.source]), [['layout_version_unsupported', 'site']]);
});

test('invalid: לא אובייקט, bbox הפוך, conf:150, words עם מחרוזת, מפתח $x, עומק > 8 — עם rejectedJson ואזהרה', () => {
  const cases = [
    ['x', 'layout is not an object'],
    [[1, 2], 'layout is not an object'],
    [(() => { const l = layoutOf(1); l.lines[0].bbox = [1607, 299, 208, 347]; return l; })(), 'lines[0].bbox invalid'],
    [(() => { const l = layoutOf(1); l.lines[0].conf = 150; return l; })(), 'lines[0].conf invalid'],
    [(() => { const l = layoutOf(1); l.lines[1].words[0][0] = '950'; return l; })(), 'lines[1].words invalid'],
    [(() => { const l = layoutOf(1); l.lines[0].$x = 1; return l; })(), 'forbidden key "$x"'],
    [(() => { const l = layoutOf(1); l.frames[0]['a.b'] = 1; return l; })(), 'forbidden key "a.b"'],
    [(() => { const l = layoutOf(1); l.deep = [[[[[[[[1]]]]]]]]; return l; })(), 'nesting deeper than 8'],
    [(() => { const l = layoutOf(2); l.geometry = 'exact'; return l; })(), 'geometry must be "approx" exactly when dewarped'],
    [(() => { const l = layoutOf(1); l.toSource = [0.1, 0, 0, 0, 0.1, 0]; return l; })(), 'toSource determinant out of range'],
    [(() => { const l = layoutOf(1); l.lines = [l.lines[1], l.lines[0]]; return l; })(), 'lines[1].k not sorted'],
    [(() => { const l = layoutOf(2); l.lines[0].wordTexts = ['שלום']; return l; })(), 'lines[0].wordTexts invalid'],
  ];
  for (const [raw, expected] of cases) {
    const r = normalizePageLayout(raw, entry(1).imageSha256 === raw?.image?.imageSha256 ? entry(1) : entry(2));
    assert.equal(r.status, 'invalid', expected);
    assert.ok(r.errors.includes(expected), `${expected} ∉ ${JSON.stringify(r.errors)}`);
    assert.equal(r.layoutJson, null);
    assert.equal(r.rejectedJson, JSON.stringify(raw));
    assert.deepEqual(r.warnings.map((w) => w.code), ['layout_invalid']);
    assert.ok(r.errors.length <= 5);
  }
});

test('imageSha256 שונה מה-pageMap → invalid עם layout_image_mismatch (במקום layout_invalid)', () => {
  const r = normalizePageLayout(layoutOf(1), entry(2));
  assert.equal(r.status, 'invalid');
  assert.deepEqual(r.warnings.map((w) => w.code), ['layout_image_mismatch']);
  assert.ok(r.rejectedJson);
});

test('גדול מ-1.125MiB → too_large, בלי rejectedJson, עם layout_too_large', () => {
  const raw = layoutOf(1);
  raw.lines[0].huge = 'א'.repeat(SITE_LAYOUT_PAGE_MAX_BYTES / 2);
  const r = normalizePageLayout(raw, entry(1));
  assert.equal(r.status, 'too_large');
  assert.ok(r.bytes > SITE_LAYOUT_PAGE_MAX_BYTES);
  assert.equal(r.layoutJson, null);
  assert.equal(r.rejectedJson, null);
  assert.deepEqual(r.warnings.map((w) => w.code), ['layout_too_large']);
});

test('דטרמיניזם ושדות לא מוכרים: אותו קלט → אותו פלט; שדה לא מוכר בשורה ובשורש נשמר ב-layoutJson', () => {
  const raw = layoutOf(1);
  raw.lines[0].futureField = { a: [1, 2] };
  raw.extraRoot = 'v';
  const a = normalizePageLayout(raw, entry(1));
  const b = normalizePageLayout(structuredClone(raw), entry(1));
  assert.deepEqual(a, b);
  assert.equal(a.status, 'ok');
  const stored = JSON.parse(a.layoutJson);
  assert.deepEqual(stored.lines[0].futureField, { a: [1, 2] });
  assert.equal(stored.extraRoot, 'v');
  // optional עם null (במקום מושמט) — לא פוסל את ה-layout
  raw.lines[0].corrected = null;
  assert.equal(normalizePageLayout(raw, entry(1)).status, 'ok');
});

test('layoutV1Problems: לכל היותר 5 שגיאות גם כשכל השורות פגומות', () => {
  const raw = layoutOf(1);
  raw.lines = Array.from({ length: 50 }, (_, k) => ({ k }));
  const errors = layoutV1Problems(raw);
  assert.equal(errors.length, 5);
});

test('normalizeWarnings: מתעלם ממה שאינו תקין, מנקה ומקצר, עד 20, source worker', () => {
  assert.deepEqual(normalizeWarnings(5), []);
  assert.deepEqual(normalizeWarnings('x'), []);
  assert.deepEqual(normalizeWarnings(null), []);
  const raw = [
    null,
    'layout_too_large',
    { code: 'Bad-Code', message: 'x' },
    { code: 'layout_too_large', message: `m${String.fromCharCode(0x202e)}${String.fromCharCode(7)}ok` },
    { code: 'layout_alts_trimmed' },
    { code: 'x'.repeat(65), message: '' },
    { code: 'layout_build_failed', message: 'z'.repeat(900) },
  ];
  const out = normalizeWarnings(raw);
  assert.deepEqual(out.slice(0, 2), [
    { code: 'layout_too_large', message: 'mok', source: 'worker' },
    { code: 'layout_alts_trimmed', message: '', source: 'worker' },
  ]);
  assert.equal(out[2].message.length, 500);
  assert.equal(out.length, 3);
  const many = normalizeWarnings(Array.from({ length: 25 }, () => ({ code: 'a', message: '' })));
  assert.equal(many.length, MAX_PAGE_WARNINGS);
});

test('pageMetadataJson / bookMetadataJson: כמות שהוא, או השמטה/תת-קבוצה מעל הגבול', () => {
  const meta = RESULT.pages[2].metadata;
  assert.deepEqual(pageMetadataJson(meta), { json: JSON.stringify(meta), warning: null });
  assert.deepEqual(pageMetadataJson(undefined), { json: null, warning: null });
  const big = pageMetadataJson({ x: 'a'.repeat(PAGE_METADATA_MAX_BYTES) });
  assert.equal(big.json, null);
  assert.equal(big.warning.code, 'metadata_too_large');
  assert.equal(big.warning.source, 'site');

  assert.deepEqual(bookMetadataJson(RESULT.metadata), { json: JSON.stringify(RESULT.metadata), truncated: false });
  assert.deepEqual(bookMetadataJson(null), { json: null, truncated: false });
  const huge = { ...RESULT.metadata, per_page_detail: 'x'.repeat(BOOK_METADATA_MAX_BYTES) };
  const t = bookMetadataJson(huge);
  assert.equal(t.truncated, true);
  const kept = JSON.parse(t.json);
  assert.equal(kept.per_page_detail, undefined);
  assert.equal(kept.otzaria_issue_list, undefined); // לא בתת-הקבוצה
  assert.deepEqual(kept.layout, RESULT.metadata.layout);
  assert.equal(kept.service_version, '1.0.143');
  assert.deepEqual(kept.hardware, RESULT.metadata.hardware);
});

// קלט עוין: קינון עמוק מאוד עובר את JSON.parse ואת validateResult, אבל JSON.stringify זורק עליו
// RangeError — חריגה כאן הייתה מפילה את כל הקליטה (500 בכל ניסיון, הטקסט לא נקלט לעולם)
const deepJson = (n) => JSON.parse(`${'['.repeat(n)}0${']'.repeat(n)}`);

test('קלט עוין: metadata מקונן מאוד לא זורק — העמוד בלי metadata (עם אזהרה), metadata הספר → null/תת-קבוצה', () => {
  const deep = deepJson(200_000);
  const page = pageMetadataJson({ lines: 3, deep });
  assert.equal(page.json, null);
  assert.equal(page.warning.code, 'metadata_too_large');
  assert.deepEqual(bookMetadataJson({ deep }), { json: '{}', truncated: true });
  assert.deepEqual(bookMetadataJson({ layout: deep }), { json: null, truncated: true });
  const kept = bookMetadataJson({ service_version: '1.0.143', deep });
  assert.deepEqual(JSON.parse(kept.json), { service_version: '1.0.143' });
});

test('קלט עוין ב-layout: קינון עמוק, __proto__/constructor, מחרוזות NaN/Infinity, טיפוסים שגויים, מערכים ענקיים — לא זורק', () => {
  const e = entry(1);
  const deep = normalizePageLayout({ ...layoutOf(1), extra: deepJson(200_000) }, e);
  assert.equal(deep.status, 'invalid');
  assert.equal(normalizePageLayout(deepJson(200_000), e).status, 'invalid');

  // מפתח __proto__ מ-JSON.parse הוא מאפיין רגיל (לא שינוי prototype) — שדה לא מוכר, נשמר כמות שהוא
  // הזרקה לרמת השורש בלבד: מחליפים את ה-'{' הפותח של האובייקט החיצוני
  const proto = JSON.parse('{"__proto__":{"polluted":1},"constructor":{"x":1},' + JSON.stringify(layoutOf(1)).slice(1));
  const r = normalizePageLayout(proto, e);
  assert.equal(r.status, 'ok', JSON.stringify(r.errors));
  assert.equal(({}).polluted, undefined);
  assert.equal(JSON.parse(r.layoutJson).constructor.x, 1);

  const bad = [
    (l) => { l.toSource = ['NaN', 0, 0, 0, 1, 0]; },
    (l) => { l.lines[0].conf = 'Infinity'; },
    (l) => { l.lines[0].bbox = [0, 0, 1e308, 1e308]; },
    (l) => { l.lines[0].bbox = ['1', '2', '3', '4']; },
    (l) => { l.lines = { length: 1 }; },
    (l) => { l.image = null; },
    (l) => { l.lines[0].words = Array.from({ length: 2001 }, () => [1, 2, 0.5]); },
    (l) => { l.frames = Array.from({ length: 1001 }, () => l.frames[0]); },
    (l) => { l.orderFrames = Array.from({ length: 2001 }, () => 'm1'); },
    (l) => { l.lines[0].alternatives = Array.from({ length: 51 }, () => ({})); },
  ];
  for (const mutate of bad) {
    const l = layoutOf(1);
    mutate(l);
    const out = normalizePageLayout(l, e);
    assert.equal(out.status, 'invalid', mutate.toString());
    assert.equal(out.warnings[0].code, 'layout_invalid');
  }
  for (const raw of ['x', 5, true, [1, 2]]) assert.equal(normalizePageLayout(raw, e).status, 'invalid');
  assert.equal(normalizePageLayout({ ...layoutOf(1), layoutVersion: '1' }, e).status, 'unsupported_version');
});

test('resultMetadataView: רק השדות לממשק; otzaria_issue_list עד 50; JSON פגום → null', () => {
  const v = resultMetadataView(JSON.stringify({ ...RESULT.metadata, otzaria_issue_list: Array.from({ length: 70 }, (_, i) => `i${i}`) }));
  assert.deepEqual(Object.keys(v).sort(), [
    'bridge_version', 'hardware', 'layout', 'models', 'otzaria_issue_list', 'otzaria_issues', 'run_seconds', 'service_version',
  ]);
  assert.deepEqual(v.hardware, { gpu: 'AMD Radeon RX 9060 XT' });
  assert.equal(v.otzaria_issue_list.length, 50);
  assert.equal(resultMetadataView('{'), null);
  assert.equal(resultMetadataView(null), null);
  assert.deepEqual(resultMetadataView(JSON.stringify({ salvage: { reason: 'cancelled', pages: 2 } })), { salvage: { reason: 'cancelled', pages: 2 } });
});

test('textSha256Hex: UTF-8', () => {
  assert.equal(textSha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.match(textSha256Hex('שלום'), /^[0-9a-f]{64}$/);
});

test('toSource: כל מטריצה אפינית סופית והפיכה בטווח הדטרמיננטה מתקבלת (לא רק זהות/סיבוב טהור)', () => {
  // PDF שנבנה באתר: קנה המידה האמיתי של הביטמפ (למשל e=0.999597) ולא זהות מדויקת
  for (const m of [[0.999597, 0, 0.2, 0, 0.999597, -0.3], [1.2, 0.01, 5, -0.02, 0.8, 7], [-1, 0, 1748, 0, 1, 0]]) {
    const raw = layoutOf(2);
    raw.toSource = m;
    assert.equal(normalizePageLayout(raw, entry(2)).status, 'ok', JSON.stringify(m));
  }
  for (const m of [[0, 0, 0, 0, 0, 0], [3, 0, 0, 0, 3, 0], [1, 0, 0, 0, 1, Number.NaN], [1, 0, 0, 0, 1]]) {
    const raw = layoutOf(2);
    raw.toSource = m;
    assert.equal(normalizePageLayout(raw, entry(2)).status, 'invalid', JSON.stringify(m));
  }
});

test('קודי ההסרה של השירות (warnings_invalid_shape / metadata_invalid_shape / layout_invalid_shape): נשמרים ומתויגים בעברית', () => {
  const codes = ['warnings_invalid_shape', 'metadata_invalid_shape', 'layout_invalid_shape'];
  const out = normalizeWarnings(codes.map((code) => ({ code, message: '1 malformed warnings removed' })));
  assert.deepEqual(out.map((w) => w.code), codes);
  for (const code of codes) {
    assert.ok(Object.hasOwn(OCR_WARNING_LABELS, code), code);
    const label = ocrWarningLabel(code);
    assert.match(label, /[֐-׿]/);
    assert.ok(!label.includes('אינה מוכרת'), code);
  }
});
