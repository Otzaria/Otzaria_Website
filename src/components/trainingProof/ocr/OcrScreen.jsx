'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useDialog } from '@/components/providers/DialogContext'
import { useRound } from '../common/useRound'
import { progress, countBy, nextIndex, isTypingTarget, isHandled } from '../common/roundModel'
import RoundHeader from '../common/RoundHeader'
import RoundEnd from '../common/RoundEnd'
import RoundStates, { LostNotice } from '../common/RoundStates'
import GuideBox from '../common/GuideBox'
import FullPageDialog from '../common/FullPageDialog'
import Kbd from '../common/Kbd'
import OcrLineCard from './OcrLineCard'
import { revealCard } from './calmScroll'
import { SCREEN_KEYS, keyOf } from './screenKeys'

const HOME = '/library/page-proof'

// זיהוי-הטקסט (docs/75 §2): 30 שורות מכל הספרים והכתבים, כמו מסך ההגהה בתחנה.
// מקשים: 1 נכון · 2 תקן · 3 דלג · 4 לא קריא · 5 הכתב שגוי · ↑↓ שורה (בלי "חיתוך גרוע" — screenKeys).
// כל סימון נשמר מיד; אחריו עוברים לשורה הבאה שלא טופלה — בלי לגלול כשהיא כבר נראית (calmScroll).
// בכניסה לסבב ("קח 30 נוספות", או חזרה אחרי רענון) — השורה הפתוחה הראשונה נוכחית, נגללת לתוך
// החלון אם צריך (גם אחרי "קח 30" הדף נשאר למטה, ליד הכפתור) ומקבלת מיקוד.
export default function OcrScreen() {
  const round = useRound('ocr')
  const router = useRouter()
  if (round.status !== 'ready') return <RoundStates round={round} onHome={() => router.push(HOME)} />
  // key — סבב חדש מתחיל ממצב נקי (השורה הנוכחית, הטיוטות)
  return <OcrRound key={round.round} round={round} />
}

function OcrRound({ round }) {
  const router = useRouter()
  const { showAlert } = useDialog()
  const [cur, setCur] = useState(() => Math.max(0, round.items.findIndex((it) => !isHandled(it))))
  const [editing, setEditing] = useState(null)
  const [ctxOf, setCtxOf] = useState(null)
  const scrollNext = useRef(true)
  const focusFirst = useRef(true)
  const top = useRef(null)
  const { items } = round
  const { done, total } = progress(items)

  useEffect(() => {
    if (!scrollNext.current) return
    scrollNext.current = false
    const id = items[cur]?.id
    // הכותרות הדביקות: של האתר, ושל הסבב (RoundHeader — הילד הראשון כאן)
    const stickies = [...document.querySelectorAll('header'), top.current?.firstElementChild]
    const el = id ? document.getElementById(`tp-line-${id}`) : null
    if (!el) return
    revealCard(el, { stickies })
    if (focusFirst.current) {
      focusFirst.current = false
      el.focus({ preventScroll: true })
    }
  }, [cur, items])

  const move = useCallback((i) => {
    scrollNext.current = true
    setCur(Math.max(0, Math.min(items.length - 1, i)))
  }, [items.length])

  const mark = useCallback(
    async (i, action, text) => {
      const it = items[i]
      if (!it || it.skipped) return
      setEditing(null)
      const r = await round.mark(it.id, action === 'fixed' ? { action, text } : { action })
      if (!r.ok) return showAlert('השמירה נכשלה', r.error)
      if (action === 'router') showAlert('הועבר לנתב הכתב', 'אחרי שייקבע הכתב הנכון — השורה תחזור להגהה')
      if (i === cur) move(nextIndex(items, i))
    },
    [items, round, cur, move, showAlert]
  )

  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target) || ctxOf) return
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        move(cur + (e.key === 'ArrowDown' ? 1 : -1))
        return
      }
      const action = SCREEN_KEYS[e.key]
      if (!action) return
      e.preventDefault()
      if (action === 'fixed') setEditing(items[cur]?.id || null)
      else mark(cur, action)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cur, items, mark, move, ctxOf])

  const goHome = async () => {
    await round.release()
    router.push(HOME)
  }

  const by = countBy(items, (it) => it.result?.action)
  const summary = `${by.ok || 0} נכונות · ${by.fixed || 0} תוקנו · ${by.bad || 0} לא קריא · ${by.skip || 0} דילגתם · ${by.router || 0} חזרו לנתב${by.seg ? ` · ${by.seg} חיתוך גרוע` : ''}`

  return (
    <div ref={top} className="flex flex-col gap-3">
      <RoundHeader title="זיהוי טקסט" done={done} total={total} onHome={goHome} />
      {round.lost ? <LostNotice onRetake={round.take} /> : null}
      <p className="text-body-sm leading-8 text-on-surface-variant">
        <Kbd>{keyOf('ok')}</Kbd> נכון · <Kbd>{keyOf('fixed')}</Kbd> תקן (ואז <Kbd>Enter</Kbd> שומר, <Kbd>Esc</Kbd> מבטל) · <Kbd>{keyOf('skip')}</Kbd> דלג ·{' '}
        <Kbd>{keyOf('bad')}</Kbd> לא קריא · <Kbd>{keyOf('router')}</Kbd> הכתב שגוי · <Kbd>↓</Kbd>/<Kbd>↑</Kbd> שורה אחרת. כל לחיצה נשמרת מיד.
      </p>
      <GuideBox section="ocr" />
      <div className="flex flex-col gap-3">
        {items.map((it, i) => (
          <OcrLineCard
            key={it.id}
            item={it}
            index={i}
            total={total}
            current={i === cur}
            saving={!!round.saving[it.id]}
            editing={editing === it.id}
            onSelect={() => setCur(i)}
            onMark={(action, text) => {
              setCur(i)
              mark(i, action, text)
            }}
            onEdit={() => {
              setCur(i)
              setEditing(it.id)
            }}
            onCancelEdit={() => setEditing(null)}
            onShowCtx={() => setCtxOf(it)}
          />
        ))}
      </div>
      <RoundEnd done={done} total={total} summary={summary} onMore={round.take} onStop={goHome} />
      {ctxOf?.ctx ? <FullPageDialog ctx={ctxOf.ctx} alias={ctxOf.alias} page={ctxOf.page} onClose={() => setCtxOf(null)} /> : null}
    </div>
  )
}
