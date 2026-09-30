// כרטיסי-המונים בראש רשת-העמודים — כמו בדף הספר הישן: כל כרטיס הוא גם מסנן
// (לחיצה ← מוצגים רק העמודים האלה). המפתחות — FILTERS ב-lib/pageProof/gridState.
// "ממתינים לזיהוי-מחדש" מוצג רק כשיש כאלה.

const CARDS = [
  {
    key: 'all',
    label: 'סה"כ עמודים',
    count: (c) => c.total,
    base: 'border',
    idle: 'border-surface-variant/30 hover:border-primary/50',
    active: 'border-primary ring-2 ring-primary/20 bg-primary/5',
    num: 'text-on-surface',
    text: 'text-on-surface/70',
  },
  {
    key: 'available',
    label: 'פנויים',
    hint: 'כולל עמודים לבדיקה כפולה שדרוש להם בודק נוסף',
    count: (c) => c.available,
    idle: 'border-neutral-300 hover:border-neutral-400',
    active: 'border-neutral-500 bg-neutral-50 ring-2 ring-neutral-200',
    num: 'text-neutral-700',
    text: 'text-neutral-700',
  },
  {
    key: 'mine',
    label: 'בטיפולך',
    count: (c) => c.mine,
    idle: 'border-info-300 hover:border-info-400',
    active: 'border-info-500 bg-info-50 ring-2 ring-info-200',
    num: 'text-info-700',
    text: 'text-info-700',
  },
  {
    key: 'submitted',
    label: 'הוגשו',
    hint: 'עמודים שהגשתם וממתינים לאישור מנהל',
    count: (c) => c.submitted,
    idle: 'border-warning-alt-300 hover:border-warning-alt-400',
    active: 'border-warning-alt-500 bg-warning-alt-50 ring-2 ring-warning-alt-200',
    num: 'text-warning-alt-700',
    text: 'text-warning-alt-700',
  },
  {
    key: 'approved',
    label: 'אושרו',
    hint: 'עמודים שהגשתם והמנהל אישר',
    count: (c) => c.approved,
    idle: 'border-success-300 hover:border-success-400',
    active: 'border-success-500 bg-success-50 ring-2 ring-success-200',
    num: 'text-success-700',
    text: 'text-success-700',
  },
  {
    key: 'recut',
    label: 'ממתינים לזיהוי-מחדש',
    hint: 'עמודים שחיתוך השורות שלהם תוקן — יחזרו להגהה במעבר שני',
    count: (c) => c.recut,
    optional: true,
    idle: 'border-feature-300 hover:border-feature-400',
    active: 'border-feature-500 bg-feature-50 ring-2 ring-feature-200',
    num: 'text-feature-700',
    text: 'text-feature-700',
  },
]

export default function ProofStatCards({ counts, active = 'all', onSelect }) {
  const cards = CARDS.filter((c) => !c.optional || c.count(counts) > 0)
  return (
    <div className={`mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 ${cards.length > 5 ? 'lg:grid-cols-6' : 'lg:grid-cols-5'}`}>
      {cards.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={() => onSelect?.(c.key)}
          aria-pressed={active === c.key}
          title={c.hint}
          className={`glass rounded-xl p-4 text-center transition-all ${c.base || 'border-2'} ${active === c.key ? c.active : c.idle}`}
        >
          <p className={`text-3xl font-bold ${c.num}`}>{c.count(counts).toLocaleString('he-IL')}</p>
          <p className={`text-sm ${c.text}`}>{c.label}</p>
        </button>
      ))}
    </div>
  )
}
