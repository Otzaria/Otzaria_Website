/**
 * בדיקות מדיניות המטמון של חסימת השבת. הרצה: npm test
 *
 * הבדיקה שבמרכז הקובץ היא "אחרי הפסקה בתעבורה": גרסה קודמת החזירה ערך שפג
 * תוקפו במשך חלון של עשר דקות, ולכן הבקשה הראשונה בשבת — אחרי כמה דקות בלי
 * תעבורה — קיבלה את ההחלטה "מותר" שנשמרה לפני כניסת השבת.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createShabbatGate } from './shabbat-cache.js'

/** בונה שער עם שעון וירטואלי ו-fetch מבוקר */
function harness({ initialValue = false } = {}) {
  let clock = 1_000_000
  let value = initialValue
  let calls = 0
  let failNext = false
  let resolvers = []

  const gate = createShabbatGate({
    now: () => clock,
    fetchImpl: () => {
      calls++
      if (failNext) {
        failNext = false
        return Promise.reject(new Error('network down'))
      }
      const captured = value
      return new Promise((resolve) => {
        resolvers.push(() => resolve({
          ok: true,
          json: () => Promise.resolve({ status: { isAssurBemlacha: captured } }),
        }))
      })
    },
  })

  return {
    gate,
    advance: (ms) => { clock += ms },
    setHebcal: (v) => { value = v },
    failNextFetch: () => { failNext = true },
    get calls() { return calls },
    /** משחרר את בקשות ה-fetch התלויות ומאפשר ל-microtasks להתנקז */
    async settle() {
      const pending = resolvers
      resolvers = []
      for (const fn of pending) fn()
      for (let i = 0; i < 4; i++) await new Promise((r) => setImmediate(r))
    },
  }
}

test('בקשה ראשונה בתהליך חדש ממתינה לתשובה טרייה', async () => {
  const h = harness()
  const pending = h.gate.isAssurBemlacha()
  await h.settle()
  assert.equal(await pending, false)
  assert.equal(h.calls, 1)
})

test('ערך בתוקף מוחזר בלי קריאה נוספת ל-Hebcal', async () => {
  const h = harness()
  const first = h.gate.isAssurBemlacha()
  await h.settle()
  await first

  h.advance(20_000)
  assert.equal(await h.gate.isAssurBemlacha(), false)
  assert.equal(h.calls, 1)
})

test('אחרי הפסקה בתעבורה, הבקשה הראשונה בשבת נחסמת', async () => {
  const h = harness({ initialValue: false })
  const first = h.gate.isAssurBemlacha()
  await h.settle()
  await first

  // נכנסה שבת, ובמשך תשע דקות לא הגיעה אף בקשה
  h.setHebcal(true)
  h.advance(9 * 60_000)

  const pending = h.gate.isAssurBemlacha()
  await h.settle()
  assert.equal(await pending, true, 'ערך שפג תוקפו לא אמור להיות מוחזר')
})

test('רענון מקדים: התשובה מיידית והרענון נשלח ברקע', async () => {
  const h = harness({ initialValue: true })
  const first = h.gate.isAssurBemlacha()
  await h.settle()
  await first
  const before = h.calls

  h.advance(50_000) // נותרו 10 שניות לתוקף — פחות מ-refreshAheadMs
  const waitUntil = []
  const answer = await h.gate.isAssurBemlacha({ waitUntil: (p) => waitUntil.push(p) })

  assert.equal(answer, true, 'התשובה מגיעה מהמטמון, בלי המתנה')
  assert.equal(h.calls, before + 1, 'ובמקביל נשלח רענון')
  assert.equal(waitUntil.length, 1, 'הרענון נמסר ל-waitUntil')
  await h.settle()
})

test('כשל רענון אינו מבטל החלטת חסימה שבתוקף', async () => {
  const h = harness({ initialValue: true })
  const first = h.gate.isAssurBemlacha()
  await h.settle()
  await first

  h.advance(50_000)
  h.failNextFetch()
  const pending = h.gate.isAssurBemlacha()
  await h.settle()

  assert.equal(await pending, true)
  assert.equal(h.gate._peek().value, true, 'המטמון נשאר על "אסור"')
})

test('כשל ללא ערך בתוקף נכשל "פתוח"', async () => {
  const h = harness()
  h.failNextFetch()
  const pending = h.gate.isAssurBemlacha()
  await h.settle()
  assert.equal(await pending, false)
})

test('בקשות מקבילות מתאחדות לקריאה אחת (single-flight)', async () => {
  const h = harness()
  const all = Promise.all([
    h.gate.isAssurBemlacha(),
    h.gate.isAssurBemlacha(),
    h.gate.isAssurBemlacha(),
  ])
  await h.settle()
  assert.deepEqual(await all, [false, false, false])
  assert.equal(h.calls, 1)
})
