export const BOOK_INFO_GENERATION_OPTIONS = [
  'חז"ל',
  'ראשונים',
  'אחרונים',
  'מחברי זמננו'
]

export const BOOK_INFO_SUB_GENERATION_OPTIONS_BY_GENERATION = {
  'חז"ל': ['תקופת המקרא', 'חז"ל', 'תנאים', 'אמוראים'],
  ראשונים: ['גאונים', 'ראשוני הראשונים', 'אחרוני הראשונים'],
  אחרונים: ['ראשוני האחרונים', 'אחרוני האחרונים', 'ראשי הישיבות'],
  'מחברי זמננו': ['מחברי זמננו']
}

export const BOOK_INFO_SUB_GENERATION_OPTIONS = Object.values(
  BOOK_INFO_SUB_GENERATION_OPTIONS_BY_GENERATION
).flat()

export const BOOK_INFO_EDITABLE_FIELDS = [
  'bookName',
  'authorName',
  'generationName',
  'subGenerationName',
  'startYear',
  'endYear'
]
