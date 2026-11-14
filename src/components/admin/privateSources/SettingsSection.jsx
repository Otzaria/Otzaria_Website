'use client'

import Button from '@/components/ui/Button'
import { cardClasses } from '@/components/ui/Card'
import { loginHref } from '@/components/admin/list/adminRequest'
import {
  SETTINGS_LISTS, booksCount, manualSetsSummary, settingsValues, usageText,
} from '@/lib/adminPrivateSourcesScreen/privateSourcesTerms'

function ValueRow({ label, color, meta }) {
  return (
    <li className="flex items-center gap-2 py-1.5 text-body-md">
      {color !== undefined && (
        <span aria-hidden="true" className="size-3 shrink-0 rounded-full bg-outline-variant" style={color ? { backgroundColor: color } : undefined} />
      )}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="shrink-0 text-body-sm tabular-nums text-on-surface-variant">{meta}</span>
    </li>
  )
}

/**
 * לשונית "הגדרות": חמש הרשימות בעמוד אחד (במקום חמישה כפתורים בכותרת) — סטים, מצבי מקור, אופני אישור, פלטפורמות
 * ומצבי פניות. כל רשימה: מה היא, הערכים שבה וכמה משתמשים בכל אחד, ו"ערוך" שפותח את חלון העריכה הקיים (אצל המסך).
 * @param {{ sources: any, outreach: any, onEdit: (listId: string) => void }} props
 */
export default function SettingsSection({ sources, outreach, onEdit }) {
  const data = { sourceItems: sources.items, outreachItems: outreach.items }
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      {SETTINGS_LISTS.map((list) => {
        const fromOutreach = list.source === 'outreach'
        const loading = fromOutreach ? outreach.loading : sources.loading
        const failed = fromOutreach ? outreach.error : sources.items.length === 0 ? sources.error : null
        const retry = fromOutreach ? () => outreach.load() : () => sources.load()
        const rows = list.kind === 'sets'
          ? manualSetsSummary(sources.manualSets).map((s) => ({ key: s.key, label: s.label, meta: booksCount(s.count) }))
          : settingsValues(list.id, fromOutreach ? outreach.statuses : sources.options[list.id], data)
            .map((v) => ({ key: v.key, label: v.label, color: v.color, meta: usageText(v.count, list.modal.usageNoun) }))
        return (
          <section key={list.id} className={cardClasses({ padding: 'md', className: 'flex flex-col gap-3' })} aria-labelledby={`ps-settings-${list.id}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <h2 id={`ps-settings-${list.id}`} className="text-title-md text-on-surface">{list.title}</h2>
                <p className="text-body-sm text-on-surface-variant">{list.description}</p>
              </div>
              <Button variant="text" size="sm" icon="edit" disabled={loading || Boolean(failed)} onClick={() => onEdit(list.id)}
                aria-label={`ערוך את ${list.title}`}>
                ערוך
              </Button>
            </div>
            {loading ? (
              <p className="text-body-sm text-on-surface-variant">טוען…</p>
            ) : failed ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-error">
                <span>{failed.sessionExpired ? 'פג תוקף ההתחברות.' : 'לא הצלחנו לטעון את הרשימה.'}</span>
                {failed.sessionExpired
                  ? <Button href={loginHref()} variant="text" size="sm" icon="login">התחבר</Button>
                  : <Button variant="text" size="sm" icon="refresh" onClick={retry} aria-label={`נסה שוב לטעון את ${list.title}`}>נסה שוב</Button>}
              </div>
            ) : rows.length === 0 ? (
              <p className="text-body-sm text-on-surface-variant">{list.kind === 'sets' ? 'אין סטים ידניים.' : 'הרשימה ריקה.'}</p>
            ) : (
              <ul className="divide-y divide-outline-variant">
                {rows.map((r) => <ValueRow key={r.key} label={r.label} color={list.kind === 'sets' ? undefined : r.color} meta={r.meta} />)}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}
