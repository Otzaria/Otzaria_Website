import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

const HEBREW_WORD_RE = /[\u0590-\u05FF"'"'"'״׳]+/g
const USE_PREFIXES = ['ו', 'ב', 'כ', 'ל', 'מ', 'ש', 'ה']
const MISSPELLINGS_LIMIT = 1500
const MAX_SUGGEST_CANDIDATES = 3000

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
  ['ש', ['ס']],
])

// Module-level cache — built once per process
let wordSet = null
let prefixIndex = null
let loadPromise = null

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
    const list = map.get(key2)
    if (list) list.push(word)
    else map.set(key2, [word])
  }
  if (key1 && key1 !== key2) {
    const list = map.get(key1)
    if (list) list.push(word)
    else map.set(key1, [word])
  }
}

function buildWordSet(dicText) {
  const set = new Set()
  const index = new Map()
  const lines = dicText.split(/\r?\n/)
  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i]?.split('/')[0]?.trim()
    if (!raw) continue
    const word = normalizeHebrew(raw)
    if (!set.has(word)) {
      set.add(word)
      addToIndex(index, word)
    }
  }
  return { set, index }
}

async function loadDictionary() {
  if (wordSet !== null) return
  if (loadPromise) return loadPromise

  loadPromise = (async () => {
    const dicPath = path.join(process.cwd(), 'public', 'spellcheck', 'he_TORANIT.dic')
    const dicText = await fs.promises.readFile(dicPath, 'utf8')
    const built = buildWordSet(dicText)
    wordSet = built.set
    prefixIndex = built.index
  })()

  return loadPromise
}

function isCorrect(word, extraWords) {
  if (!word) return false
  if (extraWords?.has(word)) return true
  if (wordSet?.has(word)) return true
  if (word.length > 1) {
    const prefix = word[0]
    if (USE_PREFIXES.includes(prefix)) {
      const base = word.slice(1)
      if (base && base[0] !== prefix && (wordSet?.has(base) || extraWords?.has(base))) {
        return true
      }
    }
  }
  return false
}

function isConfusable(a, b) {
  return !!CONFUSABLES.get(a)?.includes(b)
}

function weightedDistance(a, b, maxDist) {
  if (a === b) return 0
  const alen = a.length
  const blen = b.length
  if (Math.abs(alen - blen) > maxDist) return maxDist + 1

  const v0 = new Array(blen + 1)
  const v1 = new Array(blen + 1)
  for (let i = 0; i <= blen; i++) v0[i] = i

  for (let i = 0; i < alen; i++) {
    v1[0] = i + 1
    let minRow = v1[0]
    const ca = a[i]
    for (let j = 0; j < blen; j++) {
      const cb = b[j]
      let cost = ca === cb ? 0 : (isConfusable(ca, cb) ? 0.5 : 1)
      const val = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost)
      v1[j + 1] = val
      if (val < minRow) minRow = val
    }
    if (minRow > maxDist) return maxDist + 1
    for (let j = 0; j <= blen; j++) v0[j] = v1[j]
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
  const combined = [...new Set([...bucketA, ...bucketB])]
  if (combined.length === 0) return []

  const maxDist = normalized.length <= 4 ? 1 : normalized.length <= 7 ? 2 : 3
  const maxCandidates = Math.min(combined.length, MAX_SUGGEST_CANDIDATES)

  const results = []
  for (let i = 0; i < maxCandidates; i++) {
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

export async function POST(request) {
  try {
    const body = await request.json()
    const { action = 'check', text, personalWords = [], word, limit = 8 } = body

    await loadDictionary()

    if (action === 'suggest') {
      const suggestions = fuzzySuggest(word || '', limit)
      return NextResponse.json({ suggestions })
    }

    // action === 'check'
    const extraWords = new Set(personalWords.map(w => normalizeHebrew(String(w))))
    const words = extractHebrewWords(text || '')

    const counts = new Map()
    for (let i = 0; i < words.length; i++) {
      const w = words[i]
      const existing = counts.get(w)
      if (existing) existing.count++
      else counts.set(w, { count: 1, firstIndex: i })
    }

    const misspellings = []
    for (const [w, data] of counts) {
      if (!isCorrect(w, extraWords)) {
        misspellings.push({ word: w, count: data.count, firstIndex: data.firstIndex })
        if (misspellings.length >= MISSPELLINGS_LIMIT) break
      }
    }

    misspellings.sort((a, b) => a.firstIndex - b.firstIndex)

    return NextResponse.json({
      misspellings,
      limited: misspellings.length >= MISSPELLINGS_LIMIT,
      wordsLimited: false,
    })
  } catch (err) {
    return NextResponse.json({ error: err?.message || 'שגיאת שרת' }, { status: 500 })
  }
}
