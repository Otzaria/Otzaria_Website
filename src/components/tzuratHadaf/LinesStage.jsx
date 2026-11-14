'use client'

import { useMemo, useRef, useState } from 'react'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { applyLineOps, opFirstWordUp, opLastWordDown } from '@/lib/tzuratHadaf/lineOps'
import BlockTabs from './BlockTabs'
import LineRow from './LineRow'
import { BUILD_NOTE, REJECT_REASON } from './labels'
import { isConfirmed, nextSuspicious, suspiciousLeft, toggleConfirm, tryAddOp, wordActions } from './linesLogic'

// שלב "שורות": לכל גוש — רשימת השורות; מעל המילים שלנו בכל שורה — אותה שורה מהסריקה. הפעולות:
// "המילה הראשונה למעלה" (opFirstWordUp), "המילה האחרונה למטה" (opLastWordDown), לחיצה על מילה → "השורה מתחילה כאן" /
// "מכאן — לשורה הבאה" (opStartAt), ו"השורה נכונה" (confirm). הרשימה מוצגת אחרי כל הפעולות (applyLineOps).
// ops / onOps(nextOps) — ההורה מחזיק את ההיסטוריה (ביטול/חזרה); onRejected(reason) — הודעה כשהפעולה נדחית.

export default function LinesStage({ pageId, scanUrl, model, ops, onOps, onUndo, onRedo, canUndo, canRedo, onRejected, readOnly = false, nonVilna = false }) {
  const blocks = useMemo(() => model?.blocks || [], [model])
  const [blockId, setBlockId] = useState(() => blocks[0]?.id || null)
  const [menu, setMenu] = useState(null)
  const rowRefs = useRef(new Map())
  const lastK = useRef(-1)

  const { model: shown, touched } = useMemo(() => applyLineOps(model, ops), [model, ops])
  const block = shown.blocks?.find((b) => b.id === blockId) || shown.blocks?.[0] || null
  // גוש נעול (editable:false — מפרשים בשוליים) אינו מקבל פעולות שורה: בלי מונה חשודות ובלי כפתורים
  const counts = useMemo(() => new Map((shown.blocks || []).map((b) => [b.id, b.editable === false ? 0 : suspiciousLeft(b, touched)])), [shown, touched])

  if (nonVilna) {
    return (
      <p role="note" className="rounded-xl border border-info-200 bg-info-50 p-4 text-info-800">
        העמוד הזה ב-PDF אינו מדפוס וילנא, ולכן אין בו השוואת שורות. עברו לשלב הנוסח.
      </p>
    )
  }
  if (!block) return <p className="text-on-surface/60">אין שורות בעמוד הזה.</p>

  const locked = block.editable === false
  const ro = readOnly || locked

  const add = (op) => {
    if (ro) return
    const r = tryAddOp(model, ops, op)
    if (r.reason) onRejected?.(REJECT_REASON[r.reason] || 'הפעולה לא אפשרית')
    else onOps(r.ops)
    setMenu(null)
  }

  const goNext = () => {
    const k = nextSuspicious(block, lastK.current, touched)
    if (k < 0) {
      onRejected?.('אין עוד שורות חשודות בגוש הזה')
      return
    }
    lastK.current = k
    const el = rowRefs.current.get(`${block.id}:${block.lines[k].i}`)
    el?.scrollIntoView?.({ block: 'center' })
    el?.focus?.({ preventScroll: true })
  }

  const left = counts.get(block.id) || 0

  return (
    <div className="flex flex-col gap-3">
      <p role="note" className="flex items-start gap-2 rounded-xl border border-info-200 bg-info-50 px-3 py-2 text-sm text-info-800">
        <span aria-hidden="true" className="material-symbols-outlined text-base">info</span>
        {BUILD_NOTE}
      </p>
      <div className="glass-strong sticky top-28 z-10 flex flex-wrap items-center gap-2 rounded-xl p-2">
        <BlockTabs
          blocks={shown.blocks}
          value={block.id}
          counts={counts}
          onChange={(id) => {
            setBlockId(id)
            setMenu(null)
            lastK.current = -1
          }}
        />
        <div className="ms-auto flex flex-wrap items-center gap-1">
          <Button variant="tonal" size="sm" icon="skip_next" onClick={goNext} disabled={!left}>
            לשורה החשודה הבאה{left ? ` (${left})` : ''}
          </Button>
          <Button variant="text" size="sm" icon="undo" iconOnly aria-label="ביטול" onClick={onUndo} disabled={!canUndo || readOnly} />
          <Button variant="text" size="sm" icon="redo" iconOnly aria-label="חזרה" onClick={onRedo} disabled={!canRedo || readOnly} />
        </div>
      </div>
      {locked ? (
        <p role="note" className="text-sm text-on-surface/70">
          בגוש הזה אין בדיקת שורות — הוא מוצג לעיון בלבד. בעיה בו אפשר לדווח בשלב הנוסח.
        </p>
      ) : block.auto !== 'ok' && (
        <p className="flex items-center gap-2 text-sm text-on-surface/70">
          <Badge tone="warning" icon="warning">
            הגוש הזה לא עוגן במחשב
          </Badge>
          המחשב לא הצליח להתאים את השורות שלו לדפוס — כל שורה כאן חשובה.
        </p>
      )}
      <ol className="flex flex-col gap-2" aria-label={`השורות של ${block.label || block.id}`}>
        {block.lines.map((line, k) => {
          const key = `${block.id}:${line.i}`
          const t = touched.get(key) || null
          const menuJ = menu && menu.key === key ? menu.j : null
          const wa = menuJ != null ? wordActions(block, k, menuJ) : null
          const up = opFirstWordUp(block, k)
          const down = opLastWordDown(block, k)
          const confirmed = isConfirmed(ops, block.id, line.i)
          return (
            <LineRow
              key={key}
              pageId={pageId}
              scanUrl={scanUrl}
              block={block}
              line={line}
              k={k}
              touched={t}
              menuJ={menuJ}
              rowRef={(el) => {
                if (el) rowRefs.current.set(key, el)
                else rowRefs.current.delete(key)
              }}
              onWord={(j) => !ro && !line.fake && setMenu(menuJ === j ? null : { key, j })}
            >
              {wa && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg bg-info-50 p-2 text-sm" data-testid="word-menu">
                  <span className="font-bold">
                    המילה <span className="font-frank text-base">«{line.words[menuJ]?.t}»</span>:
                  </span>
                  {menuJ === 0 ? (
                    <span className="text-on-surface/70">השורה כבר מתחילה במילה הזו.</span>
                  ) : (
                    <>
                      <Button size="sm" variant="tonal" disabled={!wa.startHere} onClick={() => add(wa.startHere)} title="המילים שלפניה עולות לסוף השורה הקודמת">
                        השורה מתחילה כאן
                      </Button>
                      <Button size="sm" variant="tonal" disabled={!wa.nextFromHere} onClick={() => add(wa.nextFromHere)} title="המילה הזו והמילים שאחריה יורדות לתחילת השורה הבאה">
                        מכאן — לשורה הבאה
                      </Button>
                    </>
                  )}
                  <Button size="sm" variant="text" onClick={() => setMenu(null)}>
                    ביטול
                  </Button>
                </div>
              )}
              {!ro && !line.fake && (
                <div className="flex flex-wrap gap-1">
                  <Button size="sm" variant="outlined" icon="arrow_upward" disabled={!up} onClick={() => add(up)}>
                    המילה הראשונה למעלה
                  </Button>
                  <Button size="sm" variant="outlined" icon="arrow_downward" disabled={!down} onClick={() => add(down)}>
                    המילה האחרונה למטה
                  </Button>
                  <Button size="sm" variant={confirmed ? 'filled' : 'tonal'} icon="check" aria-pressed={confirmed} onClick={() => onOps(toggleConfirm(ops, block.id, line.i))}>
                    השורה נכונה
                  </Button>
                </div>
              )}
            </LineRow>
          )
        })}
      </ol>
    </div>
  )
}
