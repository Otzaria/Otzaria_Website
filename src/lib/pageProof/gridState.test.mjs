import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STATES,
  STATE_UI,
  CLAIMABLE,
  canClaim,
  isMyState,
  pageStateFor,
  bookCounts,
  barSegments,
  GROUPS,
  FILTERS,
  matchesFilter,
  bookMatches,
  groupBySequence,
  seqClaimLabel,
  claimRefusal,
  scriptLabel,
  failMessage,
  canProof,
  decodeParam,
  editorHref,
  bookHref,
  thumbUrl,
  imageUrl,
  isOpenToVolunteers,
  volunteerOpenFilter,
  CLAIM_HOURS,
  CLAIM_RULE,
  CLAIM_SHORT,
} from './gridState.js';

const NOW = new Date('2026-09-29T12:00:00Z');
const HOUR = 3600 * 1000;
const ME = '64b7f0c2a1b2c3d4e5f60001';
const OTHER = '64b7f0c2a1b2c3d4e5f60002';
const later = new Date(NOW.getTime() + 5 * HOUR);
const earlier = new Date(NOW.getTime() - HOUR);

const page = (extra = {}) => ({
  status: 'open',
  required: 1,
  activeCount: 0,
  approvedCount: 0,
  submitters: [],
  leasedBy: null,
  leasedUntil: null,
  mySubmissionStatus: null,
  ...extra,
});
const stateOf = (extra, viewer = ME) => pageStateFor(page(extra), viewer, NOW);

test('פנוי: פתוח, בלי החכרה ובלי הגשות', () => {
  assert.equal(stateOf({}), 'open');
  assert.equal(pageStateFor(undefined, ME, NOW), 'open');
});

test('החכרה שפגה אינה תופסת — העמוד פנוי', () => {
  assert.equal(stateOf({ leasedBy: OTHER, leasedUntil: earlier }), 'open');
  assert.equal(stateOf({ leasedBy: ME, leasedUntil: earlier }), 'open');
});

test('בטיפולך מול תפוס — לפי מי שמחזיק בהחכרה שבתוקף', () => {
  assert.equal(stateOf({ leasedBy: ME, leasedUntil: later }), 'mine');
  assert.equal(stateOf({ leasedBy: OTHER, leasedUntil: later }), 'taken');
  // מזהים כאובייקט (ObjectId) או מחרוזת — אותו דבר
  assert.equal(stateOf({ leasedBy: { toString: () => ME }, leasedUntil: later.toISOString() }), 'mine');
  // צופה לא מזוהה — כל החכרה היא "תפוס"
  assert.equal(stateOf({ leasedBy: ME, leasedUntil: later }, null), 'taken');
});

test('הגשה של הצופה קודמת לכל השאר', () => {
  assert.equal(stateOf({ mySubmissionStatus: 'submitted', submitters: [ME], activeCount: 1 }), 'submitted');
  assert.equal(stateOf({ mySubmissionStatus: 'approved', status: 'done', submitters: [ME], activeCount: 1 }), 'approved');
  // הגשה מאושרת ששינתה חיתוך — העמוד ממתין לזיהוי-מחדש, אבל למגיש: "אושר"
  assert.equal(stateOf({ mySubmissionStatus: 'approved', status: 'recut', submitters: [ME] }), 'approved');
  // מגיש בלי פירוט הסטטוס — "הוגש"
  assert.equal(stateOf({ submitters: [ME], activeCount: 1, required: 2 }), 'submitted');
  // הגשה שנדחתה (המגיש כבר הוצא מ-submitters) — כאילו אין
  assert.equal(stateOf({ mySubmissionStatus: 'rejected' }), 'open');
});

test('דרוש בודק נוסף: עמוד כפול שהוגש פעם אחת בידי אחר', () => {
  assert.equal(stateOf({ required: 2, activeCount: 1, submitters: [OTHER] }), 'second');
  // מישהו כבר תפס אותו כבודק שני
  assert.equal(stateOf({ required: 2, activeCount: 1, submitters: [OTHER], leasedBy: OTHER, leasedUntil: later }), 'taken');
  assert.equal(stateOf({ required: 2, activeCount: 1, submitters: [OTHER], leasedBy: ME, leasedUntil: later }), 'mine');
  // הגשה שנייה כבר נכנסה (עוד לפני שסומן done)
  assert.equal(stateOf({ required: 2, activeCount: 2, submitters: [OTHER, 'x'] }), 'done');
});

