/**
 * בדיקות תנאי `when` על תרומות contributes.startup. הרצה: npm test
 *
 * המטרה: תוסף עם when שבור ייחסם בהגשה לחנות, ותוסף בלי when כלל לא ייפגע.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateStartupWhenConditions } from './pluginValidation.js'

/** מניפסט מדומה עם תרומת שורת פקדים אחת הנושאת את התנאי הנבדק */
function manifestWithWhen(when, { minAppVersion = '0.9.97' } = {}) {
  return {
    minAppVersion,
    contributes: { startup: { toolbarItems: [{ id: 'a', label: 'א', when }] } }
  }
}

test('תוסף בלי when כלל אינו נבדק', () => {
  assert.deepEqual(validateStartupWhenConditions({}), [])
  assert.deepEqual(validateStartupWhenConditions({ contributes: {} }), [])
  assert.deepEqual(
    validateStartupWhenConditions({
      minAppVersion: '0.9.89',
      contributes: {
        startup: {
          toolbarItems: [{ id: 'a', label: 'א' }],
          activationEvents: ['app.startup']
        }
      }
    }),
    []
  )
})

test('when תקין — עלים וקומבינטורים', () => {
  assert.deepEqual(
    validateStartupWhenConditions(manifestWithWhen({
      setting: { key: 'key-dark-mode', equals: true }
    })),
    []
  )
  assert.deepEqual(
    validateStartupWhenConditions(manifestWithWhen({
      storage: { key: 'showButton', exists: true }
    })),
    []
  )
  assert.deepEqual(
    validateStartupWhenConditions(manifestWithWhen({
      all: [
        { setting: { key: 'key-font-size', notEquals: 16 } },
        { not: { any: [{ storage: { key: 'a', equals: null } }] } }
      ]
    })),
    []
  )
})

test('when נבדק בכל שלוש קטגוריות התרומות', () => {
  for (const field of ['toolbarItems', 'contextMenuItems', 'searchDialogItems']) {
    const errors = validateStartupWhenConditions({
      minAppVersion: '0.9.97',
      contributes: { startup: { [field]: [{ id: 'a', when: { setting: {} } }] } }
    })
    assert.equal(errors.length, 1)
    assert.match(errors[0], new RegExp(`^contributes\\.startup\\.${field}: when לא תקין`))
  }
})

test('שגיאות סכימה', () => {
  const cases = [
    [{}, 'exactly one of setting, storage, all, any, not'],
    [{ setting: { key: 'key-dark-mode' }, storage: { key: 'a', exists: true } },
      'exactly one of setting, storage, all, any, not'],
    ['key-dark-mode', 'when must be an object'],
    [{ unless: { key: 'a' } }, 'unsupported when operator "unless"'],
    [{ setting: { key: 'key-dark-mode', wen: true } }, 'unsupported when field "wen"'],
    [{ setting: { key: 'key-dark-mode' } }, 'exactly one of equals, notEquals, exists'],
    [{ setting: { key: 'key-dark-mode', equals: true, exists: true } },
      'exactly one of equals, notEquals, exists'],
    [{ setting: { key: '', equals: true } }, 'non-empty string of up to 128 characters'],
    [{ setting: { key: 'k'.repeat(129), equals: true } },
      'non-empty string of up to 128 characters'],
    [{ setting: { key: 'key-dark-mode', exists: 'yes' } }, 'when exists must be a bool'],
    [{ storage: { key: 'a', equals: { nested: 1 } } },
      'string, number or bool'],
    [{ all: [] }, 'all must be a non-empty array of conditions'],
    [{ any: { setting: { key: 'key-dark-mode', equals: true } } },
      'any must be a non-empty array of conditions'],
    [{ setting: 'key-dark-mode' }, 'when leaf must be an object with a key']
  ]
  for (const [when, expected] of cases) {
    const errors = validateStartupWhenConditions(manifestWithWhen(when))
    assert.equal(errors.length, 1, `נצפתה שגיאה אחת עבור ${JSON.stringify(when)}`)
    assert.ok(
      errors[0].includes(expected),
      `"${errors[0]}" אמור להכיל "${expected}"`
    )
  }
})

