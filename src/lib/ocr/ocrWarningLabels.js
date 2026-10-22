// תוויות בעברית לקודי האזהרה של נתוני הפריסה/העזר בתוצאת OCR מקומי (pages[].warnings[].code
// מהעובד, ואזהרות שהאתר מוסיף בקליטה). מודול טהור בלי imports — נטען גם בשרת (נתיב הקריאה
// /api/page-content/ocr-data) וגם בדפדפן (ocrJobView.js). קוד שאינו מוכר מוצג כקוד חשוף.

export const OCR_WARNING_LABELS = Object.freeze({
  layout_alts_trimmed: 'הצעות החלופות של העמוד הושמטו כדי לעמוד במגבלת הגודל',
  layout_too_large: 'נתוני הפריסה של העמוד גדולים מהמותר ולא נשמרו; הטקסט נקלט כרגיל',
  layout_dropped_result_size: 'נתוני הפריסה הושמטו כדי שהתוצאה כולה תעמוד במגבלת הגודל (100MB)',
  layout_geometry_unknown: 'אין מידע על עיבוד התמונה (יישור/השטחה), ולכן אי אפשר למקם את השורות על התמונה',
  layout_build_failed: 'בניית נתוני הפריסה נכשלה; הטקסט נקלט כרגיל',
  layout_invalid_shape: 'נתוני הפריסה שהתקבלו פגומים ולא נשמרו',
  layout_invalid: 'נתוני הפריסה של העמוד לא תקינים; נשמרו לבירור בלבד, והטקסט נקלט כרגיל',
  layout_version_unsupported: 'גרסת נתוני הפריסה אינה נתמכת באתר; הנתונים נשמרו כפי שהם, והטקסט נקלט כרגיל',
  layout_image_mismatch: 'נתוני הפריסה שייכים לתמונה אחרת מזו שהייתה בעמוד ביצירת העבודה',
  metadata_too_large: 'נתוני העזר של העמוד גדולים מהמותר ולא נשמרו',
  // מהשירות המקומי: warnings/metadata פגומים הוסרו מאותו עמוד בלבד, הטקסט וכל השאר נשמרו
  warnings_invalid_shape: 'חלק מהאזהרות שהתקבלו לעמוד היו פגומות ולא נשמרו; הטקסט נקלט כרגיל',
  metadata_invalid_shape: 'נתוני העזר של העמוד שהתקבלו היו פגומים (כולם או חלקם) ולא נשמרו; הטקסט נקלט כרגיל',
});

/** קוד אזהרה → תווית בעברית; קוד שאינו מוכר — "אזהרה שאינה מוכרת לאתר (<code>)" */
export function ocrWarningLabel(code) {
  if (typeof code === 'string' && Object.hasOwn(OCR_WARNING_LABELS, code)) return OCR_WARNING_LABELS[code];
  return typeof code === 'string' && code ? `אזהרה שאינה מוכרת לאתר (${code})` : 'אזהרה שאינה מוכרת לאתר';
}
