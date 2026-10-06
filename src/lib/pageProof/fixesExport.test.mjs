import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFixesFile, splitPrimary, pickPrimary, pendingRecut, recutOf, splitFixesFile, MAX_FILE_OPS } from './fixesExport.js';

const GID = 'a1b2c3d4e5f6a7b8';

test('splitPrimary: הגשה למעבר שני (גרסה חדשה של העמוד) ראשית לגרסה שלה, לא "כפולה"', () => {
  const subs = [
    { _id: 'r1a', page: 4, approvedAt: '2026-09-01', who: 'u1', ops: [] },
    { _id: 'r1b', page: 4, revision: 1, approvedAt: '2026-09-02', who: 'u2', ops: [] },
    { _id: 'r2a', page: 4, revision: 2, approvedAt: '2026-09-10', who: 'u3', ops: [] },
    { _id: 'r2b', page: 4, revision: 2, approvedAt: '2026-09-11', who: 'u4', ops: [] },
  ];
  const { primary, double } = splitPrimary(subs);
  assert.deepEqual(primary.map((s) => s._id), ['r1a', 'r2a']);
  assert.deepEqual(double.map((s) => s._id), ['r1b', 'r2b']);
});

test('splitPrimary: גרסה חסרה או לא תקינה = 1', () => {
  const subs = [
    { _id: 'a', page: 1, approvedAt: '2026-09-01', ops: [] },
    { _id: 'b', page: 1, revision: 0, approvedAt: '2026-09-02', ops: [] },
    { _id: 'c', page: 1, revision: 1, approvedAt: '2026-09-03', ops: [] },
  ];
  const { primary, double } = splitPrimary(subs);
  assert.deepEqual(primary.map((s) => s._id), ['a']);
  assert.deepEqual(double.map((s) => s._id), ['b', 'c']);
});

test('buildFixesFile: בעמוד אחד — פעולות הגרסה הקודמת קודם, גם כשאושרו מאוחר יותר', () => {
  const f = buildFixesFile(
    GID,
    [
      { page: 3, revision: 2, who: 'u2', approvedAt: '2026-09-10', submittedAt: '2026-09-09T10:00:00Z', ops: [{ kind: 'line_ok', page: 3, ids: [5] }] },
      { page: 3, who: 'u1', approvedAt: '2026-09-12', submittedAt: '2026-09-01T10:00:00Z', ops: [{ kind: 'text', page: 3, ids: [5], value: 'א' }] },
      { page: 1, revision: 2, who: 'u3', approvedAt: '2026-09-13', submittedAt: '2026-09-02T10:00:00Z', ops: [{ kind: 'cut_ok', page: 1, value: true }] },
    ],
    new Date('2026-09-24T00:00:00Z')
  );
  assert.deepEqual(f.ops.map((o) => [o.page, o.kind, o.who]), [
    [1, 'cut_ok', 'u3'],
    [3, 'text', 'u1'],
    [3, 'line_ok', 'u2'],
  ]);
  // לכל פעולה — הגרסה שעליה נעשתה (חסרה = 1)
  assert.deepEqual(f.ops.map((o) => o.revision), [2, 1, 2]);
});

test('pickPrimary: עמוד כפול — ההגשה שמשנה חיתוך ראשית גם כשאושרה אחרי הגשת-טקסט (אחרת העמוד לא חוזר מזיהוי-מחדש)', () => {
  const B = { _id: 'B', page: 7, revision: 1, who: 'otz-b', approvedAt: '2026-09-29T10:00:00Z', ops: [{ kind: 'text', page: 7, ids: [3], value: 'אבג' }] };
  const A = { _id: 'A', page: 7, revision: 1, who: 'otz-a', approvedAt: '2026-09-29T11:00:00Z', needsRecut: true, ops: [{ kind: 'line_split', page: 7, ids: [4], value: { x: 500 } }] };
  assert.equal(pickPrimary([B, A]), A);
  const { primary, double } = splitPrimary([B, A]);
  assert.deepEqual(primary.map((s) => s._id), ['A']);
  assert.deepEqual(double.map((s) => s._id), ['B']);
  assert.ok(buildFixesFile(GID, primary).ops.some((o) => o.kind === 'line_split'), 'פעולת-החיתוך בקובץ הראשי');
  // הגשה שכבר יצאה בקובץ ראשי — נשארת ראשית (היא כבר אצלם)
  const Bx = { ...B, exportedAt: '2026-09-29T10:30:00Z' };
  assert.equal(pickPrimary([Bx, A]), Bx);
  // בלי חיתוך — הראשונה שאושרה
  assert.equal(pickPrimary([{ ...A, needsRecut: false }, B]), B);
  assert.equal(pickPrimary([]), null);
});

