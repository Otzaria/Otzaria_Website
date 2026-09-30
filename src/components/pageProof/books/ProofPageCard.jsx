'use client'

import Link from 'next/link'
import { useDialog } from '@/components/providers/DialogContext'
import { STATE_UI, editorHref, CLAIM_HOURS } from '@/lib/pageProof/gridState'
import { formatHebrewDate, formatTimeAgo, formatTimeLeft, formatUntil } from '@/lib/pageProof/dates'
import ProofPageThumb from './ProofPageThumb'

// כרטיס של עמוד אחד ברשת-העמודים של ספר בהגהת-עמודים — בנוי כמו PageCard
// בדף הספר הישן (/library/books/[path]): תמונה ממוזערת בגובה 3:4 עם מספר
// העמוד (לחיצה ← הגדלה), "עמוד N" עם תווית-מצב, מי מחזיק בו ועד מתי ("שמור
// לך עד מחר ב-14:05"), והכפתור המתאים למצב. תפיסה ושחרור שואלים קודם
// (showConfirm), כמו בדף הישן.
//
// page: {id, page, state, revision, claimer, leasedUntil, submittedAt}
// onClaim(page) / onRelease(page) — נקראים רק אחרי אישור בחלון-השאלה.
// canClaimNew=false (ספר מושהה) — בלי תפיסה חדשה.
// compact — התצוגה הצפופה (כרטיסים צרים): תוויות קצרות, בלי שורת-הזמן.

const BTN_BASE = 'flex w-full items-center justify-center rounded-lg font-bold transition-colors'
const SIZE = { full: 'gap-2 py-2 text-sm', compact: 'gap-1 py-1.5 text-xs' }
const NOTE_BASE = 'flex w-full cursor-not-allowed items-center justify-center rounded-lg bg-surface-variant/40 font-medium text-on-surface/50'
const ICON = { full: 'text-lg', compact: 'text-base' }

// הטקסטים של הכפתורים וההסברים: [מלא, קצר]
const TEXT = {
  claim: ['תפוס ועבוד', 'תפוס ועבוד'],
  second: ['תפוס כבודק שני', 'בודק שני'],
  resume: ['המשך לעבוד', 'המשך'],
  view: ['צפייה', 'צפייה'],
  taken: ['תפוס בידי מתנדב אחר', 'תפוס'],
  recut: ['ממתין לזיהוי-מחדש', 'בזיהוי-מחדש'],
  paused: ['הספר מושהה', 'מושהה'],
}

const confirmClaim = (page) =>
  page.state === 'second'
    ? {
        title: `בדיקה שנייה של עמוד ${page.page}`,
        message: `מתנדב אחר כבר הגיש את העמוד הזה, והוא נבחר לבדיקה כפולה — כך מודדים עד כמה המתייגים מסכימים.\nעבדו עליו כרגיל ובאופן עצמאי (ההגשה הקודמת לא מוצגת לכם). העמוד יישמר עבורכם ל-${CLAIM_HOURS} שעות, וכל פתיחה שלו בעורך מחדשת את הזמן.`,
        confirm: 'תפוס כבודק שני',
      }
    : {
        title: `עבודה על עמוד ${page.page}`,
        message: `האם אתם מעוניינים לעבוד על עמוד זה?\nהעמוד יסומן "בטיפולך" ויישמר עבורכם ל-${CLAIM_HOURS} שעות (כל פתיחה שלו בעורך מחדשת את הזמן), ואז ייפתח בעורך.`,
        confirm: 'תפוס ועבוד',
      }

// השורה שמתחת לכותרת: של מי העמוד ועד מתי הוא שמור (כמו "ע"י ..." / "משויך
// אליך", ו"שמור לך עד מחר ב-14:05"; כמה זמן נשאר — בריחוף). בתצוגה הצפופה —
// רק מי (עד מתי — בריחוף).
function Holder({ page, now, compact }) {
  if (page.state === 'mine' || page.state === 'taken') {
    const who = page.state === 'mine' ? 'משויך אליך' : `ע"י ${page.claimer || 'מתנדב אחר'}`
    const until = formatUntil(page.leasedUntil, now)
    const kept = until ? `${page.state === 'mine' ? 'שמור לך' : 'שמור'} עד ${until}` : ''
    return (
      <div className="mb-2">
        <p className="truncate text-xs font-medium text-on-surface/60" title={compact && kept ? `${who} · ${kept}` : who}>
          {who}
        </p>
        {!compact && kept && (
          <p className="text-[10px] leading-tight text-on-surface/50" title={formatTimeLeft(page.leasedUntil, now) || undefined}>
            {kept}
          </p>
        )}
      </div>
    )
  }
  if (compact) return null
  if ((page.state === 'submitted' || page.state === 'approved') && page.submittedAt) {
    return (
      <div className="mb-2">
        <p className="truncate text-xs font-medium text-on-surface/60">משויך אליך</p>
        <p className="text-[10px] leading-tight text-on-surface/50">
          הוגש {formatHebrewDate(page.submittedAt)}, {formatTimeAgo(page.submittedAt, now)}
        </p>
      </div>
    )
  }
  if (page.state === 'second') {
    return <p className="mb-2 text-xs font-medium text-on-surface/60">עמוד לבדיקה כפולה</p>
  }
  return null
}

