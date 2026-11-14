'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Button from '@/components/ui/Button'
import { useDialog } from '@/components/providers/DialogContext'
import FastItemCard from './FastItemCard'
import HelpDialog, { HelpButton } from './HelpDialog'
import KindFilter from './KindFilter'
import StatsStrip from './StatsStrip'
import { AccessNotice } from './TzuratShell'
import { api } from './api'
import { answerBody, answerReady, keyAction, pushExclude } from './fastLogic'
import { BASE_PATH, PRACTICE_PATH, SAVED_NOTE } from './labels'

// המסלול המהיר: כרטיס החלטה אחד בכל פעם (כמו /library/ocr-layout). אחרי תשובה — "נשמר — תודה" (בלי לגלות אם
// התשובה נכונה: שני מתנדבים עונים בלי לראות זה את זה), והכרטיס הבא. מקשים: 1–4 בחירה, Enter שמירה, N דילוג,
// O "משהו אחר", U "לא ברור" (לא בתוך שדה הקלדה).

const KIND_KEY = 'tzuratHadaf.fastKind'
const FLASH_MS = 1800

function readKind() {
  try {
    const v = window.localStorage.getItem(KIND_KEY)
    return ['any', 'g', 'r', 't'].includes(v) ? v : 'any'
  } catch {
    return 'any'
  }
}

