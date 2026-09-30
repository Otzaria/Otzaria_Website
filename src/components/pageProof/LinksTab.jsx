'use client'

import { tokenize } from '@/lib/pageProof/textModel'
import { linkBadge } from '@/lib/pageProof/flowEdit'
import { Section } from './LineTab'

// כרטיסיית "קישורים" בלוח הפרטים: הערה ↔ הציון בגוף, ד"ה ↔ המקור, המשך.
// קישור חדש נוצר בטקסט עצמו (מילה ← "קישור" ← המילה המקבילה בזרם השני ←
// "קישור"); כאן — הרשימה, אישור/ביטול של קישורי המערכת, והקישורים החסרים.
// המספר שליד כל קישור הוא אותו מספר שמופיע אחרי המילים בטקסט.

const KIND_HE = { note: 'הערה', dh: 'דיבור-המתחיל', join: 'המשך' }
const MISSING_HE = {
  note_no_anchor: 'הערה בלי ציון בגוף',
  anchor_no_note: 'ציון בלי הערה',
  misread: 'ציון שנקרא שגוי',
  gap: 'פער במספור',
}
const btn = 'rounded-md px-2 py-0.5 text-xs transition-colors disabled:opacity-40'

// שורה שבעמוד אחר (קישור-סעיף שזולג בין עמודים): "עמוד 4, שורה 12: «…»" — מספר-השורה ותחילת הטקסט מגיעים
// מחוזה-העמוד (`to_line_no`/`to_text`, `from_line_no`/`from_text`); בלעדיהם — מזהה-השורה כמו קודם
export function farLabel(page, lineNo, lineId, text) {
  const t = String(text || '').trim()
  const short = t.length > 32 ? `${t.slice(0, 32)}…` : t
  return `עמוד ${page}, שורה ${lineNo != null ? lineNo + 1 : lineId}${short ? `: «${short}»` : ''}`
}

function wordsText(line, range) {
  if (!line || !Array.isArray(range)) return null
  const ws = tokenize(line.text).filter((t) => t.w === 'word')
  return ws
    .slice(range[0], range[1] + 1)
    .map((w) => w.text)
    .join(' ')
}

