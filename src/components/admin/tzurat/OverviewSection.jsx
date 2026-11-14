'use client'

import ErrorState from '@/components/ui/ErrorState'
import ProgressBar from '@/components/ui/ProgressBar'
import { formatNumber } from '@/lib/adminTerms'
import { ITEM_STATUS_ORDER, countRows, mergeByLabel, sortBooks, statusLabel, volunteersText } from '@/lib/adminTzuratScreen/tzuratTerms'
import { kindLabel } from './adminLabels'
import EmptyText from '@/components/ui/EmptyText'
import ListLoading from '@/components/ui/ListLoading'
import RefreshButton from '@/components/ui/RefreshButton'
import CardSection from '@/components/ui/CardSection'

// לשונית "מצב" (לשעבר "סקירה"): ההתקדמות בכל מסכת (עמודים שהושלמו, החלטות פתוחות / שהוסכמו / במחלוקת), פילוח
// ההחלטות לפי מצב ולפי סוג גוש, הגשות ודיווחים לפי מצב, ומתנדבים. GET stats — נטען פעם אחת במעטפת (גם בשביל
// המונים בלשוניות) ומגיע לכאן כ-stats. בלי ספריית גרפים — שורות ופסים. בלי טבלה רחבה: כל מסכת היא שורה שנשברת
// בטלפון, בלי גלילה לרוחב.

function BookRow({ book }) {
  const name = book.masechet || book.slug
  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0" data-testid="overview-book">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-title-sm text-on-surface">{name}</h3>
        <span className="text-body-sm tabular-nums text-on-surface-variant">
          {formatNumber(book.pagesDone)} מתוך {formatNumber(book.pages)} עמודים הושלמו
        </span>
      </div>
      <ProgressBar value={Number(book.pagesDone) || 0} max={Math.max(1, Number(book.pages) || 0)} label={`עמודים שהושלמו ב${name}`} />
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-body-sm text-on-surface-variant">
        <span><span className="tabular-nums text-on-surface">{formatNumber(book.items)}</span> החלטות</span>
        <span><span className="tabular-nums text-on-surface">{formatNumber(book.itemsOpen)}</span> פתוחות</span>
        <span><span className="tabular-nums text-on-surface">{formatNumber(book.itemsAgreed)}</span> הוסכמו או הוכרעו</span>
        <span><span className="tabular-nums text-on-surface">{formatNumber(book.itemsDisputed)}</span> במחלוקת או לבדיקה</span>
      </p>
    </li>
  )
}

function Counts({ title, rows }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h3 className="text-title-sm text-on-surface">{title}</h3>
      {!rows.length ? (
        <p className="text-body-sm text-on-surface-variant">אין נתונים</p>
      ) : (
        <ul className="flex flex-col gap-2 text-body-sm">
          {rows.map((r) => (
            <li key={r.key} className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)_auto] items-center gap-3">
              <span className="truncate text-on-surface" title={r.label}>{r.label}</span>
              <ProgressBar value={r.percent} max={100} label={r.label} valueText={`${formatNumber(r.value)} (${r.percent}%)`} />
              <span className="text-end tabular-nums text-on-surface-variant">{formatNumber(r.value)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** @param {{ stats: { data: any, error: string | null, loading: boolean, reload: () => void } }} props */
export default function OverviewSection({ stats }) {
  const { data, error, reload } = stats
  if (error && !data) {
    return <ErrorState title="לא הצלחנו לטעון את המצב" description={error} onRetry={reload} />
  }
  const books = sortBooks(data?.books)
  return (
    <div className="flex flex-col gap-4">
      <CardSection
        title="התקדמות לפי מסכת"
        testId="overview-books"
        actions={<RefreshButton onClick={reload} />}
        description="החלטה היא מקום בדף שבו אוצריא והדפוס שונים, והמתנדבים בודקים מה נכון. החלטות שסומנו &quot;לא רלוונטי&quot; לא נספרות כאן."
      >
        {!data ? <ListLoading /> : !books.length ? (
          <EmptyText>עוד לא הועלו חבילות. מעלים אותן בלשונית &quot;חבילות&quot;.</EmptyText>
        ) : (
          <ul className="flex flex-col divide-y divide-outline-variant">
            {books.map((b) => <BookRow key={b.slug} book={b} />)}
          </ul>
        )}
      </CardSection>

      {data && (
        <CardSection title="פילוח" testId="overview-counts" description={<span data-testid="overview-volunteers">{volunteersText(data.volunteers)}</span>}>
          <div className="grid gap-x-8 gap-y-6 md:grid-cols-2">
            <Counts title="החלטות לפי מצב" rows={countRows(data.items?.byStatus, (k) => statusLabel('item', k), ITEM_STATUS_ORDER)} />
            <Counts title="החלטות לפי סוג" rows={countRows(mergeByLabel(data.items?.byKind, kindLabel))} />
            <Counts title="הגשות" rows={countRows(data.submissions?.byStatus, (k) => statusLabel('submission', k), ['submitted', 'approved', 'rejected', 'processing'])} />
            <Counts title="דיווחים" rows={countRows(data.reports?.byStatus, (k) => statusLabel('report', k), ['new', 'in_progress', 'fixed', 'wontfix', 'duplicate'])} />
          </div>
        </CardSection>
      )}
    </div>
  )
}
