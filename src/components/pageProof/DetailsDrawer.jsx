'use client'

import LinksTab from './LinksTab'
import LineTab from './LineTab'
import PageTab from './PageTab'
import ChangesTab from './ChangesTab'

// לוח "פרטים" של עורך ההגהה — נפתח מהסרגל ("פרטים") בצד הדף. כל מה שאינו
// חלק מהעבודה השוטפת (טקסט, עיצוב, מסגרות) ולכן לא צריך להיות על המסך כל
// הזמן: קישורים, פרטי השורה שבה הסמן, העמוד כולו, ורשימת השינויים.
// extraTabs (רשות) — [{id, label, render(ctx)}]: לשוניות נוספות של דף עוטף (תוכנת-הספר), אחרי
// הקבועות; ctx = {view, baseDoc, ops, stats, caretLine, caretLocked, linkPending, readOnly, act}.
// מזהה שכבר קיים — מתעלמים ממנו. lockTitle (רשות) — ההסבר על שורה נעולה בכרטיסיית "שורה" (LineTab).
// inherited (רשות) — {idx, label}: הפעולות שהתקבלו ממישהו אחר — רשימה נפרדת בכרטיסיית "שינויים" (ChangesTab).

export const DETAILS_TABS = [
  { id: 'links', label: 'קישורים' },
  { id: 'line', label: 'שורה' },
  { id: 'page', label: 'עמוד' },
  { id: 'changes', label: 'שינויים' },
]

export default function DetailsDrawer({
  tab = 'links',
  setTab,
  onClose,
  view,
  baseDoc,
  ops = [],
  stats,
  caretLine = null,
  caretLocked = false,
  linkPending = null,
  readOnly = false,
  act,
  extraTabs = null,
  lockTitle,
  inherited = null,
  className = '',
}) {
  const extra = Array.isArray(extraTabs)
    ? extraTabs.filter((t, i, all) => t?.id && typeof t.render === 'function' && !DETAILS_TABS.some((d) => d.id === t.id) && all.findIndex((x) => x?.id === t.id) === i)
    : []
  const tabs = extra.length ? [...DETAILS_TABS, ...extra] : DETAILS_TABS
  const own = extra.find((t) => t.id === tab)
  return (
    <aside dir="rtl" aria-label="פרטים" className={`glass-strong flex min-h-0 flex-col overflow-hidden rounded-xl animate-enter-fade ${className}`}>
      <div className="flex items-center border-b border-surface-variant">
        <nav role="tablist" aria-label="לוח הפרטים" className="flex min-w-0 flex-1 text-sm">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab?.(t.id)}
              className={`flex-1 px-1 py-2 ${tab === t.id ? 'border-b-2 border-primary font-bold' : 'text-on-surface/60 hover:bg-surface-variant/50'}`}
            >
              {t.label}
              {t.id === 'changes' && ops.length > 0 && <span className="mr-1 rounded-full bg-primary px-1.5 text-[10px] text-on-primary">{ops.length}</span>}
            </button>
          ))}
        </nav>
        <button type="button" onClick={onClose} aria-label="סגירת לוח הפרטים" title="סגירה" className="mx-1 rounded-full p-1 text-on-surface/60 hover:bg-surface-variant hover:text-on-surface">
          <span aria-hidden="true" className="material-symbols-outlined block text-base">close</span>
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3" role="tabpanel">
        {tab === 'links' && <LinksTab view={view} baseDoc={baseDoc} ops={ops} readOnly={readOnly} linkPending={linkPending} act={act} />}
        {tab === 'line' && <LineTab key={caretLine?.id ?? 'none'} view={view} line={caretLine} locked={caretLocked} readOnly={readOnly} act={act} lockTitle={lockTitle} />}
        {tab === 'page' && <PageTab view={view} stats={stats} readOnly={readOnly} act={act} />}
        {tab === 'changes' && <ChangesTab baseDoc={baseDoc} ops={ops} readOnly={readOnly} act={act} inherited={inherited} />}
        {own && own.render({ view, baseDoc, ops, stats, caretLine, caretLocked, linkPending, readOnly, act })}
      </div>
    </aside>
  )
}
