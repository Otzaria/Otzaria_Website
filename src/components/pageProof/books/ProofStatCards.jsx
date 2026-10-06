import { GROUPS, groupCount } from '@/lib/pageProof/gridState'

// כרטיסי-המונים בראש רשת-העמודים — כמו בדף הספר הישן: כל כרטיס הוא גם מסנן
// (לחיצה ← מוצגים רק העמודים האלה). הקבוצות, התוויות והמספרים — gridState.GROUPS, אותם כמו בפס ההתקדמות
// שמתחת, כך שכל הכרטיסים (בלי "סה"כ") מסתכמים ל"סה"כ". "ממתינים לזיהוי-מחדש" מוצג רק כשיש כאלה.

// העיצוב לכל קבוצה (מחלקות שלמות — Tailwind סורק אותן מכאן)
const LOOK = {
  done: { idle: 'border-success-300 hover:border-success-400', active: 'border-success-500 bg-success-50 ring-2 ring-success-200', num: 'text-success-700' },
  submitted: { idle: 'border-warning-alt-300 hover:border-warning-alt-400', active: 'border-warning-alt-500 bg-warning-alt-50 ring-2 ring-warning-alt-200', num: 'text-warning-alt-700' },
  mine: { idle: 'border-info-300 hover:border-info-400', active: 'border-info-500 bg-info-50 ring-2 ring-info-200', num: 'text-info-700' },
  taken: { idle: 'border-info-200 hover:border-info-300', active: 'border-info-400 bg-info-50 ring-2 ring-info-100', num: 'text-info-600' },
  recut: { idle: 'border-feature-300 hover:border-feature-400', active: 'border-feature-500 bg-feature-50 ring-2 ring-feature-200', num: 'text-feature-700' },
  available: { idle: 'border-neutral-300 hover:border-neutral-400', active: 'border-neutral-500 bg-neutral-50 ring-2 ring-neutral-200', num: 'text-neutral-700' },
}

// הסדר בכרטיסים: מה שאפשר לעשות קודם (פנויים, בטיפולך), אחר כך מה שקורה בספר
const CARD_ORDER = ['available', 'mine', 'taken', 'submitted', 'done', 'recut']

const TOTAL = {
  key: 'all',
  label: 'סה"כ עמודים',
  base: 'border',
  idle: 'border-surface-variant/30 hover:border-primary/50',
  active: 'border-primary ring-2 ring-primary/20 bg-primary/5',
  num: 'text-on-surface',
  color: 'text-on-surface/70',
}

export default function ProofStatCards({ counts, active = 'all', onSelect }) {
  const groups = CARD_ORDER.map((k) => GROUPS.find((g) => g.key === k))
    .map((g) => ({ ...g, ...LOOK[g.key], n: groupCount(counts, g) }))
    .filter((g) => !g.optional || g.n > 0)
  const cards = [{ ...TOTAL, n: counts?.total || 0 }, ...groups]
  return (
    <div className={`mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4 ${cards.length > 6 ? 'lg:grid-cols-7' : 'lg:grid-cols-6'}`}>
      {cards.map((c) => {
        const mineOf = c.mineOf ? counts?.[c.mineOf] || 0 : 0
        return (
          <button
            key={c.key}
            type="button"
            onClick={() => onSelect?.(c.key)}
            aria-pressed={active === c.key}
            title={c.hint}
            data-group={c.key}
            className={`glass rounded-xl p-4 text-center transition-all ${c.base || 'border-2'} ${active === c.key ? c.active : c.idle}`}
          >
            <p className={`text-3xl font-bold ${c.num}`}>{c.n.toLocaleString('he-IL')}</p>
            <p className={`text-sm ${c.color}`}>{c.label}</p>
            {mineOf > 0 && <p className="text-xs text-on-surface/60">{`מתוכם ${mineOf.toLocaleString('he-IL')} שלך שאושרו`}</p>}
          </button>
        )
      })}
    </div>
  )
}
