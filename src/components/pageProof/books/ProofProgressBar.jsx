import { barSegments } from '@/lib/pageProof/gridState'

// פס ההתקדמות של ספר בהגהת-עמודים — כמו בכרטיסי הספרים הישנים: ירוק למה
// שהושלם, כחול למה שבטיפול, והפנויים הם הרקע האפור של הפס. מקטע לכל קבוצה
// (gridState.GROUPS — אותן קבוצות ואותם מספרים כמו בכרטיסים שמעליו). legend:
//   'dots'   — נקודה ומספר לכל מצב (התווית ב-title), כמו בכרטיס הישן
//   'labels' — נקודה, תווית ומספר
//   'none'   — בלי מקרא
export default function ProofProgressBar({ counts, legend = 'dots', className = '' }) {
  const segments = barSegments(counts)
  const summary = segments.map((s) => `${s.label}: ${s.n}`).join(', ')

  return (
    <div className={className}>
      <div
        role="img"
        aria-label={summary ? `מצב העמודים — ${summary}` : 'אין עמודים'}
        className="flex h-3 w-full overflow-hidden rounded-full bg-neutral-100 shadow-inner"
      >
        {segments
          .filter((s) => s.key !== 'available')
          .map((s) => (
            <div
              key={s.key}
              className={`${s.bar} h-full transition-all duration-500`}
              style={{ width: `${s.pct}%` }}
              title={`${s.label}: ${s.n}`}
            />
          ))}
      </div>

      {legend !== 'none' && segments.length > 0 && (
        <div
          className={
            legend === 'dots'
              ? 'mt-3 flex items-center justify-between gap-2 border-t border-surface-variant/50 pt-3 text-xs font-medium'
              : 'mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium'
          }
        >
          {segments.map((s) => (
            <div key={s.key} className={`flex items-center gap-1.5 ${s.color}`} title={s.label}>
              <div className={`h-2 w-2 rounded-full ${s.bar}`} />
              {legend === 'labels' && <span>{s.label}</span>}
              <span>{s.n.toLocaleString('he-IL')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
