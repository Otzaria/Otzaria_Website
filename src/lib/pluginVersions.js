import path from 'path'
import { promises as fs } from 'fs'
import {
  getPluginDir,
  ensureVersionDir,
  COMPANION_BASENAME,
  PLUGIN_FILE_BASENAME
} from './pluginStorage'
import { companionFromDoc, serializeCompanionForPublic } from './pluginCompanion.js'

// מעביר את הגרסה החיה הנוכחית להיסטוריה (versions[]) לפני שהיא נדרסת בגרסה חדשה.
// יש לקרוא *לפני* שהקובץ החי מוחלף ו*לפני* ששדות התוסף עודכנו — נשען על הערכים
// הנוכחיים של plugin. מעתיק את קובץ ה-otzplugin החי לתיקיית הגרסה ודוחף רשומת מטא-דאטה.
// מחזיר את הרשומה שנשמרה. זורק שגיאה אם אין קובץ חי/גרסה לשמר — הקוראים מסתמכים
// על כך שארכוב מוצלח שקול לשימור הגרסה הקודמת, ולכן כשל חוסם את הדריסה/האישור.
export async function archiveCurrentVersion(plugin) {
  const pluginId = plugin._id.toString()
  const version = (plugin.version || '').toString().trim()
  if (!version) {
    throw new Error('Cannot archive plugin version: missing current version')
  }

  const fileExt = plugin.pluginFileExt || '.otzplugin'
  const liveFile = path.join(getPluginDir(pluginId), `${PLUGIN_FILE_BASENAME}${fileExt}`)

  try {
    await fs.access(liveFile)
  } catch {
    // אין קובץ חי לתוסף שאמור להיות פעיל — מצב נתונים שגוי. עדיף לזרוק ולחסום
    // את העדכון מאשר "להצליח" בשקט ולדרוס גרסה ללא שימורה בהיסטוריה.
    throw new Error(`Cannot archive plugin version ${version}: live plugin file not found`)
  }

  const versionDir = await ensureVersionDir(pluginId, version)
  const dest = path.join(versionDir, `${PLUGIN_FILE_BASENAME}${fileExt}`)
  await fs.copyFile(liveFile, dest)

  // מתקין התוכנה הנלווית של הגרסה היוצאת נשמר לצידה, כדי שגרסה ארכיונית תוגש
  // עם התוכנה שהתאימה לה. כשל בהעתקה אינו חוסם את הארכוב: קובץ התוסף — שהוא
  // מה שהארכוב קיים בשבילו — כבר נשמר, ורשומת המתקין נזנחת כדי שלא תצביע לקובץ
  // חסר (התוצאה: הגרסה הישנה תוצג בלי מתקין, ולא עם קישור שבור).
  const companion = companionFromDoc(plugin.companion)
  let archivedCompanion = null
  if (companion) {
    const companionFile = path.join(getPluginDir(pluginId), `${COMPANION_BASENAME}${companion.ext}`)
    try {
      await fs.copyFile(companionFile, path.join(versionDir, `${COMPANION_BASENAME}${companion.ext}`))
      archivedCompanion = companion
    } catch (err) {
      console.error(`Failed to archive companion installer for version ${version}:`, err)
    }
  }

  const entry = {
    version,
    pluginFileName: plugin.pluginFileName || '',
    pluginFileExt: fileExt,
    pluginFileSize: plugin.pluginFileSize || 0,
    status: plugin.status,
    compatibleWith: plugin.compatibleWith || '',
    maxAppVersion: plugin.maxAppVersion || null,
    requiresNetwork: plugin.requiresNetwork === true,
    shortDescription: plugin.shortDescription || '',
    description: plugin.description || '',
    companion: archivedCompanion || { present: false },
    archivedAt: new Date()
  }

  // החלפת רשומה קיימת לאותה גרסה (הגנה — בדרך כלל לא קיימת) ודחיפת החדשה.
  plugin.versions = (plugin.versions || []).filter((v) => v.version !== version)
  plugin.versions.push(entry)
  return entry
}

// בונה ייצוג ציבורי לגרסה ארכיונית, על בסיס הייצוג הציבורי של התוסף החי.
// משכפל את המידע הויזואלי (תמונה/צילומי מסך) מהגרסה הנוכחית, ודורס את שדות
// המטא-דאטה בערכי הגרסה הארכיונית. קישורי ההורדה/הדף נושאים את סיומת @version.
export function formatVersionForPublic(livePublic, plugin, versionEntry) {
  const pluginId = plugin._id.toString()
  const ref = `${pluginId}@${versionEntry.version}`
  return {
    ...livePublic,
    version: versionEntry.version,
    status: versionEntry.status || livePublic.status,
    compatibleWith: versionEntry.compatibleWith || livePublic.compatibleWith,
    maxAppVersion: versionEntry.maxAppVersion || null,
    requiresNetwork: versionEntry.requiresNetwork === true,
    shortDescription: versionEntry.shortDescription || livePublic.shortDescription,
    description: versionEntry.description || livePublic.description,
    pluginFileSize: versionEntry.pluginFileSize || 0,
    updatedAt: versionEntry.archivedAt
      ? new Date(versionEntry.archivedAt).toISOString().split('T')[0]
      : livePublic.updatedAt,
    downloadUrl: `/api/plugins/${ref}/download`,
    supportsDirectInstall: (versionEntry.pluginFileExt || '').toLowerCase() === '.otzplugin',
    // התוכנה הנלווית של אותה גרסה — לא זו של הגרסה החיה. גרסה שאורכבה לפני
    // שהפיצ'ר נוסף (או שהעתקת המתקין שלה נכשלה) נופלת למתקין החי, כי להציג
    // תוסף שדורש תוכנה כאילו הוא עומד בפני עצמו הוא הטעות הגרועה מהשתיים.
    companion: serializeCompanionForPublic(versionEntry.companion, {
      downloadUrl: `/api/plugins/${ref}/companion`
    }) || livePublic.companion || null,
    isHistoricalVersion: true,
    latestVersion: plugin.version
  }
}