test('buildFixesFile: לכל פעולה op_id (הגשה:מקום), גרסה וחתימת-העמוד כשידועה', () => {
  const sigs = new Map([['3:1', '1:0000abcd']]);
  const f = buildFixesFile(
    GID,
    [
      { _id: 's1', page: 3, who: 'u1', approvedAt: '2026-09-12', ops: [{ kind: 'text', page: 3, ids: [5], value: 'א' }, { kind: 'line_ok', page: 3, ids: [5, 6] }] },
      { _id: 's2', page: 4, revision: 2, who: 'u2', approvedAt: '2026-09-13', ops: [{ kind: 'cut_ok', page: 4, value: true }] },
    ],
    new Date('2026-09-24T00:00:00Z'),
    sigs
  );
  assert.deepEqual(
    f.ops.map((o) => [o.op_id, o.revision, o.sig ?? null]),
    [
      ['s1:0', 1, '1:0000abcd'],
      ['s1:1', 1, '1:0000abcd'],
      ['s2:0', 2, null],
    ]
  );
  assert.equal(f.contract, 1);
});

test('splitFixesFile: מעל התקרה שלהם — כמה קבצים, בלי לפצל עמוד', () => {
  const op = (page) => ({ kind: 'line_ok', page, ids: [1] });
  const file = { contract: 1, gid: GID, who: 'x', when: 'y', ops: [...Array(3).fill(op(1)), ...Array(4).fill(op(2)), ...Array(2).fill(op(3))] };
  assert.deepEqual(splitFixesFile(file, 100), [file]);
  const parts = splitFixesFile(file, 5);
  assert.deepEqual(parts.map((p) => p.ops.map((o) => o.page)), [[1, 1, 1], [2, 2, 2, 2], [3, 3]]);
  assert.ok(parts.every((p) => p.gid === GID && p.contract === 1));
  // עמוד שלבדו גדול מהתקרה — בקובץ משלו
  assert.deepEqual(splitFixesFile(file, 2).map((p) => p.ops.length), [3, 4, 2]);
  assert.equal(MAX_FILE_OPS, 5000);
});

test('buildFixesFile: קישור לעמוד אחר — page, ids ו-value (עם העמוד, מספר-השורה ותחילת-הטקסט של הצד הזר) כמות-שהם', () => {
  const link = { kind: 'link_add', page: 5, ids: [12, 77], value: { kind: 'dh', from_words: [0, 1], to_words: [2, 2], to_page: 4, to_line_no: 11, to_text: 'ב ועוד נראה' } };
  const back = { kind: 'link_add', page: 5, ids: [55, 13], value: { kind: 'note', from_words: [0, 0], to_words: [1, 1], from_page: 6, from_line_no: 2, from_text: 'ג והנה' } };
  const file = buildFixesFile(GID, [{ _id: 's1', page: 5, who: 'u1', approvedAt: '2026-09-30', ops: [link, back] }], new Date('2026-09-30T10:00:00Z'));
  assert.deepEqual(
    file.ops.map(({ kind, page, ids, value }) => ({ kind, page, ids, value })),
    [link, back]
  );
  assert.deepEqual(file.ops.map((o) => o.op_id), ['s1:0', 's1:1']);
});

test('buildFixesFile: פעולה הפוכה ("החזר למקור") יוצאת עם revert', () => {
  const s = { _id: 's', page: 4, revision: 1, who: 'w', approvedAt: '2026-10-05T10:00:00Z', ops: [{ kind: 'text', page: 4, ids: [1], value: 'מקור', revert: true }, tA] };
  assert.deepEqual(buildFixesFile('g', [s]).ops.map((o) => o.revert ?? null), [true, null]);
});

test('buildFixesFile: הגשה שמבוססת על הגשה קודמת (הבודק השני) — same_as לכל פעולה זהה, ובלי השדה לשאר', () => {
  const ops = [
    { kind: 'text', page: 4, ids: [1], value: 'א' },
    { kind: 'para', page: 4, ids: [2], value: 'h2' },
  ];
  const f = buildFixesFile(GID, [{ _id: 'sB', page: 4, who: 'u2', approvedAt: '2026-10-05', ops, sameAs: ['sA:3', null] }], new Date('2026-10-05T10:00:00Z'));
  assert.equal(f.ops[0].same_as, 'sA:3');
  assert.equal('same_as' in f.ops[1], false);
  // בלי sameAs — כמו תמיד
  assert.equal(buildFixesFile(GID, [{ _id: 's1', page: 4, who: 'u1', approvedAt: '2026-10-05', ops }]).ops.some((o) => 'same_as' in o), false);
});

