const HEBREW_WORD_RE = /[\u0590-\u05FF"'"'"'״׳]+/g

let spell = null
let loadingPromise = null
let wordSet = null
let prefixIndex = null
let useNspell = true
let suggestMode = 'fuzzy'

const MAX_WORDS_TO_CHECK = 60000
const YIELD_EVERY = 2000
const MAX_SUGGEST_CANDIDATES = 12000
const USE_PREFIXES = ['ו', 'ב', 'כ', 'ל', 'מ', 'ש', 'ה']

const CONFUSABLES = new Map([
  ['כ', ['ב', 'ק']],
  ['ב', ['כ', 'ו']],
  ['ק', ['כ']],
  ['ו', ['ב']],
  ['ה', ['ד', 'י', 'ח']],
  ['ד', ['ה', 'ז', 'ר']],
  ['ז', ['ד']],
  ['י', ['ה']],
  ['ח', ['ה', 'ת']],
  ['ת', ['ח', 'ט']],
  ['ט', ['ת']],
  ['נ', ['ג']],
  ['ג', ['נ']],
  ['א', ['ע']],
  ['ע', ['א']],
  ['ס', ['ש']],
  ['ש', ['ס']]
])

function normalizeHebrew(text) {
  if (!text) return ''
  return text.replace(/["']/g, m => (m === '"' ? '״' : '׳'))
}

function extractHebrewWords(text) {
  if (!text) return []
  const normalized = normalizeHebrew(text).replace(/[־]/g, ' ')
  const matches = normalized.match(HEBREW_WORD_RE)
  return matches ? matches.filter(Boolean) : []
}

function addToIndex(map, word) {
  if (!word) return
  const key2 = word.slice(0, 2)
  const key1 = word.slice(0, 1)
  if (key2) {
    const list2 = map.get(key2)
    if (list2) list2.push(word)
    else map.set(key2, [word])
  }
  if (key1) {
    const list1 = map.get(key1)
    if (list1) list1.push(word)
    else map.set(key1, [word])
  }
}

function buildWordSet(dicText) {
  const set = new Set()
  const index = new Map()
  const lines = dicText.split(/\r?\n/)
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i]
    if (!line) continue
    const raw = line.split('/')[0]?.trim()
    if (!raw) continue
    const word = normalizeHebrew(raw)
    if (!set.has(word)) {
      set.add(word)
      addToIndex(index, word)
    }
  }
  return { set, index }
}

async function loadSpell({ aff, dic, personalWords }) {
  if (spell || wordSet) return { spell, wordSet }
  if (loadingPromise) return loadingPromise

  loadingPromise = (async () => {
    const [affText, dicText] = await Promise.all([
      fetch(aff).then(res => {
        if (!res.ok) throw new Error(`Failed to load ${aff}`)
        return res.text()
      }),
      fetch(dic).then(res => {
        if (!res.ok) throw new Error(`Failed to load ${dic}`)
        return res.text()
      })
    ])

    const built = buildWordSet(dicText)
    wordSet = built.set
    prefixIndex = built.index

    if (Array.isArray(personalWords)) {
      personalWords.forEach(word => {
        if (typeof word === 'string' && word.trim()) {
          const normalized = normalizeHebrew(word.trim())
          wordSet.add(normalized)
          addToIndex(prefixIndex, normalized)
        }
      })
    }

    try {
      const nspell = (await import('nspell')).default
      const instance = nspell(affText, dicText)
      if (Array.isArray(personalWords)) {
        personalWords.forEach(word => {
          if (typeof word === 'string' && word.trim()) instance.add(normalizeHebrew(word.trim()))
        })
      }
      spell = instance
      useNspell = true
      suggestMode = 'nspell'
    } catch (err) {
      spell = null
      useNspell = false
      suggestMode = 'fuzzy'
    }

    return { spell, wordSet }
  })()

  return loadingPromise
}

function isCorrect(word) {
  if (!word) return false

  if (useNspell && spell) {
    try {
      if (spell.correct(word)) return true
    } catch (err) {
      useNspell = false
      suggestMode = 'fuzzy'
    }
  }

  if (wordSet?.has(word)) return true

  if (word.length > 1 && wordSet) {
    const prefix = word[0]
    if (USE_PREFIXES.includes(prefix)) {
      const base = word.slice(1)
      if (base && base[0] !== prefix && wordSet.has(base)) {
        return true
      }
    }
  }

  return false
}

function isConfusable(a, b) {
  const list = CONFUSABLES.get(a)
  return !!list && list.includes(b)
}

