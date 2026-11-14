'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Button from '@/components/ui/Button'
import { useDialog } from '@/components/providers/DialogContext'
import FastItemCard from './FastItemCard'
import { AccessNotice } from './TzuratShell'
import { api } from './api'
import { answerReady, keyAction } from './fastLogic'
import { FAST_PATH, guideHref, num } from './labels'
import { SECTION_LABEL, guideSuggestions, practiceAnswers, resultsById } from './practiceLogic'

// תרגול לפני המסלול המהיר: עד עשרה כרטיסים (אותו FastItemCard), התשובות נאספות ונשלחות יחד בסוף
// (POST /api/tzurat-hadaf/practice), ואז לכל כרטיס — אם צדקתם, התשובה הנכונה וההסבר.

export default function PracticeRunner() {
  const { showAlert } = useDialog()
  const [items, setItems] = useState(null)
  const [fail, setFail] = useState(null)
  const [i, setI] = useState(0)
  const [values, setValues] = useState({})
  const [sending, setSending] = useState(false)
  const [outcome, setOutcome] = useState(null)
  const textRef = useRef(null)

  useEffect(() => {
    let alive = true
    api.practice().then((r) => {
      if (!alive) return
      if (r.ok) setItems(r.data.items || [])
      else setFail({ status: r.status, error: r.error })
    })
    return () => {
      alive = false
    }
  }, [])

  const item = items?.[i] || null
  const value = item ? values[item.id] || null : null
  const last = items ? i >= items.length - 1 : false
  const setValue = useCallback((v) => item && setValues((m) => ({ ...m, [item.id]: v })), [item])

  const finish = useCallback(async () => {
    if (!items || sending) return
    setSending(true)
    const r = await api.submitPractice(practiceAnswers(items, values))
    setSending(false)
    if (!r.ok) {
      showAlert('שגיאה', r.error)
      return
    }
    setOutcome(r.data)
    window.scrollTo?.({ top: 0 })
  }, [items, values, sending, showAlert])

  const next = useCallback(() => {
    if (!answerReady(value)) return
    if (last) finish()
    else setI((n) => n + 1)
  }, [value, last, finish])

  useEffect(() => {
    if (outcome || !item) return undefined
    const onKey = (e) => {
      if (document.querySelector('[role="dialog"]')) return
      const a = keyAction(e, item)
      if (!a || a.type === 'skip') return
      e.preventDefault()
      if (a.type === 'choose') setValue({ choice: a.id })
      else if (a.type === 'unclear') setValue({ choice: 'unclear' })
      else if (a.type === 'other') textRef.current?.focus()
      else if (a.type === 'submit') next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [item, outcome, setValue, next])

  const results = useMemo(() => (outcome ? resultsById(items, outcome.results) : null), [outcome, items])
  const suggest = useMemo(() => (outcome ? guideSuggestions(items, outcome.results) : []), [outcome, items])

  if (fail) return <AccessNotice status={fail.status} error={fail.error} />
  if (!items) return <p className="glass-strong rounded-xl p-8 text-center text-on-surface/60" role="status">טוען את התרגול...</p>
  if (!items.length) {
    return (
      <div className="glass-strong flex flex-col items-center gap-3 rounded-xl p-8 text-center">
        <p className="text-on-surface/80">אין כרגע שאלות לתרגול.</p>
        <Button href={FAST_PATH} prefetch={false}>
          למסלול המהיר
        </Button>
      </div>
    )
  }

  if (outcome) {
    return (
      <div className="flex flex-col gap-4">
        <div className="glass-strong flex flex-col items-center gap-3 rounded-xl p-6 text-center" role="status">
          <span aria-hidden="true" className="material-symbols-outlined text-5xl text-primary">emoji_events</span>
          <p className="text-xl font-bold text-on-surface" data-testid="practice-score">
            ענית נכון על {num(outcome.score)} מתוך {num(outcome.total)}
          </p>
          <p className="text-on-surface/70">למטה — כל שאלה עם התשובה הנכונה וההסבר.</p>
          {suggest.length > 0 && (
            <div className="rounded-lg border border-warning-alt-200 bg-warning-alt-50 p-3 text-start text-sm text-warning-alt-800" data-testid="practice-suggest">
              <p className="font-bold">כדאי לקרוא בהנחיות לפני שמתחילים:</p>
              <ul className="mt-1 list-disc pr-5">
                {suggest.map((s) => (
                  <li key={s}>
                    <a href={guideHref(s)} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">
                      {SECTION_LABEL[s] || s}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Button href={FAST_PATH} prefetch={false} icon="quiz">
            למסלול המהיר
          </Button>
        </div>
        {items.map((it) => (
          <div key={it.id} className="glass-strong rounded-xl p-4">
            <FastItemCard item={it} value={values[it.id] || null} disabled compact result={results[it.id] || { correct: false, expectedText: '', explain: it.explain }} />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className="text-sm font-bold text-on-surface/70" data-testid="practice-progress">
          שאלה {num(i + 1)} מתוך {num(items.length)}
        </span>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-variant" aria-hidden="true">
          <div className="h-full bg-primary transition-all" style={{ width: `${((i + 1) / items.length) * 100}%` }} />
        </div>
      </div>
      <div className="glass-strong flex flex-col gap-4 rounded-xl p-4 sm:p-6">
        <FastItemCard key={item.id} item={item} value={value} onChange={setValue} textRef={textRef} />
        <div className="flex flex-wrap gap-2 border-t border-outline-variant pt-4">
          {i > 0 && (
            <Button variant="outlined" onClick={() => setI(i - 1)} disabled={sending}>
              הקודמת
            </Button>
          )}
          <Button onClick={next} disabled={!answerReady(value)} loading={sending} icon={last ? 'done_all' : undefined}>
            {last ? 'סיום ובדיקה' : 'הבאה'}
          </Button>
        </div>
      </div>
    </div>
  )
}
