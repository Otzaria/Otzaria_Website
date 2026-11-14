'use client'

import Badge from '@/components/ui/Badge'
import { pageImageUrl } from './api'
import { lineCropBox } from './linesLogic'

// שורה אחת בשלב "שורות" (ובבחירת מילים ל"בדפוס כתוב אחרת"): החיתוך של אותה שורה מהסריקה, ומתחתיו המילים שלנו
// בשורה ככפתורים. flag (start/end/both) — המילה הראשונה/האחרונה אצלנו שונה מהדפוס: מסומנת. touched — 'start' (הוזזה)
// או 'confirm' (אושרה). mode='select' — לחיצה על מילה בוחרת אותה (selected(j)); אחרת onWord(j) פותח את תפריט המילה.

function chipCls({ flagged, selected, menu }) {
  if (selected) return 'border-primary bg-primary text-on-primary'
  if (menu) return 'border-info-600 bg-info-100 text-on-surface'
  if (flagged) return 'border-warning-500 bg-warning-100 text-on-surface ring-2 ring-warning-400'
  return 'border-outline-variant bg-surface text-on-surface hover:border-primary'
}

export default function LineRow({
  pageId,
  scanUrl,
  block,
  line,
  k,
  touched = null,
  mode = 'edit',
  selected = () => false,
  menuJ = null,
  onWord,
  rowRef = null,
  children = null,
}) {
  const crop = lineCropBox(line.scan)
  const words = line.words || []
  const flagStart = line.flag === 'start' || line.flag === 'both'
  const flagEnd = line.flag === 'end' || line.flag === 'both'
  const suspicious = !!line.flag && !touched
  return (
    <li
      ref={rowRef}
      tabIndex={-1}
      data-line={`${block.id}:${line.i}`}
      data-suspicious={suspicious ? '1' : undefined}
      className={`flex flex-col gap-2 rounded-xl border p-3 outline-none focus-visible:ring-2 focus-visible:ring-primary ${
        suspicious ? 'border-warning-400 bg-warning-50/60' : touched ? 'border-success-300 bg-success-50/40' : 'border-outline-variant bg-surface'
      }`}
    >
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-bold text-on-surface/80">שורה {k + 1}</span>
        {suspicious && (
          <Badge tone="warning" icon="warning">
            {line.flag === 'both' ? 'תחילת השורה וסופה שונים מהדפוס' : flagStart ? 'תחילת השורה שונה מהדפוס' : 'סוף השורה שונה מהדפוס'}
          </Badge>
        )}
        {touched === 'start' && <Badge tone="success">הוזזה</Badge>}
        {touched === 'confirm' && (
          <Badge tone="success" icon="check">
            נבדקה
          </Badge>
        )}
      </div>
      {crop ? (
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white p-1">
          <img src={pageImageUrl(pageId, 'scan', crop, { baseUrl: scanUrl })} alt={`שורה ${k + 1} בסריקה`} loading="lazy" className="block h-auto max-h-24 w-full object-contain" draggable={false} />
        </div>
      ) : (
        <p className="text-xs text-on-surface/50">לשורה הזו אין מקום מסומן בסריקה.</p>
      )}
      <div className="flex flex-wrap gap-1 font-frank text-lg" role="group" aria-label={`המילים שלנו בשורה ${k + 1}`}>
        {words.map((w, j) => {
          const flagged = (flagStart && j === 0 && !touched) || (flagEnd && j === words.length - 1 && !touched)
          const sel = mode === 'select' && selected(j)
          return (
            <button
              key={`${w.ref || ''}:${w.wi ?? j}:${j}`}
              type="button"
              onClick={() => onWord?.(j)}
              aria-pressed={mode === 'select' ? sel : undefined}
              aria-expanded={mode === 'edit' ? menuJ === j : undefined}
              className={`min-h-9 rounded-md border px-2 leading-tight transition-colors ${chipCls({ flagged, selected: sel, menu: menuJ === j })}`}
            >
              {w.t}
            </button>
          )
        })}
        {!words.length && <span className="text-sm text-on-surface/50">(שורה ריקה)</span>}
      </div>
      {Array.isArray(line.print) && line.print.length > 0 && (
        <p className="text-xs text-on-surface/50" title="זיהוי אוטומטי של הסריקה — לרמז בלבד, ייתכנו בו טעויות">
          זיהוי הסריקה (רמז): <span className="font-frank text-sm">{line.print.join(' ')}</span>
        </p>
      )}
      {children}
    </li>
  )
}
