'use client'

import SyncedPanes from './SyncedPanes'
import { CHECKS } from './labels'

// שלב "מבט כללי": שני הלוחות (SyncedPanes) ורשימת הבדיקות — לכל בדיקה "תקין" או "יש בעיה";
// "יש בעיה" פותח את חלון הדיווח עם הקטגוריה המתאימה (onIssue(category)). עמוד שאינו וילנא — בלי השוואת שורות.

export default function OverviewStage({ page, checks, onCheck, onIssue, readOnly = false }) {
  return (
    <div className="flex flex-col gap-4">
      {page.nonVilna && (
        <p role="note" className="flex items-start gap-2 rounded-xl border border-info-200 bg-info-50 p-3 text-sm text-info-800">
          <span aria-hidden="true" className="material-symbols-outlined">info</span>
          העמוד הזה ב-PDF אינו מדפוס וילנא, ולכן אין בו השוואת שורות. בדקו רק את המבט הכללי ואת הנוסח.
        </p>
      )}
      <SyncedPanes scanSrc={page.scan?.url} oursSrc={page.ours?.url} model={page.model} showLines={!page.nonVilna} />
      <section className="glass-strong rounded-xl p-4" aria-labelledby="th-checks">
        <h2 id="th-checks" className="mb-3 font-bold text-on-surface">
          בדיקות
        </h2>
        <ul className="flex flex-col gap-2">
          {CHECKS.map((c) => {
            const v = checks?.[c.key] || null
            return (
              <li key={c.key} className="flex flex-wrap items-center gap-2 border-b border-outline-variant/60 pb-2 last:border-0" data-check={c.key}>
                <span className="min-w-[14rem] flex-1 text-on-surface">{c.label}</span>
                <div role="group" aria-label={c.label} className="flex gap-1">
                  <button
                    type="button"
                    aria-pressed={v === 'ok'}
                    disabled={readOnly}
                    onClick={() => onCheck(c.key, 'ok')}
                    className={`flex min-h-10 items-center gap-1 rounded-lg border px-3 text-sm font-bold disabled:opacity-50 ${
                      v === 'ok' ? 'border-success-600 bg-success-600 text-white' : 'border-outline-variant bg-surface text-on-surface hover:border-success-600'
                    }`}
                  >
                    <span aria-hidden="true" className="material-symbols-outlined text-base">check</span>
                    תקין
                  </button>
                  <button
                    type="button"
                    aria-pressed={v === 'issue'}
                    disabled={readOnly}
                    onClick={() => {
                      onCheck(c.key, 'issue')
                      onIssue?.(c.category)
                    }}
                    className={`flex min-h-10 items-center gap-1 rounded-lg border px-3 text-sm font-bold disabled:opacity-50 ${
                      v === 'issue' ? 'border-danger-600 bg-danger-600 text-white' : 'border-outline-variant bg-surface text-on-surface hover:border-danger-600'
                    }`}
                  >
                    <span aria-hidden="true" className="material-symbols-outlined text-base">warning</span>
                    יש בעיה
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
