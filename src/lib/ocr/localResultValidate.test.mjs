import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_RESULT_BYTES,
  MAX_PAGE_TEXT_CHARS,
  pageMapByIndex,
  parseResultBytes,
  validateResult,
  validationDetails,
} from './localResultValidate.js';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);

// עבודה שמתאימה לדוגמאות החוזה (contracts/examples/job-envelope.json בריפו השירות)
const JOB = {
  _id: 'job-0001',
  inputSha256: A,
  pageMap: [
    { pdfPageIndex: 1, page: 'p-001', pageNumber: 1, expectedUpdatedAt: new Date(), imageSha256: B },
    { pdfPageIndex: 2, page: 'p-002', pageNumber: 2, expectedUpdatedAt: new Date(), imageSha256: B },
  ],
};

// contracts/examples/result-*.json — מועתקים כמו שהם
const EXAMPLES = {
  success: '{"schemaVersion":1,"jobId":"job-0001","inputSha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","outcome":"success","pipelineVersion":"0.1.0","pages":[{"pdfPageIndex":1,"text":"שלום","metadata":{"confidence":0.97}},{"pdfPageIndex":2,"text":"עולם"}],"metadata":{"gpu_kind":"amd"}}',
  partial: '{"schemaVersion":1,"jobId":"job-0001","inputSha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","outcome":"partial","pipelineVersion":"0.1.0","pages":[{"pdfPageIndex":1,"text":"שלום"},{"pdfPageIndex":2,"error":{"code":"layout_failed","message":"layout failed"}}]}',
  failed: '{"schemaVersion":1,"jobId":"job-0001","inputSha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","outcome":"failed","pipelineVersion":"","pages":[],"error":{"code":"gpu_unavailable","message":"AMD GPU not available"}}',
  cancelled: '{"schemaVersion":1,"jobId":"job-0001","inputSha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","outcome":"cancelled","pipelineVersion":"","pages":[]}',
};

const parse = (s) => {
  const r = parseResultBytes(Buffer.from(s, 'utf8'));
  assert.equal(r.ok, true);
  return r.doc;
};
const success = () => parse(EXAMPLES.success);
const check = (doc, bytes = 100) => validateResult(doc, JOB, bytes);

// ==================== parseResultBytes ====================

test('parseResultBytes: UTF-8 עם BOM מתקבל; UTF-8 שבור / לא JSON / לא אובייקט נדחים', () => {
  const bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(EXAMPLES.success, 'utf8')]);
  assert.equal(parseResultBytes(bom).ok, true);
  assert.equal(parseResultBytes(bom).doc.pages[0].text, 'שלום');
  assert.deepEqual(parseResultBytes(Buffer.from([0x7b, 0xff, 0x7d])), { ok: false });
  assert.deepEqual(parseResultBytes(Buffer.from('{"a":', 'utf8')), { ok: false });
  assert.deepEqual(parseResultBytes(Buffer.from('[1,2]', 'utf8')), { ok: false });
  assert.deepEqual(parseResultBytes(Buffer.from('null', 'utf8')), { ok: false });
  assert.deepEqual(parseResultBytes(Buffer.alloc(0)), { ok: false });
});

// ==================== דוגמאות החוזה ====================

test('ארבע דוגמאות result-*.json מתקבלות מול עבודה מתאימה', () => {
  for (const [name, json] of Object.entries(EXAMPLES)) {
    const r = check(parse(json), Buffer.byteLength(json));
    assert.deepEqual(r, { ok: true, errors: [] }, name);
  }
});

test('pageMapByIndex: אינדקס → איבר המיפוי', () => {
  const m = pageMapByIndex(JOB);
  assert.equal(m.size, 2);
  assert.equal(m.get(2).page, 'p-002');
  assert.equal(pageMapByIndex({}).size, 0);
});

// ==================== דחיות ====================

test('עמוד חסר ב-success / partial נדחה', () => {
  const doc = success();
  doc.pages.pop();
  assert.deepEqual(check(doc).errors, ['missing page 2']);
  const p = parse(EXAMPLES.partial);
  p.pages.shift();
  assert.deepEqual(check(p).errors, ['missing page 1']);
});

