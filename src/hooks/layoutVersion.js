// גרסת פריסת המילים של עמוד, קשורה למזהה העמוד שלה (useLocalWordBoxes).
// רשומה: { pageId, version }. תשובת שמירה של עמוד קודם שמגיעה אחרי מעבר עמוד לא דורסת את
// גרסת העמוד הנוכחי.

// הגרסה הצפויה לשליחה בשמירה של pageId — 0 אם הרשומה שייכת לעמוד אחר
export function versionFor(record, pageId) {
  return record && record.pageId === pageId ? record.version : 0
}

// הרשומה אחרי שמירה מוצלחת של pageId שהשרת החזיר בה version. אם בינתיים עברו לעמוד אחר —
// הרשומה לא משתנה.
export function nextVersionRecord(record, pageId, version) {
  if (!record || record.pageId !== pageId) return record
  return { pageId, version: version ?? record.version }
}
