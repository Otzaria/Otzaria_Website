import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  pageHasText,
  buildPageUpdate,
  ocrTextSha256,
  pageEditedByHuman,
  pageSkippedInMode,
  selectionView,
  countOcrPages,
  jobPageRange,
  selectServerJobPages,
  LEGACY_OCR_WRITE_SLACK_MS,
} from './runOcrJob.pure.js';

// ==================== pageHasText ====================

test('pageHasText: true כשיש content', () => {
  assert.equal(pageHasText({ content: 'שלום' }), true);
});

test('pageHasText: true כשיש rightColumn בלבד', () => {
  assert.equal(pageHasText({ rightColumn: 'טקסט' }), true);
});

test('pageHasText: true כשיש leftColumn בלבד', () => {
  assert.equal(pageHasText({ leftColumn: 'טקסט' }), true);
});

test('pageHasText: false כשהכל ריק/רווחים בלבד', () => {
  assert.equal(pageHasText({ content: '   ', rightColumn: '', leftColumn: '\n' }), false);
});

test('pageHasText: false כשאין שדות טקסט כלל', () => {
  assert.equal(pageHasText({}), false);
});

test('pageHasText: false כששדות הם undefined/null', () => {
  assert.equal(pageHasText({ content: undefined, rightColumn: null }), false);
});

// ==================== buildPageUpdate ====================

test('buildPageUpdate: מחזיר content ומאפס טורים ל-two-columns', () => {
  assert.deepEqual(buildPageUpdate('טקסט מזוהה'), {
    content: 'טקסט מזוהה',
    rightColumn: '',
    leftColumn: '',
    isTwoColumns: false,
    lastOcrTextSha256: ocrTextSha256('טקסט מזוהה'),
  });
});

test('buildPageUpdate: מחרוזת ריקה נשמרת כ-content ריק', () => {
  assert.deepEqual(buildPageUpdate(''), {
    content: '',
    rightColumn: '',
    leftColumn: '',
    isTwoColumns: false,
    lastOcrTextSha256: ocrTextSha256(''),
  });
});

// ==================== pageEditedByHuman / skip_edited ====================

const OCR = 'פלט זיהוי';
const T0 = new Date('2026-11-01T10:00:00Z');
const at = (ms) => new Date(T0.getTime() + ms);
// עמוד שה-OCR כתב ואיש לא נגע בו (עם טביעה)
const fresh = { status: 'available', content: OCR, lastOcrTextSha256: ocrTextSha256(OCR) };

test('ocrTextSha256: sha256 hex יציב, רגיש לתוכן', () => {
  assert.match(ocrTextSha256('א'), /^[0-9a-f]{64}$/);
  assert.equal(ocrTextSha256('א'), ocrTextSha256('א'));
  assert.notEqual(ocrTextSha256('א'), ocrTextSha256('א '));
  assert.equal(ocrTextSha256(undefined), ocrTextSha256(''));
});

test('pageEditedByHuman: פלט OCR שלא נגעו בו — לא ערוך; עמוד ריק — לא ערוך', () => {
  assert.equal(pageEditedByHuman(fresh), false);
  assert.equal(pageEditedByHuman({ status: 'available', content: '  ' }), false);
  assert.equal(pageEditedByHuman({}), false);
});

test('pageEditedByHuman: תפוס/הושלם — ערוך גם כשהטקסט זהה לפלט, וגם כשהעמוד ריק', () => {
  assert.equal(pageEditedByHuman({ ...fresh, status: 'in-progress' }), true);
  assert.equal(pageEditedByHuman({ ...fresh, status: 'completed' }), true);
  assert.equal(pageEditedByHuman({ status: 'in-progress', content: '' }), true);
});

test('pageEditedByHuman: טקסט שונה מהטביעה / טורים — ערוך', () => {
  assert.equal(pageEditedByHuman({ ...fresh, content: OCR + ' תיקון' }), true);
  assert.equal(pageEditedByHuman({ ...fresh, rightColumn: 'ימין' }), true);
  assert.equal(pageEditedByHuman({ status: 'available', content: '', leftColumn: 'שמאל' }), true);
});

test('skip_edited: מחיקה אנושית מלאה נשמרת, גם בלי revision של לקוח חדש', () => {
  for (const content of ['', '   ']) {
    const deleted = { ...fresh, content };
    assert.equal(pageEditedByHuman(deleted), true);
    assert.equal(pageSkippedInMode(selectionView(deleted), 'skip_edited'), true);
    assert.equal(pageSkippedInMode(selectionView(deleted), 'skip'), false);
  }
  assert.equal(pageEditedByHuman({ ...fresh, content: '', lastOcrTextSha256: ocrTextSha256('') }), false);
});

