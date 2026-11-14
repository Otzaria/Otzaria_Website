import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_ACTIVE_PAGE_CLAIMS,
  PAGE_RELEASE_AFTER_DAYS,
  PAGE_REMIND_AFTER_DAYS,
  DAY_MS,
  isPersonalBook,
  pageReleaseCutoff,
  pageRemindCutoff,
  autoReleaseAt,
  isClaimExpired,
  canClaimAnotherPage,
  hebrewDays,
  claimLimitMessage,
  claimRulesText,
} from './pageClaimPolicy.js';

const NOW = new Date('2026-11-09T12:00:00Z');
const daysAgo = (d) => new Date(NOW.getTime() - d * DAY_MS);

test('הערכים שנקבעו: 5 עמודים, שחרור אחרי 5 ימים, תזכורת לפני השחרור', () => {
  assert.equal(MAX_ACTIVE_PAGE_CLAIMS, 5);
  assert.equal(PAGE_RELEASE_AFTER_DAYS, 5);
  assert.ok(PAGE_REMIND_AFTER_DAYS > 0 && PAGE_REMIND_AFTER_DAYS < PAGE_RELEASE_AFTER_DAYS);
});

test('isPersonalBook — פרטי או בבעלות משתמש', () => {
  assert.equal(isPersonalBook({ isPrivate: true }), true);
  assert.equal(isPersonalBook({ ownerId: 'u1' }), true);
  assert.equal(isPersonalBook({ isPrivate: false, ownerId: null }), false);
  assert.equal(isPersonalBook(null), false);
});

test('גבולות זמן: שחרור ותזכורת', () => {
  assert.equal(pageReleaseCutoff(NOW).getTime(), daysAgo(5).getTime());
  assert.equal(pageRemindCutoff(NOW).getTime(), daysAgo(3).getTime());
  assert.equal(autoReleaseAt(daysAgo(1)).getTime(), NOW.getTime() + 4 * DAY_MS);
  assert.equal(autoReleaseAt(null), null);
  assert.equal(autoReleaseAt('not a date'), null);
  assert.equal(autoReleaseAt(daysAgo(1).toISOString()).getTime(), NOW.getTime() + 4 * DAY_MS);
});

test('isClaimExpired — בדיוק 5 ימים פג; פחות לא; תאריך חסר לא פג', () => {
  assert.equal(isClaimExpired(daysAgo(5), NOW), true);
  assert.equal(isClaimExpired(daysAgo(7), NOW), true);
  assert.equal(isClaimExpired(new Date(daysAgo(5).getTime() + 1000), NOW), false);
  assert.equal(isClaimExpired(daysAgo(0), NOW), false);
  assert.equal(isClaimExpired(undefined, NOW), false);
});

test('canClaimAnotherPage — עד 4 מותר, מ-5 חסום', () => {
  assert.equal(canClaimAnotherPage(0), true);
  assert.equal(canClaimAnotherPage(4), true);
  assert.equal(canClaimAnotherPage(5), false);
  assert.equal(canClaimAnotherPage(9), false);
  // ספירה לא ידועה — לא חוסמים בצד הלקוח (השרת הוא הסמכות)
  assert.equal(canClaimAnotherPage(undefined), true);
});

test('hebrewDays', () => {
  assert.equal(hebrewDays(1), 'יום אחד');
  assert.equal(hebrewDays(2), 'יומיים');
  assert.equal(hebrewDays(5), '5 ימים');
  assert.equal(hebrewDays(-3), '0 ימים');
});

test('טקסטים למשתמש בעברית ומזכירים את המספרים', () => {
  assert.match(claimLimitMessage(), /עד 5 עמודים/);
  assert.match(claimRulesText(), /עד 5 עמודים/);
  assert.match(claimRulesText(), /5 ימים/);
});
