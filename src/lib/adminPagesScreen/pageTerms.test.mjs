import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  updatedAgoText, isStale, pageLabel, pagesCountText, pageFilename, combinedFilename, editorHref, combinedText, workerText, statusLabel,
  releasedMessage, bulkReleaseConfirm, bulkProgressText, bulkResultText, partialLoadNote, loadProgressText, splitCombinedText,
  checkUnchanged, skippedMessage, statusChangeBlocked, statusChangeConfirm, shouldAnnounce, STALE_DAYS, STATUS_TONES, RELEASE_PENDING_LINE,
} from './pageTerms.js'

const DAY = 86400000
const NOW = Date.parse('2026-11-06T10:00:00Z')
const ago = (d) => new Date(NOW - d * DAY).toISOString()

test('updatedAgoText: ימים עד חודשיים, אחר כך חודשים ושנים', () => {
  assert.equal(updatedAgoText(ago(0), NOW), 'היום')
  assert.equal(updatedAgoText(ago(1), NOW), 'אתמול')
  assert.equal(updatedAgoText(ago(2), NOW), 'לפני יומיים')
  assert.equal(updatedAgoText(ago(12), NOW), 'לפני 12 ימים')
  assert.equal(updatedAgoText(ago(59), NOW), 'לפני 59 ימים')
  assert.equal(updatedAgoText(ago(61), NOW), 'לפני חודשיים')
  assert.equal(updatedAgoText(ago(140), NOW), 'לפני 4 חודשים')
  assert.equal(updatedAgoText(ago(400), NOW), 'לפני שנה')
  assert.equal(updatedAgoText(ago(800), NOW), 'לפני שנתיים')
  assert.equal(updatedAgoText(ago(1200), NOW), 'לפני 3 שנים')
  assert.equal(updatedAgoText(null, NOW), '')
  assert.equal(updatedAgoText('לא תאריך', NOW), '')
})

test('isStale: רק בעבודה, לפי "עודכן"; בלי תאריך — ותיק', () => {
  assert.equal(isStale({ status: 'in-progress', updatedAt: ago(8) }, 7, NOW), true)
  assert.equal(isStale({ status: 'in-progress', updatedAt: ago(6) }, 7, NOW), false)
  assert.equal(isStale({ status: 'completed', updatedAt: ago(80) }, 7, NOW), false)
  assert.equal(isStale({ status: 'in-progress' }, 30, NOW), true)
  assert.equal(isStale({ status: 'in-progress', updatedAt: ago(80) }, 0, NOW), false)
})

test('מילים קטנות: מצב, עמוד, ספירה, שמות קבצים, עורך, מי עובד', () => {
  assert.equal(statusLabel('in-progress'), 'בעבודה')
  assert.equal(statusLabel('x'), 'לא ידוע')
  assert.equal(pageLabel(1234), 'עמוד 1,234')
  assert.equal(pagesCountText(1), 'עמוד אחד')
  assert.equal(pagesCountText(5000), '5,000 עמודים')
  const page = { bookName: 'מסילת ישרים', number: 7 }
  assert.equal(pageFilename(page), 'מסילת ישרים-7.txt')
  assert.equal(combinedFilename(3), 'עמודים-3.txt')
  assert.equal(combinedFilename(30, 2000), 'עמודים-30-מתוך-2000-חלקי.txt')
  assert.equal(editorHref({ bookName: 'א/ב ג', number: 3 }), '/library/books/%D7%90%2F%D7%91%20%D7%92/3')
  assert.equal(workerText({ status: 'in-progress', claimedBy: 'משה' }), 'משה')
  assert.equal(workerText({ status: 'in-progress', claimedBy: null }), 'משתמש שנמחק')
  assert.equal(workerText({ status: 'available', claimedBy: null }), '')
})

test('combinedText: כמו קובץ "הורד הכול" של השרת', () => {
  const text = combinedText([{ bookName: 'א', number: 1, text: 'שלום' }, { bookName: 'ב', number: 2, text: '' }])
  assert.equal(text.split('ספר: ').length - 1, 2)
  assert.ok(text.startsWith('========================================\nספר: א | עמוד: 1\n========================================\n\nשלום\n'))
  assert.equal(combinedText(null), '')
})

