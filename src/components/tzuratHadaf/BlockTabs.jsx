'use client'

// בחירת גוש בעמוד (גמרא, רש"י, תוספות, גיליון...) — לשונית לכל גוש, עם תג כשהגוש לא עוגן במחשב (auto !== 'ok')
// ומונה השורות החשודות שעוד נשארו. counts — Map של blockId → מספר.
export default function BlockTabs({ blocks, value, onChange, counts = null }) {
  return (
    <div role="tablist" aria-label="גושים בעמוד" className="flex flex-wrap gap-1">
      {blocks.map((b) => {
        const on = b.id === value
        const n = counts?.get(b.id) || 0
        return (
          <button
            key={b.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(b.id)}
            className={`flex min-h-10 items-center gap-1 rounded-lg border px-3 text-sm font-bold ${on ? 'border-primary bg-primary text-on-primary' : 'border-outline-variant bg-surface text-on-surface hover:border-primary'}`}
          >
            {b.label || b.id}
            {n > 0 && <span className={`rounded-full px-1.5 text-xs ${on ? 'bg-white/25' : 'bg-warning-100 text-warning-800'}`}>{n}</span>}
          </button>
        )
      })}
    </div>
  )
}
