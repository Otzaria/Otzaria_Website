'use client'

import { PAGE_TYPES } from '@/lib/pageProof/vocab'
import { Section } from './LineTab'

// כרטיסיית "עמוד": סוג-העמוד, בדיקת-השפיות של החיתוך, הוספת שורה שהוחמצה,
// ו"כל השאר נכון" — אישור מפורש לשורות שנבדקו ולא דרשו תיקון.

const btn = 'rounded-md px-2 py-1 text-sm transition-colors disabled:opacity-40'

export default function PageTab({ view, stats, untouched, mode, pendingAdd, streams, readOnly, act }) {
  const sanity = view.sanity
  return (
    <div className="text-on-surface">
      {sanity && sanity.verdict !== 'ok' && (
        <div className="my-2 rounded-md bg-danger-100 p-2 text-sm text-danger-700">
          <b>בדיקת-השפיות חשודה בחיתוך שבור.</b> אם שורות רבות מפוצלות או חוצות טורים — אל תתייגו את העמוד; סמנו &quot;לא בטוח&quot; והוסיפו הערה למנהל.
          {sanity.reasons?.length > 0 && <ul className="mt-1 list-disc pr-4 text-xs">{sanity.reasons.map((r, i) => <li key={i}>{typeof r === 'string' ? r : JSON.stringify(r)}</li>)}</ul>}
        </div>
      )}

      <Section title="סוג העמוד">
        <select
          disabled={readOnly}
          value={view.page_type || 'regular'}
          onChange={(e) => act.pageType(e.target.value)}
          className="w-full rounded-md border border-surface-variant bg-surface px-2 py-1 text-sm"
        >
          {Object.entries(PAGE_TYPES).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </Section>

      <Section title="התקדמות">
        <ul className="space-y-0.5 text-sm">
          <li>{stats.lines} שורות · {stats.edited} תוקנו · {stats.ok} סומנו נכונות · {stats.removed} הוסרו</li>
          <li>{stats.frames} מסגרות · {stats.ops} פעולות</li>
        </ul>
        <button
          disabled={readOnly || !untouched.length}
          onClick={act.okRest}
          className={`${btn} mt-2 bg-success-100 text-success-800 hover:bg-success-200`}
          title="מסמן 'השורה נכונה' לכל שורת-תוכן שלא תוקנה — רק אחרי שבאמת קראתם אותן"
        >
          ✓ כל השאר נכון ({untouched.length} שורות)
        </button>
      </Section>

      <Section title="שורה שהוחמצה" hint="שורת-טקסט שהחיתוך לא מצא בכלל">
        {!pendingAdd ? (
          <>
            <button
              disabled={readOnly}
              onClick={() => act.mode(mode === 'add' ? 'select' : 'add')}
              className={`${btn} ${mode === 'add' ? 'bg-primary text-on-primary' : 'bg-surface-variant/60 hover:bg-surface-variant'}`}
            >
              {mode === 'add' ? 'ביטול' : 'הוספת שורה'}
            </button>
            {mode === 'add' && <p className="mt-1 text-xs text-info-700">גררו מלבן סביב השורה החסרה בסריקה</p>}
          </>
        ) : (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault()
              const fd = new FormData(e.currentTarget)
              act.addLine(String(fd.get('text') || ''), String(fd.get('stream') || 'main'))
            }}
          >
            <input name="text" autoFocus placeholder="הטקסט של השורה" maxLength={2000} className="w-full rounded-md border border-surface-variant bg-surface px-2 py-1 text-sm" />
            <select name="stream" defaultValue="main" className="w-full rounded-md border border-surface-variant bg-surface px-2 py-1 text-sm">
              {streams.map((s) => (
                <option key={s.key} value={s.key}>{s.he}</option>
              ))}
            </select>
            <div className="flex gap-1">
              <button type="submit" className={`${btn} bg-primary text-on-primary`}>הוסף</button>
              <button type="button" onClick={act.cancelAdd} className={`${btn} bg-surface-variant/60`}>ביטול</button>
            </div>
          </form>
        )}
      </Section>
    </div>
  )
}
