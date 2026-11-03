import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canViewPageContent, canWritePageLayout, PAGE_COMPLETED_FORBIDDEN, PAGE_IN_PROGRESS_FORBIDDEN, PAGE_NOT_CLAIMED_FORBIDDEN } from './pageEditAccess.js';

const U = { id: 'u1', role: 'user' };
const OTHER = 'u2';

test('available — כל מחובר', () => {
  assert.deepEqual(canViewPageContent({ status: 'available' }, U), { ok: true });
  assert.deepEqual(canViewPageContent({ status: 'available', claimedBy: OTHER }, U), { ok: true });
});

test('in-progress / completed — רק מי שתפס או hasBooksAccess (לא admin_books_only)', () => {
  assert.deepEqual(canViewPageContent({ status: 'in-progress', claimedBy: OTHER }, U), { ok: false, error: PAGE_IN_PROGRESS_FORBIDDEN });
  assert.deepEqual(canViewPageContent({ status: 'completed', claimedBy: OTHER }, U), { ok: false, error: PAGE_COMPLETED_FORBIDDEN });
  assert.deepEqual(canViewPageContent({ status: 'in-progress', claimedBy: 'u1' }, U), { ok: true });
  assert.deepEqual(canViewPageContent({ status: 'completed', claimedBy: { toString: () => 'u1' } }, { _id: 'u1', role: 'user' }), { ok: true });
  assert.deepEqual(canViewPageContent({ status: 'in-progress', claimedBy: OTHER }, { id: 'x', role: 'admin' }), { ok: true });
  assert.deepEqual(canViewPageContent({ status: 'in-progress', claimedBy: OTHER }, { id: 'x', role: 'admin_books' }), { ok: true });
  assert.equal(canViewPageContent({ status: 'in-progress', claimedBy: OTHER }, { id: 'x', role: 'admin_books_only' }).ok, false);
  assert.equal(canViewPageContent({ status: 'in-progress' }, { role: 'user' }).ok, false); // בלי claimedBy ובלי מזהה
});

test('canWritePageLayout — רק מי שתפס או מנהל ספרים; עמוד פנוי לא פתוח לכתיבה', () => {
  assert.deepEqual(canWritePageLayout({ status: 'available' }, U), { ok: false, error: PAGE_NOT_CLAIMED_FORBIDDEN });
  assert.deepEqual(canWritePageLayout({ status: 'in-progress', claimedBy: 'u1' }, U), { ok: true });
  assert.deepEqual(canWritePageLayout({ status: 'in-progress', claimedBy: OTHER }, U), { ok: false, error: PAGE_IN_PROGRESS_FORBIDDEN });
  assert.deepEqual(canWritePageLayout({ status: 'completed', claimedBy: OTHER }, U), { ok: false, error: PAGE_COMPLETED_FORBIDDEN });
  assert.deepEqual(canWritePageLayout({ status: 'available' }, { id: 'x', role: 'admin_books' }), { ok: true });
  assert.equal(canWritePageLayout({ status: 'available' }, { id: 'x', role: 'admin_books_only' }).ok, false);
});