test('ממתין לזיהוי-מחדש והושלם — כשהצופה לא מעורב', () => {
  assert.equal(stateOf({ status: 'recut', activeCount: 1, approvedCount: 1, submitters: [OTHER] }), 'recut');
  assert.equal(stateOf({ status: 'done', activeCount: 1, submitters: [OTHER] }), 'done');
  // החכרה ישנה לא משנה עמוד שכבר הושלם
  assert.equal(stateOf({ status: 'done', activeCount: 1, leasedBy: OTHER, leasedUntil: later }), 'done');
});

test('כל מצב מוחזר שייך לרשימת המצבים ויש לו תווית וצבעים', () => {
  for (const s of STATES) {
    const ui = STATE_UI[s];
    assert.ok(ui, s);
    assert.ok(ui.label && ui.short && ui.icon && ui.color && ui.bgColor && ui.borderColor && ui.bar, s);
    assert.ok(ui.short.length <= 10, `${s}: תווית קצרה לתצוגה הצפופה`);
    assert.match(ui.bar, /^bg-/);
  }
  assert.deepEqual(Object.keys(STATE_UI).sort(), [...STATES].sort());
  // כל מצב בקבוצה אחת בדיוק — כך הכרטיסים והפס מסתכמים ל"סה"כ"
  assert.deepEqual(GROUPS.flatMap((g) => g.states).sort(), [...STATES].sort());
  for (const g of GROUPS) assert.ok(g.label && g.bar.startsWith('bg-') && g.color, g.key);
  for (const g of GROUPS) assert.ok(FILTERS[g.key], `מסנן לכרטיס ${g.key}`);
});

test('אפשר לתפוס רק פנוי ודרוש-בודק-נוסף; העמודים שלי = בטיפולך/הוגש/אושר', () => {
  assert.deepEqual([...CLAIMABLE], ['open', 'second']);
  assert.deepEqual(STATES.filter(canClaim), ['open', 'second']);
  assert.deepEqual(STATES.filter(isMyState), ['mine', 'submitted', 'approved']);
});

test('מונים לפי מצב, כולל משקלים ופנויים/שלי', () => {
  const c = bookCounts(['open', 'open', 'mine', { state: 'taken' }, { state: 'done', n: 10 }, 'second', 'approved', 'zzz', null]);
  assert.equal(c.total, 16);
  assert.equal(c.open, 2);
  assert.equal(c.done, 10);
  assert.equal(c.taken, 1);
  assert.equal(c.available, 3);
  assert.equal(c.my, 2);
  assert.equal(c.recut, 0);
  assert.deepEqual(bookCounts(undefined), { ...Object.fromEntries(STATES.map((s) => [s, 0])), total: 0, available: 0, my: 0 });
});

test('פס ההתקדמות: רק קבוצות עם עמודים, בסדר הקבוע, אחוזים שמסתכמים ל-100', () => {
  const c = bookCounts([{ state: 'open', n: 4 }, { state: 'second', n: 1 }, { state: 'done', n: 2 }, { state: 'approved', n: 1 }, { state: 'mine', n: 2 }]);
  const seg = barSegments(c);
  assert.deepEqual(seg.map((s) => s.key), ['done', 'mine', 'available']);
  assert.deepEqual(seg.map((s) => s.n), [3, 2, 5]);
  assert.deepEqual(seg.map((s) => s.pct), [30, 20, 50]);
  assert.deepEqual(barSegments(bookCounts([])), []);
  assert.deepEqual(barSegments(null), []);
});

test('סינון לפי כרטיס ולפי "העמודים שלי"', () => {
  assert.equal(matchesFilter('second', 'available'), true);
  assert.equal(matchesFilter('taken', 'available'), false);
  assert.equal(matchesFilter('taken', 'all'), true);
  assert.equal(matchesFilter('taken', 'all', 'mine'), false);
  assert.equal(matchesFilter('approved', 'all', 'mine'), true);
  assert.equal(matchesFilter('approved', 'submitted', 'mine'), false);
  assert.equal(matchesFilter('recut', 'recut'), true);
  assert.equal(matchesFilter('open', 'no-such-filter'), true);
});

test('קיבוץ לרצפים לפי seq שבמסד, ממוין לפי העמוד הראשון', () => {
  const pages = [
    { id: 'c', page: 7, seq: 1 },
    { id: 'a', page: 1, seq: 0 },
    { id: 'b', page: 2, seq: 0 },
    { id: 'd', page: 6, seq: 1 },
    // רצף שמספרו גבוה (חלוקה-מחדש אחרי התנגשות) אבל עמודיו מוקדמים יותר
    { id: 'e', page: 4, seq: 9 },
  ];
  const groups = groupBySequence(pages);
  assert.deepEqual(groups.map((g) => [g.seq, g.first, g.last, g.pages.map((p) => p.id).join('')]), [
    [0, 1, 2, 'ab'],
    [9, 4, 4, 'e'],
    [1, 6, 7, 'dc'],
  ]);
  assert.deepEqual(pages.map((p) => p.id), ['c', 'a', 'b', 'd', 'e'], 'הקלט לא ממוין במקום');
});

