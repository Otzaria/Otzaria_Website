'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Button from '@/components/ui/Button'
import { useLoading } from '@/components/providers/LoadingContext'

const HEBREW_CHARS = "\\u0590-\\u05FF"
const MISSPELLINGS_LIMIT = 1500
const DEFAULT_SUGGESTION_LIMIT = 8

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
  onSelectWord = () => {}
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
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const dragStartOffset = useRef({ x: 0, y: 0 })

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

  useEffect(() => {
    if (isOpen && typeof window !== 'undefined') {
      if (position.x === 0 && position.y === 0) {
        const width = 520
        const x = Math.max(16, window.innerWidth - width - 24)
        setPosition({ x, y: 96 })
      }
    }
  }, [isOpen, position.x, position.y])

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging) return
      setPosition({
        x: e.clientX - dragStartOffset.current.x,
        y: e.clientY - dragStartOffset.current.y,
      })
    }
    const handleMouseUp = () => setIsDragging(false)

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging])

  const handleMouseDown = (e) => {
    setIsDragging(true)
    dragStartOffset.current = { x: e.clientX - position.x, y: e.clientY - position.y }
  }

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
  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed z-[9999] w-[520px] max-h-[85vh] bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col" dir="rtl" style={{ left: `${position.x}px`, top: `${position.y}px` }}>
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 cursor-move select-none" onMouseDown={handleMouseDown}>
        <div>
          <h2 className="text-base font-bold text-gray-900">{title}</h2>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg" onMouseDown={(e) => e.stopPropagation()}>
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>

      <div className="flex flex-col md:flex-row overflow-auto">
        <div className="md:w-1/3 border-b md:border-b-0 md:border-r border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold text-gray-800">מילים חשודות</span>
            <Button
              variant="ghost"
              size="sm"
              icon="refresh"
              onClick={runSpellcheck}
              label="בדוק מחדש"
            />
          </div>

          {loading && (
            <div className="text-sm text-gray-500">בודק...</div>
          )}
          {error && (
            <div className="text-sm text-red-600">{error}</div>
          )}
          {!loading && !error && misspellings.length === 0 && (
            <div className="text-sm text-green-700">לא נמצאו שגיאות</div>
          )}
          {misspellingsLimited && (
            <div className="text-xs text-amber-600 mt-2">מוצגים עד {MISSPELLINGS_LIMIT} שגיאות ראשונות.</div>
          )}

          <div className="max-h-[360px] overflow-y-auto mt-2 space-y-2">
            {misspellings.map(item => (
              <button
                key={item.word}
                onClick={() => {
                  setSelectedWord(item.word)
                  setCustomReplacement('')
                  onSelectWord(item.word)
                }}
                className={`w-full text-right px-3 py-2 rounded-lg border transition-colors ${
                  selectedWord === item.word
                    ? 'border-blue-200 bg-blue-50 text-blue-900'
                    : 'border-gray-200 hover:bg-gray-50 text-gray-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{item.word}</span>
                  <span className="text-xs text-gray-500">{item.count}x</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm text-gray-500">מילה נבחרת</div>
              <div className="text-xl font-bold text-gray-900">{selectedWord || '—'}</div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                icon="bookmark_add"
                label="הוסף למילון"
                onClick={() => handleAddPersonal(selectedWord)}
                disabled={!selectedWord}
                title="המילה תתווסף למילון האישי שלכם ותישלח לאישור מנהל להוספה למילון הכללי"
              />
            </div>
          </div>

          <div className="text-sm font-bold text-gray-800 mb-2">החלף ב:</div>
          <div className="flex flex-col sm:flex-row gap-2 mb-3">
            <input
              type="text"
              value={customReplacement}
              onChange={(e) => setCustomReplacement(e.target.value)}
              placeholder="החלפה ידנית..."
              className="flex-1 px-3 py-2 border border-gray-200 rounded-md text-sm"
            />
            <Button
              variant="ghost"
              size="sm"
              icon="swap_horiz"
              onClick={() => handleReplaceAll(selectedWord, customReplacement)}
              label="החלף הכל"
              disabled={!selectedWord || !customReplacement}
            />
          </div>
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-bold text-gray-800">הצעות</div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500">מספר הצעות</label>
                <select
                  value={suggestionLimit}
                  onChange={(e) => setSuggestionLimit(parseInt(e.target.value, 10))}
                  className="border border-gray-200 rounded-md text-xs px-2 py-1"
                >
                  <option value={0}>0</option>
                  <option value={4}>4</option>
                  <option value={8}>8</option>
                  <option value={12}>12</option>
                </select>
              </div>
            </div>

            {selectedWord && suggestions.length === 0 && (
              <div className="text-sm text-gray-500">אין הצעות זמינות</div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {suggestions.map(suggestion => (
                <div key={suggestion} className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2">
                  <span className="flex-1 text-sm text-gray-800">{suggestion}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon="swap_horiz"
                    onClick={() => handleReplaceAll(selectedWord, suggestion)}
                    label="החלף הכל"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="text-xs text-gray-500">
            מומלץ להריץ בדיקה מחדש אחרי החלפות גדולות.
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

