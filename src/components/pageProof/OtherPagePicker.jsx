'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { buildParagraphs, tokenize } from '@/lib/pageProof/textModel'
import { LINK_ERRORS, otherPageView, otherPageTabs, defaultOtherTab, otherPagePick, pageNoParam } from '@/lib/pageProof/linkFlow'
import StreamTabs from './StreamTabs'

// הצד השני של קישור — בעמוד אחר של הספר (פירוש שזולג אל אחרי הסעיף שלו, או לפניו). העמוד
// מוצג לקריאה בלבד, לפי זרמים ופסקאות כמו בעורך, וכל מילה בו היא כפתור: לחיצה משלימה את
// הקישור. המעבר בין עמודים — "הקודם" / "הבא" או מספר-עמוד; העמוד שמגיהים עצמו מדולג.
// הטעינה: GET /api/page-proof/books/[gid]/pages/[n]/lines — קריאה בלבד, בלי תפיסה או החכרה.
//
// props: gid; view — העמוד הנוכחי (מספרו, ושמות הזרמים וצבעיהם של הספר); from — הצד שנבחר
// כאן ({text, stream}); startPage — העמוד שנטען קודם (null — רק שדה המספר); onPick(pick,
// fview) — מחזיר הודעת-שגיאה (הקישור לא נוסף, החלון נשאר) או null (נוסף); onClose.
// fetchLines(gid, n) — רשות (בדיקות); ברירת-המחדל: fetch לכתובת שלמעלה.

// "הצד השני בעמוד אחר": העמוד הקודם, הבא, או מספר-עמוד (פירוש שזולג אל אחרי הסעיף שלו)
export function OtherPageButtons({ page, onOtherPage, className = '' }) {
  const btn = 'rounded-md border border-info-200 bg-white px-2 py-0.5 text-info-700 hover:bg-info-100'
  const keep = (e) => e.preventDefault()
  return (
    <span className={`mt-1 flex flex-wrap items-center gap-1 ${className}`} data-testid="other-page-buttons">
      <span>הצד השני בעמוד אחר:</span>
      {Number.isInteger(page) && page > 1 && (
        <button type="button" onMouseDown={keep} onClick={() => onOtherPage(page - 1)} title="בחירת המילה המקבילה בעמוד הקודם" className={btn}>
          עמוד {page - 1}
        </button>
      )}
      {Number.isInteger(page) && (
        <button type="button" onMouseDown={keep} onClick={() => onOtherPage(page + 1)} title="בחירת המילה המקבילה בעמוד הבא" className={btn}>
          עמוד {page + 1}
        </button>
      )}
      <button type="button" onMouseDown={keep} onClick={() => onOtherPage(null)} title="בחירת המילה המקבילה בעמוד אחר לפי מספרו" className={btn}>
        מספר עמוד…
      </button>
    </span>
  )
}

async function fetchPageLines(gid, n) {
  const res = await fetch(`/api/page-proof/books/${encodeURIComponent(gid)}/pages/${n}/lines`)
  const d = await res.json().catch(() => null)
  if (!d?.success) throw new Error(d?.error || (res.status === 404 ? `עמוד ${n} לא נמצא בספר` : 'טעינת העמוד נכשלה'))
  return d
}

// המילים של קטע-שורה בפסקה (w0..w1), עם מספר-המילה בשורה
function segWords(line, s) {
  const words = tokenize(line?.text ?? '').filter((t) => t.w === 'word')
  return words.map((w, i) => ({ i, text: w.text })).filter((w) => w.i >= s.w0 && w.i <= s.w1)
}

