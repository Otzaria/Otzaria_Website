import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ADMIN_STATES,
  ADMIN_STATE_UI,
  adminPageState,
  leaseOf,
  adminCounts,
  adminMatches,
  parsePageRange,
  rangeLabel,
  releaseMessage,
  bulkReleaseMessage,
  DRAFT_WARNING,
  CLAIM_NOTE,
  cancelRecutMessage,
} from './adminGrid.js';

// רשת-העמודים בניהול: המצב בעיני המנהל, מונים, מסננים, טווח-עמודים ונוסחי
// האזהרה בשחרור (הטיוטה של המתנדב שמורה באתר ועוברת עם העמוד).

const NOW = new Date('2026-09-30T12:00:00Z');
const later = new Date(NOW.getTime() + 3600e3);
const earlier = new Date(NOW.getTime() - 3600e3);
const P = (extra = {}) => ({ status: 'open', required: 1, activeCount: 0, approvedCount: 0, leasedBy: null, leasedUntil: null, ...extra });

test('המצב בעיני המנהל: פנוי, בודק נוסף, תפוס, ממתין לאישור, אושר, זיהוי-מחדש', () => {
  assert.equal(adminPageState(P(), NOW), 'open');
  assert.equal(adminPageState(P({ leasedBy: 'u1', leasedUntil: earlier }), NOW), 'open', 'תפיסה שפגה — פנוי');
  assert.equal(adminPageState(P({ leasedBy: 'u1', leasedUntil: later }), NOW), 'taken');
  assert.equal(adminPageState(P({ required: 2, activeCount: 1 }), NOW), 'second');
  assert.equal(adminPageState(P({ required: 2, activeCount: 1, leasedBy: 'u2', leasedUntil: later }), NOW), 'taken');
  assert.equal(adminPageState(P({ status: 'done', activeCount: 1 }), NOW), 'submitted');
  assert.equal(adminPageState(P({ status: 'done', activeCount: 1, approvedCount: 1 }), NOW), 'approved');
  assert.equal(adminPageState(P({ status: 'done', required: 2, activeCount: 2, approvedCount: 1 }), NOW), 'submitted');
  // מצב-ביניים: ההגשה נכנסה ועוד לא סומן done
  assert.equal(adminPageState(P({ activeCount: 1 }), NOW), 'submitted');
  assert.equal(adminPageState(P({ status: 'recut', activeCount: 1, approvedCount: 1 }), NOW), 'recut');
  assert.equal(adminPageState(undefined, NOW), 'open');
  for (const s of ADMIN_STATES) assert.ok(ADMIN_STATE_UI[s]?.label, s);
  assert.equal(ADMIN_STATE_UI.submitted.label, 'ממתין לאישור');
});

test('מצב התפיסה: בתוקף / פגה (המחזיק עוד רשום) / אין', () => {
  assert.equal(leaseOf(P({ leasedBy: 'u1', leasedUntil: later }), NOW), 'active');
  assert.equal(leaseOf(P({ leasedBy: 'u1', leasedUntil: earlier }), NOW), 'expired');
  assert.equal(leaseOf(P({ leasedBy: 'u1', leasedUntil: null }), NOW), 'expired');
  assert.equal(leaseOf(P(), NOW), null);
  assert.equal(leaseOf(P({ leasedUntil: later }), NOW), null, 'מועד בלי מחזיק — אין תפיסה');
});

test('מונים ומסננים: לכל מצב, סגורים למתנדבים, תפוסים עכשיו ותפיסות שפגו', () => {
  const pages = [
    { state: 'open', volunteer: true, lease: null },
    { state: 'open', volunteer: false, lease: 'expired' },
    { state: 'second', volunteer: true, lease: null },
    { state: 'taken', volunteer: false, lease: 'active' },
    { state: 'submitted', volunteer: true, lease: null },
    { state: 'approved', volunteer: true, lease: null },
    { state: 'recut', volunteer: false, lease: null },
    { state: 'zzz' },
  ];
  const c = adminCounts(pages);
  assert.deepEqual(c, { total: 7, closed: 3, leased: 1, expired: 1, open: 2, second: 1, taken: 1, submitted: 1, approved: 1, recut: 1, recut_ask: 0 });
  const idx = (f) => pages.map((p, i) => (adminMatches(p, f) ? i : -1)).filter((i) => i >= 0);
  assert.deepEqual(idx('open'), [0, 1, 2], 'פנויים = פנוי + בודק נוסף');
  assert.deepEqual(idx('closed'), [1, 3, 6]);
  assert.deepEqual(idx('expired'), [1]);
  assert.deepEqual(idx('taken'), [3]);
  assert.equal(idx('all').length, 8);
  assert.equal(idx('no-such-filter').length, 8);
});

