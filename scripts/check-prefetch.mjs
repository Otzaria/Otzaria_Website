#!/usr/bin/env node
/**
 * check-prefetch.mjs — מוודא שדף ציבורי אינו מבצע prefetch לנתיב מוגן.
 *
 * למה זה משנה: לאורח לא מחובר, prefetch לקישור מוגן מייצר בקשת RSC שנגמרת
 * ב-redirect לדף ההתחברות, ואז נמשכות גם חבילות ה-JavaScript של דף ההתחברות —
 * הכול לפני שהמשתמש לחץ. ברשת איטית זו תחרות ישירה עם המסך הנוכחי. בפרודקשן
 * נמדדו כך 19 בקשות RSC ב-/about ו-17 בדף 404.
 *
 * הבדיקה מנתחת JSX ב-AST (Babel, כמו scripts/build-offline-editor.js) ולא
 * בהתאמת מחרוזות. גרסה קודמת בדקה `attrs.includes('prefetch')` ו-href במירכאות
 * כפולות בלבד, ולכן גם prefetch={true} וגם href='...' או href={`...`} חמקו ממנה.
 *
 * כיסוי: כל דף ציבורי (page/not-found שהמסלול שלו אינו ב-PROTECTED_PREFIXES)
 * *וכל קומפוננטה שדף כזה מייבא, במעבר טרנזיטיבי*. זה מה שתופס רגרסיה כמו זו
 * שהייתה ב-Hero ו-ContributeSection, שאינם דפים אלא קומפוננטות משותפות.
 * קומפוננטה שמוצגת רק מתוך אזור שדורש התחברות אינה נסרקת — שם prefetch מועיל.
 *
 * שימוש: node scripts/check-prefetch.mjs   (או דרך npm run check:perf)
 */

import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import babel from '@babel/core'
import { isProtectedPath } from '../src/lib/protected-routes.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'src')
const APP = path.join(SRC, 'app')

const SOURCE_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js']
const PAGE_FILE = /^(page|not-found)\.(jsx?|tsx?)$/

function parse(source, filename) {
  return babel.parseSync(source, {
    filename,
    sourceType: 'unambiguous',
    babelrc: false,
    configFile: false,
    parserOpts: {
      plugins: filename.endsWith('.ts') || filename.endsWith('.tsx')
        ? ['jsx', 'typescript']
        : ['jsx'],
      errorRecovery: true,
    },
  })
}

/** מעבר גנרי על ה-AST, באותו סגנון של build-offline-editor.js */
function walk(node, visit) {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visit)
    return
  }
  if (typeof node.type === 'string') visit(node)
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'leadingComments' || key === 'trailingComments') continue
    walk(node[key], visit)
  }
}

// ===== גרף הייבוא =====

async function resolveImport(specifier, fromFile) {
  let base
  if (specifier.startsWith('@/')) base = path.join(SRC, specifier.slice(2))
  else if (specifier.startsWith('.')) base = path.resolve(path.dirname(fromFile), specifier)
  else return null // חבילה מ-node_modules

  const candidates = [
    base,
    ...SOURCE_EXTENSIONS.map((ext) => base + ext),
    ...SOURCE_EXTENSIONS.map((ext) => path.join(base, `index${ext}`)),
  ]
  for (const candidate of candidates) {
    try {
      if ((await stat(candidate)).isFile()) return candidate
    } catch {
      // ממשיכים למועמד הבא
    }
  }
  return null
}

async function collectPageFiles(dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await collectPageFiles(full)))
    else if (PAGE_FILE.test(entry.name)) out.push(full)
  }
  return out
}

/** src/app/about/page.jsx -> /about  (סוגריים = route group, אינו חלק מה-URL) */
function routeForPageFile(file) {
  const segments = path
    .relative(APP, file)
    .split(path.sep)
    .slice(0, -1)
    .filter((s) => !(s.startsWith('(') && s.endsWith(')')))
  return '/' + segments.join('/')
}

// ===== קריאת קישורים =====

/**
 * ערכי href אפשריים של קישור. עבור template literal מוחזרת התחילית הסטטית —
 * `/library/books/${slug}` נבדק לפי '/library/books/', וזה מספיק כדי לדעת שהוא מוגן.
 */
function hrefCandidates(node) {
  if (!node) return []
  switch (node.type) {
    case 'StringLiteral':
      return [node.value]
    case 'TemplateLiteral':
      return [node.quasis[0]?.value?.cooked ?? '']
    case 'JSXExpressionContainer':
      return hrefCandidates(node.expression)
    case 'ConditionalExpression':
      return [...hrefCandidates(node.consequent), ...hrefCandidates(node.alternate)]
    case 'LogicalExpression':
      return [...hrefCandidates(node.left), ...hrefCandidates(node.right)]
    default:
      return []
  }
}