test('קיבוץ: עמודים בלי seq — לפי מקומם בספר, size בכל קבוצה, בלי מספר-רצף', () => {
  const pages = [1, 2, 3, 4, 5, 6, 7].map((n) => ({ id: `p${n}`, page: n }));
  const groups = groupBySequence(pages, 3);
  assert.deepEqual(groups.map((g) => [g.seq, g.first, g.last]), [
    [null, 1, 3],
    [null, 4, 6],
    [null, 7, 7],
  ]);
  assert.equal(groupBySequence(pages).length, 2);
  assert.deepEqual(groupBySequence(null), []);
  assert.deepEqual(groupBySequence([{ page: 'x' }, null]), []);
});

test('רשימת הספרים: לשוניות וחיפוש לפי שם', () => {
  const free = { title: 'שולחן ערוך', counts: bookCounts([{ state: 'open', n: 4 }, 'done']) };
  const mineOnly = { title: 'Mishna Berura', counts: bookCounts(['mine', { state: 'done', n: 3 }]) };
  const finished = { title: 'ספר גמור', counts: bookCounts([{ state: 'done', n: 9 }, 'submitted', 'recut']) };
  const empty = { title: 'ריק', counts: bookCounts([]) };
  const all = [free, mineOnly, finished, empty];
  const pick = (opts) => all.filter((b) => bookMatches(b, opts)).map((b) => b.title);
  assert.deepEqual(pick({ filter: 'available' }), ['שולחן ערוך']);
  // "העמודים שלי" כולל גם מה שהגשתי (בספר הגמור יש עמוד שהגשתי)
  assert.deepEqual(pick({ filter: 'mine' }), ['Mishna Berura', 'ספר גמור']);
  assert.deepEqual(pick({ filter: 'completed' }), ['ספר גמור']);
  assert.equal(pick({ filter: 'all' }).length, 4);
  assert.deepEqual(pick({ search: ' ערוך ' }), ['שולחן ערוך']);
  assert.deepEqual(pick({ search: 'mishna' }), ['Mishna Berura'], 'בלי תלות ברישיות');
  assert.deepEqual(pick({ filter: 'available', search: 'גמור' }), []);
  assert.equal(bookMatches({ title: 'x' }, { filter: 'available' }), false, 'ספר בלי מונים');
});

test('כפתור הרצף: כמה עמודים ייתפסו', () => {
  assert.equal(seqClaimLabel(5, 5), 'תפוס את 5 העמודים');
  assert.equal(seqClaimLabel(3, 5), 'תפוס את 3 העמודים הפנויים');
  assert.equal(seqClaimLabel(1, 5), 'תפוס את העמוד הפנוי');
  assert.equal(seqClaimLabel(2, 2), 'תפוס את 2 העמודים');
});

test('הודעת סירוב לפי המצב העדכני', () => {
  assert.equal(claimRefusal('taken'), 'העמוד נתפס בינתיים בידי מתנדב אחר');
  assert.equal(claimRefusal('submitted'), 'כבר הגשתם את העמוד הזה');
  assert.equal(claimRefusal('recut'), 'העמוד ממתין לחיתוך ולזיהוי-מחדש ואינו פתוח כרגע');
  assert.equal(claimRefusal('open'), 'אי אפשר לתפוס את העמוד כרגע');
});

test('תווית הכתב והודעות שגיאה בעברית', () => {
  assert.equal(scriptLabel('rashi'), 'כתב רש"י');
  assert.equal(scriptLabel('square'), 'כתב מרובע');
  assert.equal(scriptLabel(null), '');
  const fallback = 'נסו שוב';
  assert.equal(failMessage(new TypeError('Failed to fetch'), fallback), fallback);
  assert.equal(failMessage(new SyntaxError('Unexpected token <'), fallback), fallback);
  assert.equal(failMessage(new Error('API Error: 502'), fallback), fallback);
  assert.equal(failMessage(new Error(''), fallback), fallback);
  assert.equal(failMessage(null, fallback), fallback);
  assert.equal(failMessage(new Error('העמוד כבר הושלם'), fallback), 'העמוד כבר הושלם');
});

test('מי רשאי להגיה: מאומת, מנהל ספרייה או מנהל OCR', () => {
  assert.equal(canProof(null), false);
  assert.equal(canProof({ role: 'user' }), false);
  assert.equal(canProof({ role: 'user', isVerified: true }), true);
  assert.equal(canProof({ role: 'admin_books_only' }), true);
  assert.equal(canProof({ role: 'admin_ocr' }), true);
  assert.equal(canProof({ role: 'admin_plugins' }), false);
});

