// מחלץ הודעת שגיאה קריאה מ-unknown (כפי שמגיע מ-catch), עם ברירת מחדל
// כשאין Error עם הודעה
export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return fallback
}
