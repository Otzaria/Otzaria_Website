'use client'

import { Section } from './LineTab'

// כרטיסיית "קישורים": הערה ↔ הציון בגוף, ד"ה ↔ המקור, המשך. הקישורים של
// המערכת מקווקווים על הסריקה; אישור הופך אותם לקו רציף (אמת אנושית).

const KIND_HE = { note: 'הערה', dh: 'דיבור-המתחיל', join: 'המשך' }
const MISSING_HE = {
  note_no_anchor: 'הערה בלי ציון בגוף',
  anchor_no_note: 'ציון בלי הערה',
  misread: 'ציון שנקרא שגוי',
  gap: 'פער במספור',
}
const btn = 'rounded-md px-2 py-0.5 text-xs transition-colors disabled:opacity-40'

export default function LinksTab({ view, mode, linkFrom, readOnly, act }) {
  const byId = new Map(view.lines.map((l) => [l.id, l]))
  const label = (id) => {
    const l = byId.get(id)
    if (!l) return `שורה ${id}`
    const t = String(l.text || '').slice(0, 28)
    return `${(l.line_no ?? 0) + 1}: ${t}${(l.text || '').length > 28 ? '…' : ''}`
  }
  const links = view.links || []
  const missing = view.missing || []

  return (
    <div className="text-on-surface">
      <Section title="הוספת קישור">
        <button
          disabled={readOnly}
          onClick={() => act.mode(mode === 'link' ? 'select' : 'link')}
          className={`rounded-md px-2 py-1 text-sm ${mode === 'link' ? 'bg-primary text-on-primary' : 'bg-surface-variant/60 hover:bg-surface-variant'}`}
        >
          {mode === 'link' ? 'ביטול' : 'קישור ידני'}
        </button>
        {mode === 'link' && (
          <p className="mt-2 text-xs text-info-700">
            {linkFrom == null ? 'לחצו על שורת ההערה (או הד"ה) בסריקה' : `ההערה: ${label(linkFrom)} — עכשיו לחצו על השורה שהיא מפרשת`}
          </p>
        )}
        <p className="mt-1 text-xs text-on-surface/60">אפשר גם לבחור שתי שורות בטקסט ולהשתמש ב"קישור ביניהן" בכרטיסיית השורה.</p>
      </Section>

      <Section title={`קישורים בעמוד (${links.length})`}>
        {!links.length && <p className="text-xs text-on-surface/60">אין קישורים</p>}
        <ul className="space-y-2 text-sm">
          {links.map((k) => (
            <li key={`${k.from_line}-${k.to_line}-${k.to_page}`} className={`rounded-md border p-2 ${k.suspect ? 'border-danger-600' : 'border-surface-variant'}`}>
              <div className="text-xs text-on-surface/60">
                {KIND_HE[k.kind] || k.kind} · {k.src === 'human' ? 'אושר' : `אוטומטי${typeof k.conf === 'number' ? ` ${Math.round(k.conf * 100)}%` : ''}`}
              </div>
              <button type="button" className="block text-right hover:underline" onClick={() => act.selectLines([k.from_line])}>{label(k.from_line)}</button>
              <div className="text-xs text-on-surface/50">
                ← {k.to_page === view.page ? (
                  <button type="button" className="hover:underline" onClick={() => act.selectLines([k.to_line])}>{label(k.to_line)}</button>
                ) : (
                  `עמוד ${k.to_page}, שורה ${k.to_line}`
                )}
              </div>
              {k.suspect && <div className="text-xs text-danger-700">{k.suspect}</div>}
              <div className="mt-1 flex gap-1">
                {k.src !== 'human' && k.to_line != null && (
                  <button disabled={readOnly} onClick={() => act.linkOk(k.from_line)} className={`${btn} bg-success-100 text-success-800`}>✓ נכון</button>
                )}
                <button disabled={readOnly} onClick={() => act.linkDel(k.from_line)} className={`${btn} bg-danger-100 text-danger-700`}>✗ שגוי</button>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={`קישורים חסרים (${missing.length})`} hint="כנראה שגיאת-זיהוי: ציון שנקרא לא נכון, או הערה בלי ציון">
        {!missing.length && <p className="text-xs text-on-surface/60">אין</p>}
        <ul className="space-y-1 text-sm">
          {missing.map((m, i) => (
            <li key={i} className="rounded-md bg-warning-alt-100/60 p-2">
              <div className="text-xs font-bold">{MISSING_HE[m.type] || m.type}{m.sign ? ` · ${m.sign}` : ''}</div>
              {m.line_id != null && (
                <button type="button" className="text-right text-xs hover:underline" onClick={() => act.selectLines([m.line_id])}>{label(m.line_id)}</button>
              )}
              {m.detail && <div className="text-xs text-on-surface/60">{m.detail}</div>}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  )
}
