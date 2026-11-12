/**
 * הודעה בעברית לפי קוד סטטוס, כשהשרת (או פרוקסי/CDN/מסנן) החזיר תשובה שאינה JSON.
 */
export function describeNonJsonStatus(status) {
  switch (status) {
    case 413: return 'הקובץ גדול מדי לשרת (413)'
    case 502: case 503: return `השרת אינו זמין כרגע (${status}) — נסו שוב בעוד רגע`
    case 504: case 408: return `פג הזמן המוקצב לפעולה (${status}) — ייתכן שהקובץ גדול מדי להמרה בבקשה אחת`
    default:
      return status >= 500
        ? `שגיאת שרת (${status})`
        : `השרת החזיר תשובה לא תקינה (${status}) — ייתכן שחסם אותה מסנן או פרוקסי`
  }
}

/**
 * קורא גוף תשובה כ-JSON; אם זה לא JSON (למשל דף HTML של nginx/מסנן) —
 * מחזיר אובייקט `{ success: false, error }` עם הודעה ברורה במקום לזרוק SyntaxError.
 */
export async function parseJsonResponse(response) {
  const text = await response.text()
  try {
    return JSON.parse(text)
  } catch {
    return { success: false, error: describeNonJsonStatus(response.status), nonJson: true }
  }
}
