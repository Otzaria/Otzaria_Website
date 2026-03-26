import {
  BOOK_INFO_EDITABLE_FIELDS,
  BOOK_INFO_GENERATION_OPTIONS,
  BOOK_INFO_SUB_GENERATION_OPTIONS_BY_GENERATION
} from '@/lib/book-info-constants'

function asNullableString(value) {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function asNullableNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return null
  }
  return parsed
}

export function mergeBookInfoWithPending(book, pending) {
  if (!pending?.changes) {
    return { ...book }
  }
  return {
    ...book,
    ...pending.changes
  }
}

export function normalizeBookInfoUpdates(rawUpdates = {}) {
  const updates = {}
  const errors = []

  for (const field of BOOK_INFO_EDITABLE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(rawUpdates, field)) {
      continue
    }

    const value = rawUpdates[field]

    if (field === 'bookName' || field === 'authorName') {
      const normalized = asNullableString(value)
      if (field === 'bookName' && !normalized) {
        errors.push('שם הספר הוא שדה חובה')
      } else {
        updates[field] = normalized || ''
      }
      continue
    }

    if (field === 'generationName') {
      const normalized = asNullableString(value)
      if (!normalized) {
        updates[field] = null
      } else if (!BOOK_INFO_GENERATION_OPTIONS.includes(normalized)) {
        errors.push('ערך דור מחבר לא תקין')
      } else {
        updates[field] = normalized
      }
      continue
    }

    if (field === 'subGenerationName') {
      const normalized = asNullableString(value)
      updates[field] = normalized || null
      continue
    }

    if (field === 'startYear' || field === 'endYear') {
      const normalized = asNullableNumber(value)
      if (value !== null && value !== undefined && value !== '' && normalized === null) {
        errors.push(`ערך לא תקין בשדה ${field}`)
      } else {
        updates[field] = normalized
      }
      continue
    }
  }

  if (
    Object.prototype.hasOwnProperty.call(updates, 'startYear') &&
    Object.prototype.hasOwnProperty.call(updates, 'endYear')
  ) {
    const start = updates.startYear
    const end = updates.endYear
    if (start !== null && end !== null && start > end) {
      errors.push('שנת התחלה לא יכולה להיות גדולה משנת סיום')
    }
  }

  const effectiveGenerationName = Object.prototype.hasOwnProperty.call(updates, 'generationName')
    ? updates.generationName
    : asNullableString(rawUpdates.generationName)
  const effectiveSubGenerationName = Object.prototype.hasOwnProperty.call(updates, 'subGenerationName')
    ? updates.subGenerationName
    : asNullableString(rawUpdates.subGenerationName)

  if (effectiveGenerationName === 'מחברי זמננו' && !effectiveSubGenerationName) {
    updates.subGenerationName = 'מחברי זמננו'
  }

  const normalizedSubGenerationName =
    Object.prototype.hasOwnProperty.call(updates, 'subGenerationName')
      ? updates.subGenerationName
      : effectiveSubGenerationName

  if (normalizedSubGenerationName) {
    const allowedSubGenerations =
      BOOK_INFO_SUB_GENERATION_OPTIONS_BY_GENERATION[effectiveGenerationName] || []
    if (!effectiveGenerationName || !allowedSubGenerations.includes(normalizedSubGenerationName)) {
      errors.push('דור המשנה לא תואם לדור שנבחר')
    }
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'generationName') && !effectiveGenerationName) {
    updates.subGenerationName = null
  }

  return { updates, errors }
}

export function buildDiff(baseDoc, updates) {
  const diff = {}
  for (const field of BOOK_INFO_EDITABLE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(updates, field)) {
      continue
    }

    const nextValue = updates[field]
    const currentValue =
      baseDoc[field] === undefined || baseDoc[field] === '' ? null : baseDoc[field]
    const normalizedNext = nextValue === '' ? null : nextValue

    if (currentValue !== normalizedNext) {
      diff[field] = nextValue
    }
  }
  return diff
}

export function getChangedFields(changes = {}) {
  const source =
    changes && typeof changes.toObject === 'function'
      ? changes.toObject({ minimize: false })
      : changes

  return BOOK_INFO_EDITABLE_FIELDS.filter((field) => source?.[field] !== undefined)
}

export function escapeCsvValue(value) {
  if (value === null || value === undefined) {
    return ''
  }
  const stringValue = String(value)
  if (
    stringValue.includes(',') ||
    stringValue.includes('"') ||
    stringValue.includes('\n') ||
    stringValue.includes('\r')
  ) {
    return `"${stringValue.replace(/"/g, '""')}"`
  }
  return stringValue
}
