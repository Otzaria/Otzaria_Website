'use client'

import { useState } from 'react'
import { SectionSwitch } from '../bits'
import OcrReview from './OcrReview'
import RouterReview from './RouterReview'
import FramesReview from './FramesReview'
import OfflineCard from '../offline/OfflineCard'

// לשונית "סקירה ואישור": בורר חלק ← "עבודה בלי אינטרנט" ← הסקירה של החלק. דחייה מחזירה את הפריט למאגר (§8.2).
// אחרי העלאת קובץ-החלטות הסקירה נטענת מחדש (key), כדי שמה שהוחל ייצא ממנה.
export default function ReviewTab({ section, setSection, summary, onChanged }) {
  const [round, setRound] = useState(0)
  const pending = summary ? Object.fromEntries(Object.entries(summary.sections).map(([k, v]) => [k, v.submitted])) : null
  const applied = () => {
    setRound((n) => n + 1)
    onChanged?.()
  }
  return (
    <div className="flex flex-col gap-3">
      <SectionSwitch value={section} onChange={setSection} counts={pending} />
      <OfflineCard section={section} onApplied={applied} />
      {section === 'ocr' && <OcrReview key={round} onChanged={onChanged} />}
      {section === 'router' && <RouterReview key={round} onChanged={onChanged} />}
      {section === 'frames' && <FramesReview key={round} onChanged={onChanged} />}
    </div>
  )
}
