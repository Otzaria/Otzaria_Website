'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { snapFrame, autoFrames } from '@/lib/pageProof/ops'
import { streamChoices, straddlingLineIds, untouchedLineIds, replaceWord, newFid, viewStats } from '@/lib/pageProof/view'
import { useProofEditor } from './useProofEditor'
import ProofScan from './ProofScan'
import ProofLineRow from './ProofLineRow'
import LineTab from './LineTab'
import FramesTab from './FramesTab'
import LinksTab from './LinksTab'
import PageTab from './PageTab'
import ChangesTab from './ChangesTab'

// עורך הגהת-עמוד: הסריקה, הטקסט בסדר-קריאה ולוח-צד. כל לחיצה = פעולה אחת
// בסוגי חוזה-העמוד; העורך משמש גם את המתנדב (עריכה) וגם את המנהל (סקירה,
// ועריכה לפני אישור). actions — פונקציית-רינדור לכפתורי ההגשה של הדף העוטף.

const TABS = [
  { id: 'line', label: 'שורה' },
  { id: 'frames', label: 'מסגרות' },
  { id: 'links', label: 'קישורים' },
  { id: 'page', label: 'עמוד' },
  { id: 'changes', label: 'שינויים' },
]

const MODE_HE = {
  frame: 'מצב-מסגרות',
  bbox: 'תיקון תיבה',
  add: 'הוספת שורה',
  split: 'פיצול שורה',
  link: 'קישור ידני',
}

const isTyping = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)