test('פרמטר מהכתובת: פענוח רק כשצריך, בלי לזרוק', () => {
  assert.equal(decodeParam('abc123'), 'abc123');
  assert.equal(decodeParam('a%20b'), 'a b');
  assert.equal(decodeParam('%D7%A1'), 'ס');
  assert.equal(decodeParam('100%'), '100%');
  assert.equal(decodeParam('%E0%A4%A'), '%E0%A4%A', 'רצף שבור — כמו שהוא');
  assert.equal(decodeParam(['a', 'b']), 'a/b');
  assert.equal(decodeParam(undefined), '');
});

test('כתובות: עורך, ספר ותמונות עם גרסת-העמוד', () => {
  assert.equal(editorHref('abc'), '/library/page-proof?page=abc');
  assert.equal(bookHref('a b/c'), '/library/page-proof/books/a%20b%2Fc');
  assert.equal(thumbUrl({ id: 'p1', revision: 2 }), '/api/page-proof/pages/p1/thumb?v=2');
  assert.equal(thumbUrl({ id: 'p1' }), '/api/page-proof/pages/p1/thumb?v=1');
  assert.equal(imageUrl({ id: 'p1', revision: 3 }), '/api/page-proof/pages/p1/image?v=3');
});

test('עמוד שהמנהל סגר (volunteer:false): "closed" — אלא אם הוא של הצופה', () => {
  const closed = { volunteer: false };
  assert.equal(stateOf(closed), 'closed');
  assert.equal(stateOf({ ...closed, required: 2, activeCount: 1, submitters: [OTHER] }), 'closed', 'גם בודק שני — לא מוצע');
  assert.equal(stateOf({ ...closed, leasedBy: OTHER, leasedUntil: later }), 'closed', 'של אחר — לא מוצג לי');
  assert.equal(stateOf({ ...closed, status: 'done', activeCount: 1, submitters: [OTHER] }), 'closed');
  // מי שכבר מחזיק בו ממשיך; מה שהגשתי — נשאר שלי
  assert.equal(stateOf({ ...closed, leasedBy: ME, leasedUntil: later }), 'mine');
  assert.equal(stateOf({ ...closed, leasedBy: ME, leasedUntil: earlier }), 'closed', 'התפיסה שלי פגה — כבר לא שלי');
  assert.equal(stateOf({ ...closed, submitters: [ME], activeCount: 1 }), 'submitted');
  assert.equal(stateOf({ ...closed, mySubmissionStatus: 'approved', status: 'done' }), 'approved');
  // בלי השדה (עמוד מלפני שנוסף) / true — פתוח כרגיל
  assert.equal(stateOf({ volunteer: undefined }), 'open');
  assert.equal(stateOf({ volunteer: true }), 'open');
  // 'closed' אינו מצב שנספר או מוצג למתנדב
  assert.equal(STATES.includes('closed'), false);
  assert.equal(bookCounts(['closed', 'open']).total, 1);
  assert.equal(claimRefusal('closed'), 'העמוד אינו פתוח להגהה כרגע');
});

test('פתוח למתנדבים: עמוד בלי השדה פתוח; המסנן למסד — עותק חדש בכל קריאה', () => {
  assert.equal(isOpenToVolunteers({}), true);
  assert.equal(isOpenToVolunteers({ volunteer: true }), true);
  assert.equal(isOpenToVolunteers({ volunteer: false }), false);
  assert.equal(isOpenToVolunteers(null), true);
  const a = volunteerOpenFilter();
  assert.deepEqual(a, { volunteer: { $ne: false } });
  assert.notEqual(a.volunteer, volunteerOpenFilter().volunteer);
});

test('כלל ה-48 שעות כפי שהמתנדב קורא אותו: לכל עמוד לחוד, בלי שבת וחג, ומתחדש בכל פתיחה בעורך', () => {
  assert.equal(CLAIM_HOURS, 48);
  assert.ok(CLAIM_RULE.includes('48 שעות (לכל עמוד לחוד; שבת וחג אינם נספרים)'));
  assert.match(CLAIM_RULE, /כל פתיחה שלו בעורך מחדשת את הזמן ל-48 שעות מלאות/);
  assert.match(CLAIM_RULE, /חוזר למאגר/);
  assert.match(CLAIM_RULE, /טיוטה שלא הגשתם נשארת בדפדפן/);
  assert.equal(CLAIM_SHORT, 'כל עמוד שתפסתם שמור לכם 48 שעות (שבת וחג אינם נספרים), וכל פתיחה שלו בעורך מחדשת את הזמן.');
});
