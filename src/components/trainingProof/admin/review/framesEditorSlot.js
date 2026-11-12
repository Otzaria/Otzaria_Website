'use client'

// נקודת-החיבור לעורך-המסגרות של הגלאי (docs/76 §8.3: "העורך נבנה כרכיב שגם מסך הסקירה
// של המנהל משתמש בו — readOnly/review").
//
// הסקירה (FramesReview) מעבירה:
//   page       — הפריט כפי שמסך הניהול מקבל אותו (adminItem): img, w, h, page, frames (הצעת
//                המודל), result ({status, frames, streams_added} — מה שהמתנדב שמר)
//   streams    — הזרמים של הספר (TrainingProofBook.streams)
//   onSave(mark) — "תקן ואשר": POST /api/admin/training-proof/review/fix {id, mark}
//                (נבדק בשרת ב-checkFramesPage, כמו סימון של מתנדב, עם status:'marked')
// כאן — מתאם קטן: העורך מדווח על כל שינוי (onChange), והכפתור "תקן ואשר" שולח את המסגרות שבעורך.
// עמוד שכבר אושר, או שעוד לא סומן — לקריאה בלבד.

import { createElement as h, useState } from 'react'
import FramesEditorBase from '@/components/trainingProof/frames/FramesEditor'
import { buttonClasses } from '@/components/ui/buttonStyles'

// onApprove — Enter בעורך (כשהעורך לא תופס את המקש, למשל בסדר-קריאה): "אשר את העמוד";
// ואם שיניתם משהו — "תקן ואשר" עם המסגרות שבעורך
export function FramesEditor({ page, streams, onSave, onApprove }) {
  const start = page.result?.frames || page.frames || []
  const [frames, setFrames] = useState(start)
  const [dirty, setDirty] = useState(false)
  const editable = page.status === 'submitted'
  const fixBtn = editable
    ? h(
        'button',
        {
          type: 'button',
          className: buttonClasses({ variant: 'tonal', size: 'sm', fullWidth: true, disabled: !dirty, className: 'mt-2' }),
          disabled: !dirty,
          onClick: () => onSave({ status: 'marked', frames }),
          title: dirty ? '' : 'עוד לא שיניתם דבר — אפשר לאשר את העמוד כמו שהוא',
        },
        'תקן ואשר'
      )
    : null
  return h(FramesEditorBase, {
    key: page.id,
    mode: editable ? 'review' : 'readOnly',
    page: { id: page.id, w: page.w, h: page.h, img: page.img, frames: start },
    streams,
    compare: page.frames,
    keyboard: editable,
    onChange: (next, { save } = {}) => {
      setFrames(next)
      if (save !== false) setDirty(true)
    },
    sideExtra: fixBtn,
    onConfirm: editable && onApprove ? (next) => (dirty ? onSave({ status: 'marked', frames: next }) : onApprove()) : undefined,
  })
}
