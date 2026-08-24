/**
 * החנות והוולידטור חייבים לראות אותו מפרט ואותה לוגיקה. הרצה: npm test
 *
 * הרקע: עד לאיחוד היו שני מימושים מקבילים של אותם כללים ושני עותקים של
 * המפרט, והם נסחפו זה מזה (מפת ההרשאות בחנות פיגרה ב-10 מתודות). הבדיקה
 * הזאת נכשלת אם החנות מפסיקה להישען על החבילה, או אם היא מתחילה לחסום כלל
 * מפרט שלא הוכרע כמדיניות חנות.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import validator from 'otzaria-plugin-validator'
import { PLUGIN_SDK_SPEC, validateStartupWhenConditions, checkDesignCompliance } from './pluginValidation.js'

const sha = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

test('המפרט שהחנות רואה זהה לזה שבחבילה — אותו ארטיפקט, לא עותק', () => {
  assert.equal(PLUGIN_SDK_SPEC, validator.SPEC)
  assert.equal(sha(PLUGIN_SDK_SPEC), sha(validator.SPEC))
})

test('הלוגיקה מגיעה מהחבילה ולא ממימוש מקומי', () => {
  assert.equal(validateStartupWhenConditions, validator.validateStartupWhenConditions)
  assert.equal(checkDesignCompliance, validator.checkDesignCompliance)
})

test('מפת ההרשאות של המתודות נלקחת מהמפרט במלואה', () => {
  const spec = validator.mergeWithFallback(validator.buildFallbackSpec())
  assert.equal(spec.methodPermissions.size, Object.keys(PLUGIN_SDK_SPEC.methodPermissions).length)
  for (const [method, permission] of Object.entries(PLUGIN_SDK_SPEC.methodPermissions)) {
    assert.equal(spec.methodPermissions.get(method), permission, `סחיפה ב-${method}`)
  }
})

test('כללי המניפסט שהחנות אינה חוסמת עליהם מוכרזים במפורש', () => {
  // אין כאן "מה נכון" — יש כאן "מה הוכרע". הרחבת הרשימה היא החלטת מדיניות.
  const enforcedByStore = new Set([
    'schemaVersion', 'name', 'description', 'toolTabTitle', 'permissions',
  ])
  const notEnforcedByStore = validator.ALL_MANIFEST_RULES.filter((r) => !enforcedByStore.has(r))
  assert.deepEqual(notEnforcedByStore, [
    'id', 'version', 'stability', 'appVersionRange', 'databaseSources', 'toolTabIcon',
  ])
})
