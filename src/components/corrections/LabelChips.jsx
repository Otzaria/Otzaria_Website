'use client'

const TONES = {
  info: 'bg-info-50 text-info-700 border-info-200',
  warn: 'bg-warning-50 text-warning-700 border-warning-200',
  danger: 'bg-danger-50 text-danger-700 border-danger-200',
  success: 'bg-success-50 text-success-700 border-success-200',
}

/** תוויות מצב בולטות (מחושבות בשרת ב-deriveLabels). */
export default function LabelChips({ labels = [] }) {
  if (!labels.length) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {labels.map((l) => (
        <span key={l.id} className={`text-xs font-bold px-2 py-0.5 rounded-full border ${TONES[l.tone] || TONES.info}`}>
          {l.text}
        </span>
      ))}
    </div>
  )
}