test('splitCombinedText: קובץ השרת (download-batch) בחזרה לעמודים — אותו טקסט כמו download/:id', () => {
  // כמו api/admin/pages/download-batch: טור אחד — content + "\n" + "\n\n"; שני טורים — "--- R ---\n…\n\n--- L ---\n…\n" + "\n\n"
  const RULE = '='.repeat(40)
  const server = `${RULE}\nספר: א | עמוד: 1\n${RULE}\n\nשלום\nעולם\n\n\n`
    + `${RULE}\nספר: א | עמוד: 2\n${RULE}\n\n--- חלק 1 ---\nימין\n\n--- חלק 2 ---\nשמאל\n\n\n`
    + `${RULE}\nספר: א | עמוד: 3\n${RULE}\n\n\n\n\n`
  const map = splitCombinedText(server)
  assert.deepEqual([...map.keys()], [1, 2, 3])
  assert.equal(map.get(1), 'שלום\nעולם')
  assert.equal(map.get(2), '--- חלק 1 ---\nימין\n\n--- חלק 2 ---\nשמאל')
  assert.equal(map.get(3), '')
  // הלוך-חזור: מה שהקובץ המאוחד כותב — חוזר כמו שהוא
  assert.equal(splitCombinedText(combinedText([{ bookName: 'ב', number: 9, text: 'x' }])).get(9), 'x')
  assert.equal(splitCombinedText('').size, 0)
})

test('"בלי שינוי יותר מ-": 3 / 7 / 14; "בעבודה" בצבע הראשי', () => {
  assert.deepEqual(STALE_DAYS, [3, 7, 14])
  assert.equal(STATUS_TONES['in-progress'], 'primary')
})

test('הודעות שחרור: ניסוח אחד ל"בעוד כמה שניות"; חלון השחרור המרובה לא אדום', () => {
  const page = { bookName: 'מסילת ישרים', number: 7 }
  assert.equal(RELEASE_PENDING_LINE, 'ישוחרר בעוד כמה שניות')
  assert.equal(releasedMessage(page), '"מסילת ישרים", עמוד 7 שוחרר. עכשיו הוא פנוי לכל המתנדבים.')
  const one = bulkReleaseConfirm(1)
  assert.equal(one.title, 'לשחרר עמוד אחד?')
  assert.equal(one.confirmLabel, 'שחרר')
  assert.equal(one.tone, 'default')
  assert.match(one.body, /לא מקבלים על זה הודעה ולא מאבדים נקודות/)
  const many = bulkReleaseConfirm(1200, 3)
  assert.equal(many.title, 'לשחרר 1,200 עמודים?')
  assert.match(many.body, /3 מהנבחרים אינם בעבודה/)
  assert.match(bulkReleaseConfirm(2, 1).body, /עמוד אחד מהנבחרים אינו בעבודה/)
})

test('checkUnchanged / skippedMessage: הבדיקה לפני שליחה', () => {
  const was = { status: 'in-progress', claimedById: 'u1' }
  assert.equal(checkUnchanged(was, { status: 'in-progress', claimedById: 'u1' }), 'ok')
  assert.equal(checkUnchanged(was, undefined), 'gone')
  assert.equal(checkUnchanged(was, { status: 'completed', claimedById: 'u1' }), 'changed')
  assert.equal(checkUnchanged(was, { status: 'in-progress', claimedById: 'u2' }), 'changed')
  assert.equal(checkUnchanged({ status: 'available', claimedById: null }, { status: 'available' }), 'ok')
  const page = { bookName: 'א', number: 2 }
  assert.equal(skippedMessage('release', page, 'changed'), '"א", עמוד 2 כבר לא בעבודה אצל אותו משתמש — לא שוחרר.')
  assert.match(skippedMessage('release', page, 'gone'), /לא נמצא יותר — לא שוחרר/)
  assert.match(skippedMessage('status', page, 'changed'), /השתנה בינתיים — לא שונה/)
})

