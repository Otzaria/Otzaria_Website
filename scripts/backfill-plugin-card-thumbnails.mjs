// יצירת תמונות ממוזערות (thumbnails) לכרטיסי תוספים שכבר קיימים באחסון.
// הרצה ידנית בלבד: node scripts/backfill-plugin-card-thumbnails.mjs [מזהי תוספים]
// חובה להריץ עם אותו PLUGIN_STORAGE_DIR של השרת, אחרת הסקריפט יעבוד על תיקייה אחרת.
// שמות קובצי התמונה הממוזערת תלויים ב-inode וב-mtime של קובץ המקור, לכן חובה להריץ
// מחדש אחרי העתקה/שחזור של האחסון (ההעתקה משנה inode/mtime והממוזערות הישנות לא יתאימו).
// אין ניקוי יתומים ואין dry-run.
import { opendir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import sharp from 'sharp'
import { backfillPluginCardThumbnail, getPluginDir } from '../src/lib/pluginStorage.js'

const args = process.argv.slice(2)
if (args.some((id) => !/^[a-f0-9]{24}$/i.test(id))) {
  throw new Error('שימוש: node scripts/backfill-plugin-card-thumbnails.mjs [מזהי תוספים]')
}
const imageExtensions = ['.webp', '.png', '.jpg', '.gif']
const storageRoot = dirname(getPluginDir('000000000000000000000000'))
sharp.concurrency(1)
sharp.cache(false)
let failures = 0
let created = 0

async function processPlugin(id) {
  for (const ext of imageExtensions) {
    try {
      if (await backfillPluginCardThumbnail(id, ext)) {
        created += 1
        await delay(100)
      }
    } catch (error) {
      if (error.code === 'ENOENT') continue
      failures += 1
      console.error(`שגיאה ביצירת תמונה ממוזערת ל-${id}${ext}`, error.message)
    }
  }
}

if (args.length) {
  for (const pluginId of new Set(args)) await processPlugin(pluginId)
} else {
  for await (const entry of await opendir(storageRoot)) {
    if (entry.isDirectory() && /^[a-f0-9]{24}$/i.test(entry.name)) await processPlugin(entry.name)
  }
}
console.log(`נוצרו ${created} תמונות ממוזערות. שגיאות: ${failures}.`)
if (failures) process.exitCode = 1
