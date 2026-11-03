'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useDialog } from '@/components/providers/DialogContext'
import { useRound } from '../common/useRound'
import { progress, nextIndex, isTypingTarget } from '../common/roundModel'
import RoundHeader from '../common/RoundHeader'
import RoundEnd from '../common/RoundEnd'
import RoundStates, { LostNotice } from '../common/RoundStates'
import GuideBox from '../common/GuideBox'
import Kbd from '../common/Kbd'
import FullPageDialog from '../common/FullPageDialog'
import RouterLineCard from './RouterLineCard'
import {
  initDraft,
  withInkWords,
  isMixed,
  isComplete,
  toMarkBody,
  setLine,
  setBad,
  setWord,
  acceptSuggestion,
  keyAction,
  nextOpenWord,
  missingWords,
} from './routerDraft'

const HOME = '/library/page-proof'

// נתב-הכתב (docs/75 §2): כתב לשורה, ובשורה מעורבת — כתב לכל מילה. 30 שורות בסבב.
// מקשים: 1–4 כתב · Enter ההצעה נכונה · 0 פסול · Tab השורה/המילים · ←→ מילה · ↑↓ שורה.
// הטיוטה של כל שורה נשמרת באתר ברגע שהיא שלמה (בשורה מעורבת — כשלכל מילה יש כתב),
// ואחרי כל שינוי שלה.
export default function RouterScreen() {
  const round = useRound('router')
  const router = useRouter()
  // "קח 30 שורות נוספות" נלחץ למטה, בסוף הרשימה — הסבב החדש מביא את המתנדב לשורה הראשונה
  const jumpTopRef = useRef(false)
  const take = useCallback(() => {
    jumpTopRef.current = true
    return round.take()
  }, [round])
  if (round.status !== 'ready') return <RoundStates round={round} onHome={() => router.push(HOME)} />
  // key — סבב חדש מתחיל ממצב נקי (השורה הנוכחית, הטיוטות)
  return <RouterRound key={round.round} round={round} take={take} jumpTopRef={jumpTopRef} />
}

