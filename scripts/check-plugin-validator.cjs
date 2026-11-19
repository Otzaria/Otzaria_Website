// בודק ש-otzaria-plugin-validator המותקן ב-node_modules אינו ישן מהגרסה הנעולה
// ב-package-lock.json. התלות מוצמדת לתגית נעה (#v1): התקנה מקומית ישנה (למשל
// 1.14, שבה main הוא ה-Action עצמו ואינו מייצא דבר) הפילה עד כה את הטסטים
// ב-TypeError סתום בזמן import. גרסה *חדשה* מה-lock תקינה — כך בדיוק נראית
// בנייה שרועננה ל-#v1 בלי --save (ראו README, "הצמדה: ראש v1 בכל בנייה").
// קריאת קבצים מקומיים בלבד, בלי רשת. רץ כ-pretest; ידנית: npm run check:plugin-validator
const fs = require('node:fs')
const path = require('node:path')

const PACKAGE = 'otzaria-plugin-validator'
const FIX = 'npm ci'

function parseVersion(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(version ?? '').trim())
  return match ? match.slice(1, 4).map(Number) : null
}

// <0 כש-a ישנה מ-b, 0 כשוות, >0 כשחדשה. גרסה שאינה x.y.z → null (לא ניתן להשוות).
function compareVersions(a, b) {
  const left = parseVersion(a)
  const right = parseVersion(b)
  if (!left || !right) return null
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) return left[i] - right[i]
  }
  return 0
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (err) {
    if (err.code === 'ENOENT') return null
    throw err
  }
}

function checkPluginValidatorInstall(root = process.cwd()) {
  const lock = readJson(path.join(root, 'package-lock.json'))
  const locked = lock?.packages?.[`node_modules/${PACKAGE}`]
  const installed = readJson(path.join(root, 'node_modules', PACKAGE, 'package.json'))
  const result = {
    ok: true,
    installedVersion: installed?.version ?? null,
    lockedVersion: locked?.version ?? null,
    lockedResolved: locked?.resolved ?? null,
    message: '',
  }

  if (!installed) {
    result.ok = false
    result.message = `${PACKAGE} אינו מותקן ב-node_modules (נעול ב-package-lock.json: ${result.lockedVersion ?? 'לא ידוע'}). הריצו: ${FIX}`
    return result
  }
  if (!locked?.version) {
    result.message = `אין רשומה ל-${PACKAGE} ב-package-lock.json — לא ניתן להשוות (מותקן: ${result.installedVersion})`
    return result
  }
  const cmp = compareVersions(result.installedVersion, result.lockedVersion)
  if (cmp === null) {
    result.message = `לא ניתן להשוות גרסאות ${PACKAGE}: מותקן ${result.installedVersion}, נעול ${result.lockedVersion}`
  } else if (cmp < 0) {
    result.ok = false
    result.message =
      `${PACKAGE} המותקן ישן מהנעול: מותקן ${result.installedVersion}, נדרש לפחות ${result.lockedVersion}` +
      ` (${result.lockedResolved ?? 'ראו package-lock.json'}). התלות מוצמדת לתגית נעה #v1, ו-node_modules לא` +
      ` מתעדכן מעצמו. הריצו: ${FIX}`
  } else if (cmp > 0) {
    result.message = `${PACKAGE} ${result.installedVersion} חדש מהנעול (${result.lockedVersion}) — תקין אחרי רענון #v1`
  }
  return result
}

if (require.main === module) {
  const result = checkPluginValidatorInstall()
  if (!result.ok) {
    console.error(`✖ ${result.message}`)
    process.exit(1)
  }
  if (result.message) console.log(`ℹ ${result.message}`)
}

module.exports = { checkPluginValidatorInstall, compareVersions }