test('עמוד כפול ואינדקס לא מבוקש נדחים', () => {
  const doc = success();
  doc.pages.push({ pdfPageIndex: 2, text: 'שוב' });
  doc.pages.push({ pdfPageIndex: 3, text: 'זר' });
  assert.deepEqual(check(doc).errors, ['duplicate page 2', 'unrequested page 3']);
});

test('pageId זר נדחה; pageId תואם מתקבל', () => {
  const doc = success();
  doc.pages[0].pageId = 'p-999';
  assert.deepEqual(check(doc).errors, ['page 1 pageId mismatch']);
  doc.pages[0].pageId = 'p-001';
  assert.equal(check(doc).ok, true);
});

test('success עם שגיאת עמוד / שגיאה עליונה נדחה', () => {
  const doc = success();
  doc.pages[1] = { pdfPageIndex: 2, error: { code: 'x', message: '' } };
  assert.deepEqual(check(doc).errors, ['success result contains page errors']);
  const top = success();
  top.error = { code: 'x', message: 'y' };
  assert.deepEqual(check(top).errors, ['success result has top-level error']);
});

test('failed בלי error עליון ובלי שגיאה בכל עמוד נדחה; שגיאה בכל עמוד מתקבלת', () => {
  const doc = parse(EXAMPLES.failed);
  delete doc.error;
  assert.deepEqual(check(doc).errors, ['failed result requires top-level error or an error on every requested page']);
  doc.pages = [
    { pdfPageIndex: 1, error: { code: 'a', message: '' } },
    { pdfPageIndex: 2, error: { code: 'b', message: '' } },
  ];
  assert.equal(check(doc).ok, true);
  doc.pages[1] = { pdfPageIndex: 2, text: 'x' };
  assert.equal(check(doc).ok, false);
  const blank = parse(EXAMPLES.failed);
  blank.error.code = ' ';
  assert.deepEqual(check(blank).errors, ['failed result top-level error without code']);
});

test('inputSha256 שגוי ו-jobId שגוי (גם באותיות אחרות) נדחים', () => {
  const doc = success();
  doc.inputSha256 = B;
  doc.jobId = 'JOB-0001';
  assert.deepEqual(check(doc).errors, ['jobId mismatch', 'inputSha256 mismatch']);
});

test('schemaVersion/outcome לא תקינים נדחים; outcome באותיות גדולות אינו outcome', () => {
  const doc = success();
  doc.schemaVersion = 2;
  doc.outcome = 'Success';
  assert.deepEqual(check(doc).errors, ['schemaVersion must be 1', 'outcome invalid']);
});

test('pipelineVersion ריק ב-success/partial נדחה (ב-failed/cancelled מותר)', () => {
  const doc = success();
  doc.pipelineVersion = '  ';
  assert.deepEqual(check(doc).errors, ['pipelineVersion missing']);
});

test('עמוד בלי טקסט ובלי שגיאה, ושגיאת עמוד בלי code — נדחים', () => {
  const doc = parse(EXAMPLES.partial);
  doc.pages[0] = { pdfPageIndex: 1 };
  doc.pages[1] = { pdfPageIndex: 2, error: { code: '', message: 'm' } };
  assert.deepEqual(check(doc).errors, ['page 1 has neither text nor error', 'page 2 error without code']);
});

test('טקסט עמוד ארוך מהמותר נדחה', () => {
  const doc = success();
  doc.pages[0].text = 'א'.repeat(MAX_PAGE_TEXT_CHARS + 1);
  assert.deepEqual(check(doc).errors, ['page 1 text too long']);
});

// אותו גבול ואותה יחידה כמו ResultValidator.MaxPageTextUnits בשירות (Validation/Validators.cs, 1.0.141+):
// 2,000,000 יחידות UTF-16 (String.length = .NET string.Length), "> גבול" נדחה — בדיוק הגבול מתקבל
test('גבול טקסט עמוד: בדיוק 2,000,000 יחידות UTF-16 מתקבל, גם בזוגות surrogate; יחידה אחת יותר נדחית', () => {
  assert.equal(MAX_PAGE_TEXT_CHARS, 2_000_000);
  const exact = success();
  exact.pages[0].text = 'א'.repeat(MAX_PAGE_TEXT_CHARS);
  assert.deepEqual(check(exact), { ok: true, errors: [] });

  // 1,000,000 אמוג'י = 2,000,000 יחידות UTF-16 (מיליון נקודות קוד בלבד) — בדיוק הגבול
  const emoji = success();
  emoji.pages[0].text = '😀'.repeat(MAX_PAGE_TEXT_CHARS / 2);
  assert.equal(emoji.pages[0].text.length, MAX_PAGE_TEXT_CHARS);
  assert.deepEqual(check(emoji), { ok: true, errors: [] });
  // עוד תו אחד: 1,000,001 נקודות קוד בלבד, אבל 2,000,001 יחידות — נדחה (לא נספר בנקודות קוד)
  emoji.pages[0].text += 'א';
  assert.deepEqual(check(emoji).errors, ['page 1 text too long']);
});

