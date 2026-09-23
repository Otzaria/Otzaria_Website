// לוגיקה טהורה של טופס התוכנה הנלווית — משותפת לדף העלאת התוסף ולחלון העריכה
// (הרכיב עצמו: src/components/plugins/CompanionFieldset.jsx). השרת בודק הכול
// שוב ב-buildCompanionMeta; כאן רק כדי שהמשתמש יקבל את השגיאה לפני העלאה של
// מאות MB, ולא אחריה.
import { MAX_COMPANION_BYTES } from './pluginLimits.js'
import {
  companionExtOf,
  companionPlatformExtensions,
  companionPlatformLabel
} from './pluginCompanionPlatforms.js'

// ערכי הטופס ההתחלתיים. existing הוא הייצוג הציבורי (plugin.companion), או
// null לתוסף בלי תוכנה נלווית / להעלאה חדשה.
export function companionFormFromPublic(existing) {
  return {
    name: existing?.name || '',
    version: existing?.version || '',
    platform: existing?.platform || 'windows',
    installsPlugin: existing?.installsPlugin === true,
    serviceId: existing?.service?.id || '',
    serviceMinVersion: existing?.service?.minVersion || '',
    hideUnlessInstalled: existing?.service?.hideUnlessInstalled === true
  }
}

// שגיאה (בעברית) אם הקובץ אינו מתאים כמתקין לפלטפורמה, או null.
export function checkCompanionFile({ fileName, size }, platform) {
  const allowed = companionPlatformExtensions(platform)
  const ext = companionExtOf(fileName)
  if (!allowed.includes(ext)) {
    return `סיומת המתקין (${ext || 'ללא סיומת'}) אינה מתאימה ל-${companionPlatformLabel(platform)}. מותר: ${allowed.join(', ')}`
  }
  if (size > MAX_COMPANION_BYTES) {
    return `קובץ המתקין חורג מהמגבלה של ${MAX_COMPANION_BYTES / 1024 / 1024}MB`
  }
  return null
}

// שגיאה (בעברית) לפני שליחה, או null.
// hasFile: נבחר קובץ מתקין חדש. hasExisting: לתוסף כבר יש מתקין (בעריכה).
// שם בלי קובץ ובלי מתקין קיים היה נזרק בשקט — השרת אינו שומר מטא-דאטה בלי
// קובץ — ולכן זו שגיאה מפורשת.
export function validateCompanionForm(form, { hasFile, hasExisting }) {
  const name = form.name.trim()
  if (!hasFile && !hasExisting) {
    if (name) return 'צורף שם תוכנה נלווית בלי קובץ מתקין. יש לצרף את המתקין או לרוקן את השם'
    return null
  }
  if (!name) return 'יש למלא את שם התוכנה הנלווית — הוא מוצג למשתמש בדף התוסף'
  if (form.hideUnlessInstalled && !form.serviceId.trim()) {
    return 'כדי להסתיר את התוסף ממי שהתוכנה אינה מותקנת אצלו יש למלא מזהה שירות'
  }
  return null
}

// השדות שנשלחים לשרת. file אופציונלי — בלעדיו (בעריכה) נערכת המטא-דאטה של
// המתקין הקיים.
export function appendCompanionFields(formData, form, file) {
  if (file) formData.append('companionFile', file)
  formData.append('companionName', form.name.trim())
  formData.append('companionVersion', form.version.trim())
  formData.append('companionPlatform', form.platform)
  formData.append('companionInstallsPlugin', form.installsPlugin ? 'true' : 'false')
  formData.append('companionServiceId', form.serviceId.trim())
  formData.append('companionServiceMinVersion', form.serviceMinVersion.trim())
  formData.append('companionHideUnlessInstalled', form.hideUnlessInstalled ? 'true' : 'false')
}
