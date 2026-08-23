// סיומת .js מפורשת — הקובץ נטען גם ע"י node --test (ESM ללא רזולוציית webpack)
import { compareVersions } from './pluginManifest.js'
import {
  isValidAppVersion,
  resolveCompatibleVersion,
  lowestSupportedAppVersion
} from './pluginCompatibility.js'

// בדיקת עדכונים ב-batch עבור אפליקציית אוצריא: הלקוח שולח את התוספים המותקנים
// אצלו (מזוהים לפי pluginUid מה-manifest, לא לפי _id) עם הגרסה המותקנת של כל
// אחד, ומקבל לכל תוסף האם קיימת גרסה תואמת חדשה יותר וכתובת הורדה מוצמדת-גרסה.

export const MAX_UPDATE_REQUESTS = 100

// uid מה-manifest: עד 200 תווים (כמו במודל), ללא רווחים/פסיקים/@ שמשמשים כמפרידים.
// נבדק: לינארי — מחלקת תווים פשוטה עם כמת חסום, אין נסיגה קטסטרופלית
const UID_RE = /^[A-Za-z0-9._-]{1,200}$/

// פירוק פרמטר plugins ("uid@ver,uid@ver,..."). פריט לא-תקין פוסל את הבקשה כולה
// (400 אצל הקורא) — קלט כזה מעיד על לקוח שבור, לא על תוסף חסר.
// יותר מ-MAX_UPDATE_REQUESTS פריטים → invalid, כדי שהלקוח יידע ולא יקבל תשובה חלקית.
export function parseUpdateRequestList(raw) {
  const items = (raw || '').toString().split(',').map((s) => s.trim()).filter(Boolean)
  if (items.length === 0 || items.length > MAX_UPDATE_REQUESTS) {
    return { requests: null }
  }

  const requests = []
  const seen = new Set()
  for (const item of items) {
    const at = item.lastIndexOf('@')
    if (at <= 0 || at === item.length - 1) return { requests: null }
    const uid = item.slice(0, at)
    const installedVersion = item.slice(at + 1)
    if (!UID_RE.test(uid) || !isValidAppVersion(installedVersion)) {
      return { requests: null }
    }
    if (seen.has(uid)) continue
    seen.add(uid)
    requests.push({ uid, installedVersion })
  }
  return { requests }
}

// חישוב תשובת העדכונים: לכל בקשה שנמצא לה תוסף — רשומה אחת. uid שאינו בחנות
// (או מוסתר/מושהה — הסינון הציבורי נעשה בשאילתה אצל הקורא) פשוט מושמט.
//
// לכל רשומה:
//   hasUpdate  — הגרסה התואמת הגבוהה ביותר גבוהה מהמותקנת
//   version/downloadUrl — הגרסה התואמת; ה-URL מוצמד לגרסה (@version) כך שמה
//     שהוצג למשתמש הוא בדיוק מה שיותקן, גם אם תפורסם גרסה חדשה בינתיים
//   incompatible — קיים רק כשאין אף גרסה תואמת ל-appVersion, עם פרטי הסבר
export function resolvePluginUpdates(plugins, requests, appVersion) {
  const byUid = new Map()
  for (const plugin of plugins || []) {
    if (plugin.pluginUid) byUid.set(plugin.pluginUid, plugin)
  }

  const results = []
  for (const { uid, installedVersion } of requests) {
    const plugin = byUid.get(uid)
    if (!plugin) continue

    const selected = resolveCompatibleVersion(plugin, appVersion)
    if (!selected) {
      results.push({
        uid,
        id: plugin._id.toString(),
        hasUpdate: false,
        incompatible: {
          latestVersion: plugin.version,
          compatibleWith: plugin.compatibleWith || '',
          maxAppVersion: plugin.maxAppVersion || null,
          minSupportedAppVersion: lowestSupportedAppVersion(plugin)
        }
      })
      continue
    }

    let hasUpdate
    try {
      hasUpdate = compareVersions(selected.version, installedVersion) > 0
    } catch {
      // מספר גרסה פגום ברשומת החנות — אין להציע עדכון שאי אפשר להשוות
      hasUpdate = false
    }

    results.push({
      uid,
      id: plugin._id.toString(),
      hasUpdate,
      version: selected.version,
      status: selected.status,
      requiresNetwork: selected.requiresNetwork,
      pluginFileSize: selected.pluginFileSize,
      releasedAt: selected.releasedAt,
      downloadUrl: `/api/plugins/${plugin._id.toString()}@${selected.version}/download`,
      isLatest: selected.isLatest
    })
  }
  return results
}
