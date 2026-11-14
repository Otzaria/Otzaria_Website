// סינון מקומי (בצד הלקוח) של רשימת "כל התוספים" — חולץ מ-src/app/plugins/all
// כדי שהלוגיקה תהיה ניתנת לבדיקה בנפרד מהקומפוננטה (ראו pluginFilter.test.mjs).
//
// שלושת התנאים הם AND: חיפוש חופשי (שם/תיאור קצר/תיאור מלא/תגית), סטטוס
// מדויק, ותגית מדויקת. 'all' משמעו "בלי סינון" עבור סטטוס/תגית.

export function filterPlugins(plugins, { searchQuery = '', statusFilter = 'all', activeTag = 'all' } = {}) {
  let filtered = plugins

  if (searchQuery) {
    const query = searchQuery.toLowerCase()
    filtered = filtered.filter(plugin =>
      plugin.name.toLowerCase().includes(query) ||
      plugin.shortDescription.toLowerCase().includes(query) ||
      plugin.description.toLowerCase().includes(query) ||
      plugin.tags?.some(tag => tag.toLowerCase().includes(query))
    )
  }

  if (statusFilter !== 'all') {
    filtered = filtered.filter(plugin => plugin.status === statusFilter)
  }

  if (activeTag !== 'all') {
    filtered = filtered.filter(plugin => plugin.tags?.includes(activeTag))
  }

  return filtered
}

// מיון הרשימה: 'recommended' — הסדר שהשרת החזיר (הנבחרים ואחריהם מהחדש לישן); 'newest' — לפי
// מועד הפרסום הראשון; 'updated' — לפי החלפת קובץ התוסף האחרונה. תוסף בלי תאריך — בסוף.
export const SORT_MODES = ['recommended', 'newest', 'updated']

const SORT_DATE_FIELD = { newest: 'publishedAt', updated: 'fileUpdatedAt' }

export function sortPlugins(plugins, sortMode = 'recommended') {
  const field = SORT_DATE_FIELD[sortMode]
  if (!field) return plugins
  // השוואת מחרוזות: גם ISO מלא וגם YYYY-MM-DD ממוינים נכון כטקסט. sort יציב — שוויון שומר על סדר השרת.
  return [...plugins].sort((a, b) => (b[field] || '').localeCompare(a[field] || ''))
}

// כמה תוספים משויכים לכל תגית — Map של תגית → מספר. תגית כפולה באותו תוסף נספרת פעם אחת.
export function countTags(plugins) {
  const counts = new Map()
  plugins.forEach(plugin => {
    new Set(plugin.tags || []).forEach(tag => counts.set(tag, (counts.get(tag) || 0) + 1))
  })
  return counts
}

// תגית התאמה ולא נושא: "מראה תואם לאוצריא" (OTZARIA_DESIGN_TAG ב-pluginValidation.js, שמתווספת
// אוטומטית לתוסף שעומד בהנחיות העיצוב), והווריאציות הידניות שלה בנתונים — "עיצוב תואם לאוצריא",
// "מראה תואם אוצריא", "תואם אוצריא". בתצוגה בלבד: הן לא נכנסות לתגיות הנפוצות, ומופיעות בסוף.
const COMPATIBILITY_TAG_RE = /תואם\s*ל?\s*אוצריא/
export function isCompatibilityTag(tag) {
  return COMPATIBILITY_TAG_RE.test(tag || '')
}

// כל התגיות לפי שכיחות (הנפוצה ראשונה), ובשוויון — א"ב עברי. [{ tag, count }]. תגיות ההתאמה
// (isCompatibilityTag) — אחרי כל תגיות הנושא, באותו סדר ביניהן.
// מסנן התגיות בדף "כל התוספים" מציג את הראשונות כ"נפוצות", ואת כולן בתפריט "כל התגיות".
export function rankTags(plugins) {
  return Array.from(countTags(plugins), ([tag, count]) => ({ tag, count }))
    .sort((a, b) =>
      Number(isCompatibilityTag(a.tag)) - Number(isCompatibilityTag(b.tag)) ||
      b.count - a.count ||
      a.tag.localeCompare(b.tag, 'he')
    )
}

// התגיות שמוצגות כשבבים: N תגיות הנושא הראשונות בדירוג (בלי תגיות התאמה). התגית הפעילה תמיד
// גלויה — אם היא לא ביניהן (תגית התאמה, או בכלל לא ברשימה, למשל מקישור ישן), היא נוספת ראשונה.
export function popularTags(ranked, activeTag = 'all', limit = 8) {
  const top = ranked.filter(t => !isCompatibilityTag(t.tag)).slice(0, limit)
  if (activeTag === 'all' || top.some(t => t.tag === activeTag)) return top
  const active = ranked.find(t => t.tag === activeTag) || { tag: activeTag, count: 0 }
  return [active, ...top]
}

// חיפוש בתוך רשימת התגיות (תפריט "כל התגיות"): התאמה חלקית, בלי תלות ברישיות וברווחים בקצוות.
export function searchTags(tags, query) {
  const q = (query || '').trim().toLowerCase()
  if (!q) return tags
  return tags.filter(t => t.tag.toLowerCase().includes(q))
}