function Note({ icon, text, title, size }) {
  return (
    <div className={`${NOTE_BASE} ${SIZE[size]}`} title={title}>
      <span aria-hidden="true" className={`material-symbols-outlined ${ICON[size]}`}>{icon}</span>
      <span>{text}</span>
    </div>
  )
}

function Actions({ page, canClaimNew, busy, compact, onAskClaim }) {
  const size = compact ? 'compact' : 'full'
  const t = (key) => TEXT[key][compact ? 1 : 0]
  const href = editorHref(page.id)
  const icon = (name) => (
    <span aria-hidden="true" className={`material-symbols-outlined ${ICON[size]}`}>
      {name}
    </span>
  )
  switch (page.state) {
    case 'open':
    case 'second':
      if (!canClaimNew) {
        return <Note icon="pause_circle" text={t('paused')} title="הספר מושהה — אי אפשר לתפוס בו עמודים חדשים כרגע" size={size} />
      }
      return (
        <button
          type="button"
          onClick={onAskClaim}
          disabled={busy}
          title={page.state === 'second' ? 'תפוס כבודק שני' : undefined}
          className={`${BTN_BASE} ${SIZE[size]} bg-primary text-on-primary hover:bg-accent disabled:opacity-50`}
        >
          {icon(page.state === 'second' ? 'person_add' : 'lock')}
          <span>{t(page.state === 'second' ? 'second' : 'claim')}</span>
        </button>
      )
    case 'mine':
      return (
        <Link href={href} className={`${BTN_BASE} ${SIZE[size]} bg-primary text-on-primary hover:bg-accent`}>
          {icon('edit')}
          <span>{t('resume')}</span>
        </Link>
      )
    case 'submitted':
    case 'approved':
      return (
        <Link
          href={href}
          className={`${BTN_BASE} ${SIZE[size]} bg-primary/10 text-primary hover:bg-primary/20`}
          title={page.state === 'approved' ? 'ההגשה שלכם אושרה' : 'ההגשה שלכם ממתינה לאישור'}
        >
          {icon('visibility')}
          <span>{t('view')}</span>
        </Link>
      )
    case 'taken':
      return (
        <Note
          icon="lock"
          text={t('taken')}
          title="מתנדב אחר עובד על העמוד. אם לא יגיש אותו עד שייגמר הזמן — הוא יחזור להיות פנוי"
          size={size}
        />
      )
    case 'recut':
      return (
        <Note
          icon="cached"
          text={t('recut')}
          title="הגשה שאושרה שינתה את חיתוך השורות. העמוד נחתך ונקרא מחדש בתוכנת-הספר, ויחזור להגהה במעבר שני"
          size={size}
        />
      )
    default:
      return null
  }
}

export default function ProofPageCard({ page, canClaimNew = true, busy = false, compact = false, now, onClaim, onRelease, onPreview }) {
  const { showConfirm } = useDialog()
  const ui = STATE_UI[page.state] || STATE_UI.open

  const askClaim = () => {
    const q = confirmClaim(page)
    showConfirm(q.title, q.message, () => onClaim?.(page), q.confirm, 'ביטול')
  }

  const askRelease = (e) => {
    e.stopPropagation()
    e.preventDefault()
    showConfirm(
      'שחרור עמוד',
      `לשחרר את עמוד ${page.page}?\nהעמוד יחזור למאגר ויהיה פנוי למתנדבים אחרים. טיוטה שלא הוגשה נשארת בדפדפן שלכם.`,
      () => onRelease?.(page),
      'שחרר',
      'ביטול'
    )
  }

  const secondPass = page.revision > 1 && (page.state === 'open' || page.state === 'mine')

  return (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-xl border-2 border-surface-variant glass transition-all hover:border-primary/50">
      <ProofPageThumb page={page} onPreview={onPreview}>
        {page.state === 'mine' && onRelease && (
          <button
            type="button"
            onClick={askRelease}
            disabled={busy}
            className="absolute right-2 top-2 z-20 cursor-pointer rounded-lg bg-danger-600 p-2 text-white shadow-lg transition-all hover:scale-110 hover:bg-danger-700 active:bg-danger-800 disabled:opacity-50"
            title="שחרר עמוד"
            aria-label={`שחרור עמוד ${page.page}`}
          >
            <span aria-hidden="true" className="material-symbols-outlined text-lg">close</span>
          </button>
        )}
      </ProofPageThumb>

      <div className={`flex flex-1 flex-col ${compact ? 'p-2' : 'p-3'}`}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-1">
          <span className={`${compact ? 'text-sm' : 'text-lg'} font-bold text-on-surface`}>עמוד {page.page}</span>
          <span
            className={`whitespace-nowrap rounded border px-2 py-0.5 text-xs font-bold ${ui.bgColor} ${ui.color} ${ui.borderColor}`}
            title={ui.label}
          >
            {compact ? ui.short : ui.label}
          </span>
        </div>
        {secondPass && (
          <span
            className="mb-2 self-start rounded bg-warning-100 px-1.5 text-[10px] font-bold text-warning-800"
            title="העמוד חזר מזיהוי-מחדש אחרי תיקון חיתוך השורות — בדקו היטב את השורות המסומנות"
          >
            מעבר שני
          </span>
        )}

        <Holder page={page} now={now} compact={compact} />

        <div className="mt-auto grid gap-2">
          <Actions page={page} canClaimNew={canClaimNew} busy={busy} compact={compact} onAskClaim={askClaim} />
        </div>
      </div>
    </div>
  )
}
