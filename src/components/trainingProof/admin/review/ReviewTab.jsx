'use client'

import { SectionSwitch } from '../bits'
import OcrReview from './OcrReview'
import RouterReview from './RouterReview'
import FramesReview from './FramesReview'

// לשונית "סקירה ואישור": בורר חלק ← הסקירה של החלק. דחייה מחזירה את הפריט למאגר (§8.2).
export default function ReviewTab({ section, setSection, summary, onChanged }) {
  const pending = summary ? Object.fromEntries(Object.entries(summary.sections).map(([k, v]) => [k, v.submitted])) : null
  return (
    <div className="flex flex-col gap-3">
      <SectionSwitch value={section} onChange={setSection} counts={pending} />
      {section === 'ocr' && <OcrReview onChanged={onChanged} />}
      {section === 'router' && <RouterReview onChanged={onChanged} />}
      {section === 'frames' && <FramesReview onChanged={onChanged} />}
    </div>
  )
}
