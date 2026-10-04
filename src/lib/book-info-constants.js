// חמשת הדורות שאפליקציית אוצריא מכירה; דור אחר מוצג בה כמו ספר בלי דור
export const BOOK_INFO_GENERATION_OPTIONS = [
  'תורה שבכתב',
  'חז"ל',
  'ראשונים',
  'אחרונים',
  'מחברי זמננו'
]

export const BOOK_INFO_SUB_GENERATION_OPTIONS_BY_GENERATION = {
  'תורה שבכתב': [],
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
