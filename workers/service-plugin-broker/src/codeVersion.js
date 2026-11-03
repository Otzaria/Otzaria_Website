import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { BROKER_ROOT } from './config.js'

/** מה שהמתווך טוען בזמן ריצה. קובצי האתר שהוא מייבא (src/lib/...) נאספים אוטומטית לפי הייבוא. */
export const CODE_PATHS = [
  path.join(BROKER_ROOT, 'src'),
  path.join(BROKER_ROOT, 'policy'),
  path.join(BROKER_ROOT, 'package.json'),
]

const RELATIVE_IMPORT = /\b(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g

async function listFiles(entry) {
  let names
  try {
    names = await readdir(entry, { withFileTypes: true })
  } catch (err) {
    if (err?.code === 'ENOTDIR' || err?.code === 'ENOENT') return [entry]
    throw err
  }
  const files = []
  for (const d of names) files.push(...await listFiles(path.join(entry, d.name)))
  return files
}

/** כל הקבצים שבנתיבים, ועוד כל קובץ שהם מייבאים בנתיב יחסי (רקורסיבית). קובץ חסר נשמר כ-null. */
export async function codeFiles(paths = CODE_PATHS) {
  const contents = new Map()
  const queue = (await Promise.all(paths.map(listFiles))).flat()
  while (queue.length) {
    const file = queue.pop()
    if (contents.has(file)) continue
    const data = await readFile(file).catch(() => null)
    contents.set(file, data)
    if (!data || !file.endsWith('.js')) continue
    for (const [, spec] of data.toString('utf8').matchAll(RELATIVE_IMPORT)) queue.push(path.resolve(path.dirname(file), spec))
  }
  return contents
}

/** טביעת אצבע של הקוד שבדיסק. קובץ חסר נספר כחסר — כך שגם מחיקה משנה את הטביעה. */
export async function codeFingerprint(paths = CODE_PATHS) {
  const hash = createHash('sha256')
  const contents = await codeFiles(paths)
  for (const file of [...contents.keys()].sort()) {
    hash.update(file).update('\0')
    hash.update(contents.get(file) ?? '\u0000missing').update('\0')
  }
  return hash.digest('hex')
}
