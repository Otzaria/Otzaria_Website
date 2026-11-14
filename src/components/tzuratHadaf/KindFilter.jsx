import { KIND_FILTERS } from './labels'

// מסנן סוג הטקסט במסלול המהיר: הכל / גמרא / רש"י / תוספות.
export default function KindFilter({ value, onChange, disabled = false }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="radiogroup" aria-label="סוג הטקסט" className="flex flex-wrap gap-1 rounded-xl bg-surface-variant/50 p-1">
        {KIND_FILTERS.map((k) => {
          const on = value === k.id
          return (
            <button
              key={k.id}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={disabled}
              onClick={() => onChange(k.id)}
              className={`min-h-9 rounded-lg px-3 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                on ? 'bg-primary text-on-primary' : 'text-on-surface hover:bg-surface'
              }`}
            >
              {k.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
