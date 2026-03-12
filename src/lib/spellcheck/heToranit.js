'use client'

import nspell from 'nspell'

const DICT_BASE_PATH = '/spellcheck'
const AFFIX_PATH = `${DICT_BASE_PATH}/he_TORANIT.aff`
const DICT_PATH = `${DICT_BASE_PATH}/he_TORANIT.dic`
const PERSONAL_WORDS_KEY = 'toranit_personal_words'

let cachedSpell = null
let pendingLoad = null

function loadPersonalWords(spell) {
  if (typeof window === 'undefined') return
  try {
    const raw = localStorage.getItem(PERSONAL_WORDS_KEY)
    if (!raw) return
    const words = JSON.parse(raw)
    if (!Array.isArray(words)) return
    words.forEach(word => {
      if (typeof word === 'string' && word.trim()) {
        spell.add(word.trim())
      }
    })
  } catch (err) {
    console.warn('Failed to load personal spelling words', err)
  }
}

export function addPersonalWord(word) {
  if (typeof window === 'undefined') return
  const clean = (word || '').trim()
  if (!clean) return
  try {
    const raw = localStorage.getItem(PERSONAL_WORDS_KEY)
    const words = raw ? JSON.parse(raw) : []
    if (!Array.isArray(words)) return
    if (!words.includes(clean)) {
      words.push(clean)
      localStorage.setItem(PERSONAL_WORDS_KEY, JSON.stringify(words))
    }
    if (cachedSpell) cachedSpell.add(clean)
  } catch (err) {
    console.warn('Failed to save personal spelling word', err)
  }
}

export async function getToranitSpell() {
  if (cachedSpell) return cachedSpell
  if (pendingLoad) return pendingLoad

  pendingLoad = (async () => {
    const [aff, dic] = await Promise.all([
      fetch(AFFIX_PATH).then(res => {
        if (!res.ok) throw new Error(`Failed to load ${AFFIX_PATH}`)
        return res.text()
      }),
      fetch(DICT_PATH).then(res => {
        if (!res.ok) throw new Error(`Failed to load ${DICT_PATH}`)
        return res.text()
      })
    ])

    const spell = nspell(aff, dic)
    loadPersonalWords(spell)
    cachedSpell = spell
    return spell
  })()

  return pendingLoad
}

export const TORANIT_DICT_PATHS = {
  aff: AFFIX_PATH,
  dic: DICT_PATH
}
