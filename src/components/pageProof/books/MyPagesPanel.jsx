'use client'

import Link from 'next/link'
import { CLAIM_HOURS, CLAIM_RULE, bookHref } from '@/lib/pageProof/gridState'
import { formatSince, formatTimeAgo, formatUntil } from '@/lib/pageProof/dates'
import { SUBMITTED_HINT, submittedWaiting } from '@/lib/pageProof/helpTexts'

// "העמודים שלי" — מה שדף המתנדב (/library/page-proof) מציג בכניסה: הרצפים שבהם
// אתם מחזיקים עמודים, ולכל עמוד עד מתי הוא שמור לכם; לחיצה על עמוד פותחת אותו
// בעורך. שום עמוד אינו נתפס כאן — לבחירת עמודים: רשת-העמודים (/library/page-proof/books).
//
// held    — הרצפים מ-GET /api/page-proof/mine ({book, seq, pages:[{id, page, state, leasedUntil}]})
// recutPending — העמודים ששלחתם לזיהוי-מחדש ועוד לא חזרו ({id, gid, title, page, requestedAt,
//           picked}); הם חוזרים אליכם לבד, עם השורות החדשות
// submitted — ההגשות שלכם שממתינות לבדיקת מנהל ({id, submissionId, gid, title, page, submittedAt}) —
//           "הוגש — ממתין לבדיקת מנהל (מאז …)", גם כשכל הרצף כבר הוגש; onOpenSubmitted(pageId) — לצפייה
// missing — העמוד שביקשו בכתובת (?page=) ואינו בטיפולכם: {id, gid?, page?, state?}
// onOpen(sequence, pageId) · now — מתי נטען (לחישוב "עד מתי")

const GRID_PATH = '/library/page-proof/books'

// למה העמוד שביקשו אינו נפתח, לפי מצבו בעיני המתנדב (gridState.pageStateFor)
const MISSING_WHY = {
  open: `הוא פנוי: אם תפסתם אותו, עברו ${CLAIM_HOURS} שעות (בלי שבת וחג) מאז שנפתח והוא חזר למאגר. אפשר לתפוס אותו שוב ברשת-העמודים של הספר — טיוטה שלא הגשתם שמורה בדפדפן.`,
  second: 'הוא ממתין לבודק נוסף — אפשר לתפוס אותו ברשת-העמודים של הספר.',
  taken: 'מתנדב אחר עובד עליו כרגע.',
  done: 'הוא כבר הושלם.',
  recut: 'הוא ממתין לחיתוך ולזיהוי-מחדש בתוכנת-הספר, ויחזור להגהה במעבר שני (עמוד ששלחתם בעצמכם — יחזור אליכם).',
  closed: 'הוא אינו פתוח להגהה כרגע.',
}

function MissingNotice({ missing }) {
  const known = missing?.page != null
  return (
    <div role="status" className="flex items-start gap-2 rounded-xl border border-warning-alt-200 bg-warning-alt-50 p-4 text-sm text-warning-alt-800">
      <span aria-hidden="true" className="material-symbols-outlined">info</span>
      <div className="flex-1">
        <p className="font-bold">{known ? `עמוד ${missing.page} אינו בטיפולכם כרגע` : 'העמוד שביקשתם לא נמצא'}</p>
        <p className="mt-1">{known ? MISSING_WHY[missing.state] || 'אי אפשר לפתוח אותו לעריכה כרגע.' : 'אולי הספר הוסר מההגהה. בחרו עמוד אחר ברשת-העמודים.'}</p>
        {missing?.gid && (
          <Link href={bookHref(missing.gid)} className="mt-2 inline-flex items-center gap-1 font-medium text-primary hover:underline">
            <span aria-hidden="true" className="material-symbols-outlined text-base">grid_view</span>
            לרשת-העמודים של הספר
          </Link>
        )}
      </div>
    </div>
  )
}

const PAGE_BTN = 'flex flex-col items-start rounded-lg border px-3 py-2 text-right transition-colors'
const PAGE_CLS = {
  mine: 'border-info-300 bg-info-50 text-info-900 hover:bg-info-100',
  submitted: 'border-warning-alt-300 bg-warning-alt-50 text-warning-alt-800 hover:bg-warning-alt-100',
  approved: 'border-success-300 bg-success-50 text-success-800 hover:bg-success-100',
}

function pageNote(p, now) {
  if (p.state === 'submitted') return submittedWaiting(formatSince(p.submittedAt, now?.getTime() > 0 ? now : new Date()))
  if (p.state === 'approved') return 'אושר'
  const until = formatUntil(p.leasedUntil, now)
  return until ? `שמור לך עד ${until}` : 'בטיפולך'
}

