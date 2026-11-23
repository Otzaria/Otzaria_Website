import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  clamavAssetLabel, clamavIncompleteMessage, clamavPartialOverride, isLimitsSignature, partialScanNote, withPartialScanNote,
} from '../src/clamavPartial.js'
import { buildContextText } from '../src/reviewDocs.js'

const SIG = 'Heuristics.Limits.Exceeded.MaxFileSize'
const job = { assets: [{ key: 'native0', name: 'setup.exe' }, { key: 'native1', name: 'mac.dmg' }] }
const partial = { status: 'partial', incomplete: [{ key: 'native0', signature: SIG }, { key: 'plugin', signature: SIG }],
  override: { reason: 'נבדק\nידנית', grantedAt: '2026-11-20T10:00:00.000Z' } }

test('isLimitsSignature / clamavAssetLabel', () => {
  assert.equal(isLimitsSignature(SIG), true)
  assert.equal(isLimitsSignature('Heuristics.Limits.Exceeded'), true)
  assert.equal(isLimitsSignature('Heuristics.Limits.ExceededX'), false)
  assert.equal(isLimitsSignature('Win.Test.EICAR_HDB-1'), false)
  assert.equal(clamavAssetLabel({ key: 'plugin', isPlugin: true }), 'קובץ התוסף')
  assert.equal(clamavAssetLabel({ key: 'native0', name: 'a\nb.exe' }), 'המתקין a\\u000ab.exe')
  assert.equal(clamavAssetLabel(undefined), 'קובץ בהגשה')
})

test('clamavIncompleteMessage: בתוך המגבלה, עם "ועוד N" כשהרשימה ארוכה', () => {
  const one = clamavIncompleteMessage([{ key: 'native0', label: 'המתקין setup.exe', signature: SIG }], 3)
  assert.match(one, /^- המתקין setup\.exe: Heuristics\.Limits\.Exceeded\.MaxFileSize$/m)
  assert.match(one, /שאר הקבצים \(2\) נסרקו ולא נמצאה בהם חתימה מוכרת/)
  const many = Array.from({ length: 9 }, (_, i) => ({ key: `native${i}`, label: `המתקין ${'x'.repeat(70)}${i}.exe`, signature: SIG }))
  const msg = clamavIncompleteMessage(many, 9)
  assert.ok(msg.length <= 500, String(msg.length))
  assert.match(msg, /^- ועוד \d+$/m)
  assert.match(msg, /אף קובץ בהגשה לא נסרק במלואו/)
})

test('clamavPartialOverride: רק ערך תקין נחשב חריגה', () => {
  const good = { reason: 'סיבה', grantedAt: '2026-11-20T10:00:00Z' }
  assert.deepEqual(clamavPartialOverride({ overrides: { clamavPartial: good } }), { reason: 'סיבה', grantedAt: '2026-11-20T10:00:00.000Z' })
  for (const o of [undefined, null, {}, { clamavPartial: null }, { clamavPartial: [] }, { clamavPartial: 'yes' },
    { clamavPartial: { ...good, reason: '  ' } }, { clamavPartial: { ...good, reason: 5 } },
    { clamavPartial: { ...good, reason: 'x'.repeat(501) } }, { clamavPartial: { ...good, grantedAt: 'not a date' } },
    { clamavPartial: { reason: 'סיבה' } }]) {
    assert.equal(clamavPartialOverride({ overrides: o }), null, JSON.stringify(o))
  }
  assert.equal(clamavPartialOverride(null), null)
})

test('partialScanNote / withPartialScanNote', () => {
  assert.equal(partialScanNote(job, { status: 'clean' }), null)
  assert.equal(partialScanNote(job, undefined), null)
  assert.equal(withPartialScanNote(job, { status: 'clean' }, 'דוח'), 'דוח')
  const note = partialScanNote(job, partial)
  assert.match(note, /^שימו לב: סריקת ClamAV הייתה חלקית/)
  assert.match(note, /המתקין setup\.exe \(Heuristics\.Limits\.Exceeded\.MaxFileSize\); קובץ התוסף/)
  assert.match(note, /אושר ידנית ע״י מנהל: נבדק ידנית\.$/)
  const out = withPartialScanNote(job, partial, 'גוף הדוח')
  assert.equal(out, `${note}\n\nגוף הדוח`)
  // דוח שכבר קרוב לתקרה נחתך כך שהכול נשאר בתוך המגבלה
  const long = withPartialScanNote(job, partial, 'א'.repeat(40_000), 64 * 1024)
  assert.ok(Buffer.byteLength(long, 'utf8') <= 64 * 1024)
  assert.ok(long.startsWith(note) && long.endsWith('…'))
  assert.ok(!long.includes('�'))
})

test('CONTEXT.txt לסוקר מציין סריקה חלקית ואת הקבצים, רק כשהקבלה partial', () => {
  const ctxText = (data) => buildContextText({ kind: 'plugin', assets: [] }, new Map([['clamav', { data }]]))
  const text = ctxText(partial)
  assert.match(text, /^clamav: "partial"$/m)
  assert.match(text, /סריקה חלקית: .*"key":"native0","signature":"Heuristics\.Limits\.Exceeded\.MaxFileSize"/)
  assert.doesNotMatch(text, /נבדק/)
  assert.doesNotMatch(ctxText({ status: 'clean' }), /סריקה חלקית/)
})
