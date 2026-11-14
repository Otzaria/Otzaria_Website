'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Button from '@/components/ui/Button'
import FloatingPanel from '@/components/ui/FloatingPanel'
import { cx } from '@/components/ui/cx'
import { fieldClasses } from '@/components/ui/fieldStyles'
import { FOCUS_RING_INSET } from '@/components/ui/focusRing'
import { useLoading } from '@/components/providers/LoadingContext'

const HEBREW_CHARS = "\\u0590-\\u05FF"
const MISSPELLINGS_LIMIT = 1500
const DEFAULT_SUGGESTION_LIMIT = 8
const DIALOG_WIDTH = 560
const POSITION_STORAGE_KEY = 'spellcheckDialogPosition'

// ברירת המחדל: בצד שמאל של המסך (מעל הטקסט). המיקום עצמו נצמד לחלון ב-FloatingPanel.
function getDefaultPosition(vp) {
  return { x: Math.max(16, vp.width - DIALOG_WIDTH - 24), y: 96 }
}

function normalizeHebrew(text) {
  if (!text) return ''
  return text.replace(/["']/g, m => (m === '"' ? '״' : '׳'))
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function replaceAllOccurrences(text, word, replacement) {
  if (!word) return text
  const escaped = escapeRegExp(word)
    .replace(/\\"/g, '["״]')
    .replace(/\\'/g, "['׳]")
    .replace(/״/g, '["״]')
    .replace(/׳/g, "['׳]")
  const pattern = `(^|[^${HEBREW_CHARS}])(${escaped})(?=([^${HEBREW_CHARS}]|$))`
  const re = new RegExp(pattern, 'g')
  return text.replace(re, (match, prefix) => `${prefix}${replacement}`)
}

export default function SpellcheckDialog({
  isOpen,
  onClose,
  text,
  onApplyText,
  title = 'בדיקת איות',
  onSelectWord = () => {},
  returnFocus
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [misspellings, setMisspellings] = useState([])
  const [selectedWord, setSelectedWord] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [customReplacement, setCustomReplacement] = useState('')
  const [misspellingsLimited, setMisspellingsLimited] = useState(false)
  const [suggestionLimit, setSuggestionLimit] = useState(DEFAULT_SUGGESTION_LIMIT)
  const [personalWords, setPersonalWords] = useState([])
  const [globalWords, setGlobalWords] = useState([])
  const [isReady, setIsReady] = useState(false)

  const isMountedRef = useRef(true)
  const hasLoadedWordsRef = useRef(false)
  const personalWordsRef = useRef([])
  const globalWordsRef = useRef([])
  const checkAbortRef = useRef(null)
  const { startLoading, stopLoading } = useLoading()

  useEffect(() => {
    isMountedRef.current = true
    return () => { isMountedRef.current = false }
  }, [])

  useEffect(() => { personalWordsRef.current = personalWords }, [personalWords])
  useEffect(() => { globalWordsRef.current = globalWords }, [globalWords])

  async function fetchPersonalWords() {
    try {
      const res = await fetch('/api/user/spell-words')
      if (!res.ok) return []
      const data = await res.json()
      return Array.isArray(data.spellWords) ? data.spellWords : []
    } catch { return [] }
  }

  async function fetchGlobalWords() {
    try {
      const res = await fetch('/api/spell-words/global')
      if (!res.ok) return []
      const data = await res.json()
      return Array.isArray(data.words) ? data.words : []
    } catch { return [] }
  }

  const runSpellcheck = useCallback(async (wordsOverride = null, options = null) => {
    if (!isOpen) return
    const silent = !!options?.silent
    if (!silent) {
      setLoading(true)
      setError(null)
      setMisspellings([])
      setSuggestions([])
    }

    if (checkAbortRef.current) checkAbortRef.current.abort()
    const controller = new AbortController()
    checkAbortRef.current = controller

    const wordsForSpell = Array.isArray(wordsOverride)
      ? wordsOverride
      : Array.from(new Set([...(personalWordsRef.current || []), ...(globalWordsRef.current || [])]))

    try {
      const res = await fetch('/api/spellcheck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'check',
          text: normalizeHebrew(text),
          personalWords: wordsForSpell,
        }),
        signal: controller.signal,
      })

      if (!isMountedRef.current) return
      if (!res.ok) throw new Error('שגיאת שרת')
      const data = await res.json()

      setMisspellings(data.misspellings || [])
      setMisspellingsLimited(!!data.limited)
      setSelectedWord(data.misspellings?.[0]?.word || '')
      setCustomReplacement('')
      setLoading(false)
      setIsReady(true)
      stopLoading()
    } catch (err) {
      if (err.name === 'AbortError') return
      if (!isMountedRef.current) return
      setError(err.message || 'שגיאה בבדיקת האיות')
      setLoading(false)
      setIsReady(true)
      stopLoading()
    }
  }, [isOpen, text, stopLoading])

  useEffect(() => {
    if (!isOpen) {
      hasLoadedWordsRef.current = false
      if (checkAbortRef.current) checkAbortRef.current.abort()
      setIsReady(false)
      stopLoading()
      return
    }
    if (hasLoadedWordsRef.current) return
    hasLoadedWordsRef.current = true

    startLoading('בודק איות...', () => {
      if (checkAbortRef.current) checkAbortRef.current.abort()
      setLoading(false)
      setMisspellings([])
      setSuggestions([])
      setSelectedWord('')
      setCustomReplacement('')
      hasLoadedWordsRef.current = false
      setIsReady(false)
      onClose()
    })

    Promise.all([fetchPersonalWords(), fetchGlobalWords()]).then(([personal, global]) => {
      if (!isMountedRef.current) return
      setPersonalWords(personal)
      setGlobalWords(global)
      const combined = Array.from(new Set([...(personal || []), ...(global || [])]))
      runSpellcheck(combined)
    })
  // callbacks מוחרגים; האפקט מתבסס על מצב הפתיחה
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, runSpellcheck])

  // Fetch suggestions from server whenever selected word changes
  useEffect(() => {
    if (!selectedWord) {
      setSuggestions([])
      return
    }

    const controller = new AbortController()

    ;(async () => {
      try {
        const res = await fetch('/api/spellcheck', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'suggest',
            word: normalizeHebrew(selectedWord),
            limit: suggestionLimit,
          }),
          signal: controller.signal,
        })
        if (!res.ok) return
        const data = await res.json()
        if (isMountedRef.current) setSuggestions(data.suggestions || [])
      } catch (err) {
        if (err.name === 'AbortError') return
      }
    })()

    return () => controller.abort()
  }, [selectedWord, suggestionLimit])

  const handleReplaceAll = (word, replacement) => {
    if (!word || !replacement) return
    const nextText = replaceAllOccurrences(text, word, replacement)
    if (nextText !== text) {
      onApplyText(nextText)
      setMisspellings(prev => {
        const next = prev.filter(item => item.word !== word)
        if (selectedWord === word) setSelectedWord(next[0]?.word || '')
        return next
      })
      setSuggestions([])
      setCustomReplacement('')
    }
  }

  const handleAddPersonal = async (word) => {
    if (!word) return
    const normalized = normalizeHebrew(word)
    try {
      const res = await fetch('/api/user/spell-words', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: normalized })
      })
      if (!res.ok) return
      const data = await res.json()
      const nextPersonal = Array.isArray(data.spellWords)
        ? data.spellWords
        : Array.from(new Set([...(personalWords || []), normalized]))
      setPersonalWords(nextPersonal)
      setMisspellings(prev => {
        const next = prev.filter(item => item.word !== normalized)
        if (selectedWord === normalized) setSelectedWord(next[0]?.word || '')
        return next
      })
      runSpellcheck(nextPersonal || [], { silent: true })
    } catch {
      // ignore
    }
  }

  if (!isOpen) return null
  if (!isReady) return null
  return (
    <FloatingPanel
      title={title}
      icon="spellcheck"
      onClose={onClose}
      storageKey={POSITION_STORAGE_KEY}
      width={DIALOG_WIDTH}
      defaultPosition={getDefaultPosition}
      returnFocus={returnFocus}
      bodyClassName="p-0"
    >
      <div className="flex flex-col sm:flex-row">
        <div className="border-b border-outline-variant p-4 sm:w-2/5 sm:border-b-0 sm:border-e">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-label-lg text-on-surface">מילים חשודות</h3>
            <Button variant="text" size="sm" iconOnly icon="refresh" aria-label="בדיקה מחדש" title="בדיקה מחדש" onClick={runSpellcheck} />
          </div>

          <div role="status" className="text-body-sm">
            {loading && <p className="text-on-surface-variant">בודק...</p>}
            {error && <p className="text-error">{error}</p>}
            {!loading && !error && misspellings.length === 0 && <p className="text-on-surface-variant">לא נמצאו שגיאות</p>}
            {misspellingsLimited && <p className="mt-2 text-on-surface-variant">מוצגות {MISSPELLINGS_LIMIT} השגיאות הראשונות.</p>}
          </div>

          <ul className="custom-scrollbar mt-2 max-h-[min(360px,30dvh)] space-y-1 overflow-y-auto sm:max-h-[360px]">
            {misspellings.map(item => (
              <li key={item.word}>
                <button
                  type="button"
                  aria-pressed={selectedWord === item.word}
                  onClick={() => {
                    setSelectedWord(item.word)
                    setCustomReplacement('')
                    onSelectWord(item.word)
                  }}
                  className={cx(
                    'flex min-h-(--touch-target) w-full items-center justify-between gap-2 rounded-(--radius-control) px-3 text-start text-body-md text-on-surface transition-colors',
                    selectedWord === item.word
                      ? 'bg-[var(--editor-selection-bg,var(--color-surface-selected))]'
                      : 'hover:bg-surface-container-high',
                    FOCUS_RING_INSET
                  )}
                >
                  <span className="truncate">{item.word}</span>
                  <span className="shrink-0 text-label-md text-on-surface-variant" aria-label={`${item.count} פעמים`}>{item.count}×</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="min-w-0 flex-1 space-y-4 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-label-md text-on-surface-variant">מילה נבחרת</p>
              <p className="truncate text-title-lg text-on-surface">{selectedWord || '—'}</p>
            </div>
            <Button
              variant="text"
              size="sm"
              icon="bookmark_add"
              onClick={() => handleAddPersonal(selectedWord)}
              disabled={!selectedWord}
              title="המילה תתווסף למילון האישי שלך ותישלח לאישור מנהל להוספה למילון הכללי"
              className="whitespace-nowrap"
            >
              הוסף למילון
            </Button>
          </div>

          <div>
            <label htmlFor="spell-replacement" className="mb-1 block text-label-lg text-on-surface">החלף ב</label>
            <div className="flex gap-2">
              <input
                id="spell-replacement"
                type="text"
                value={customReplacement}
                onChange={(e) => setCustomReplacement(e.target.value)}
                placeholder="החלפה ידנית..."
                className={fieldClasses({ className: 'min-w-0 flex-1 text-body-sm' })}
              />
              <Button
                variant="tonal"
                size="sm"
                onClick={() => handleReplaceAll(selectedWord, customReplacement)}
                disabled={!selectedWord || !customReplacement}
                className="shrink-0 whitespace-nowrap"
              >
                החלפת הכול
              </Button>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-label-lg text-on-surface">הצעות</h3>
              <label className="flex items-center gap-2 whitespace-nowrap text-label-md text-on-surface-variant">
                מספר הצעות
                <select
                  value={suggestionLimit}
                  onChange={(e) => setSuggestionLimit(parseInt(e.target.value, 10))}
                  className={fieldClasses({ kind: 'select', className: 'w-auto min-h-(--touch-target) text-body-sm' })}
                >
                  <option value={0}>0</option>
                  <option value={4}>4</option>
                  <option value={8}>8</option>
                  <option value={12}>12</option>
                </select>
              </label>
            </div>

            {selectedWord && suggestions.length === 0 && (
              <p className="text-body-sm text-on-surface-variant">אין הצעות זמינות</p>
            )}
            <ul className="grid grid-cols-1 gap-1.5">
              {suggestions.map(suggestion => (
                <li key={suggestion} className="flex items-center gap-2 rounded-(--radius-control) border border-outline-variant py-0.5 ps-3 pe-0.5">
                  <span className="min-w-0 flex-1 truncate text-body-md text-on-surface">{suggestion}</span>
                  <Button
                    variant="text"
                    size="sm"
                    onClick={() => handleReplaceAll(selectedWord, suggestion)}
                    aria-label={`החלפת הכול ב${suggestion}`}
                    className="shrink-0 whitespace-nowrap"
                  >
                    החלפת הכול
                  </Button>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-body-sm text-on-surface-variant">
            מומלץ להריץ בדיקה מחדש אחרי החלפות גדולות.
          </p>
        </div>
      </div>
    </FloatingPanel>
  )
}