export default function LinksTab({ view, readOnly = false, linkPending = null, act }) {
  const byId = new Map((view.lines || []).map((l) => [l.id, l]))
  const label = (id, range = null) => {
    const l = byId.get(id)
    if (!l) return `שורה ${id}`
    const w = wordsText(l, range)
    if (w) return `${(l.line_no ?? 0) + 1}: «${w}»`
    const t = String(l.text || '').slice(0, 28)
    return `${(l.line_no ?? 0) + 1}: ${t}${(l.text || '').length > 28 ? '…' : ''}`
  }
  const links = view.links || []
  const missing = view.missing || []

  return (
    <div className="text-on-surface">
      <Section title="קישור חדש">
        <ol className="list-decimal space-y-0.5 pr-4 text-xs text-on-surface/75">
          <li>סמנו בטקסט את המילה (למשל ציון-ההערה או מילות הדיבור-המתחיל) ולחצו «קישור» (Ctrl+K).</li>
          <li>עברו ללשונית של הזרם השני וסמנו את המילה המקבילה.</li>
          <li>לחצו שוב «קישור». Esc — ביטול.</li>
        </ol>
        <p className="mt-1 text-xs text-on-surface/60">
          לכל שורת-הערה (או פירוש) קישור אחד. בשורה עם כמה הערות — קשרו את הראשונה; קישור חדש מאותה שורה מחליף את הקודם (תתבקשו לאשר).
        </p>
        {linkPending ? (
          <div className="mt-2 flex items-center gap-2 rounded-md bg-info-50 px-2 py-1 text-xs text-info-800">
            <span className="flex-1">ממתין לצד השני{linkPending.from?.text ? ` של «${linkPending.from.text}»` : ''}</span>
            <button type="button" onClick={act.cancelLink} className={`${btn} bg-white text-info-700`}>
              ביטול
            </button>
          </div>
        ) : (
          <button type="button" disabled={readOnly || !act.startLink} onClick={act.startLink} className={`${btn} mt-2 bg-surface-variant/60 hover:bg-surface-variant`}>
            קישור מהמילה שבסמן
          </button>
        )}
      </Section>

      <Section title={`קישורים בעמוד (${links.length})`}>
        {!links.length && <p className="text-xs text-on-surface/60">אין קישורים</p>}
        <ul className="space-y-2 text-sm">
          {links.map((k, idx) => (
            <li key={`${k.from_line}-${k.to_line}-${k.to_page}-${idx}`} className={`rounded-md border p-2 ${k.suspect ? 'border-danger-600' : 'border-surface-variant'}`}>
              <div className="flex items-center gap-1 text-xs text-on-surface/60">
                <span className="font-bold text-info-700">{linkBadge(idx + 1)}</span>
                {KIND_HE[k.kind] || k.kind} · {k.src === 'human' ? 'אושר' : `אוטומטי${typeof k.conf === 'number' ? ` ${Math.round(k.conf * 100)}%` : ''}`}
              </div>
              {k.from_page != null && k.from_page !== view.page ? (
                <div className="text-right">{farLabel(k.from_page, k.from_line_no, k.from_line, k.from_text)}</div>
              ) : (
                <button type="button" className="block text-right hover:underline" onClick={() => act.jumpToLine(k.from_line, k.from_words?.[0])}>
                  {label(k.from_line, k.from_words)}
                </button>
              )}
              <div className="text-xs text-on-surface/50">
                ←{' '}
                {k.to_page == null || k.to_page === view.page ? (
                  <button type="button" className="hover:underline" onClick={() => act.jumpToLine(k.to_line, (k.to_words || k.words)?.[0])}>
                    {label(k.to_line, k.to_words || k.words)}
                  </button>
                ) : (
                  farLabel(k.to_page, k.to_line_no, k.to_line, k.to_text)
                )}
              </div>
              {k.suspect && <div className="text-xs text-danger-700">{k.suspect}</div>}
              {k.from_page != null && k.from_page !== view.page ? (
                <div className="mt-1 text-xs text-on-surface/50">מאשרים או מוחקים בעמוד {k.from_page}, שבו הפירוש</div>
              ) : (
              <div className="mt-1 flex gap-1">
                {k.src !== 'human' && k.to_line != null && (
                  <button type="button" disabled={readOnly} onClick={() => act.linkOk(k.from_line)} className={`${btn} bg-success-100 text-success-800`}>
                    ✓ נכון
                  </button>
                )}
                <button type="button" disabled={readOnly} onClick={() => act.linkDel(k.from_line)} className={`${btn} bg-danger-100 text-danger-700`}>
                  ✗ שגוי
                </button>
              </div>
              )}
            </li>
          ))}
        </ul>
      </Section>

      <Section title={`קישורים חסרים (${missing.length})`} hint="כנראה שגיאת-זיהוי: ציון שנקרא לא נכון, או הערה בלי ציון">
        {!missing.length && <p className="text-xs text-on-surface/60">אין</p>}
        <ul className="space-y-1 text-sm">
          {missing.map((m, i) => (
            <li key={i} className="rounded-md bg-warning-alt-100/60 p-2">
              <div className="text-xs font-bold">
                {MISSING_HE[m.type] || m.type}
                {m.sign ? ` · ${m.sign}` : ''}
              </div>
              {m.line_id != null && (
                <button type="button" className="text-right text-xs hover:underline" onClick={() => act.jumpToLine(m.line_id)}>
                  {label(m.line_id)}
                </button>
              )}
              {m.detail && <div className="text-xs text-on-surface/60">{m.detail}</div>}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  )
}