/** prefetch פוטר רק כשהוא במפורש {false}. prefetch={true} או משתנה אינם פוטרים. */
function hasExplicitPrefetchFalse(attributes) {
  for (const attr of attributes) {
    if (attr.type !== 'JSXAttribute' || attr.name?.name !== 'prefetch') continue
    const value = attr.value
    if (
      value?.type === 'JSXExpressionContainer' &&
      value.expression?.type === 'BooleanLiteral' &&
      value.expression.value === false
    ) {
      return true
    }
  }
  return false
}

/** שם המשתנה שאליו נקשר next/link בקובץ (בדרך כלל Link, אך לא בהכרח) */
function linkLocalNames(ast) {
  const names = new Set()
  walk(ast, (node) => {
    if (node.type !== 'ImportDeclaration' || node.source?.value !== 'next/link') return
    for (const spec of node.specifiers) {
      if (spec.type === 'ImportDefaultSpecifier') names.add(spec.local.name)
    }
  })
  return names
}

function jsxName(node) {
  if (!node) return ''
  if (node.type === 'JSXIdentifier') return node.name
  if (node.type === 'JSXMemberExpression') return jsxName(node.property)
  return ''
}

async function scanFile(file) {
  const source = await readFile(file, 'utf8')
  const ast = parse(source, file)
  const names = linkLocalNames(ast)
  if (names.size === 0) return { violations: [], imports: importSpecifiers(ast) }

  const violations = []
  walk(ast, (node) => {
    if (node.type !== 'JSXOpeningElement' || !names.has(jsxName(node.name))) return

    const hrefAttr = node.attributes.find(
      (a) => a.type === 'JSXAttribute' && a.name?.name === 'href'
    )
    if (!hrefAttr) return

    const protectedHrefs = hrefCandidates(hrefAttr.value).filter(
      (href) => href.startsWith('/') && isProtectedPath(href)
    )
    if (protectedHrefs.length === 0) return
    if (hasExplicitPrefetchFalse(node.attributes)) return

    violations.push({
      file: path.relative(ROOT, file),
      line: node.loc?.start?.line ?? 0,
      href: protectedHrefs[0],
    })
  })

  return { violations, imports: importSpecifiers(ast) }
}

function importSpecifiers(ast) {
  const specifiers = []
  walk(ast, (node) => {
    if (node.type === 'ImportDeclaration' && node.source?.value) specifiers.push(node.source.value)
  })
  return specifiers
}

/**
 * @returns {Promise<{violations: Array, scanned: number, publicPages: number}>}
 */
export async function checkPrefetch() {
  const pageFiles = await collectPageFiles(APP)
  const publicPages = pageFiles.filter((file) => !isProtectedPath(routeForPageFile(file)))

  const violations = []
  const visited = new Set()
  const queue = [...publicPages]

  // BFS על גרף הייבוא: כל קובץ שדף ציבורי מגיע אליו נסרק גם הוא
  while (queue.length > 0) {
    const file = queue.pop()
    if (visited.has(file)) continue
    visited.add(file)

    let result
    try {
      result = await scanFile(file)
    } catch (err) {
      throw new Error(`${path.relative(ROOT, file)}: ${err.message}`)
    }

    violations.push(...result.violations)

    for (const specifier of result.imports) {
      const resolved = await resolveImport(specifier, file)
      if (resolved && !visited.has(resolved)) queue.push(resolved)
    }
  }

  return { violations, scanned: visited.size, publicPages: publicPages.length }
}

// הרצה ישירה מהמסוף
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkPrefetch()
    .then(({ violations, scanned, publicPages }) => {
      if (violations.length === 0) {
        console.log(`✓ prefetch — ${scanned} קבצים מ-${publicPages} דפים ציבוריים, אין קישור לנתיב מוגן`)
        return
      }
      console.error(`✗ ${violations.length} קישורים בדפים ציבוריים מבצעים prefetch לנתיב מוגן:`)
      for (const v of violations) console.error(`   ${v.file}:${v.line} → ${v.href}`)
      console.error('   הוסף prefetch={false}')
      process.exitCode = 1
    })
    .catch((err) => {
      console.error(`✗ check-prefetch: ${err.message}`)
      process.exitCode = 1
    })
}
