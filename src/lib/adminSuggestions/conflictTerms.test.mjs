import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CONFLICTS_DESCRIPTION, SIDE_LABELS, KEEP_LABELS, conflictBookName, conflictPartsText, conflictsCountText, resolveBookConfirm, resolvedBookMessage,
  CONFLICT_PANEL_HINT, CONFLICT_RETRY_MESSAGE, partPendingMessage,
} from './conflictTerms.js'

test('"GitHub" רק פעם אחת, עם הסבר; בשאר — "המאגר"', () => {
  assert.match(CONFLICTS_DESCRIPTION, /מאגר המרכזי \(GitHub\)/)
  const rest = [...Object.values(SIDE_LABELS), ...Object.values(KEEP_LABELS),
    ...['ours', 'theirs'].flatMap((s) => { const c = resolveBookConfirm({ title: 'בראשית' }, s); return [c.title, c.body, ...c.details, c.confirmLabel] }),
    CONFLICT_PANEL_HINT, CONFLICT_RETRY_MESSAGE, partPendingMessage({ title: 'בראשית' }, 2, 'ours')]
  for (const t of rest) assert.doesNotMatch(t, /GitHub|גיטהאב|סנכרון|קונפליקט|דחיפה/, t)
})

test('שם הספר: כותרת, או מהנתיב', () => {
  assert.equal(conflictBookName({ title: 'בראשית', path: 'תנך/בראשית.txt' }), 'בראשית')
  assert.equal(conflictBookName({ path: 'תנך/שמות.txt' }), 'שמות')
  assert.equal(conflictBookName({}), 'ספר בלי שם')
})

test('מונים', () => {
  assert.equal(conflictPartsText(1), 'חלק אחד שונה')
  assert.equal(conflictPartsText(7), '7 חלקים שונים')
  assert.equal(conflictsCountText(1), 'ספר אחד מחכה להחלטה')
  assert.equal(conflictsCountText(3), '3 ספרים מחכים להחלטה')
})

test('אישור לכל הספר: הרסני, ואומר מה יימחק', () => {
  const ours = resolveBookConfirm({ title: 'בראשית' }, 'ours')
  assert.equal(ours.tone, 'danger')
  assert.equal(ours.confirmLabel, 'השאר את הנוסח שבאתר')
  assert.match(ours.details[0], /במאגר .* יימחקו/)
  const theirs = resolveBookConfirm({ title: 'בראשית' }, 'theirs')
  assert.equal(theirs.confirmLabel, 'השאר את הנוסח שבמאגר')
  assert.match(theirs.details[0], /באתר .* יבוטלו/)
  assert.equal(resolvedBookMessage({ title: 'בראשית' }, 'theirs'), 'ב"בראשית" נשאר הנוסח שבמאגר')
})

test('הודעה עם "בטל" אחרי בחירה בחלק', () => {
  assert.equal(partPendingMessage({ title: 'בראשית' }, 2, 'ours'), 'חלק 2 ב"בראשית": יישאר הנוסח שבאתר')
  assert.match(CONFLICT_PANEL_HINT, /יימחק/)
})
