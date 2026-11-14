// לוגיקה טהורה של עמוד התוסף (בלי React) — מה מוצג ובאיזה סדר. טסט: pluginDetailModel.test.ts.
import type { BreadcrumbItem } from '@/components/plugins/Breadcrumbs'
import type { Plugin, PluginVersionEntry } from './types'

/** חנות התוספים › הקטגוריה הראשונה (אם משובץ) › שם התוסף */
export function buildPluginBreadcrumbs(plugin: Pick<Plugin, 'name' | 'categories'>): BreadcrumbItem[] {
  const first = plugin.categories?.[0]
  return [
    { label: 'חנות התוספים', href: '/plugins' },
    ...(first ? [{ label: first.name, href: `/plugins/category/${first.slug}` }] : []),
    { label: plugin.name }
  ]
}

function normalize(text: string | undefined | null): string {
  return (text || '').replace(/\s+/g, ' ').trim()
}

/**
 * האם להציג את אזור "התיאור" המלא. התיאור הקצר כבר מוצג בראש העמוד; אצל תוספים רבים התיאור המלא
 * זהה לו (או חלק ממנו) — ואז האזור רק חוזר על אותו טקסט.
 */
export function hasDistinctDescription(plugin: Pick<Plugin, 'description' | 'shortDescription'>): boolean {
  const full = normalize(plugin.description)
  if (!full) return false
  const short = normalize(plugin.shortDescription)
  return !short || !short.includes(full)
}

/** התיאור לראש העמוד — התיאור הקצר, ואם אין (תוסף ישן) — התיאור המלא */
export function heroDescription(plugin: Pick<Plugin, 'description' | 'shortDescription'>): string {
  return (plugin.shortDescription || '').trim() || (plugin.description || '').trim()
}

/** כתובת העמוד של גרסה: הגרסה העדכנית — /plugins/<id>; ארכיונית — /plugins/<id>@<version> */
export function versionHref(pluginId: string, entry: Pick<PluginVersionEntry, 'version' | 'isLatest'>): string {
  return entry.isLatest ? `/plugins/${pluginId}` : `/plugins/${pluginId}@${encodeURIComponent(entry.version)}`
}

/** מספר בספרות עם מפריד אלפים (2,473) */
export function formatCount(value: number | undefined | null): string {
  return (value || 0).toLocaleString('he-IL')
}

/** תאריך העדכון המוצג — מועד שינוי הקובץ בפועל, ואם אין — התאריך המקורי / העדכון */
export function displayUpdatedDate(plugin: Pick<Plugin, 'fileUpdatedAt' | 'originalDate' | 'updatedAt'>): string {
  return plugin.fileUpdatedAt || plugin.originalDate || plugin.updatedAt
}

/**
 * מי רשאי לעשות מה בעמוד (המעלה בלבד; מנהל עובד מממשק הניהול). זהה ללוגיקה שהייתה בעמוד.
 *   canEdit       — המשתמש הוא המעלה, ובתצוגת הגרסה החיה
 *   suspendedByAdmin — הושהה בניהול: רק מנהל מחזיר
 *   showSuspendToggle — כפתור השהיה/החזרה מוצג
 */
export function ownerPermissions(
  plugin: Pick<Plugin, 'authorId' | 'isHistoricalVersion' | 'isSuspended' | 'suspendedByRole'>,
  userId: string | undefined
) {
  const canEdit = Boolean(userId && userId === plugin.authorId && !plugin.isHistoricalVersion)
  const suspendedByAdmin = plugin.isSuspended === true && plugin.suspendedByRole === 'admin'
  const canResume = plugin.isSuspended === true && !suspendedByAdmin
  return {
    canEdit,
    suspendedByAdmin,
    showSuspendToggle: canEdit && (!plugin.isSuspended || canResume)
  }
}

/**
 * תוסף שירות: העריכה הישירה חסומה (גם בשרת) — במקומה המעלה מקבל קישור לדף הגשות השירות.
 * canEdit — מ-ownerPermissions.
 */
export function serviceOwnerActions(plugin: Pick<Plugin, 'id' | 'hasService'>, canEdit: boolean) {
  const isService = plugin.hasService === true
  return {
    showEdit: canEdit && !isService,
    serviceUrl: canEdit && isService ? `/plugins/${plugin.id}/service` : null
  }
}

/**
 * טקסט חופשי של המפתח (תיאור, תיאור קצר) → פסקאות של שורות, לתצוגה של כל שורה כבלוק נפרד.
 * למה לא <p> אחד עם whitespace-pre-line: הנתונים מגיעים עם \r\n ובשורות שמערבבות אנגלית ועברית —
 * בחירה בלחיצה כפולה/משולשת חצתה את גבול השורה, וכיוון השורה (נקודה בסוף שורה אנגלית) נקבע לפי
 * הפסקה כולה. כאן: \r\n ו-\r → \n; שורה ריקה (או כמה) מפרידה פסקאות; שורות ריקות בקצוות נזרקות.
 * ירידות השורה שהמפתח הזין נשמרות (issue #175).
 */
export function splitUserText(text: string | null | undefined): string[][] {
  const normalized = (text || '').replace(/\r\n?/g, '\n')
  return normalized
    .split(/\n[ \t]*\n/)
    .map((paragraph) => paragraph.split('\n').map((line) => line.trimEnd()))
    .map((lines) => {
      let first = 0
      let last = lines.length
      while (first < last && lines[first].trim() === '') first++
      while (last > first && lines[last - 1].trim() === '') last--
      return lines.slice(first, last)
    })
    .filter((lines) => lines.length > 0)
}
