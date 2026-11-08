import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  moveItem, reorderList, toLayoutPlugin, settingsSnapshot, settingsDirty, hiddenReason, visibleInCategory,
  clientSlugify, hasHebrew, initialCategoryForm, categoryFormErrors, categoryPayload, categoryFormDirty, categoryPluginsDirty, movedNotice,
} from './storeLayout.js'

test('הזזה בחיצים: החלפה עם השכן, ובקצוות — בלי שינוי', () => {
  assert.deepEqual(moveItem(['a', 'b', 'c'], 0, 1), ['b', 'a', 'c'])
  assert.deepEqual(moveItem(['a', 'b', 'c'], 2, -1), ['a', 'c', 'b'])
  const list = ['a', 'b']
  assert.equal(moveItem(list, 0, -1), list)
  assert.equal(moveItem(list, 1, 1), list)
})

test('גרירה: העברה למקום יעד; אינדקס לא חוקי — בלי שינוי', () => {
  assert.deepEqual(reorderList(['a', 'b', 'c', 'd'], 0, 2), ['b', 'c', 'a', 'd'])
  assert.deepEqual(reorderList(['a', 'b', 'c', 'd'], 3, 0), ['d', 'a', 'b', 'c'])
  const list = ['a']
  assert.equal(reorderList(list, 0, 5), list)
})

test('תוסף מרשימת הניהול', () => {
  assert.deepEqual(toLayoutPlugin({ _id: 'x', name: 'n', version: '1', status: 'beta', image: { ext: '.png' }, isSuspended: true }), {
    id: 'x', name: 'n', version: '1', status: 'beta', isApproved: true, isHidden: false, isSuspended: true, downloadCount: 0, image: '/api/plugins/x/image',
  })
  assert.equal(toLayoutPlugin({ _id: 'y', image: {} }).image, null)
})

test('שינוי שלא נשמר בנבחרים ובכותרות', () => {
  const saved = settingsSnapshot({ featuredPlugins: [{ id: 'a' }, { id: 'b' }], homeTitle: 'כ' })
  const state = { featured: [{ id: 'a' }, { id: 'b' }], homeTitle: 'כ', homeSubtitle: '' }
  assert.equal(settingsDirty(saved, state), false)
  assert.equal(settingsDirty(saved, { ...state, featured: [{ id: 'b' }, { id: 'a' }] }), true)
  assert.equal(settingsDirty(saved, { ...state, homeSubtitle: 'x' }), true)
  assert.deepEqual(settingsSnapshot(null), { plugins: [], ids: [], homeTitle: '', homeSubtitle: '' })
  // "בטל שינויים" מחזיר את התוספים עצמם, גם מי שכבר אינו ברשימת המאושרים
  assert.deepEqual(saved.plugins, [{ id: 'a' }, { id: 'b' }])
})

test('מה לא יוצג בפועל', () => {
  assert.equal(hiddenReason({ isApproved: true }), null)
  assert.match(hiddenReason({ isApproved: false }), /לא מאושר/)
  assert.match(hiddenReason({ isApproved: true, isHidden: true }), /מוסתר/)
  assert.match(hiddenReason({ isApproved: true, isSuspended: true }), /מושהה/)
  assert.equal(visibleInCategory({ plugins: [{ isApproved: true }, { isApproved: true, isSuspended: true }] }), 1)
})

test('טופס הקטגוריה: כתובת, שגיאות בעברית, ומה נשלח', () => {
  assert.equal(clientSlugify('  Study Tools!! '), 'study-tools')
  assert.equal(clientSlugify('כלים'), '')
  assert.equal(hasHebrew('כלים'), true)
  const form = initialCategoryForm(null)
  assert.equal(form.isVisible, true)
  assert.equal(form.sortMode, 'rating')
  assert.deepEqual(Object.keys(categoryFormErrors(form)).sort(), ['name', 'slug'])
  assert.match(categoryFormErrors({ ...form, name: 'כלים' }).slug, /באנגלית/)
  assert.match(categoryFormErrors({ ...form, name: 'a', slug: 'Bad Slug' }).slug, /קטנות/)
  assert.deepEqual(categoryFormErrors({ ...form, name: 'a', slug: 'a-b' }), {})
  assert.ok(categoryFormErrors({ ...form, name: 'a', slug: 'a', showOnHome: true, homeLimit: 20 }).homeLimit)
  assert.deepEqual(categoryPayload({ ...form, name: ' a ', slug: 'a', homeLimit: '7', manualTopCount: '' }), {
    name: 'a', slug: 'a', description: '', icon: '', showOnHome: false, homeLimit: 7, sortMode: 'rating', manualTopCount: 0,
  })
  const category = { name: 'x', slug: 'x', isVisible: false, sortMode: 'manual' }
  assert.equal(initialCategoryForm(category).isVisible, false)
  assert.equal(categoryFormDirty(initialCategoryForm(category), category), false)
  assert.equal(categoryFormDirty({ ...initialCategoryForm(category), name: 'y' }, category), true)
  // מחרוזת מהשדה מול מספר מהשרת, ורווח בקצה: לא נחשבים שינוי
  const stored = { name: 'x', slug: 'x', homeLimit: 7, manualTopCount: 2, showOnHome: true }
  assert.equal(categoryFormDirty({ ...initialCategoryForm(stored), homeLimit: '7', manualTopCount: '2' }, stored), false)
  assert.equal(categoryFormDirty({ ...initialCategoryForm(stored), name: 'x ' }, stored), false)
  assert.equal(categoryFormDirty({ ...initialCategoryForm(stored), homeLimit: '8' }, stored), true)
  // אחרי שמירה ההשוואה היא מול הטופס שנשמר
  const typed = { ...initialCategoryForm(stored), homeLimit: '9' }
  assert.equal(categoryFormDirty(typed, typed), false)
  assert.equal(categoryPluginsDirty([{ id: 'a' }, { id: 'b' }], [{ id: 'a' }, { id: 'b' }]), false)
  assert.equal(categoryPluginsDirty([{ id: 'b' }, { id: 'a' }], [{ id: 'a' }, { id: 'b' }]), true)
  assert.equal(movedNotice('א', 1, 3), '״א״ הועבר למקום 2 מתוך 3')
})
