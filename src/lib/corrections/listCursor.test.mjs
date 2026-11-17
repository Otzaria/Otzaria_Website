import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { parseReportCursor, reportCursor } from './listCursor.js';

test('cursor freezes the sort boundary and validates the requested sort', () => {
  const row = { _id: new mongoose.Types.ObjectId(), createdAt: new Date('2026-11-01'), libraryVersionSortKey: 31 };
  const raw = reportCursor(row, 'version');
  const parsed = parseReportCursor(raw, 'version');
  assert.equal(String(parsed._id), String(row._id));
  assert.deepEqual(parsed.createdAt, row.createdAt);
  assert.equal(parsed.libraryVersionSortKey, 31);
  assert.equal(parseReportCursor(raw, 'newest'), null);
  assert.equal(parseReportCursor(reportCursor({ _id: row._id }, 'oldest'), 'oldest').createdAt, null);
});

test('cursor rejects malformed or oversized boundaries before a database query', () => {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const valid = [1, 'version', '2026-11-01T00:00:00.000Z', '0123456789abcdef01234567', 31];
  for (const raw of [null, '', 'x'.repeat(401), '%', encode({}), encode([...valid, 1]),
    encode([2, ...valid.slice(1)]), encode([1, 'version', 'invalid', valid[3], 31]),
    encode([1, 'version', valid[2], 'invalid', 31]), encode([1, 'version', valid[2], valid[3], '31'])]) {
    assert.equal(parseReportCursor(raw, 'version'), null);
  }
});