// עמוד חורג כפי ש-ResultFinalizer.Load בשירות (Execution/ResultFinalizer.cs:63-73, 1.0.141+) הופך אותו לפני
// ההקפאה: בלי text, metadata של העמוד נשמר, error.code = page_text_too_long, ו-success הופך ל-partial
test('עמוד page_text_too_long (עם metadata ובלי text) מתקבל ב-partial — גם כשכל העמודים כאלה', () => {
  const tooLong = (i) => ({
    pdfPageIndex: i,
    metadata: { lines: 30, review: null },
    error: { code: 'page_text_too_long', message: 'Page text exceeds 2000000 UTF-16 code units.' },
  });
  const one = success();
  one.outcome = 'partial';
  one.pages[1] = tooLong(2);
  assert.deepEqual(check(one), { ok: true, errors: [] });

  const all = success();
  all.outcome = 'partial';
  all.pages = [tooLong(1), tooLong(2)];
  assert.deepEqual(check(all), { ok: true, errors: [] });

  // ב-failed (שגיאה בכל עמוד, עם או בלי error עליון no_page_processed) וב-cancelled — גם כן
  const failed = success();
  failed.outcome = 'failed';
  failed.pages = [tooLong(1), tooLong(2)];
  assert.deepEqual(check(failed), { ok: true, errors: [] });
  failed.error = { code: 'no_page_processed', message: 'no requested page was processed' };
  assert.deepEqual(check(failed), { ok: true, errors: [] });
  const cancelled = success();
  cancelled.outcome = 'cancelled';
  cancelled.pages[0] = tooLong(1);
  assert.deepEqual(check(cancelled), { ok: true, errors: [] });
});

// כל קודי שגיאת העמוד שהשירות עשוי לשלוח: layout_failed / not_processed (bridge/ocr_bridge.py build_result,
// עם text:"" ובלי metadata) ו-page_text_too_long (ResultFinalizer.cs). האתר לא מסנן לפי קוד.
test('קודי שגיאת עמוד של השירות מתקבלים, עם text ריק ובלי metadata (pipeline-contract.md)', () => {
  for (const code of ['layout_failed', 'not_processed', 'page_text_too_long']) {
    const doc = success();
    doc.outcome = 'partial';
    doc.pages[1] = { pdfPageIndex: 2, text: '', error: { code, message: 'm' } };
    assert.deepEqual(check(doc), { ok: true, errors: [] }, code);
  }
});

// pipeline-contract.md: ערכים בתוך metadata של הספר עשויים להיות null (למשל gpu.name כשאין GPU מזוהה)
test('metadata של הספר/העמוד עם ערכי null בתוכו מתקבל', () => {
  const doc = success();
  doc.metadata = {
    hardware: null,
    gpu: { name: null, vram_peak_allocated_gb: null, vram_peak_reserved_gb: null },
    resumed: false,
    bridge_version: null,
  };
  doc.pages[0].metadata = { lines: 3, scripts: { square: 3, rashi: null, mixed: null } };
  assert.deepEqual(check(doc), { ok: true, errors: [] });
});

// הקלה מכוונת (CONTRACT.md, סעיף "מגבלות וקבלה סלחנית"): השירות 1.0.138+ (adb0c97) לא מקפיא error עליון בלי code
// (Validators.cs:154, HANDOVER 3.1 פריט 11), אבל DeliverySender לא מאמת מחדש קובץ שהוקפא בגרסה ישנה —
// ולכן partial/cancelled כזה עדיין מתקבל (ב-failed נדחה, כמו בשירות)
test('error עליון עם code ריק: ב-partial/cancelled מתקבל (הקלה), ב-failed נדחה', () => {
  for (const outcome of ['partial', 'cancelled']) {
    const doc = parse(EXAMPLES.partial);
    doc.outcome = outcome;
    doc.error = { code: '', message: 'm' };
    assert.deepEqual(check(doc), { ok: true, errors: [] }, outcome);
  }
  const failed = parse(EXAMPLES.failed);
  failed.error.code = '';
  assert.deepEqual(check(failed).errors, ['failed result top-level error without code']);
});

