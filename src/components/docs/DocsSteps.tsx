import type { ReactNode } from 'react'

/** רשימת שלבים ממוספרת (ol — הסדר הוא חלק מהמשמעות). המספר נלקח מה-CSS counter של הרשימה. */
export function DocsSteps({ children }: { children: ReactNode }) {
  return <ol className="space-y-3 [counter-reset:docs-step]">{children}</ol>
}

/** שלב: עיגול מספר טונלי, כותרת h3 ותוכן. */
export function DocsStep({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <li className="flex gap-4 rounded-card bg-surface-container-low p-4 [counter-increment:docs-step] sm:p-5">
      <span
        aria-hidden="true"
        className="flex size-10 shrink-0 items-center justify-center rounded-pill bg-secondary-container text-title-md text-on-secondary-container before:content-[counter(docs-step)]"
      />
      <div className="min-w-0 flex-1 space-y-3">
        <h3 className="text-title-md text-on-surface">{title}</h3>
        {children}
      </div>
    </li>
  )
}