export default function ProofEditor({ page, initialOps = null, readOnly = false, persist = true, actions = null }) {
  const baseDoc = page.doc
  const ed = useProofEditor({ pageId: page.id, baseDoc, initialOps, readOnly, persist })
  const { view, ops, push, sel, setSel } = ed
  const P = baseDoc.page

  const [tab, setTab] = useState('line')
  const [mode, setModeState] = useState('select')
  const [zoom, setZoom] = useState(null)
  const [focusId, setFocusId] = useState(null)
  const [linkFrom, setLinkFrom] = useState(null)
  const [pendingAdd, setPendingAdd] = useState(null)
  const [frameStream, setFrameStream] = useState('main')
  const scanWrap = useRef(null)

  const streams = useMemo(() => streamChoices(baseDoc), [baseDoc])
  const straddling = useMemo(() => straddlingLineIds(view.lines, view.frames), [view.lines, view.frames])
  const untouched = useMemo(() => untouchedLineIds(view), [view])
  const stats = useMemo(() => viewStats(view, ops), [view, ops])
  const lineById = useMemo(() => new Map(view.lines.map((l) => [l.id, l])), [view.lines])
  const selLines = sel.ids.map((i) => lineById.get(i)).filter(Boolean)
  // פעולות-שורה רק על שורות מקוריות (מזהה חיובי) — לשורות מקומיות אין מזהה אצלם
  const ids = selLines.filter((l) => l.id > 0).map((l) => l.id)

  // זום התחלתי: רוחב הסריקה בלוח
  useEffect(() => {
    const el = scanWrap.current
    if (!el) return
    setZoom(Math.max(0.1, Math.min(1.5, (el.clientWidth - 8) / baseDoc.size[0])))
  }, [page.id, baseDoc.size])

  const setMode = useCallback((m) => {
    setModeState(m)
    setLinkFrom(null)
    if (m !== 'add') setPendingAdd(null)
  }, [])

  const selectLines = useCallback(
    (list, additive = false, fromText = false) => {
      setSel((s) => {
        let next = list
        if (additive) {
          const cur = new Set(s.ids)
          for (const i of list) {
            if (cur.has(i)) cur.delete(i)
            else cur.add(i)
          }
          next = [...cur]
        }
        return { ids: next, words: null, fid: null }
      })
      if (fromText && list.length) setFocusId(list[list.length - 1])
      if (list.length) setTab((t) => (t === 'changes' || t === 'page' ? 'line' : t))
    },
    [setSel]
  )

  const op = (kind, value, withIds = true) => {
    const o = { kind, page: P }
    if (withIds) {
      if (!ids.length) return false
      o.ids = ids
    }
    if (value !== undefined) o.value = value
    return push(o)
  }

  const frameList = () => (view.frames || []).map(({ fid, stream, bbox, order, kind }) => ({ fid, stream, bbox, order, ...(kind ? { kind } : {}) }))

  const act = {
    stream: (v) => op('stream', v),
    para: (v) => op('para', v),
    paraStart: (b) => op('para_start', b ? 1 : 0),
    script: (v) => op('script', v),
    mixed: (b) => op('mixed_line', b ? 1 : 0),
    certainty: (v, why) => op('certainty', { v, why: why || null }),
    lineOk: () => op('line_ok'),
    remove: () => op('status', 'removed'),
    restore: () => op('status', 'restore'),
    style: (style, on) => {
      if (ids.length !== 1 || !sel.words) return
      push({ kind: 'styles', page: P, ids, value: { style, words: sel.words, on } })
    },
    merge: () => ids.length === 2 && push({ kind: 'line_merge', page: P, ids }) && setSel({ ids: [], words: null, fid: null }),
    link: () => ids.length === 2 && push({ kind: 'link_add', page: P, ids }),
    mode: setMode,
    framesSet: (frames) => push({ kind: 'frames_set', page: P, value: { frames: frames.map(({ seq, ...f }) => (void seq, f)) } }),
    frameSeq: (fid, seq) => push({ kind: 'frame_seq', page: P, value: { fid, seq } }),
    framesClear: () => push({ kind: 'frames_clear', page: P }),
    framesAuto: () => {
      // נקודת-פתיחה מחושבת כאן (כדי שהמתייג יראה ויתקן), ונשלחת כ-frames_set
      const fr = autoFrames(view, (taken) => newFid(taken))
      if (!fr.length) return
      push(
        { kind: 'frames_set', page: P, value: { frames: fr.map(({ seq, ...f }) => (void seq, f)), manual: true } },
        ...fr.map((f) => ({ kind: 'frame_seq', page: P, value: { fid: f.fid, seq: f.seq } }))
      )
      setMode('frame')
    },
    selectFrame: (fid) => {
      setMode('frame')
      setSel((s) => ({ ...s, fid }))
    },
    selectLines: (list) => selectLines(list, false, true),
    linkOk: (src) => push({ kind: 'link_ok', page: P, value: { src_line: src, page: P } }),
    linkDel: (src) => push({ kind: 'link_del', page: P, value: { src_line: src, page: P } }),
    pageType: (v) => push({ kind: 'page_type', page: P, value: v }),
    okRest: () => untouched.length && push({ kind: 'line_ok', page: P, ids: untouched }),
    addLine: (text, stream) => {
      if (!pendingAdd) return
      if (push({ kind: 'line_add', page: P, value: { bbox: pendingAdd, text, stream } })) {
        setPendingAdd(null)
        setMode('select')
      }
    },
    cancelAdd: () => {
      setPendingAdd(null)
      setMode('select')
    },
    removeOp: ed.removeAt,
  }

  // ---- אירועי הסריקה ----
  const onDrawRect = (rect) => {
    if (mode === 'add') {
      setPendingAdd(rect)
      setTab('page')
      return
    }
    if (mode !== 'frame') return
    const bbox = snapFrame(rect, view.lines.filter((l) => l.id > 0))
    const cur = frameList()
    const taken = new Set(cur.map((f) => f.fid))
    const fid = newFid(taken)
    const seq = (view.frames || []).filter((f) => f.stream === frameStream && !f.kind).length + 1
    const frame = { fid, stream: frameStream, bbox, order: cur.length + 1 }
    if (push({ kind: 'frames_set', page: P, value: { frames: [...cur, frame], snap: false } }, { kind: 'frame_seq', page: P, value: { fid, seq } })) {
      setSel((s) => ({ ...s, fid }))
    }
  }
  const onFrameChange = (fid, bbox) => act.framesSet(frameList().map((f) => (f.fid === fid ? { ...f, bbox } : f)))
  const onBboxChange = (id, bbox) => push({ kind: 'bbox', page: P, ids: [id], value: bbox })
  const onSplit = (id, x) => {
    if (id < 0) return
    if (push({ kind: 'line_split', page: P, ids: [id], value: { x } })) {
      setMode('select')
      setSel({ ids: [], words: null, fid: null })
    }
  }
  const onLinkPick = (id) => {
    if (id < 0) return
    if (linkFrom == null) setLinkFrom(id)
    else if (id !== linkFrom) {
      push({ kind: 'link_add', page: P, ids: [linkFrom, id] })
      setLinkFrom(null)
    }
  }

  // ---- טקסט ----
  const onEditText = useCallback((id, text) => push({ kind: 'text', page: P, ids: [id], value: text }), [push, P])
  const onPickWord = useCallback(
    (id, i, w) => {
      const l = lineById.get(id)
      if (l) push({ kind: 'text', page: P, ids: [id], value: replaceWord(l.text, i, w) })
    },
    [push, P, lineById]
  )
  const onWordClick = useCallback(
    (id, i, extend) => {
      setSel((s) => {
        if (s.ids[0] !== id) return s
        const words = extend && s.words ? [Math.min(s.words[0], i), Math.max(s.words[1], i)] : [i, i]
        return { ...s, words }
      })
    },
    [setSel]
  )
  const onRowSelect = useCallback((id, additive) => selectLines([id], additive, true), [selectLines])

  // ---- מקלדת ----
  useEffect(() => {
    const onKey = (e) => {
      if (isTyping(e.target)) return
      const ctrl = e.ctrlKey || e.metaKey
      if (ctrl && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault()
        ed.undo()
      } else if (ctrl && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault()
        ed.redo()
      } else if (e.key === 'Escape') {
        setMode('select')
        setSel({ ids: [], words: null, fid: null })
      } else if (readOnly) {
        return
      } else if (/^[1-9]$/.test(e.key) && !ctrl && ids.length) {
        const s = streams[Number(e.key) - 1]
        if (s) {
          e.preventDefault()
          const heading = selLines[0]?.stream?.endsWith('_heading')
          act.stream(heading ? `${s.key}_heading` : s.key)
        }
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && mode === 'frame' && sel.fid) {
        e.preventDefault()
        act.framesSet(frameList().filter((f) => f.fid !== sel.fid).map((f, k) => ({ ...f, order: k + 1 })))
        setSel((s) => ({ ...s, fid: null }))
      } else if (e.key === 'Delete' && ids.length) {
        e.preventDefault()
        act.remove()
      } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !ctrl) {
        e.preventDefault()
        const list = view.lines
        const cur = list.findIndex((l) => l.id === sel.ids[sel.ids.length - 1])
        const next = list[Math.max(0, Math.min(list.length - 1, cur + (e.key === 'ArrowDown' ? 1 : -1)))]
        if (next) selectLines([next.id], false, true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const imageUrl = page.imageUrl
  const errorBar = ed.error && (
    <div className="flex items-center justify-between rounded-md bg-danger-100 px-3 py-1 text-sm text-danger-700">
      {ed.error}
      <button onClick={() => ed.setError(null)} className="text-xs">✗</button>
    </div>
  )

  return (
    <div className="flex flex-col gap-2">
      {/* סרגל-כלים */}
      <div className="glass-strong flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-sm">
        <button onClick={ed.undo} disabled={readOnly || !ed.canUndo} className="rounded px-2 py-1 hover:bg-surface-variant disabled:opacity-40" title="ביטול (Ctrl+Z)">
          <span className="material-symbols-outlined align-middle text-base">undo</span>
        </button>
        <button onClick={ed.redo} disabled={readOnly || !ed.canRedo} className="rounded px-2 py-1 hover:bg-surface-variant disabled:opacity-40" title="חזרה (Ctrl+Y)">
          <span className="material-symbols-outlined align-middle text-base">redo</span>
        </button>
        <span className="mx-1 h-5 w-px bg-surface-variant" />
        <button onClick={() => setZoom((z) => Math.max(0.05, (z || 0.3) / 1.25))} className="rounded px-2 py-1 hover:bg-surface-variant" title="הקטנה">
          <span className="material-symbols-outlined align-middle text-base">zoom_out</span>
        </button>
        <span className="w-12 text-center tabular-nums">{Math.round((zoom || 0) * 100)}%</span>
        <button onClick={() => setZoom((z) => Math.min(3, (z || 0.3) * 1.25))} className="rounded px-2 py-1 hover:bg-surface-variant" title="הגדלה">
          <span className="material-symbols-outlined align-middle text-base">zoom_in</span>
        </button>
        <span className="mx-1 h-5 w-px bg-surface-variant" />
        {mode !== 'select' ? (
          <span className="rounded-full bg-primary px-3 py-0.5 text-on-primary">
            {MODE_HE[mode]}
            <button onClick={() => setMode('select')} className="mr-2" title="יציאה (Esc)">✗</button>
          </span>
        ) : (
          <span className="text-on-surface/60">{readOnly ? 'תצוגה בלבד' : 'לחיצה = בחירה · גרירה על הסריקה = בחירה באזור · לחיצה-כפולה על טקסט = עריכה'}</span>
        )}
        {ed.restored && <span className="rounded bg-info-100 px-2 py-0.5 text-xs text-info-800">שוחזרה טיוטה שמורה</span>}
        <span className="flex-1" />
        {actions && actions({ ops, view, stats, untouched, reset: ed.reset })}
      </div>
      {errorBar}

      <div className="grid h-[calc(100vh-13rem)] min-h-[520px] grid-cols-1 gap-2 lg:grid-cols-[300px_minmax(0,1fr)_minmax(0,1.15fr)]">
        {/* לוח-צד */}
        <aside className="glass-strong flex min-h-0 flex-col overflow-hidden rounded-xl">
          <nav className="flex border-b border-surface-variant text-sm">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex-1 px-1 py-2 ${tab === t.id ? 'border-b-2 border-primary font-bold' : 'text-on-surface/60 hover:bg-surface-variant/50'}`}
              >
                {t.label}
                {t.id === 'changes' && ops.length > 0 && <span className="mr-1 rounded-full bg-primary px-1.5 text-[10px] text-on-primary">{ops.length}</span>}
              </button>
            ))}
          </nav>
          <div className="min-h-0 flex-1 overflow-y-auto px-3">
            {tab === 'line' && <LineTab lines={selLines} streams={streams} wordRange={sel.words} readOnly={readOnly} mode={mode} act={act} />}
            {tab === 'frames' && (
              <FramesTab view={view} streams={streams} frameStream={frameStream} setFrameStream={setFrameStream} mode={mode} straddleCount={straddling.size} readOnly={readOnly} act={act} />
            )}
            {tab === 'links' && <LinksTab view={view} mode={mode} linkFrom={linkFrom} readOnly={readOnly} act={act} />}
            {tab === 'page' && <PageTab view={view} stats={stats} untouched={untouched} mode={mode} pendingAdd={pendingAdd} streams={streams} readOnly={readOnly} act={act} />}
            {tab === 'changes' && <ChangesTab baseDoc={baseDoc} ops={ops} readOnly={readOnly} act={act} />}
          </div>
        </aside>

        {/* הטקסט בסדר-קריאה */}
        <section className="glass-strong min-h-0 overflow-y-auto rounded-xl py-1" dir="rtl">
          {view.lines.map((l) => (
            <ProofLineRow
              key={l.id}
              line={l}
              doc={view}
              lowWord={view.low_word ?? 0.95}
              selected={sel.ids.includes(l.id)}
              wordRange={sel.ids[0] === l.id ? sel.words : null}
              straddle={straddling.has(l.id)}
              readOnly={readOnly}
              onSelect={onRowSelect}
              onWordClick={onWordClick}
              onEditText={onEditText}
              onPickWord={onPickWord}
            />
          ))}
        </section>

        {/* הסריקה */}
        <section ref={scanWrap} className="min-h-0">
          {zoom != null && (
            <ProofScan
              view={view}
              imageUrl={imageUrl}
              zoom={zoom}
              mode={mode}
              sel={sel}
              straddling={straddling}
              linkFrom={linkFrom}
              focusId={focusId}
              readOnly={readOnly}
              onSelectLines={(list, additive) => selectLines(list, additive)}
              onSelectFrame={(fid) => setSel((s) => ({ ...s, fid }))}
              onDrawRect={onDrawRect}
              onFrameChange={onFrameChange}
              onBboxChange={onBboxChange}
              onSplit={onSplit}
              onLinkPick={onLinkPick}
            />
          )}
        </section>
      </div>
    </div>
  )
}
