// עיצוב תאריך אחיד למסכי ניהול התוספים (he-IL, כולל שעה) — עם הגנה מפני ערך ריק.
// מאחד את שתי המימושים הזהים שהיו בעמוד (formatDate ו-formatRatingDate).
export function formatAdminDate(value) {
  if (!value) return ''
  return new Date(value).toLocaleDateString('he-IL', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}
