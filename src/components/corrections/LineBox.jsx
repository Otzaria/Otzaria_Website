'use client'

/** תיבת שורת טקסט גולמית (טקסט בלבד, שמירת רווחים). */
export default function LineBox({ title, subtitle, text, tone = 'neutral', empty = '—' }) {
  const border = tone === 'source' ? 'border-info-200' : tone === 'target' ? 'border-success-200' : 'border-neutral-cool-200'
  return (
    <section className={`rounded-xl border ${border} bg-white p-4 min-w-0`}>
      <h3 className="font-bold text-on-surface">{title}</h3>
      {subtitle && <p className="text-xs text-on-surface/60 mt-0.5 break-all">{subtitle}</p>}
      <div className="mt-3 whitespace-pre-wrap break-words leading-8 text-lg" dir="rtl">
        {text === null || text === undefined ? <span className="text-on-surface/40">{empty}</span> : text === '' ? <span className="text-on-surface/40">(שורה ריקה)</span> : text}
      </div>
    </section>
  )
}
