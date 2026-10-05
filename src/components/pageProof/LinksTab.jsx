'use client'

import { linkBadge, farLabel, linksInDisplayOrder } from '@/lib/pageProof/flowEdit'
import { LINK_HE, cancelledLinks, isIncomingFar, linkEndLabel, linkKindHe, linkSourceHe } from '@/lib/pageProof/linkCancel'
import { Section } from './LineTab'
import { OtherPageButtons } from './OtherPagePicker'

// כרטיסיית "קישורים" בלוח הפרטים: הערה ↔ הציון בגוף, ד"ה ↔ המקור, המשך.
// קישור חדש נוצר בטקסט עצמו (מילה ← "קישור" ← המילה המקבילה בזרם השני ←
// "קישור"); כאן — הרשימה, אישור קישורי המערכת, "בטל קישור" לכל קישור, הקישורים שבוטלו
// (עם "החזר לאוטומטי") והקישורים החסרים. הכלל של הביטול וההחזרה — lib/pageProof/linkCancel.js.
// המספר שליד כל קישור הוא אותו מספר שמופיע אחרי המילים בטקסט, והרשימה בסדר הזה —
// סדר הופעת הקישורים בעמוד (flowEdit.linksInDisplayOrder), לא סדר יצירתם.
// קישור שהצד השני שלו בעמוד אחר ("עמוד 4, שורה 12: «…»"): מהמערכת, כשהפירוש בעמוד אחר —
// מאשרים/מבטלים בעמוד של הפירוש.
// act.unlink(k) — "בטל קישור"; act.restoreLink(entry) — "החזר לאוטומטי" (entry מ-cancelledLinks);
// act.otherPage(n) (רשות) — בחירת הצד השני בעמוד אחר, כשהקישור ממתין לצד השני.
// baseDoc ו-ops (רשות) — העמוד שיובא והפעולות: בשבילם "בוטל בעריכה הזו" מופיע ברשימת הקישורים שבוטלו.

export { farLabel }

const MISSING_HE = {
  note_no_anchor: 'הערה בלי ציון בגוף',
  anchor_no_note: 'ציון בלי הערה',
  misread: 'ציון שנקרא שגוי',
  gap: 'פער במספור',
}
const btn = 'rounded-md px-2 py-0.5 text-xs transition-colors disabled:opacity-40'
// "בטל קישור" — בולט: רקע אדום מלא
const unlinkBtn = 'rounded-md bg-danger-600 px-2.5 py-1 text-xs font-bold text-white transition-colors hover:bg-danger-700 disabled:opacity-40'

