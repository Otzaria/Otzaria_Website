// הקרנת הייצוג הציבורי של תוסף (פלט formatPluginForPublic) לשדות שכרטיס
// תוסף (src/components/plugins/PluginCard.tsx) וההתקנה הישירה צריכים בפועל.
//
// למה: דפי החנות (בית, קטגוריה, כל התוספים) הם Server Components שמעבירים
// את רשימת התוספים כ-props לרכיב לקוח — וכל שדה ב-props נשלח פעמיים לדפדפן:
// פעם כ-HTML ופעם ב-payload של ה-hydration. הייצוג המלא כולל גם את רשימת
// כל הגרסאות (עם קישורי הורדה ותאימות לכל אחת), צילומי מסך, תיאור מלא
// ושדות פנימיים שאף כרטיס אינו מציג.
//
// ה-API הציבורי (/api/plugins, store-home, categories/[slug]) לא משתמש בזה
// וממשיך להחזיר את הייצוג המלא.

export const PLUGIN_CARD_FIELDS = [
  'id',
  'name',
  'shortDescription',
  'version',
  'status',
  'image',
  'downloadUrl',
  'supportsDirectInstall',
  'tags',
  'downloadCount',
  'ratingAvg',
  'ratingCount',
  'fileUpdatedAt',
  'originalDate',
  'updatedAt'
]

// includeDescription: לדף "כל התוספים", שהחיפוש המקומי שלו (pluginFilter.js)
// מחפש גם בתיאור המלא.
export function toPluginCardData(plugin, { includeDescription = false } = {}) {
  const card = {}
  for (const field of PLUGIN_CARD_FIELDS) {
    if (plugin[field] !== undefined) card[field] = plugin[field]
  }
  if (includeDescription) card.description = plugin.description ?? ''
  return card
}
