import MiniSearch from 'minisearch'
import Plugin from '@/models/Plugin'
import { getStoreSettings } from '@/models/StoreSettings'
import { normalizeHebrew, tokenizeHebrew, expandTermVariants } from '@/lib/hebrewSearchNormalize'

// אינדקס חיפוש in-memory על התוספים הציבוריים (מאושרים ולא-מוסתרים).
// נבנה עצלה, נשמר ברמת המודול (אינסטנס Next יחיד — ראו תכנון 8.5), עם TTL כרשת
// ביטחון + הפגה ישירה (invalidatePluginSearchIndex) מכל מוטציה רלוונטית.
// מגבלה מתועדת: בריבוי אינסטנסים ההפגה הישירה מקומית בלבד וה-TTL מגביל את הסטייה.

const TTL_MS = 60_000

// שם > תגיות > תיאור קצר > מפתח > תיאור מלא
const FIELD_BOOSTS = { name: 8, tags: 5, shortDescription: 3, author: 2, description: 1 }

const SELECT_FIELDS = [
  'name', 'slug', 'shortDescription', 'description', 'version', 'status', 'author',
  'authorId', 'compatibleWith', 'maxAppVersion', 'requiresNetwork', 'tags', 'homepage',
  'pluginFileName', 'pluginFileExt', 'pluginFileSize', 'image', 'screenshots',
  'originalDate', 'fileUpdatedAt', 'downloadCount', 'versions', 'updatedAt', 'createdAt'
].join(' ')

let cache = { index: null, docs: new Map(), builtAt: 0 }

function processTerm(term) {
  const normalized = normalizeHebrew(term)
  if (!normalized) return null
  return expandTermVariants(normalized)
}

function buildIndex(plugins) {
  const index = new MiniSearch({
    fields: ['name', 'tags', 'shortDescription', 'author', 'description'],
    storeFields: [],
    processTerm,
    tokenize: (text) => tokenizeHebrew(text)
  })

  index.addAll(
    plugins.map((plugin) => ({
      id: plugin._id.toString(),
      name: plugin.name || '',
      tags: (plugin.tags || []).join(' '),
      shortDescription: plugin.shortDescription || '',
      author: plugin.author || '',
      description: plugin.description || ''
    }))
  )
  return index
}

export async function getSearchIndex() {
  if (cache.index && Date.now() - cache.builtAt < TTL_MS) return cache

  const [plugins, settings] = await Promise.all([
    Plugin.find({ isApproved: true, isHidden: false }).select(SELECT_FIELDS).lean(),
    getStoreSettings()
  ])

  // סימון "נבחר" (featured) על המסמכים — משמש לדחיפה קלה בדירוג
  const featured = new Set(settings.featuredPluginIds.map((id) => id.toString()))
  for (const plugin of plugins) {
    plugin.isFeatured = featured.has(plugin._id.toString())
  }

  const docs = new Map(plugins.map((plugin) => [plugin._id.toString(), plugin]))
  // החלפה אטומית — בקשות מקבילות ימשיכו לקרוא מהקאש הישן עד סיום הבנייה
  cache = { index: buildIndex(plugins), docs, builtAt: Date.now() }
  return cache
}

export function invalidatePluginSearchIndex() {
  cache.builtAt = 0
}

function searchOptions(combineWith) {
  return {
    boost: FIELD_BOOSTS,
    // אין fuzzy למילים קצרות (רעש), אין prefix לאות בודדת
    fuzzy: (term) => (term.length >= 4 ? 0.2 : false),
    prefix: (term) => term.length >= 2,
    combineWith,
    processTerm
  }
}

// דירוג סופי: רלוונטיות טקסטואלית דומיננטית, פופולריות שוברת שוויון, דחיפה קלה לנבחר
function finalScore(miniScore, doc) {
  return (
    miniScore *
    (1 + 0.15 * Math.log10(1 + (doc.downloadCount || 0))) *
    (doc.isFeatured ? 1.25 : 1)
  )
}

// חיפוש מדורג. מחזיר { results: [{ doc, score, matchedFields }], relaxed }.
// כל מונחי השאילתה נדרשים (AND); אם אין תוצאות — ניסיון שני מרוכך (OR).
export async function searchPlugins(query) {
  const { index, docs } = await getSearchIndex()

  let relaxed = false
  let hits = index.search(query, searchOptions('AND'))
  if (hits.length === 0) {
    hits = index.search(query, searchOptions('OR'))
    relaxed = hits.length > 0
  }

  const results = []
  for (const hit of hits) {
    const doc = docs.get(hit.id)
    if (!doc) continue
    const matchedFields = new Set()
    for (const term of Object.keys(hit.match || {})) {
      for (const field of hit.match[term]) matchedFields.add(field)
    }
    results.push({ doc, score: finalScore(hit.score, doc), matchedFields: Array.from(matchedFields) })
  }

  results.sort((a, b) => b.score - a.score)
  return { results, relaxed }
}