test('skip_edited: שמירת עורך מפורשת מגינה על legacy גם בתוך חלון כתיבת OCR', () => {
  for (const content of ['תיקון אנושי', '']) {
    const edited = { status: 'available', content, contentSaveRevision: 1, lastOcrAt: T0, updatedAt: at(10000) };
    assert.equal(pageEditedByHuman(edited), true);
    assert.equal(pageSkippedInMode(selectionView(edited), 'skip_edited'), true);
  }
  // דריסה מפורשת ב-OCR חדש משאירה את revision לסדר שמירות העורך;
  // הטביעה החדשה מוכיחה שהתוכן הנוכחי שוב פלט OCR שלא השתנה.
  assert.equal(pageEditedByHuman({ ...fresh, contentSaveRevision: 1 }), false);
});

test('pageEditedByHuman: עמוד ישן בלי טביעה — לפי פער updatedAt מ-lastOcrAt (OCR מקומי)', () => {
  const legacy = { status: 'available', content: OCR, lastOcrAt: T0 };
  assert.equal(pageEditedByHuman({ ...legacy, updatedAt: at(1265) }), false);
  assert.equal(pageEditedByHuman({ ...legacy, updatedAt: at(LEGACY_OCR_WRITE_SLACK_MS) }), false);
  assert.equal(pageEditedByHuman({ ...legacy, updatedAt: at(LEGACY_OCR_WRITE_SLACK_MS + 1) }), true);
  assert.equal(pageEditedByHuman({ ...legacy, updatedAt: at(-1) }), true);
  // טקסט בלי שום סימון OCR (הוקלד ידנית / OCRWin ישן) — שמרני: ערוך
  assert.equal(pageEditedByHuman({ status: 'available', content: OCR, updatedAt: T0 }), true);
});

test('pageSkippedInMode: overwrite / skip / skip_edited; מצב לא מוכר — כמו skip', () => {
  const edited = { ...fresh, content: 'נערך' };
  const empty = { status: 'available', content: '' };
  assert.deepEqual([fresh, edited, empty].map((p) => pageSkippedInMode(p, 'overwrite')), [false, false, false]);
  assert.deepEqual([fresh, edited, empty].map((p) => pageSkippedInMode(p, 'skip')), [true, true, false]);
  assert.deepEqual([fresh, edited, empty].map((p) => pageSkippedInMode(p, 'skip_edited')), [false, true, false]);
  assert.deepEqual([fresh, edited, empty].map((p) => pageSkippedInMode(p, undefined)), [true, true, false]);
});

test('selectionView: בלי הטקסט עצמו, ואותן תשובות כמו העמוד המלא בכל המצבים', () => {
  const big = 'ט'.repeat(10000);
  const cases = [
    fresh,
    { ...fresh, status: 'completed' },
    { ...fresh, content: 'נערך' },
    { ...fresh, content: '' },
    { status: 'available', content: '', contentSaveRevision: 1 },
    { status: 'available', content: OCR, contentSaveRevision: 1, lastOcrAt: T0, updatedAt: at(500) },
    { status: 'available', content: '' },
    { status: 'in-progress', content: '' },
    { status: 'available', content: big, lastOcrTextSha256: ocrTextSha256(big) },
    { status: 'available', content: '', rightColumn: 'ימין' },
    { status: 'available', content: OCR, lastOcrAt: T0, updatedAt: at(500) },
    { status: 'available', content: OCR, lastOcrAt: T0, updatedAt: at(600000) },
    { content: OCR },
  ];
  for (const p of cases) {
    const v = { ...selectionView(p), updatedAt: p.updatedAt };
    assert.ok(!v.content || v.content.length <= 1);
    assert.equal(pageHasText(v), pageHasText(p));
    assert.equal(pageEditedByHuman(v), pageEditedByHuman(p), JSON.stringify(p).slice(0, 80));
    for (const m of ['overwrite', 'skip', 'skip_edited']) assert.equal(pageSkippedInMode(v, m), pageSkippedInMode(p, m));
  }
});