function weightedDistance(a, b, maxDist) {
  if (a === b) return 0
  const alen = a.length
  const blen = b.length
  if (Math.abs(alen - blen) > maxDist) return maxDist + 1

  const v0 = new Array(blen + 1)
  const v1 = new Array(blen + 1)

  for (let i = 0; i <= blen; i += 1) v0[i] = i

  for (let i = 0; i < alen; i += 1) {
    v1[0] = i + 1
    let minRow = v1[0]
    const ca = a[i]

    for (let j = 0; j < blen; j += 1) {
      const cb = b[j]
      let cost = ca === cb ? 0 : 1
      if (cost === 1 && isConfusable(ca, cb)) cost = 0.5

      const val = Math.min(
        v1[j] + 1,
        v0[j + 1] + 1,
        v0[j] + cost
      )
      v1[j + 1] = val
      if (val < minRow) minRow = val
    }

    if (minRow > maxDist) return maxDist + 1
    for (let j = 0; j <= blen; j += 1) v0[j] = v1[j]
  }

  return v0[blen]
}

function fuzzySuggest(word, limit) {
  if (!word || !prefixIndex) return []
  const normalized = normalizeHebrew(word)
  const key2 = normalized.slice(0, 2)
  const key1 = normalized.slice(0, 1)

  const bucketA = prefixIndex.get(key2) || []
  const bucketB = key1 ? (prefixIndex.get(key1) || []) : []

  const combined = bucketA.length >= bucketB.length ? bucketA.concat(bucketB) : bucketB.concat(bucketA)
  if (combined.length === 0) return []

  const maxDist = normalized.length <= 4 ? 1 : (normalized.length <= 7 ? 2 : 3)
  const maxCandidates = Math.min(combined.length, MAX_SUGGEST_CANDIDATES)

  const results = []
  for (let i = 0; i < maxCandidates; i += 1) {
    const candidate = combined[i]
    if (!candidate) continue
    if (Math.abs(candidate.length - normalized.length) > maxDist + 1) continue

    const dist = weightedDistance(normalized, candidate, maxDist + 1)
    if (dist <= maxDist + 1) {
      results.push({ candidate, dist, lenDiff: Math.abs(candidate.length - normalized.length) })
    }
  }

  results.sort((a, b) => a.dist - b.dist || a.lenDiff - b.lenDiff || a.candidate.localeCompare(b.candidate))
  return results.slice(0, limit).map(r => r.candidate)
}

async function maybeYield(index) {
  if (index % YIELD_EVERY === 0) {
    await new Promise(resolve => setTimeout(resolve, 0))
  }
}

self.onmessage = async (event) => {
  const payload = event.data || {}

  try {
    if (payload.type === 'init') {
      await loadSpell(payload)
      self.postMessage({ type: 'ready', canSuggest: true, suggestMode })
      return
    }

    if (payload.type === 'addPersonal') {
      if (payload.word) {
        const normalized = normalizeHebrew(payload.word)
        if (spell && useNspell) spell.add(normalized)
        if (wordSet) wordSet.add(normalized)
        if (prefixIndex) addToIndex(prefixIndex, normalized)
      }
      return
    }

    if (payload.type === 'check') {
      await loadSpell(payload)
      const limit = Number.isFinite(payload.limit) ? payload.limit : 1500

      const counts = new Map()
      const words = extractHebrewWords(payload.text || '')
      const maxWords = Number.isFinite(payload.maxWords) ? payload.maxWords : MAX_WORDS_TO_CHECK
      const length = Math.min(words.length, maxWords)

      for (let i = 0; i < length; i += 1) {
        const word = words[i]
        counts.set(word, (counts.get(word) || 0) + 1)
        await maybeYield(i)
      }

      const misspellings = []
      const entries = Array.from(counts.entries())
      for (let i = 0; i < entries.length; i += 1) {
        const [word, count] = entries[i]
        if (!isCorrect(word)) {
          misspellings.push({ word, count })
          if (misspellings.length >= limit) break
        }
        await maybeYield(i)
      }

      misspellings.sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
      const limited = misspellings.length >= limit
      const wordsLimited = words.length > maxWords
      self.postMessage({ type: 'checkResult', misspellings, limited, wordsLimited })
      return
    }

    if (payload.type === 'suggest') {
      if (!payload.word) {
        self.postMessage({ type: 'suggestResult', suggestions: [], canSuggest: true, suggestMode })
        return
      }
      const limit = Number.isFinite(payload.limit) ? payload.limit : 8
      let suggestions = []
      if (spell && useNspell) {
        try {
          const next = spell.suggest(payload.word)
          suggestions = Array.isArray(next) ? next.slice(0, limit) : []
        } catch (err) {
          useNspell = false
          suggestMode = 'fuzzy'
          suggestions = fuzzySuggest(payload.word, limit)
        }
      } else {
        suggestions = fuzzySuggest(payload.word, limit)
      }
      self.postMessage({ type: 'suggestResult', suggestions, canSuggest: true, suggestMode })
      return
    }
  } catch (err) {
    self.postMessage({ type: 'error', message: err?.message || 'Worker error' })
  }
}