test('שינוי מצב: מה מותר, ומה החלון אומר (מול מה שהשרת באמת עושה)', () => {
  const working = { bookName: 'א', number: 1, status: 'in-progress', claimedBy: 'משה', claimedById: 'u1' }
  const done = { ...working, status: 'completed' }
  const free = { bookName: 'א', number: 2, status: 'available', claimedBy: null, claimedById: null }
  assert.equal(statusChangeBlocked(working, 'in-progress'), 'זה המצב הנוכחי')
  assert.equal(statusChangeBlocked(free, 'in-progress'), 'אין מתנדב שהעמוד יחזור אליו')
  assert.equal(statusChangeBlocked(free, 'completed'), null)
  assert.equal(statusChangeBlocked(done, 'in-progress'), null)
  const toDone = statusChangeConfirm(working, 'completed')
  assert.equal(toDone.title, 'לשנות ל"הושלם"?')
  assert.equal(toDone.confirmLabel, 'שנה ל"הושלם"')
  assert.equal(toDone.tone, 'default')
  assert.ok(toDone.details.some((d) => /לא מוסיף נקודות/.test(d)))
  assert.ok(toDone.details.some((d) => /מונה העמודים שהושלמו בספר לא מתעדכן/.test(d)))
  const toFree = statusChangeConfirm(done, 'available')
  assert.equal(toFree.tone, 'danger')
  assert.match(toFree.body, /כבר לא ייחשב כהושלם/)
  assert.match(toFree.body, /השם של משה יישאר/)
  assert.match(statusChangeConfirm(done, 'in-progress').body, /יחזור לעבודה אצל משה/)
  assert.equal(statusChangeConfirm(working, 'available').details.some((d) => /מונה/.test(d)), false)
})

test('התקדמות וסיכום של פעולה מרובה', () => {
  assert.equal(bulkProgressText('release', { done: 3, total: 1000 }), 'משחרר… 3 מתוך 1,000')
  assert.equal(bulkProgressText('download', { done: 0, total: 2 }), 'מוריד… 0 מתוך 2')
  assert.deepEqual(bulkResultText('release', { done: 5 }), { message: '5 עמודים שוחררו.', tone: 'success' })
  assert.deepEqual(bulkResultText('release', { done: 1, failed: 2, stopped: 4 }),
    { message: 'עמוד אחד שוחרר. 2 נכשלו. 4 לא נשלחו (עצרת). מה שלא הושלם נשאר מסומן.', tone: 'error' })
  assert.equal(bulkResultText('download', { done: 0, stopped: 1 }).message, 'לא ירד אף עמוד. עמוד אחד לא נשלח (עצרת). מה שלא הושלם נשאר מסומן.')
  assert.equal(bulkResultText('download', { done: 1 }).message, 'הטקסט של עמוד אחד ירד.')
  assert.equal(bulkResultText('release', { done: 4, skipped: 3 }).message, '4 עמודים שוחררו. 3 כבר לא בעבודה אצל אותו משתמש ולא שוחררו.')
  // 403 באמצע: אומרים גם כמה כבר שוחררו
  assert.deepEqual(bulkResultText('release', { done: 7, failed: 1, stopped: 42, fatal: 'אין לך הרשאה לפעולה הזו.' }),
    { message: '7 עמודים שוחררו. 43 לא הושלמו: אין לך הרשאה לפעולה הזו. מה שלא הושלם נשאר מסומן.', tone: 'error' })
  assert.equal(bulkResultText('download', { done: 30, stopped: 1970, partialFile: true }).message,
    'הטקסט של 30 עמודים ירד (קובץ חלקי). 1,970 לא נשלחו (עצרת). מה שלא הושלם נשאר מסומן.')
})

test('shouldAnnounce: בהתחלה, כל 10% ובסוף', () => {
  assert.equal(shouldAnnounce(-1, 0, 2000), true)
  assert.equal(shouldAnnounce(0, 1, 2000), false)
  assert.equal(shouldAnnounce(0, 199, 2000), false)
  assert.equal(shouldAnnounce(0, 200, 2000), true)
  assert.equal(shouldAnnounce(200, 350, 2000), false)
  assert.equal(shouldAnnounce(1800, 2000, 2000), true)
  assert.equal(shouldAnnounce(0, 1, 3), true)
})

test('טעינה: התקדמות, והסבר רק כשעדיין חסר', () => {
  assert.equal(loadProgressText(10000, 14617), 'טוען… 10,000 מתוך 14,617')
  assert.equal(partialLoadNote(14617, 15000), null)
  assert.equal(partialLoadNote(2193, 5000), null)
  assert.equal(partialLoadNote(undefined, 5000), null)
  const note = partialLoadNote(41000, 30000)
  assert.equal(note.text, 'נבדקו 30,000 מתוך 41,000')
  assert.match(note.title, /סדר ההוספה של הספרים/)
})