test('null מפורש / טיפוס שגוי בשדות חובה — שגיאת צורה, בלי לגעת בשאר', () => {
  const doc = success();
  doc.jobId = null;
  doc.pages[1] = null;
  assert.deepEqual(check(doc).errors, ['jobId is missing', 'pages[1] is not an object']);
  const d2 = success();
  d2.pages = null;
  assert.deepEqual(check(d2).errors, ['pages is missing']);
  const d3 = success();
  d3.pages[0].pdfPageIndex = 1.5;
  d3.pages[1].error = { code: 'x' };
  d3.metadata = [];
  assert.deepEqual(check(d3).errors, [
    'metadata is not an object',
    'pages[0].pdfPageIndex invalid',
    'pages[1].error.message is missing',
  ]);
  // error/metadata/text שהם null מפורש — כאילו חסרים (השירות משמיט null, אבל זה לא סיבה לדחות)
  const d4 = success();
  d4.error = null;
  d4.metadata = null;
  d4.pages[0].metadata = null;
  assert.equal(check(d4).ok, true);
  assert.deepEqual(validateResult('x', JOB, 1).errors, ['result is not an object']);
});

test('גודל מעל המקסימום נדחה', () => {
  const doc = success();
  assert.equal(check(doc, MAX_RESULT_BYTES).ok, true);
  assert.deepEqual(check(doc, MAX_RESULT_BYTES + 1).errors, [
    `result is ${MAX_RESULT_BYTES + 1} bytes, exceeds ${MAX_RESULT_BYTES}`,
  ]);
  assert.deepEqual(validateResult(doc, JOB, 11, 10).errors, ['result is 11 bytes, exceeds 10']);
});

test('validationDetails: עד 5 שגיאות מחוברות ב-"; "', () => {
  assert.equal(validationDetails(['a', 'b', 'c', 'd', 'e', 'f']), 'a; b; c; d; e');
  assert.equal(validationDetails(['a']), 'a');
});

// נתוני פריסה/עזר (חוזה layout v1): הוולידטור לא בודק אותם — שום בעיה בהם לא דוחה את התוצאה
// (הנרמול לכל עמוד — localResultLayout.pure.js). הפיקסצ'ר המשותף של החוזה עובר כמות שהוא.
test('הפיקסצ\'ר המשותף (layout/warnings/metadata חדשים) עובר מול עבודה שנבנתה מהמעטפה שלו', async () => {
  const { readFileSync } = await import('node:fs');
  const bytes = readFileSync(new URL('./fixtures/localResultLayout.result.json', import.meta.url));
  const envelope = JSON.parse(readFileSync(new URL('./fixtures/localResultLayout.envelope.json', import.meta.url), 'utf8'));
  const job = {
    _id: envelope.jobId,
    inputSha256: envelope.inputSha256,
    pageMap: envelope.pageMap.map((e) => ({ ...e, page: e.pageId })),
  };
  const parsed = parseResultBytes(bytes);
  assert.equal(parsed.ok, true);
  assert.deepEqual(validateResult(parsed.doc, job, bytes.length), { ok: true, errors: [] });
});

test('layout:"x", warnings:5 ו-metadata עם $key לא נדחים; metadata שאינו אובייקט — נדחה כמו תמיד', () => {
  const doc = success();
  doc.pages[0].layout = 'x';
  doc.pages[0].warnings = 5;
  doc.pages[1].layout = { layoutVersion: 99, $bad: { 'a.b': 1 } };
  doc.pages[1].warnings = [null, { code: 'BAD CODE' }];
  doc.pages[1].metadata = { $key: 1, 'x.y': [1] };
  doc.metadata = { $root: true };
  assert.deepEqual(check(doc), { ok: true, errors: [] });
  const bad = success();
  bad.pages[0].metadata = 'x';
  assert.deepEqual(check(bad), { ok: false, errors: ['pages[0].metadata is not an object'] });
});
