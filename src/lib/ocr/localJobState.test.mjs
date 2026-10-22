import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ACTIVE_STATUSES,
  TERMINAL_STATUSES,
  ALL_STATUSES,
  WORKER_VISIBLE_STATUSES,
  REPORT_STATES,
  STATUS_LABELS_HE,
  isActiveStatus,
  isTerminalStatus,
  statusFromReport,
  siteStateOf,
  terminalStatusForOutcome,
  activeFilter,
  workerAvailability,
} from './localJobState.js';

test('קבוצות: אף מצב פעיל אינו סופי, והאיחוד הוא כל המצבים', () => {
  for (const s of ACTIVE_STATUSES) {
    assert.equal(TERMINAL_STATUSES.includes(s), false, s);
    assert.equal(isActiveStatus(s), true);
    assert.equal(isTerminalStatus(s), false);
  }
  for (const s of TERMINAL_STATUSES) {
    assert.equal(isActiveStatus(s), false);
    assert.equal(isTerminalStatus(s), true);
  }
  assert.equal(ALL_STATUSES.length, ACTIVE_STATUSES.length + TERMINAL_STATUSES.length);
  assert.deepEqual([...TERMINAL_STATUSES].sort(), ['cancelled', 'completed', 'failed']);
});

test('WORKER_VISIBLE_STATUSES: כל הפעילים חוץ מ-preparing', () => {
  assert.equal(WORKER_VISIBLE_STATUSES.includes('preparing'), false);
  assert.deepEqual(
    [...WORKER_VISIBLE_STATUSES].sort(),
    ACTIVE_STATUSES.filter((s) => s !== 'preparing').sort()
  );
});

test('REPORT_STATES תואם בדיוק ל-enum של status.schema.json בחוזה השירות (9 ערכים)', () => {
  // הועתק מ-contracts/status.schema.json (properties.state.enum) בריפו השירות
  const schemaEnum = ['queued', 'running', 'pausing', 'paused_runner', 'delivery_pending', 'completed', 'failed', 'cancelled', 'needs_attention'];
  assert.deepEqual([...REPORT_STATES].sort(), [...schemaEnum].sort());
});

test('statusFromReport: מצבי ביניים ממופים לעצמם, completed/failed/cancelled → null', () => {
  for (const s of ['queued', 'running', 'pausing', 'paused_runner', 'delivery_pending', 'needs_attention']) {
    assert.equal(statusFromReport(s), s);
    assert.equal(isActiveStatus(statusFromReport(s)), true);
  }
  for (const s of ['completed', 'failed', 'cancelled', 'bogus', undefined]) {
    assert.equal(statusFromReport(s), null);
  }
});

test('siteStateOf: cancelled / closed / queued / in_progress', () => {
  assert.equal(siteStateOf({ status: 'cancelled' }), 'cancelled');
  assert.equal(siteStateOf({ status: 'completed' }), 'closed');
  assert.equal(siteStateOf({ status: 'failed' }), 'closed');
  assert.equal(siteStateOf({ status: 'queued' }), 'queued');
  for (const s of ['preparing', 'running', 'pausing', 'paused_runner', 'delivery_pending', 'needs_attention', 'applying']) {
    assert.equal(siteStateOf({ status: s }), 'in_progress', s);
  }
});

test('terminalStatusForOutcome', () => {
  assert.equal(terminalStatusForOutcome('success'), 'completed');
  assert.equal(terminalStatusForOutcome('partial'), 'completed');
  assert.equal(terminalStatusForOutcome('failed'), 'failed');
  assert.equal(terminalStatusForOutcome('cancelled'), 'cancelled');
  assert.equal(terminalStatusForOutcome('Success'), null);
  for (const o of ['success', 'partial', 'failed', 'cancelled']) {
    assert.equal(isTerminalStatus(terminalStatusForOutcome(o)), true);
  }
});

test('activeFilter: active:true או רשומה ישנה בלי active ב-running', () => {
  assert.deepEqual(activeFilter(), {
    $or: [{ active: true }, { active: { $exists: false }, status: 'running' }],
  });
  // אובייקט חדש בכל קריאה — שינוי של מחזיר אחד לא משפיע על הבא
  assert.notEqual(activeFilter(), activeFilter());
});

test('STATUS_LABELS_HE: תווית לכל מצב', () => {
  for (const s of ALL_STATUSES) {
    assert.equal(typeof STATUS_LABELS_HE[s], 'string', s);
    assert.ok(STATUS_LABELS_HE[s].length > 0);
  }
});

test('workerAvailability: never / online / offline', () => {
  const now = new Date('2026-01-01T12:00:00Z');
  const th = 180_000;
  assert.equal(workerAvailability(null, now, th), 'never');
  assert.equal(workerAvailability(undefined, now, th), 'never');
  assert.equal(workerAvailability('not a date', now, th), 'never');
  assert.equal(workerAvailability(new Date(now.getTime() - 1000), now, th), 'online');
  assert.equal(workerAvailability(new Date(now.getTime() - th), now, th), 'online');
  assert.equal(workerAvailability(new Date(now.getTime() - th - 1), now, th), 'offline');
  // מחרוזת ISO (כמו אחרי JSON) ו-now כמספר
  assert.equal(workerAvailability(new Date(now.getTime() - 5000).toISOString(), now.getTime(), th), 'online');
});