// ---------- הבודק השני: ההגשה המצטברת ראשית (docs/63 §4) ----------
const tA = { kind: 'text', page: 4, ids: [1], value: 'x' };
const tB = { kind: 'text', page: 4, ids: [2], value: 'y' };
const subA = (extra = {}) => ({ _id: 'a', page: 4, revision: 1, approvedAt: '2026-10-05T10:00:00Z', ops: [tA], ...extra });
const subB = (extra = {}) => ({ _id: 'b', page: 4, revision: 1, approvedAt: '2026-10-05T10:05:00Z', basedOn: 'a', ops: [tA, tB], ...extra });

test('pickPrimary: הגשה שהגשה מאושרת אחרת מבוססת עליה אינה ראשית — המצטברת היא', () => {
  const r = splitPrimary([subA(), subB()]);
  assert.deepEqual(r.primary.map((s) => s._id), ['b']);
  assert.deepEqual(r.double.map((s) => s._id), ['a']);
  // גם כש-B אושרה לפני A, וגם כש-A משנה חיתוך
  assert.equal(pickPrimary([subA({ needsRecut: true, approvedAt: '2026-10-05T11:00:00Z' }), subB()])._id, 'b');
});

test('pickPrimary: A כבר יצאה בקובץ ראשי — B ראשית בקובץ הבא, כהמשך (same_as מונע החלה כפולה)', () => {
  const r = splitPrimary([subA({ exportedAt: '2026-10-05T10:30:00Z' }), subB()]);
  assert.deepEqual(r.primary.map((s) => s._id), ['b']);
  const file = buildFixesFile('g', [{ ...subB(), sameAs: ['a:0', null] }]);
  assert.deepEqual(file.ops.map((o) => o.same_as ?? null), ['a:0', null]);
});

test('pickPrimary: שרשרת A ← B ← C — C ראשית; מבוססת על הגשה שאינה בקבוצה (נדחתה) — כרגיל', () => {
  const C = { _id: 'c', page: 4, revision: 1, approvedAt: '2026-10-05T10:10:00Z', basedOn: 'b', ops: [tA, tB] };
  assert.equal(pickPrimary([subA(), subB(), C])._id, 'c');
  assert.equal(pickPrimary([subB({ basedOn: 'z' }), subA()])._id, 'a');
  // מזהה כאובייקט (ObjectId אחרי lean) — אותו דבר
  assert.equal(pickPrimary([subA(), subB({ basedOn: { _id: 'a' } })])._id, 'b');
});

test('pendingRecut: המשך של הגשה שיצאה — רק תיקוני-חיתוך משלו נספרים', () => {
  const cut = { kind: 'line_add', page: 4, value: { bbox: [1, 2, 3, 4], text: 'ש' } };
  const cut2 = { kind: 'line_add', page: 4, value: { bbox: [5, 6, 7, 8], text: 'ת' } };
  const A = subA({ ops: [cut], needsRecut: true, exportedAt: '2026-10-05T10:30:00Z' });
  const byId = (...l) => new Map(l.map((s) => [s._id, s]));
  const B = subB({ ops: [cut, tB], needsRecut: true });
  assert.equal(pendingRecut(B, byId(A, B)), false, 'החיתוך של A כבר יצא');
  const B2 = subB({ ops: [cut, cut2], needsRecut: true });
  assert.equal(pendingRecut(B2, byId(A, B2)), true, 'חיתוך חדש של B');
  assert.equal(pendingRecut(subA({ ops: [cut], needsRecut: true }), byId()), true);
  // ראוטי האישור וההגשה (recutOf): אותו כלל, גם כשהראשית עצמה כבר יצאה (העמוד ממתין בגללה)
  assert.equal(recutOf(B, byId(A, B)), false, 'רק החיתוך של A — כבר בדרך לתוכנת-הספר');
  assert.equal(recutOf(B2, byId(A, B2)), true);
  assert.equal(recutOf(subA({ ops: [cut], needsRecut: true, exportedAt: '2026-10-05T10:30:00Z' }), byId()), true);
  assert.equal(pendingRecut(subB({ needsRecut: false }), byId(A)), false);
});
