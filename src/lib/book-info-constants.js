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

// שדות ההרחבה של book_info.csv שייכים לספר (bookName), לא לשורת המחבר: אותו ערך בכל שורות הספר
export const BOOK_INFO_EXTENSION_EDITABLE_FIELDS = ['topics', 'pubDate', 'pubPlace', 'description']
export const BOOK_INFO_BOOK_LEVEL_FIELDS = [...BOOK_INFO_EXTENSION_EDITABLE_FIELDS, 'proofread']

export const BOOK_INFO_EDITABLE_FIELDS = [
  'bookName',
  'authorName',
  'generationName',
  'subGenerationName',
  'startYear',
  'endYear',
  ...BOOK_INFO_EXTENSION_EDITABLE_FIELDS
]

// proofread מחושב בשרת בלבד ואינו נערך בטופס
export const BOOK_INFO_FIELDS = [...BOOK_INFO_EDITABLE_FIELDS, 'proofread']

export const BOOK_INFO_LIMITS = {
  topicCount: 10,
  topicLength: 60,
  pubDate: 100,
  pubPlace: 100,
  description: 4000
}
