'use client'

import { PAGE_TYPES } from '@/lib/pageProof/vocab'
import { Section } from './LineTab'

// כרטיסיית "עמוד" בלוח הפרטים: סוג-העמוד, בדיקת-השפיות של החיתוך, "החיתוך
// בעמוד תקין", מעבר לתיקון החיתוך בסריקה (פיצול/איחוד/שורה שחסרה), שחזור
// שורות שסומנו "לא-שורה", והתקדמות.

const btn = 'rounded-md px-2 py-1 text-sm transition-colors disabled:opacity-40'

export default function PageTab({ view, stats, readOnly = false, act }) {
  const sanity = view.sanity
  const removed = (view.lines || []).filter((l) => l.status === 'removed')
  return (
    <div className="text-on-surface">
      {sanity && sanity.verdict && sanity.verdict !== 'ok' && (
        <div className="my-2 rounded-md bg-danger-100 p-2 text-sm text-danger-700">
          <b>בדיקת-השפיות חשודה בחיתוך שבור.</b> אם שורות רבות מפוצלות או חוצות טורים — תקנו במצב &quot;שורות&quot; בסריקה, או סמנו &quot;לא בטוח&quot; והוסיפו הערה למנהל.
          {sanity.reasons?.length > 0 && (
            <ul className="mt-1 list-disc pr-4 text-xs">
              {sanity.reasons.map((r, i) => (
                <li key={i}>{typeof r === 'string' ? r : JSON.stringify(r)}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Section title="סוג העמוד">
        <select
          disabled={readOnly}
          value={view.page_type || 'regular'}
          onChange={(e) => act.pageType(e.target.value)}
          aria-label="סוג העמוד"
          className="w-full rounded-md border border-surface-variant bg-surface px-2 py-1 text-sm"
        >
          {Object.entries(PAGE_TYPES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </Section>

      <Section title="חיתוך השורות" hint="שורה שחוצה שני טורים, שתי שורות בתיבה אחת, שורה שחסרה — מתקנים בסריקה, במצב 'שורות'">
        <div className="flex flex-wrap gap-1">
          <button type="button" onClick={act.toLinesMode} className={`${btn} bg-surface-variant/60 hover:bg-surface-variant`} title="פיצול, איחוד, שורה חדשה, תיבה, לא-שורה">
            לתיקון החיתוך בסריקה
          </button>
          <button
            type="button"
            disabled={readOnly || !!view.cut_ok}
            onClick={act.cutOk}
            className={`${btn} ${view.cut_ok ? 'bg-success-100 text-success-800' : 'bg-success-600 text-white hover:bg-success-700'}`}
            title="בדקתי את כל תיבות השורות בעמוד והחיתוך נכון"
          >
            {view.cut_ok ? '✓ החיתוך סומן כתקין' : '✓ החיתוך בעמוד תקין'}
          </button>
        </div>
      </Section>

      <Section title={`שורות שסומנו "לא-שורה" (${removed.length})`}>
        {!removed.length && <p className="text-xs text-on-surface/60">אין</p>}
        <ul className="space-y-1 text-sm">
          {removed.map((l) => (
            <li key={l.id} className="flex items-center gap-2 rounded bg-surface-variant/40 px-2 py-1">
              <span className="min-w-0 flex-1 truncate text-xs line-through">
                {l.id > 0 ? `${(l.line_no ?? 0) + 1}: ` : ''}
                {l.text || '(ריקה)'}
              </span>
              {l.id > 0 && (
                <button type="button" disabled={readOnly} onClick={() => act.restoreLine(l.id)} className="text-xs text-info-700 hover:underline disabled:opacity-40">
                  שחזור
                </button>
              )}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="התקדמות">
        <ul className="space-y-0.5 text-sm">
          <li>
            {stats.lines} שורות · {stats.edited} תוקנו · {stats.ok} אושרו · {stats.removed} הוסרו
          </li>
          <li>
            {stats.frames} מסגרות · {stats.ops} פעולות
          </li>
        </ul>
      </Section>
    </div>
  )
}
