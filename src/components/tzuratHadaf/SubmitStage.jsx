'use client'

import { useId } from 'react'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { CHECKS, categoryLabel, num } from './labels'
import { MAX_NOTE } from './reportLogic'

// שלב "דיווח והגשה": רשימת הדיווחים (הוספה, עריכה, מחיקה — החלון עצמו אצל ההורה), סיכום השינויים, הערה למנהל, והגשה.
// summary — reviewState.workSummary; missing — הבדיקות של מבט כללי שלא סומנו (מפתחות).

const SIDE_HE = { scan: 'סריקה', ours: 'העמוד שלנו' }

export default function SubmitStage({ reports, onAddReport, onEditReport, onDeleteReport, summary, missing, note, onNote, onSubmit, submitting, readOnly = false, onGoOverview }) {
  const noteId = useId()
  const rows = [
    { label: 'בדיקות במבט הכללי', value: `${num(summary.checksDone)} מתוך ${num(summary.checksTotal)}${summary.issues ? ` (${num(summary.issues)} עם בעיה)` : ''}` },
    { label: 'שורות שהוזזו', value: num(summary.moved) },
    { label: 'שורות שסומנו נכונות', value: num(summary.confirmed) },
    { label: 'שאלות נוסח שנענו', value: `${num(summary.answered)} מתוך ${num(summary.items)}` },
    { label: 'מילים שבדפוס כתובות אחרת', value: num(summary.manual) },
    { label: 'דיווחים', value: num(summary.reports) },
  ]
  return (
    <div className="flex flex-col gap-4">
      <section className="glass-strong flex flex-col gap-3 rounded-xl p-4" aria-labelledby="th-reports">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="th-reports" className="font-bold text-on-surface">
            דיווחים
          </h2>
          {!readOnly && (
            <Button variant="tonal" icon="add" onClick={onAddReport}>
              דיווח חדש
            </Button>
          )}
        </div>
        {!reports.length ? (
          <p className="text-sm text-on-surface/60">אין דיווחים. גוש במקום שגוי, טקסט חסר או עודף, כותרת — דווחו כאן.</p>
        ) : (
          <ul className="flex flex-col gap-2" data-testid="report-list">
            {reports.map((r, i) => (
              <li key={i} className="flex flex-wrap items-start gap-2 rounded-lg bg-surface-variant/50 px-3 py-2">
                <Badge tone="warning">{categoryLabel(r.category)}</Badge>
                {(r.regions || []).map((g) => (
                  <Badge key={g.side} icon="crop_portrait">
                    {SIDE_HE[g.side]}
                  </Badge>
                ))}
                <span className="min-w-[10rem] flex-1 text-sm text-on-surface">{r.text}</span>
                {!readOnly && (
                  <span className="flex gap-1">
                    <Button size="sm" variant="text" icon="edit" onClick={() => onEditReport(i)}>
                      עריכה
                    </Button>
                    <Button size="sm" variant="text" icon="delete" onClick={() => onDeleteReport(i)}>
                      מחיקה
                    </Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="glass-strong flex flex-col gap-3 rounded-xl p-4" aria-labelledby="th-summary">
        <h2 id="th-summary" className="font-bold text-on-surface">
          סיכום
        </h2>
        <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2" data-testid="summary">
          {rows.map((r) => (
            <div key={r.label} className="flex justify-between gap-2 border-b border-outline-variant/50 py-1">
              <dt className="text-on-surface/70">{r.label}</dt>
              <dd className="font-bold tabular-nums text-on-surface">{r.value}</dd>
            </div>
          ))}
        </dl>
        {summary.rejected > 0 && <p className="text-sm text-warning-alt-800">{num(summary.rejected)} פעולות שורה לא חלות על העמוד ולא יישלחו כעוגנים.</p>}
        {missing.length > 0 && (
          <p role="alert" className="flex flex-wrap items-center gap-2 text-sm font-bold text-danger-700">
            לפני ההגשה סמנו &quot;תקין&quot; או &quot;יש בעיה&quot; בכל הבדיקות של המבט הכללי (חסרות {num(missing.length)} מתוך {num(CHECKS.length)}).
            {onGoOverview && (
              <Button size="sm" variant="text" onClick={onGoOverview}>
                למבט הכללי
              </Button>
            )}
          </p>
        )}
        <div className="flex flex-col gap-1">
          <label htmlFor={noteId} className="font-bold text-on-surface">
            הערה למנהל (רשות)
          </label>
          <textarea
            id={noteId}
            value={note}
            maxLength={MAX_NOTE}
            rows={2}
            disabled={readOnly}
            onChange={(e) => onNote(e.target.value)}
            className="rounded-lg border border-outline-variant bg-white p-2 text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        {!readOnly && (
          <Button icon="send" size="lg" onClick={onSubmit} loading={submitting} disabled={missing.length > 0} className="self-start">
            הגשת הבדיקה
          </Button>
        )}
      </section>
    </div>
  )
}