test('עומק מעל 5 ויותר מ-20 עלים נדחים', () => {
  // 6 רמות: not/not/not/not/not/setting
  let deep = { setting: { key: 'key-dark-mode', equals: true } }
  for (let i = 0; i < 5; i++) deep = { not: deep }
  const deepErrors = validateStartupWhenConditions(manifestWithWhen(deep))
  assert.equal(deepErrors.length, 1)
  assert.ok(deepErrors[0].includes('when is nested too deeply'))

  const leaves = Array.from({ length: 21 }, (_, i) => ({
    storage: { key: `k${i}`, exists: true }
  }))
  const wideErrors = validateStartupWhenConditions(manifestWithWhen({ all: leaves }))
  assert.equal(wideErrors.length, 1)
  assert.ok(wideErrors[0].includes('non-empty array of conditions'))

  // 20 עלים מותרים, 21 בשני ענפים חוצים את התקרה
  const half = (from, count) => Array.from({ length: count }, (_, i) => ({
    storage: { key: `k${from + i}`, exists: true }
  }))
  assert.deepEqual(
    validateStartupWhenConditions(manifestWithWhen({
      all: [{ any: half(0, 10) }, { any: half(10, 10) }]
    })),
    []
  )
  const overflow = validateStartupWhenConditions(manifestWithWhen({
    all: [{ any: half(0, 11) }, { any: half(11, 10) }]
  }))
  assert.equal(overflow.length, 1)
  assert.ok(overflow[0].includes('when has too many conditions'))
})

test('עלה setting עם מפתח שאינו זמין לתוספים נחסם', () => {
  const errors = validateStartupWhenConditions(manifestWithWhen({
    setting: { key: 'key-library-path', equals: true }
  }))
  assert.equal(errors.length, 1)
  assert.ok(errors[0].includes('when קורא הגדרה שאינה זמינה לתוספים ("key-library-path")'))

  // מפתח storage באותו שם מותר — אחסון התוסף אינו כפוף ל-allowlist
  assert.deepEqual(
    validateStartupWhenConditions(manifestWithWhen({
      storage: { key: 'key-library-path', equals: true }
    })),
    []
  )
})

test('activationEvents: מפתח לא מוכר כמו "wen" נדחה', () => {
  const errors = validateStartupWhenConditions({
    minAppVersion: '0.9.97',
    contributes: {
      startup: {
        activationEvents: [
          'app.startup',
          { topic: 'reader.sectionContentChanged', wen: { storage: { key: 'a', exists: true } } }
        ]
      }
    }
  })
  assert.equal(errors.length, 1)
  assert.ok(errors[0].includes('שדה לא מוכר "wen"'))
})

test('activationEvents: when תקין ובלתי-תקין', () => {
  const startupWith = (entry) => ({
    minAppVersion: '0.9.97',
    contributes: { startup: { activationEvents: ['app.startup', entry] } }
  })
  assert.deepEqual(
    validateStartupWhenConditions(startupWith({
      topic: 'reader.sectionContentChanged',
      when: { storage: { key: 'autoSync', equals: true } }
    })),
    []
  )
  const errors = validateStartupWhenConditions(startupWith({
    topic: 'reader.sectionContentChanged',
    when: { storage: { key: 'autoSync' } }
  }))
  assert.equal(errors.length, 1)
  assert.match(errors[0], /^contributes\.startup\.activationEvents: when לא תקין/)
})

test('when דורש minAppVersion 0.9.97 לפחות', () => {
  const errors = validateStartupWhenConditions(manifestWithWhen(
    { setting: { key: 'key-dark-mode', equals: true } },
    { minAppVersion: '0.9.96' }
  ))
  assert.equal(errors.length, 1)
  assert.ok(errors[0].includes('תנאי when נתמך החל מגרסה 0.9.97'))
  assert.ok(errors[0].includes('0.9.96'))

  // minAppVersion חדש יותר תקין; חסר מדווח כ-0.0.0 ולא מקרוס
  assert.deepEqual(
    validateStartupWhenConditions(manifestWithWhen(
      { setting: { key: 'key-dark-mode', equals: true } },
      { minAppVersion: '1.0.0' }
    )),
    []
  )
  const missing = validateStartupWhenConditions({
    contributes: {
      startup: {
        toolbarItems: [{ id: 'a', when: { setting: { key: 'key-dark-mode', equals: true } } }]
      }
    }
  })
  assert.equal(missing.length, 1)
  assert.ok(missing[0].includes('0.0.0'))
})
