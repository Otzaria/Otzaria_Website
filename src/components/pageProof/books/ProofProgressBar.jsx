import { barSegments, STATE_UI } from '@/lib/pageProof/gridState'

// פס ההתקדמות של ספר בהגהת-עמודים — כמו בכרטיסי הספרים הישנים: ירוק למה
// שהושלם, כחול למה שבטיפול, והפנויים הם הרקע האפור של הפס. כאן מקטע לכל
// מצב (STATE_UI.bar). legend:
//   'dots'   — נקודה ומספר לכל מצב (התווית ב-title), כמו בכרטיס הישן
//   'labels' — נקודה, תווית ומספר
//   'none'   — בלי מקרא
export default function ProofProgressBar({ counts, legend = 'dots', className = '' }) {
  const segments = barSegments(counts)
  const summary = segments.map((s) => `${STATE_UI[s.state].label}: ${s.n}`).join(', ')

  return (
    <div className={className}>
      <div
        role="img"
        aria-label={summary ? `מצב העמודים — ${summary}` : 'אין עמודים'}
        className="flex h-3 w-full overflow-hidden rounded-full bg-neutral-100 shadow-inner"
      >
        {segments
          .filter((s) => s.state !== 'open')
          .map((s) => (
            <div
              key={s.state}
              className={`${STATE_UI[s.state].bar} h-full transition-all duration-500`}
              style={{ width: `${s.pct}%` }}
              title={`${STATE_UI[s.state].label}: ${s.n}`}
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
            <div key={s.state} className={`flex items-center gap-1.5 ${STATE_UI[s.state].color}`} title={STATE_UI[s.state].label}>
              <div className={`h-2 w-2 rounded-full ${STATE_UI[s.state].bar}`} />
              {legend === 'labels' && <span>{STATE_UI[s.state].label}</span>}
              <span>{s.n.toLocaleString('he-IL')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