test('countOcrPages: ספירות לכל מצב, רק עמודים עם תמונה מעובדים', () => {
  const img = '/uploads/books/b/p.jpg';
  const counts = countOcrPages([
    { ...fresh, imagePath: img },
    { ...fresh, imagePath: img, status: 'completed' },
    { ...fresh, imagePath: img, content: 'נערך' },
    { status: 'available', content: '', imagePath: img },
    { status: 'available', content: 'נערך', imagePath: '' },
  ]);
  assert.deepEqual(counts, {
    pagesWithImage: 4,
    editedPagesCount: 4,
    humanEditedPagesCount: 3,
    toProcess: { overwrite: 4, skip: 1, skip_edited: 2 },
  });
  assert.deepEqual(countOcrPages(null).toProcess, { overwrite: 0, skip: 0, skip_edited: 0 });
});

test('countOcrPages: range — toProcess רק בטווח, שאר הספירות לכל הספר', () => {
  const img = '/uploads/books/b/p.jpg';
  const pages = [
    { ...fresh, pageNumber: 1, imagePath: img },
    { ...fresh, pageNumber: 2, imagePath: img, content: 'נערך' },
    { status: 'available', content: '', pageNumber: 3, imagePath: img },
    { status: 'available', content: '', pageNumber: 4, imagePath: '' },
    { status: 'available', content: '', pageNumber: 5, imagePath: img },
  ];
  const all = countOcrPages(pages);
  const ranged = countOcrPages(pages, { range: { from: 2, to: 4 } });
  assert.deepEqual(ranged.toProcess, { overwrite: 2, skip: 1, skip_edited: 1 });
  assert.equal(ranged.pagesWithImage, all.pagesWithImage);
  assert.equal(ranged.editedPagesCount, all.editedPagesCount);
  assert.equal(Object.hasOwn(ranged, 'toProcessRuns'), false);
});

test('countOcrPages: withRuns — רצפי העמודים שיעובדו בכל מצב ו-maxPageNumber', () => {
  const img = '/uploads/books/b/p.jpg';
  const pages = [
    { status: 'available', content: '', pageNumber: 1, imagePath: img },
    { ...fresh, pageNumber: 2, imagePath: img },
    { status: 'available', content: 'נערך', contentSaveRevision: 1, pageNumber: 3, imagePath: img },
    { status: 'available', content: '', pageNumber: 4, imagePath: img },
    { status: 'available', content: '', pageNumber: 9, imagePath: '' },
  ];
  const counts = countOcrPages(pages, { withRuns: true });
  assert.deepEqual(counts.toProcessRuns, {
    overwrite: [[1, 4]],
    skip: [[1, 1], [4, 4]],
    skip_edited: [[1, 2], [4, 4]],
  });
  assert.equal(counts.maxPageNumber, 9);
  assert.deepEqual(counts.toProcess, { overwrite: 4, skip: 2, skip_edited: 3 });
});

test('jobPageRange: טווח שמור תקין → {from,to}; חסר/פגום → null', () => {
  assert.deepEqual(jobPageRange({ pageRange: { from: 3, to: 9 } }), { from: 3, to: 9 });
  // תת-מסמך של mongoose — רק from/to נלקחים
  assert.deepEqual(jobPageRange({ pageRange: { from: 3, to: 9, $__: {}, extra: 1 } }), { from: 3, to: 9 });
  assert.equal(jobPageRange({}), null);
  assert.equal(jobPageRange(null), null);
  assert.equal(jobPageRange({ pageRange: null }), null);
  assert.equal(jobPageRange({ pageRange: { from: 9, to: 3 } }), null);
});

test('selectServerJobPages: תמונה + מצב + טווח, שומר על הסדר', () => {
  const pages = [
    { pageNumber: 1, imagePath: '/a', content: '' },
    { pageNumber: 2, imagePath: '/a', content: 'יש' },
    { pageNumber: 3, imagePath: '', content: '' },
    { pageNumber: 4, imagePath: '/a', content: '' },
    { pageNumber: 5, imagePath: '/a', content: '' },
  ];
  assert.deepEqual(selectServerJobPages(pages, 'overwrite').map((p) => p.pageNumber), [1, 2, 4, 5]);
  assert.deepEqual(selectServerJobPages(pages, 'skip').map((p) => p.pageNumber), [1, 4, 5]);
  assert.deepEqual(selectServerJobPages(pages, 'overwrite', { from: 2, to: 4 }).map((p) => p.pageNumber), [2, 4]);
  assert.deepEqual(selectServerJobPages(pages, 'skip', { from: 2, to: 3 }), []);
  assert.deepEqual(selectServerJobPages(null, 'skip'), []);
});