export default function FastTrack() {
  const { showAlert } = useDialog()
  const [kind, setKind] = useState('any')
  const [item, setItem] = useState(null)
  const [value, setValue] = useState(null)
  const [stats, setStats] = useState(null)
  const [flags, setFlags] = useState({ needPractice: false })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState('')
  const [fail, setFail] = useState(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const excludeRef = useRef([])
  const textRef = useRef(null)
  const kindRef = useRef('any')
  const flashTimer = useRef(0)

  const load = useCallback(async (k = kindRef.current, withStats = false) => {
    setLoading(true)
    const r = await api.fast({ exclude: excludeRef.current, kind: k, stats: withStats })
    setLoading(false)
    if (!r.ok) {
      setFail({ status: r.status, error: r.error })
      setItem(null)
      return
    }
    setFail(null)
    setItem(r.data.item || null)
    setValue(null)
    if (r.data.stats) setStats(r.data.stats)
    setFlags({ needPractice: !!r.data.needPractice })
  }, [])

  useEffect(() => {
    const saved = readKind()
    kindRef.current = saved
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setKind(saved)
    load(saved, true)
    return () => clearTimeout(flashTimer.current)
  }, [load])

  const changeKind = useCallback(
    (k) => {
      kindRef.current = k
      setKind(k)
      try {
        window.localStorage.setItem(KIND_KEY, k)
      } catch {
        /* אחסון חסום */
      }
      load(k, true)
    },
    [load]
  )

  const showFlash = useCallback((msg) => {
    setFlash(msg)
    clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlash(''), FLASH_MS)
  }, [])

  const submit = useCallback(async () => {
    if (!item || saving) return
    const body = answerBody(value, 'fast')
    if (!body) return
    setSaving(true)
    const r = await api.answer(item.id, { ...body, revision: item.revision })
    setSaving(false)
    excludeRef.current = pushExclude(excludeRef.current, item.id)
    if (r.ok) {
      showFlash(SAVED_NOTE)
      setStats((s) => (s ? { ...s, mine: (s.mine || 0) + 1 } : s))
      load()
    } else if (r.status === 409) {
      // מישהו הקדים, או שכבר עניתם — פשוט ממשיכים
      showFlash(
        r.code === 'answered'
          ? 'כבר עניתם על השאלה הזו'
          : r.code === 'paused'
            ? 'המסכת הזו מושהית כרגע — הנה שאלה אחרת'
            : 'השאלה כבר הוכרעה — הנה הבאה'
      )
      load()
    } else {
      showAlert('שגיאה', r.error)
    }
  }, [item, saving, value, load, showAlert, showFlash])

  const skip = useCallback(() => {
    if (!item || saving) return
    excludeRef.current = pushExclude(excludeRef.current, item.id)
    load()
  }, [item, saving, load])

  const flag = useCallback(async () => {
    if (!item || saving) return
    setSaving(true)
    const r = await api.flag(item.id, 'crop')
    setSaving(false)
    excludeRef.current = pushExclude(excludeRef.current, item.id)
    if (r.ok || r.status === 409) {
      showFlash('תודה — הסימון נרשם, והשאלה תיבדק')
      load()
    } else showAlert('שגיאה', r.error)
  }, [item, saving, load, showAlert, showFlash])

  useEffect(() => {
    const onKey = (e) => {
      if (helpOpen || document.querySelector('[role="dialog"]')) return
      const a = keyAction(e, item)
      if (!a) return
      e.preventDefault()
      if (a.type === 'choose') setValue({ choice: a.id })
      else if (a.type === 'unclear') setValue({ choice: 'unclear' })
      else if (a.type === 'other') textRef.current?.focus()
      else if (a.type === 'skip') skip()
      else if (a.type === 'submit' && answerReady(value)) submit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [item, value, helpOpen, skip, submit])

  // התרגול חוסם רק כשיש פריטי תרגול — וזה ידוע רק לשרת (needPractice ב-fast)
  const needPractice = flags.needPractice

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <KindFilter value={kind} onChange={changeKind} disabled={loading || saving} />
        <div className="flex items-center gap-2">
          <StatsStrip stats={stats} />
          <HelpButton onClick={() => setHelpOpen(true)} />
        </div>
      </div>

      <div aria-live="polite" className="min-h-6">
        {flash && (
          <p className="inline-flex items-center gap-1 rounded-full bg-success-100 px-3 py-1 text-sm font-bold text-success-800" data-testid="flash">
            <span aria-hidden="true" className="material-symbols-outlined text-base">check</span>
            {flash}
          </p>
        )}
      </div>

      {fail ? (
        <AccessNotice status={fail.status} error={fail.error} onRetry={() => load()} />
      ) : needPractice && !item ? (
        <div className="glass-strong flex flex-col items-center gap-4 rounded-xl p-8 text-center">
          <span aria-hidden="true" className="material-symbols-outlined text-5xl text-primary">school</span>
          <p className="text-lg font-bold text-on-surface">לפני שמתחילים — תרגול קצר של עשר שאלות</p>
          <p className="text-on-surface/70">בתרגול רואים את התשובה הנכונה ואת ההסבר אחרי כל שאלה. זה לוקח כמה דקות.</p>
          <Button href={PRACTICE_PATH} prefetch={false} icon="school">
            לתרגול
          </Button>
        </div>
      ) : loading && !item ? (
        <div className="glass-strong rounded-xl p-10 text-center text-on-surface/60" role="status">
          טוען שאלה...
        </div>
      ) : !item ? (
        <div className="glass-strong flex flex-col items-center gap-4 rounded-xl p-10 text-center" data-testid="empty">
          <span aria-hidden="true" className="material-symbols-outlined text-5xl text-success-600">task_alt</span>
          <p className="font-medium text-on-surface/80">
            {kind === 'any' ? 'אין כרגע שאלות פתוחות בשבילכם — תודה רבה על העזרה!' : 'אין כרגע שאלות פתוחות מהסוג הזה.'}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {kind !== 'any' && (
              <Button variant="tonal" onClick={() => changeKind('any')}>
                כל הסוגים
              </Button>
            )}
            <Button variant="outlined" icon="refresh" onClick={() => load()}>
              בדוק שוב
            </Button>
            <Button variant="text" href={`${BASE_PATH}/pages`} prefetch={false}>
              לבדיקת עמוד שלם
            </Button>
          </div>
        </div>
      ) : (
        <div className="glass-strong flex flex-col gap-4 rounded-xl p-4 sm:p-6" aria-busy={loading || saving}>
          <FastItemCard key={item.id} item={item} value={value} onChange={setValue} onFlag={flag} disabled={saving || loading} textRef={textRef} />
          <div className="flex flex-wrap items-center gap-2 border-t border-outline-variant pt-4">
            <Button icon="check" onClick={submit} disabled={!answerReady(value) || loading} loading={saving} title="שמירה (Enter)">
              שמירה
            </Button>
            <Button variant="outlined" icon="skip_next" onClick={skip} disabled={saving || loading} title="דילוג (N)">
              דילוג
            </Button>
            <Link href={`${BASE_PATH}/mine`} prefetch={false} className="ms-auto text-sm text-on-surface/60 hover:text-primary">
              התרומות שלי
            </Link>
          </div>
        </div>
      )}

      <HelpDialog track="fast" open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  )
}
