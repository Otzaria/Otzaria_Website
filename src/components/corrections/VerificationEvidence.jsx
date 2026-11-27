'use client'

import {
  VERIFY_DECISION_LABELS, VERIFY_REASON_LABELS, EVIDENCE_KIND_LABELS, EVIDENCE_SUPPORTS_LABELS,
} from '@/lib/corrections/states'

// כמה פריטי ראיה מוצגים לפני "הצגת כל הראיות" (השירות מחזיר עד 24).
const SHOWN = 4
const TONE = {
  fix: 'bg-success-50 text-success-800 border-success-200',
  original: 'bg-warning-50 text-warning-800 border-warning-200',
  neither: 'bg-surface-variant text-on-surface/70 border-outline-variant',
}

function EvidenceItem({ item }) {
  const where = [item.source, item.edition, item.ref, item.page ? `עמוד ${item.page}` : null].filter(Boolean).join(' · ')
  const supports = item.supports ? EVIDENCE_SUPPORTS_LABELS[item.supports] : null
  return (
    <li className="rounded-lg border border-outline-variant bg-white p-2 space-y-1 min-w-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className="font-medium">{EVIDENCE_KIND_LABELS[item.kind] || item.kind || 'ראיה'}</span>
        {supports && <span className={`rounded-full border px-2 py-0.5 ${TONE[item.supports]}`}>{supports}</span>}
        {typeof item.score === 'number' && <span className="text-on-surface/60">ציון {item.score.toFixed(2)}</span>}
      </div>
      {where && <div className="text-xs text-on-surface/60 break-words">{where}</div>}
      {item.snippet && <div className="whitespace-pre-wrap break-words leading-7" dir="rtl">{item.snippet}</div>}
    </li>
  )
}

/**
 * מה שירות הבדיקה האוטומטית מצא, למתנדב: ההחלטה, הנימוק בעברית והראיות. להצגה בלבד — המתנדב מחליט.
 * @param {{verification:object|null|undefined, source?:object|null}} props
 *   verification — report.verification (decision, reasonCode, message, evidence); source — המקור העדכני (matchBasis, pathMatch)
 */
export default function VerificationEvidence({ verification, source = null }) {
  const decision = verification?.decision
  if (!decision) return null
  const evidence = Array.isArray(verification.evidence) ? verification.evidence : []
  const reason = VERIFY_REASON_LABELS[verification.reasonCode] || verification.reasonCode
  const notes = []
  if (source?.matchBasis === 'tags') notes.push('השורה אותרה לפי התוכן בלי התגיות — בקובץ התגיות שונות מאלה שבדיווח, והשינוי מחושב על השורה שבקובץ.')
  if (source?.pathMatch === 'name_fallback') notes.push('הקובץ אותר לפי שם הספר או שם הקובץ, כי הנתיב שנשלח מהתוכנה חסר או לא עדכני.')
  const rest = evidence.slice(SHOWN)
  const explanation = typeof verification.volunteerExplanation?.text === 'string' && verification.volunteerExplanation.text ? verification.volunteerExplanation : null
  return (
    <section className="glass rounded-xl p-4 space-y-3 text-sm" aria-label="ממצאי שירות הבדיקה">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-bold text-base">ממצאי שירות הבדיקה</h3>
        <span className="font-medium">{VERIFY_DECISION_LABELS[decision] || decision}</span>
      </div>
      {(reason || verification.message) && (
        <div className="space-y-1">
          {reason && <div className="text-xs text-on-surface/60">סיבה: {reason}</div>}
          {verification.message && <p className="whitespace-pre-wrap break-words" dir="rtl">{verification.message}</p>}
        </div>
      )}
      {explanation && (
        <div className="rounded-lg border border-outline-variant bg-surface-variant/40 p-2 space-y-1" aria-label="הסבר אוטומטי">
          <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
            <h4 className="font-medium text-xs">הסבר אוטומטי</h4>
            {explanation.model && <span className="text-[11px] text-on-surface/50" dir="ltr">{explanation.model}</span>}
          </div>
          <p className="whitespace-pre-wrap break-words leading-7" dir="rtl">{explanation.text}</p>
          {explanation.note && <p className="text-xs text-on-surface/50">{explanation.note}</p>}
        </div>
      )}
      {notes.map((n) => <p key={n} className="text-xs rounded-lg bg-info-50 border border-info-200 text-info-800 p-2">{n}</p>)}
      {evidence.length > 0 && (
        <div className="space-y-2">
          <ul className="space-y-2">{evidence.slice(0, SHOWN).map((e, i) => <EvidenceItem key={i} item={e} />)}</ul>
          {rest.length > 0 && (
            <details>
              <summary className="cursor-pointer text-primary text-xs">הצגת כל הראיות (עוד {rest.length})</summary>
              <ul className="space-y-2 mt-2">{rest.map((e, i) => <EvidenceItem key={i} item={e} />)}</ul>
            </details>
          )}
        </div>
      )}
      <p className="text-xs text-on-surface/50">הממצאים נאספו אוטומטית ואינם מחליפים בדיקה מול המקור; ההכרעה בידי המתנדב.</p>
    </section>
  )
}
