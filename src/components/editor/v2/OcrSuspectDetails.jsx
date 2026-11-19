'use client'

import Button from '@/components/ui/Button'
import { formatPct } from '@/lib/pageProof/wordPopup'

// הנתונים של מילה חשודה אחת — הסיבות, הסבירויות, ההצעות עם "החלף" והחלופות לפי ההקשר. משותף
// לחלונית "מילים חשודות" ולחלונית שנפתחת על המילה עצמה, כדי ששתיהן יציגו בדיוק אותו דבר.

export const SUSPECT_REASONS = {
  proofreading_fix: 'הצעת תיקון מההגהה', proofreading_check: 'ההגהה סימנה לבדיקה',
  low_conf: 'ביטחון זיהוי נמוך', alternatives: 'חלופות זיהוי', language_model: 'הצעת מודל השפה',
  mixed_script: 'כתבים מעורבים', digit_in_word: 'ספרה בתוך מילה', final_mid: 'אות סופית באמצע מילה',
  non_final_end: 'אות רגילה בסוף מילה', repeated_char: 'אות חוזרת', inner_punct: 'פיסוק בתוך מילה'
}
const SOURCES = { recognition: 'זיהוי', language: 'מודל השפה', context: 'מתאימה להקשר', proofreading: 'הגהת OCR' }

export const reasonsText = (word) => word.reasons.map((r) => SUSPECT_REASONS[r] || r).join(' · ')

/**
 * @param {{ word: object, onReplace: (suggestion: {text: string}) => void, limit?: number }} props
 *   limit — כמה הצעות להציג לכל היותר (החלונית שעל המילה: 3); בלי — כולן
 */
export default function OcrSuspectDetails({ word, onReplace, limit }) {
  const suggestions = limit ? word.suggestions.slice(0, limit) : word.suggestions
  return <>
    <p className="mb-2 text-body-sm text-on-surface-variant">{reasonsText(word)}</p>
    {word.p !== null && word.p !== undefined && <p className="text-body-sm">סבירות המילה המקורית לפי הזיהוי: {formatPct(word.p)}</p>}
    {word.proofreading?.p != null && <p className="text-body-sm">סבירות לשגיאת זיהוי לפי ההגהה: {formatPct(word.proofreading.p)}</p>}
    {word.proofreading?.why.length > 0 && <ul className="my-2 list-disc ps-5 text-body-sm text-on-surface-variant">
      {word.proofreading.why.map((reason) => <li key={reason}>{reason}</li>)}
    </ul>}
    {suggestions.length ? <ul aria-label="הצעות להחלפה" className="mt-2 space-y-2">
      {suggestions.map((s) => <li key={s.text} className="flex items-center justify-between gap-3">
        <span>{s.text}<small className="ms-2 text-on-surface-variant">{s.sources.map((k) => SOURCES[k]).join(' · ')}{s.p !== null ? ` · ${formatPct(s.p)}` : ''}</small></span>
        <Button variant="tonal" onClick={() => onReplace(s)} aria-label={`החלף ב${s.text}`}>החלף</Button>
      </li>)}
    </ul> : !word.contextAlternatives?.length && <p className="text-body-sm">אין הצעות חלופיות. אפשר לתקן ישירות בעורך לפי הצילום.</p>}
    {!!word.contextAlternatives?.length && <div className="mt-3">
      <p className="text-body-sm text-on-surface-variant">חלופות לפי ההקשר בספרייה. האחוזים הם משקל יחסי בין החלופות.</p>
      <ul aria-label="חלופות לפי ההקשר" className="mt-2 space-y-2">
        {word.contextAlternatives.map((s) => <li key={s.text}>
          <div className="flex items-center justify-between gap-3">
            <span>{s.text}{s.p != null && <small className="ms-2 text-on-surface-variant">משקל יחסי: {formatPct(s.p)}</small>}</span>
            <Button variant="tonal" onClick={() => onReplace(s)} aria-label={`החלף ב${s.text}`}>החלף</Button>
          </div>
          {s.why && <p className="text-body-sm text-on-surface-variant">{s.why}</p>}
        </li>)}
      </ul>
    </div>}
  </>
}
