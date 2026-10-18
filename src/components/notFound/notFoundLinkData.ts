/**
 * דרכי ההמשך בדף 404 — נתונים בלבד (בלי React), כדי שהרשימה תיבדק בנפרד ותהיה מקור אחד
 * לשני ההקשרים: הדף הכללי (app/not-found.tsx) ודף הספרייה (app/library/not-found.jsx).
 *
 * כל נתיב כאן קיים בקוד: /plugins (app/plugins/page.tsx), /#download (העוגן של
 * DownloadSectionClient בדף הבית), /docs (app/docs/page.jsx), /library (app/library/page.jsx),
 * /library/books (app/library/books/page.jsx). הפעולה הראשית ("לדף הבית") אינה ברשימה —
 * היא הכפתור שמעליה.
 */

export type NotFoundLink = {
  href: string
  label: string
  description: string
  /** שם גליף של Material Symbols (חייב להיות בגופן המוקטן — npm run check:icons) */
  icon: string
}

export type NotFoundContext = 'site' | 'library'

const PLUGINS: NotFoundLink = {
  href: '/plugins',
  label: 'חנות התוספים',
  description: 'כלים ותכנים נוספים לאוצריא',
  icon: 'extension'
}

const DOWNLOAD: NotFoundLink = {
  href: '/#download',
  label: 'הורדת התוכנה',
  description: 'הגרסה העדכנית למחשב ולטלפון',
  icon: 'download'
}

const DOCS: NotFoundLink = {
  href: '/docs',
  label: 'מדריכים',
  description: 'הסברים על השימוש בתוכנה',
  icon: 'menu_book'
}

const LIBRARY: NotFoundLink = {
  href: '/library',
  label: 'הספרייה המקוונת',
  description: 'ספרי אוצריא באתר',
  icon: 'library_books'
}

const BOOKS: NotFoundLink = {
  href: '/library/books',
  label: 'רשימת הספרים',
  description: 'כל הספרים שבספרייה המקוונת',
  icon: 'auto_stories'
}

export const NOT_FOUND_LINKS: Record<NotFoundContext, readonly NotFoundLink[]> = {
  site: [PLUGINS, DOWNLOAD, DOCS, LIBRARY],
  // בתוך הספרייה — קודם דפי הספרייה עצמה
  library: [LIBRARY, BOOKS, PLUGINS, DOCS]
}

/** כתובת הדואר שבדף הפרטיות (app/privacy/page.jsx) — הערוץ הקיים ליצירת קשר באתר */
export const CONTACT_EMAIL = 'otzaria.1@gmail.com'

export const BROKEN_LINK_SUBJECT = 'קישור שבור באתר אוצריא'

/** גוף ההודעה — שורה מוכנה להדבקת כתובת הדף, כדי שלא יידרש הלוך-ושוב */
export const BROKEN_LINK_BODY = 'כתובת הדף שלא נמצא:\n'

export function brokenLinkMailto(email: string = CONTACT_EMAIL, subject: string = BROKEN_LINK_SUBJECT, body: string = BROKEN_LINK_BODY): string {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