export default function LinksTab({ view, baseDoc = null, ops = null, readOnly = false, linkPending = null, act }) {
  const links = linksInDisplayOrder(view)
  const cancelled = cancelledLinks(baseDoc || view, baseDoc ? ops || [] : [], view)
  const missing = view.missing || []
  const label = (side, k) => linkEndLabel(view, side, k)

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
        <p className="mt-1 text-xs text-on-surface/60">
          הצד השני בעמוד אחר (פירוש שגולש לעמוד הקודם או הבא)? אחרי «קישור» הראשון בחרו את העמוד — בפס הכחול שמעל הטקסט או כאן — ולחצו שם על המילה.
        </p>
        <p className="mt-1 text-xs text-on-surface/60">
          קישור שגוי — «{LINK_HE.unlink}» ליד הקישור ברשימה שלמטה, או לחיצה על המספר שאחרי המילה בטקסט.
        </p>
        {linkPending ? (
          <div className="mt-2 rounded-md bg-info-50 px-2 py-1 text-xs text-info-800">
            <div className="flex items-center gap-2">
              <span className="flex-1">ממתין לצד השני{linkPending.from?.text ? ` של «${linkPending.from.text}»` : ''}</span>
              <button type="button" onClick={act.cancelLink} className={`${btn} bg-white text-info-700`}>
                ביטול
              </button>
            </div>
            {act.otherPage && <OtherPageButtons page={view.page} onOtherPage={act.otherPage} />}
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
          {links.map(({ link: k, n }) => (
            <li
              key={`${k.from_line}-${k.to_line}-${k.to_page}-${n}`}
              data-link-item={n}
              className={`rounded-md border p-2 ${k.suspect ? 'border-danger-600' : 'border-surface-variant'}`}
            >
              <div className="flex items-center gap-1 text-xs text-on-surface/60">
                <span className="font-bold text-info-700">{linkBadge(n)}</span>
                {linkKindHe(k)} · {linkSourceHe(k)}
                {k._added && <span className="rounded bg-info-50 px-1 text-info-800">נוסף עכשיו</span>}
              </div>
              {isIncomingFar(k, view.page) ? (
                <div className="text-right">{label('from', k)}</div>
              ) : (
                <button type="button" className="block text-right hover:underline" onClick={() => act.jumpToLine(k.from_line, k.from_words?.[0])}>
                  {label('from', k)}
                </button>
              )}
              <div className="text-xs text-on-surface/50">
                ←{' '}
                {k.to_page == null || k.to_page === view.page ? (
                  <button type="button" className="hover:underline" onClick={() => act.jumpToLine(k.to_line, (k.to_words || k.words)?.[0])}>
                    {label('to', k)}
                  </button>
                ) : (
                  label('to', k)
                )}
              </div>
              {k.suspect && <div className="text-xs text-danger-700">{k.suspect}</div>}
              {isIncomingFar(k, view.page) && !k._added ? (
                <div className="mt-1 text-xs text-on-surface/50">{LINK_HE.farHint(k.from_page)}</div>
              ) : (
                <div className="mt-1 flex flex-wrap gap-1">
                  {k.src !== 'human' && !k._added && k.to_line != null && (
                    <button type="button" disabled={readOnly} onClick={() => act.linkOk(k.from_line)} className={`${btn} bg-success-100 text-success-800`}>
                      ✓ נכון
                    </button>
                  )}
                  <button type="button" disabled={readOnly || !act.unlink} onClick={() => act.unlink(k)} title={LINK_HE.unlinkTitle} className={unlinkBtn}>
                    ✗ {LINK_HE.unlink}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Section>

      {cancelled.length > 0 && (
        <Section title={`קישורים שבוטלו (${cancelled.length})`} hint="המחשב לא ייצור אותם שוב. «החזר לאוטומטי» — המחשב יקבע אותם מחדש">
          <ul className="space-y-1.5 text-sm">
            {cancelled.map((c) => (
              <li key={c.key} data-cancelled-link={c.link.from_line} className="rounded-md border border-dashed border-surface-variant p-2">
                <div className="text-xs text-on-surface/60">
                  {linkKindHe(c.link)} · {c.when === 'now' ? 'בוטל בעריכה הזו' : 'בוטל קודם'}
                </div>
                <div className="text-right text-on-surface/70 line-through decoration-on-surface/40">{c.label}</div>
                {c.pending ? (
                  <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-info-800">
                    <span className="flex-1">{LINK_HE.resetQueued}</span>
                    <button type="button" disabled={readOnly} onClick={() => act.restoreLink(c)} className={`${btn} bg-surface-variant/60 hover:bg-surface-variant`}>
                      ביטול
                    </button>
                  </div>
                ) : (
                  <div className="mt-1 flex gap-1">
                    <button
                      type="button"
                      disabled={readOnly || !act.restoreLink}
                      onClick={() => act.restoreLink(c)}
                      title={c.auto ? LINK_HE.restoreAutoTitle : LINK_HE.restoreHumanTitle}
                      className={`${btn} bg-info-100 font-bold text-info-800 hover:bg-info-200`}
                    >
                      ↺ {c.auto ? LINK_HE.restoreAuto : LINK_HE.restoreHuman}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

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
                  {label('from', { from_line: m.line_id })}
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