test('טווח עמודים מהטופס', () => {
  assert.deepEqual(parsePageRange('1', '20'), { from: 1, to: 20 });
  assert.deepEqual(parsePageRange(' 7 ', ''), { from: 7, to: 7 }, '"עד" ריק — עמוד אחד');
  assert.deepEqual(parsePageRange(5, 5), { from: 5, to: 5 });
  assert.deepEqual(parsePageRange('30', '10'), { error: 'עמוד ההתחלה אחרי עמוד הסוף' });
  for (const [a, b] of [['', ''], ['0', '3'], ['a', '3'], ['1.5', '3'], ['-2', '3'], ['1', 'x'], ['1234567', '']]) {
    assert.ok(parsePageRange(a, b).error, `${a}–${b}`);
  }
  assert.equal(rangeLabel({ from: 1, to: 20 }), 'עמודים 1–20');
  assert.equal(rangeLabel({ from: 4, to: 4 }), 'עמוד 4');
});

test('נוסחי השחרור: מי מחזיק, והאזהרה שהטיוטה של המתנדב נשארת רק בדפדפן שלו', () => {
  assert.match(DRAFT_WARNING, /שמורה באתר כטיוטה של העמוד ועוברת איתו/);
  const one = releaseMessage({ page: 12, holder: 'ראובן', lease: 'active' });
  assert.ok(one.startsWith('לשחרר את עמוד 12 (בידי ראובן)?'));
  assert.ok(one.includes('פנוי לכל מתנדב'));
  assert.ok(one.endsWith(DRAFT_WARNING));
  assert.ok(releaseMessage({ page: 3, holder: 'שמעון', lease: 'expired' }).startsWith('לשחרר את עמוד 3 (בידי שמעון, התפיסה כבר פגה)?'));
  assert.ok(releaseMessage({ page: 3 }).startsWith('לשחרר את עמוד 3?'));

  assert.match(bulkReleaseMessage('expired', 1), /^לנקות תפיסה אחת שפגה בספר\?/);
  assert.match(bulkReleaseMessage('expired', 4), /^לנקות 4 תפיסות שפגו בספר\?/);
  assert.match(bulkReleaseMessage('all', 1), /^לשחרר את העמוד התפוס בספר\?/);
  assert.match(bulkReleaseMessage('all', 6), /^לשחרר את כל 6 העמודים התפוסים בספר\?/);
  for (const m of [bulkReleaseMessage('expired', 2), bulkReleaseMessage('all', 2)]) assert.ok(m.endsWith(DRAFT_WARNING));
});

test('ההסבר בניהול: 48 שעות לכל עמוד לחוד, ומתחדש בכל פתיחה בעורך', () => {
  assert.match(CLAIM_NOTE, /48 שעות \(לכל עמוד לחוד; שבת וחג אינם נספרים\)/);
  assert.match(CLAIM_NOTE, /מחדשת את הזמן ל-48 שעות מלאות/);
});

test('cancelRecutMessage: מי ביקש, שהעמוד חוזר אליו ל-48 שעות; ואם תוכנת-הספר כבר משכה — מה יקרה אז', () => {
  const m = cancelRecutMessage({ page: 7, recutRequest: { by: 'ראובן', picked: false } });
  assert.match(m, /^לבטל את הבקשה לזיהוי-מחדש של עמוד 7\?/);
  assert.match(m, /יחזור אל ראובן \(שמור לו 48 שעות\) בלי זיהוי-מחדש/);
  assert.doesNotMatch(m, /משכה/);
  assert.match(cancelRecutMessage({ page: 7, recutRequest: { by: '', picked: true } }), /יחזור אל המתנדב.*\nתוכנת-הספר כבר משכה את הבקשה/s);
});
