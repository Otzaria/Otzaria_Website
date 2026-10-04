export const EVENT_TYPE_LABELS = {
  search: 'חיפוש',
  results_shown: 'הצגת תוצאות',
  open: 'פתיחת תוצאה',
  dwell: 'זמן קריאה',
  vote: 'הצבעה',
}

export const EMPTY_FILTERS = Object.freeze({ from: '', to: '', type: '', model: '' })

export function formatDateTime(value) {
  if (!value) return ''
  return new Date(value).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })
}

/** תווית תצוגה למודל (משפחה + קוונטיזציה). */
export function modelLabel({ modelFamilyId, modelQuantization }) {
  if (!modelFamilyId) return 'לא ידוע'
  return modelQuantization ? `${modelFamilyId} (${modelQuantization})` : `${modelFamilyId} (ללא קוונטיזציה)`
}

/** רק מודלים עם משפחה ידועה ניתנים לסינון. */
export const selectableModels = (models) => models.filter((m) => m.modelFamilyId)

// A model's identity must survive changes in the order of the statistics rows.
export const modelValue = (model) => JSON.stringify([model.modelFamilyId, model.modelQuantization ?? null])

export function modelFromValue(value) {
  try {
    const pair = JSON.parse(value)
    if (Array.isArray(pair) && pair.length === 2 && typeof pair[0] === 'string' && pair[0] &&
        (pair[1] === null || typeof pair[1] === 'string')) {
      return { modelFamilyId: pair[0], modelQuantization: pair[1] }
    }
  } catch { /* an empty or invalid selection */ }
  return null
}

/**
 * מסננים בצורת אובייקט אחיד לשרת. model הוא זהות יציבה של משפחה וקוונטיזציה;
 * קוונטיזציה null נשלחת במפורש כ-null (= רק בלי קוונטיזציה), לא מושמטת (= כל הקוונטיזציות).
 */
export function filtersToCriteria(filters, models) {
  const criteria = {}
  if (filters.from) criteria.from = new Date(filters.from).toISOString()
  if (filters.to) criteria.to = new Date(filters.to).toISOString()
  if (filters.type) criteria.type = filters.type
  const model = filters.model === '' ? null : selectableModels(models).find((m) => modelValue(m) === filters.model) || modelFromValue(filters.model)
  if (model) {
    criteria.modelFamilyId = model.modelFamilyId
    criteria.modelQuantization = model.modelQuantization ?? null
  }
  return criteria
}

/** אותם מסננים כפרמטרי URL לייצוא (null → noQuantization=1). */
export function criteriaToSearchParams(criteria) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(criteria)) {
    if (key === 'modelQuantization' && value === null) params.set('noQuantization', '1')
    else if (value !== undefined && value !== '') params.set(key, String(value))
  }
  return params
}
