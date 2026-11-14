// נקודות החיבור של תוספי שירות לנתיבים הוותיקים (עריכה, אישור, הורדה, עדכונים).
// טהור בכוונה (ללא ייבוא) — נטען גם ע"י node --test וגם מקוד שרת.

export function isServicePlugin(plugin) {
  return plugin?.hasService === true
}

export function serviceManageUrl(pluginId) {
  return `/plugins/${pluginId}/service`
}

export function pluginStoreUrl(pluginId) {
  return `/plugins/${pluginId}`
}

export const SERVICE_BLOCK_MESSAGES = {
  edit: 'זהו תוסף שירות: עדכון הקובץ והפרטים נעשה רק בהגשה לבדיקה מדף ניהול השירות. עריכה ישירה אינה זמינה, גם למנהלים.',
  approve: 'זהו תוסף שירות: הוא מתפרסם רק בסיום בדיקה בתהליך תוספי השירות, ולא באישור ידני.',
  unapprove: 'זהו תוסף שירות: ביטול אישור אינו זמין עבורו. כדי להסיר אותו מהחנות יש להשהות אותו.',
  deleteVersion: 'לא ניתן למחוק גרסה של תוסף שירות: היסטוריית הגרסאות שלו קשורה לדוחות הבדיקה.',
  deleteWhileReviewing: 'לתוסף השירות יש בדיקה בתור או בריצה. יש לבטל אותה בניהול תוספי השירות ורק אז למחוק.',
  historicalInstall: 'התקנה ישירה של גרסה קודמת אינה זמינה לתוסף שירות. אפשר להתקין את הגרסה הנוכחית מדף התוסף.'
}

const SERVICE_BLOCK_CODES = {
  edit: 'service_plugin_edit_blocked',
  approve: 'service_plugin_approve_blocked',
  unapprove: 'service_plugin_unapprove_blocked',
  deleteVersion: 'service_plugin_version_delete_blocked',
  deleteWhileReviewing: 'service_plugin_review_in_progress'
}

// גוף תשובת 409 לנתיב ותיק שנחסם לתוסף שירות
export function serviceBlockedBody(kind, pluginId) {
  return { error: SERVICE_BLOCK_MESSAGES[kind], code: SERVICE_BLOCK_CODES[kind], serviceUrl: serviceManageUrl(pluginId) }
}

// קובץ התוסף של תוסף שירות באחסון הבדיקות: הנוכחי, או גרסה היסטורית מפורשת שיש לה reviewId.
// null כשאין קובץ כזה (טרם פורסם, או גרסה ותיקה בלי reviewId).
export function resolveServicePluginFile(plugin, { version = null } = {}) {
  if (!isServicePlugin(plugin)) return null
  if (!version || version === plugin.version) {
    const reviewId = plugin.serviceState?.currentPluginReview
    if (!reviewId) return null
    return {
      reviewId: String(reviewId),
      version: plugin.version,
      size: plugin.pluginFileSize || 0,
      sha256: plugin.pluginFileSha256 || null,
      fileName: plugin.pluginFileName || ''
    }
  }
  const entry = (plugin.versions || []).find((v) => v.version === version && v.reviewId)
  if (!entry) return null
  return {
    reviewId: String(entry.reviewId),
    version: entry.version,
    size: entry.pluginFileSize || 0,
    sha256: entry.pluginFileSha256 || null,
    fileName: entry.pluginFileName || plugin.pluginFileName || ''
  }
}