// הגלילה החלקה — רק כשהמשתמש לא ביקש "פחות תנועה"
const smooth = () => (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth')

function RouterRound({ round, take, jumpTopRef }) {
  const router = useRouter()
  const { showAlert } = useDialog()
  const [cur, setCur] = useState(0)
  const [drafts, setDrafts] = useState({})
  // השורה הראשונה: במעורבת — המקשים על המילים מהכניסה (כמו במעבר לשורה, goTo)
  const [focus, setFocus] = useState(() => {
    const first = round.items[0]
    return first && isMixed(initDraft(first), first) ? 'words' : 'line'
  })
  const [wsel, setWsel] = useState(0)
  // "הצג בעמוד המלא" — הפריט שהעמוד שלו פתוח; כל עוד החלון פתוח, המקשים לא מסמנים
  const [ctxOf, setCtxOf] = useState(null)
  const scrollNext = useRef(false)
  const { items } = round
  const { done, total } = progress(items)

  const draftOf = useCallback((it) => drafts[it.id] || initDraft(it), [drafts])

  useEffect(() => {
    if (!scrollNext.current) return
    scrollNext.current = false
    const id = items[cur]?.id
    if (id) document.getElementById(`tp-line-${id}`)?.scrollIntoView?.({ block: 'center', behavior: smooth() })
  }, [cur, items])

  // סבב חדש אחרי "קח 30 שורות נוספות": לראש הרשימה, והשורה הראשונה בפוקוס — המקשים עובדים מיד
  useEffect(() => {
    if (!jumpTopRef?.current) return
    jumpTopRef.current = false
    const first = items[0] && document.getElementById(`tp-line-${items[0].id}`)
    if (!first) return
    first.scrollIntoView?.({ block: 'start', behavior: smooth() })
    first.focus?.({ preventScroll: true })
    // רק בהרכבה של הסבב החדש
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // מעבר לשורה: במעורבת המקשים חלים על המילים, מהמילה הראשונה שלא סומנה
  const goTo = useCallback(
    (i, { scroll = true } = {}) => {
      const j = Math.max(0, Math.min(items.length - 1, i))
      const it = items[j]
      if (!it) return
      const d = draftOf(it)
      const mixed = isMixed(d, it)
      setFocus(mixed ? 'words' : 'line')
      setWsel(Math.max(0, (d.words || []).findIndex((w) => !w.label)))
      scrollNext.current = scroll
      setCur(j)
    },
    [items, draftOf]
  )

  // עדכון טיוטה; שמירה באתר כשהיא שלמה. advance — לעבור לשורה הבאה אחרי השמירה
  const update = useCallback(
    async (i, next, { advance = false } = {}) => {
      const it = items[i]
      if (!it) return
      setDrafts((m) => ({ ...m, [it.id]: next }))
      if (!isComplete(next)) return
      const r = await round.mark(it.id, toMarkBody(next))
      if (!r.ok) return showAlert('השמירה נכשלה', r.error)
      if (advance) goTo(nextIndex(items, i))
    },
    [items, round, goTo, showAlert]
  )

  const lineLabel = useCallback(
    (i, label) => {
      const it = items[i]
      const d = setLine(draftOf(it), label)
      if (label === 'mixed') {
        setFocus('words')
        setWsel(Math.max(0, (d.words || []).findIndex((w) => !w.label)))
        update(i, d)
        if (missingWords(d)) showAlert('שורה מעורבת', 'עכשיו המקשים 1–4 חלים על המילים (Tab — חזרה לשורה)')
        return
      }
      update(i, d, { advance: true })
    },
    [items, draftOf, update, showAlert]
  )

  const wordLabel = useCallback(
    (i, label, k = wsel) => {
      const it = items[i]
      const d = setWord(draftOf(it), k, label)
      setWsel(nextOpenWord(d, k))
      update(i, d)
    },
    [items, draftOf, update, wsel]
  )

  const accept = useCallback(
    (i) => {
      const it = items[i]
      const d = acceptSuggestion(draftOf(it), it)
      if (!isComplete(d)) {
        setDrafts((m) => ({ ...m, [it.id]: d }))
        return showAlert('חסר כתב', d.label ? `חסר כתב ל-${missingWords(d)} מילים, שלנתב אין הצעה עבורן` : 'אין לנתב הצעה לשורה הזו — בחרו כתב')
      }
      update(i, d, { advance: true })
    },
    [items, draftOf, update, showAlert]
  )

  const bad = useCallback((i) => update(i, setBad(draftOf(items[i])), { advance: true }), [items, draftOf, update])

  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target) || ctxOf) return
      const it = items[cur]
      if (!it) return
      const d = draftOf(it)
      const mixed = isMixed(d, it)
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        return goTo(cur + (e.key === 'ArrowDown' ? 1 : -1))
      }
      if (e.key === 'Tab' && mixed) {
        e.preventDefault()
        return setFocus((f) => (f === 'words' ? 'line' : 'words'))
      }
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && mixed && d.words?.length) {
        e.preventDefault()
        // מימין לשמאל: ← = המילה הבאה בקריאה
        const step = e.key === 'ArrowLeft' ? 1 : -1
        setFocus('words')
        return setWsel((k) => Math.max(0, Math.min(d.words.length - 1, k + step)))
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        return accept(cur)
      }
      const a = keyAction(e.key, mixed ? focus : 'line')
      if (!a) return
      e.preventDefault()
      if (a.type === 'bad') bad(cur)
      else if (a.type === 'line') lineLabel(cur, a.label)
      else if (a.type === 'word' && d.words?.length) wordLabel(cur, a.label)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cur, items, focus, draftOf, goTo, accept, bad, lineLabel, wordLabel, ctxOf])

  const goHome = async () => {
    await round.release()
    router.push(HOME)
  }

  return (
    <div className="flex flex-col gap-3">
      <RoundHeader title="נתב הכתב" done={done} total={total} onHome={goHome} />
      {round.lost ? <LostNotice onRetake={take} /> : null}
      <p className="text-body-sm leading-8 text-on-surface-variant">
        <Kbd>1</Kbd> מרובע · <Kbd>2</Kbd> רש&quot;י · <Kbd>3</Kbd> לועזית · <Kbd>4</Kbd> מעורבת · <Kbd>Enter</Kbd> ההצעה נכונה · <Kbd>0</Kbd> פסול ·{' '}
        <Kbd>↓</Kbd>/<Kbd>↑</Kbd> שורה אחרת. <b>בשורה מעורבת</b> המקשים חלים על המילה המסומנת (<Kbd>4</Kbd> = ניטרלי), <Kbd>←</Kbd>/<Kbd>→</Kbd> מילה
        אחרת, <Kbd>Tab</Kbd> מחליף בין השורה למילים.
      </p>
      <GuideBox section="router" />
      <div className="flex flex-col gap-3">
        {items.map((it, i) => (
          <RouterLineCard
            key={it.id}
            item={it}
            draft={draftOf(it)}
            index={i}
            total={total}
            current={i === cur}
            focus={focus}
            wsel={i === cur ? wsel : 0}
            saving={!!round.saving[it.id]}
            onSelect={() => i !== cur && goTo(i, { scroll: false })}
            onLine={(label) => {
              if (i !== cur) goTo(i, { scroll: false })
              lineLabel(i, label)
            }}
            onBad={() => bad(i)}
            onAccept={() => accept(i)}
            onWord={(label) => {
              if (i !== cur) goTo(i, { scroll: false })
              setFocus('words')
              wordLabel(i, label, i === cur ? wsel : 0)
            }}
            onPickWord={(k) => {
              if (i !== cur) goTo(i, { scroll: false })
              setFocus('words')
              setWsel(k)
            }}
            onFocus={(f) => {
              if (i !== cur) goTo(i, { scroll: false })
              setFocus(f)
            }}
            onInkWords={(boxes) => setDrafts((m) => ({ ...m, [it.id]: withInkWords(m[it.id] || initDraft(it), boxes) }))}
            onShowCtx={() => {
              if (i !== cur) goTo(i, { scroll: false })
              setCtxOf(it)
            }}
          />
        ))}
      </div>
      <RoundEnd done={done} total={total} onMore={take} onStop={goHome} />
      {ctxOf?.ctx ? <FullPageDialog ctx={ctxOf.ctx} alias={ctxOf.alias} page={ctxOf.page} onClose={() => setCtxOf(null)} /> : null}
    </div>
  )
}
