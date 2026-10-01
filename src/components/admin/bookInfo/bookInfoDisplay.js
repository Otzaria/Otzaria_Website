/** תוויות ותצוגת ערכים משותפות לרכיבי ניהול "מידע על ספרים". */

export const BOOK_INFO_FIELD_LABELS = {
  bookName: 'שם הספר',
  authorName: 'שם המחבר',
  generationName: 'דור המחבר',
  subGenerationName: 'דור משנה',
  startYear: 'תחילת התקופה',
  endYear: 'סיום התקופה'
}

export function formatBookInfoValue(value) {
  if (value === null || value === undefined || value === '') {
    return '-'
  }
  return String(value)
}
