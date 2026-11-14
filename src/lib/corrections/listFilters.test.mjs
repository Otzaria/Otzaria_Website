// תנאי הלשוניות של מסך תיקוני הטקסט: הלשונית "פנויים ובטיפולי" והדשבורד נגזרים מאותה פונקציה,
// וההבדל היחיד ביניהם הוא הענף "משויך אליי" (לדשבורד אין "אני" — הוא סופר מה שפנוי לכל מטפל).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIST_FILTERS, PUBLISHING_STATUSES, failedPublishFilter, queuedFilter } from './listFilters.js';

const NOW = new Date('2026-11-01T12:00:00Z');
const USER = { _id: 'u1' };

test('הלשונית queued = queuedFilter עם המשתמש', () => {
  assert.deepEqual(LIST_FILTERS.queued(USER, NOW), queuedFilter(NOW, USER));
});

test('בלי משתמש — אותו תנאי בדיוק, רק בלי הענף "משויך אליי"', () => {
  const tab = LIST_FILTERS.queued(USER, NOW);
  const mine = { 'manual.status': 'claimed', 'manual.assignee': USER._id };
  const withoutMine = { $and: tab.$and.map((part) => (part.$or ? { $or: part.$or.filter((b) => JSON.stringify(b) !== JSON.stringify(mine)) } : part)) };
  assert.deepEqual(queuedFilter(NOW), withoutMine);
  assert.equal(queuedFilter(NOW).$and[1].$or.length, 2);
});

test('פרסומים שנכשלו — לא בלשונית queued, וכן בלשונית "אושרו / בפרסום"', () => {
  const queuedExcluded = queuedFilter(NOW).$and[2]['publish.status'].$nin;
  assert.ok(queuedExcluded.includes('failed'));
  const publishing = LIST_FILTERS.publishing();
  assert.equal(publishing.state, failedPublishFilter().state);
  assert.ok(publishing['publish.status'].$in.includes(failedPublishFilter()['publish.status']));
  assert.ok(!PUBLISHING_STATUSES.includes('failed'));
});
