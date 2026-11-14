'use client'

import { useId, useMemo, useState } from 'react'
import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import BlockTabs from './BlockTabs'
import DrawBox from './DrawBox'
import LineRow from './LineRow'
import { MAX_TEXT } from './fastLogic'
import { inSelection, manualFromSelection, selectWord, selectedWords } from './linesLogic'

// "בדפוס כתוב אחרת": בוחרים מילה אחת או כמה מילים רצופות באותה שורה בעמוד שלנו, כותבים מה נדפס, ואפשר לסמן את
// המקום על הסריקה. onSave(entry) — רשומת manualItems: {block, line, ref, wi, n, otz, text, box}.
// model — המודל המוצג (אחרי פעולות השורה).

export default function ManualItemDialog({ pageId, model, scan, onSave, onClose }) {
  const blocks = useMemo(() => model?.blocks || [], [model])
  const [blockId, setBlockId] = useState(blocks[0]?.id || null)
  const [sel, setSel] = useState(null)
  const [text, setText] = useState('')
  const [box, setBox] = useState(null)
  const [error, setError] = useState(null)
  const textId = useId()
  const block = blocks.find((b) => b.id === blockId) || blocks[0]
  const words = selectedWords(model, sel)
  const selLine = sel ? blocks.find((b) => b.id === sel.block)?.lines?.[sel.k] : null

  const save = () => {
    if (!words.length) return setError('בחרו את המילים שבדפוס כתובות אחרת')
    if (!text.trim()) return setError('כתבו מה כתוב בדפוס')
    const entry = manualFromSelection(model, sel, text, box)
    if (!entry) return setError('אי אפשר לבחור את המילה הזו (אין לה מקום בטקסט של אוצריא) — דווחו עליה בשלב הדיווח')
    onSave(entry)
  }

  return (
    <Dialog
      title="בדפוס כתוב אחרת"
      subtitle="1. לחצו על המילה (או על הראשונה והאחרונה ברצף, באותה שורה). 2. כתבו מה כתוב בדפוס."
      onClose={onClose}
      className="sm:max-w-5xl"
      footer={
        <>
          <Button variant="text" onClick={onClose}>
            ביטול
          </Button>
          <Button icon="check" onClick={save}>
            הוספה
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {sel && (
          <div className="sticky top-0 z-10 flex flex-col gap-2 rounded-xl border border-primary/40 bg-surface p-3" data-testid="manual-selected">
            <p>
              נבחרו: <span className="font-frank text-lg font-bold">{words.map((w) => w.t).join(' ')}</span>
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor={textId} className="font-bold">
                בדפוס כתוב:
              </label>
              <input
                id={textId}
                dir="rtl"
                value={text}
                maxLength={MAX_TEXT}
                onChange={(e) => {
                  setText(e.target.value)
                  setError(null)
                }}
                className="min-h-10 w-72 max-w-full rounded-lg border border-outline-variant bg-white px-3 font-frank text-lg focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm font-bold text-danger-700">
            {error}
          </p>
        )}
        {sel && scan?.url && (
          <DrawBox src={scan.url} W={scan.w || 1000} H={scan.h || 1400} value={box} onChange={setBox} label="המקום בסריקה (רשות)" focus={selLine?.scan || null} />
        )}
        <BlockTabs
          blocks={blocks}
          value={block?.id}
          onChange={(id) => {
            setBlockId(id)
            setSel(null)
          }}
        />
        <ol className="flex flex-col gap-2">
          {(block?.lines || []).map((line, k) => (
            <LineRow
              key={`${block.id}:${line.i}`}
              pageId={pageId}
                    scanUrl={scan?.url}
              block={block}
              line={line}
              k={k}
              mode="select"
              selected={(j) => inSelection(sel, block.id, k, j)}
              onWord={(j) => {
                setSel((s) => selectWord(s, block.id, k, j))
                setError(null)
              }}
            />
          ))}
        </ol>
      </div>
    </Dialog>
  )
}