export default function OtherPagePicker({ gid, view, from = null, startPage = null, onPick, onClose, fetchLines = fetchPageLines }) {
  const here = view?.page
  const [target, setTarget] = useState(startPage)
  const [input, setInput] = useState(startPage != null ? String(startPage) : '')
  const [data, setData] = useState({ status: startPage != null ? 'loading' : 'idle' })
  const [tabPick, setTabPick] = useState(null)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const panel = useRef(null)
  const inputRef = useRef(null)
  const closeRef = useRef(onClose)
  const titleId = useId()

  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  // המיקוד בפתיחה בלבד: בלי עמוד — בשדה המספר; אחרת בחלון עצמו
  useEffect(() => {
    if (startPage == null) inputRef.current?.focus()
    else panel.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Esc סוגר רק את החלון (בשלב-הלכידה, לפני העורך שמתחתיו) — הקישור עדיין ממתין לצד השני
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      closeRef.current?.()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  useEffect(() => {
    if (target == null) return undefined
    let alive = true
    setData({ status: 'loading' })
    setTabPick(null)
    setErr(null)
    fetchLines(gid, target)
      .then((d) => alive && setData({ status: 'ok', page: d.page ?? target, lines: d.lines || [] }))
      .catch((e) => alive && setData({ status: 'error', error: e?.message || 'טעינת העמוד נכשלה' }))
    return () => {
      alive = false
    }
  }, [gid, target, fetchLines])

  const fview = useMemo(() => (data.status === 'ok' ? otherPageView(view, data.page, data.lines) : null), [data, view])
  const tabs = useMemo(() => (fview ? otherPageTabs(fview) : []), [fview])
  const tabKey = tabs.some((t) => t.key === tabPick) ? tabPick : defaultOtherTab(tabs, from?.stream)
  const paras = useMemo(() => (fview && tabKey ? buildParagraphs(fview, tabKey) : []), [fview, tabKey])
  const byId = useMemo(() => new Map((fview?.lines || []).map((l) => [l.id, l])), [fview])

  // מעבר לעמוד: העמוד שמגיהים אינו "עמוד אחר" — מדלגים עליו בחצים, ומסבירים כשהוקלד
  const go = (n) => {
    if (n == null) return setErr('מספר עמוד לא תקין')
    if (n === here) return setErr(LINK_ERRORS.samePage)
    setInput(String(n))
    setTarget(n)
  }
  // העמוד הסמוך בכיוון dir (בלי העמוד שמגיהים), או null מתחת לעמוד 1
  const near = (dir) => {
    let n = (target ?? here) + dir
    if (n === here) n += dir
    return n >= 1 ? n : null
  }
  const step = (dir) => {
    const n = near(dir)
    if (n != null) go(n)
  }

  const pickWord = async (lineId, i) => {
    if (busy || !fview) return
    const pick = otherPagePick(fview, lineId, i)
    if (pick.error) return setErr(pick.error)
    setBusy(true)
    try {
      const e = await onPick?.(pick, fview)
      if (e) setErr(e)
    } finally {
      setBusy(false)
    }
  }

  if (typeof document === 'undefined') return null
  const navBtn = 'rounded-md border border-surface-variant bg-white px-2 py-1 text-xs hover:bg-surface-variant/60 disabled:opacity-40'

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4" onClick={() => onClose?.()}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        dir="rtl"
        data-testid="other-page-picker"
        className="glass-strong flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-surface-variant px-4 py-3">
          <h2 id={titleId} className="flex items-center gap-2 text-base font-bold text-on-surface">
            <span aria-hidden="true" className="material-symbols-outlined text-info-700">link</span>
            הצד השני של הקישור — בעמוד אחר
          </h2>
          {from?.text && <span className="text-sm text-on-surface/70">מקשרים את «{from.text}» (עמוד {here})</span>}
          <span className="flex-1" />
          <button type="button" onClick={() => onClose?.()} className={navBtn}>
            סגירה
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-surface-variant bg-surface/60 px-4 py-2 text-sm">
          <button type="button" onClick={() => step(-1)} disabled={near(-1) == null} className={navBtn} title="העמוד הקודם בספר">
            → הקודם
          </button>
          <span className="min-w-[4.5rem] text-center font-bold" aria-live="polite">
            {target != null ? `עמוד ${target}` : 'בחרו עמוד'}
          </span>
          <button type="button" onClick={() => step(1)} className={navBtn} title="העמוד הבא בספר">
            הבא ←
          </button>
          <form
            className="flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault()
              go(pageNoParam(input))
            }}
          >
            <label className="flex items-center gap-1 text-xs text-on-surface/70">
              מספר עמוד
              <input
                ref={inputRef}
                type="number"
                min={1}
                inputMode="numeric"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                aria-label="מספר העמוד שבו הצד השני"
                className="w-20 rounded border border-surface-variant bg-white px-2 py-0.5 text-sm"
              />
            </label>
            <button type="submit" className={navBtn}>
              הצגה
            </button>
          </form>
        </div>

        {fview && <StreamTabs tabs={tabs} tabKey={tabKey} setTabKey={setTabPick} label="זרמי הטקסט בעמוד האחר" />}

        {err && (
          <p role="alert" className="border-b border-danger-200 bg-danger-50 px-4 py-1.5 text-sm text-danger-700">
            {err}
          </p>
        )}

        <div className="min-h-[8rem] flex-1 overflow-y-auto px-4 py-3 text-[17px] leading-loose text-on-surface">
          {data.status === 'idle' && <p className="text-sm text-on-surface/60">הקלידו את מספר העמוד שבו הצד השני של הקישור, או עברו לעמוד הקודם / הבא.</p>}
          {data.status === 'loading' && <p className="text-sm text-on-surface/60">טוען את עמוד {target}…</p>}
          {data.status === 'error' && <p className="text-sm text-danger-700">{data.error}</p>}
          {fview && !tabs.length && <p className="text-sm text-on-surface/60">אין בעמוד הזה טקסט לקישור.</p>}
          {fview && tabs.length > 0 && (
            <>
              <p className="mb-2 text-xs text-on-surface/60">לחצו על המילה המקבילה — הקישור יישמר מיד (Ctrl+Z מבטל). העמוד מוצג לקריאה בלבד.</p>
              {paras.map((p) => (
                <p key={p.key} className={`mb-2 ${p.heading ? 'font-bold' : ''}`}>
                  {p.lines.map((s) => (
                    <span key={`${s.lineId}:${s.w0}`} data-line={s.lineId}>
                      {segWords(byId.get(s.lineId), s).map((w) => (
                        <span key={w.i}>
                          <button
                            type="button"
                            data-w={w.i}
                            disabled={busy}
                            onClick={() => pickWord(s.lineId, w.i)}
                            title={`שורה ${(byId.get(s.lineId)?.line_no ?? 0) + 1}`}
                            className="rounded px-0.5 hover:bg-info-100 focus-visible:bg-info-100 focus-visible:outline-none"
                          >
                            {w.text}
                          </button>{' '}
                        </span>
                      ))}
                    </span>
                  ))}
                </p>
              ))}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