// העמודים ששלחתם לזיהוי-מחדש ועוד לא חזרו — אין מה לפתוח בהם עד שיחזרו
function RecutPending({ items, now }) {
  return (
    <section aria-labelledby="recut-pending-title" className="rounded-xl border border-feature-200 bg-feature-50/60 p-3">
      <h3 id="recut-pending-title" className="flex items-center gap-2 text-sm font-bold text-feature-800">
        <span aria-hidden="true" className="material-symbols-outlined text-base">cached</span>
        ממתינים לזיהוי-מחדש ({items.length})
      </h3>
      <p className="mt-1 text-xs text-on-surface/70">
        העמודים יחזרו אליכם עם השורות החדשות אחרי שתוכנת-הספר תעבד אותם, ויישמרו לכם שוב {CLAIM_HOURS} שעות (שבת וחג אינם נספרים). שאר התיקונים שלכם מחכים לכם בהם.
      </p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {items.map((r) => (
          <li key={r.id} className="rounded-lg border border-feature-200 bg-surface px-3 py-1.5 text-sm">
            <span className="font-bold">{r.title ? `${r.title} · ` : ''}עמוד {r.page}</span>
            <span className="block text-xs text-on-surface/60">
              {r.picked ? 'בעבודה בתוכנת-הספר' : 'ממתין לתוכנת-הספר'}
              {r.requestedAt ? ` · נשלח ${formatTimeAgo(r.requestedAt, now)}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

// ההגשות שממתינות לבדיקת מנהל — כל אחת עם מועד ההגשה. לחיצה פותחת אותה לצפייה (ההגשה שלכם, כמו שהוגשה)
function SubmittedPending({ items, now, onOpen }) {
  return (
    <section aria-labelledby="submitted-pending-title" className="rounded-xl border border-warning-alt-200 bg-warning-alt-50/60 p-3">
      <h3 id="submitted-pending-title" className="flex items-center gap-2 text-sm font-bold text-warning-alt-800">
        <span aria-hidden="true" className="material-symbols-outlined text-base">hourglass_top</span>
        ממתינים לבדיקת מנהל ({items.length})
      </h3>
      <p className="mt-1 text-xs text-on-surface/70">{SUBMITTED_HINT}</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {items.map((s) => {
          const body = (
            <>
              <span className="font-bold">{s.title ? `${s.title} · ` : ''}עמוד {s.page}</span>
              <span className="block text-xs text-on-surface/70">{submittedWaiting(formatSince(s.submittedAt, now))}</span>
            </>
          )
          return (
            <li key={s.submissionId || s.id}>
              {onOpen ? (
                <button
                  type="button"
                  onClick={() => onOpen(s.id)}
                  className="rounded-lg border border-warning-alt-200 bg-surface px-3 py-1.5 text-right text-sm transition-colors hover:bg-warning-alt-100"
                  title="פתיחה לצפייה — ההגשה שלכם, כמו שהוגשה"
                >
                  {body}
                </button>
              ) : (
                <div className="rounded-lg border border-warning-alt-200 bg-surface px-3 py-1.5 text-sm">{body}</div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export default function MyPagesPanel({ held = [], recutPending = [], submitted = [], missing = null, onOpen, onOpenSubmitted = null, now = null }) {
  const at = now || new Date(0)
  return (
    <section aria-labelledby="my-pages-title" className="glass-strong flex flex-col gap-4 rounded-xl p-5">
      {missing && <MissingNotice missing={missing} />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="my-pages-title" className="flex items-center gap-2 text-xl font-bold text-on-surface">
          <span aria-hidden="true" className="material-symbols-outlined text-accent">person</span>
          העמודים שלי
        </h2>
        <Link href={GRID_PATH} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-on-primary transition-colors hover:bg-accent">
          <span aria-hidden="true" className="material-symbols-outlined text-lg">grid_view</span>
          בחירת עמודים
        </Link>
      </div>
      <p className="text-sm text-on-surface/60">{CLAIM_RULE}</p>

      {recutPending.length > 0 && <RecutPending items={recutPending} now={now || new Date()} />}

      {submitted.length > 0 && <SubmittedPending items={submitted} now={now || new Date()} onOpen={onOpenSubmitted} />}

      {held.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-surface-variant bg-surface/30 px-4 py-10 text-center">
          <p className="font-medium text-on-surface/70">אין לכם עמודים בטיפול כרגע.</p>
          <p className="mt-1 text-sm text-on-surface/60">בחרו ספר, ובו עמוד פנוי או רצף של 5 עמודים עוקבים, ולחצו &quot;תפוס&quot;.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {held.map((s) => (
            <li key={`${s.book?.id}:${s.seq}`} className="rounded-xl border border-surface-variant/60 bg-surface/40 p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                <span className="font-bold text-on-surface">{s.book?.title}</span>
                <span className="text-on-surface/50">· רצף {s.seq + 1}</span>
                {s.book?.gid && (
                  <Link href={bookHref(s.book.gid)} className="mr-auto text-xs text-primary hover:underline">
                    לרשת-העמודים של הספר
                  </Link>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {s.pages
                  .filter((p) => PAGE_CLS[p.state])
                  .map((p) => (
                    <button key={p.id} type="button" onClick={() => onOpen?.(s, p.id)} className={`${PAGE_BTN} ${PAGE_CLS[p.state]}`}>
                      <span className="font-bold">עמוד {p.page}</span>
                      <span className="text-xs">{pageNote(p, at)}</span>
                    </button>
                  ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
