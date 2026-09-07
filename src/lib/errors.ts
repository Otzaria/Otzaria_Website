/** מחלץ הודעת שגיאה קריאה למשתמש מ-`unknown` שהתפס ב-catch, עם נופל-חזרה קבוע. */
export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}
