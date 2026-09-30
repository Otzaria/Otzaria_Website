'use client'

import { useEffect, useState } from 'react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useDialog } from '@/components/providers/DialogContext'
import { formatDateWithTime } from '@/lib/formatDate'
import { needsRecut } from '@/lib/pageProof/ops'
import { cleanOps } from '@/lib/pageProof/submitPlan'
import ProofEditor from '../ProofEditor'

// סקירת הגשה במסך מלא: העמוד עם הפעולות של המתייג מוחלות (רשימת הפעולות —
// בחלונית "פרטים" של העורך), ואישור / דחייה. "עריכה לפני אישור" פותחת את
// העורך — מה שיאושר הוא רשימת הפעולות אחרי התיקון, בצורת-החוזה בלבד (בלי
// שדות פנימיים של העורך: קבוצות-Undo, צבירת-הקלדה).
// הגשה עם תיקוני-חיתוך: אחרי האישור העמוד "ממתין לזיהוי-מחדש" — תוכנת-הספר
// קוראת מחדש את השורות שתוקנו, והעמוד חוזר להגהה במעבר שני (השרת מחליט
// לפי הפעולות הסופיות).
// הגשה שנעשתה על גרסה קודמת של העמוד (לפני שחזר מזיהוי-מחדש) מוצגת על הגרסה
// הנוכחית — לכן בלי "עריכה לפני אישור": הפעולות מתייחסות לשורות של הגרסה הקודמת.

const sameOps = (a, b) => JSON.stringify(cleanOps(a)) === JSON.stringify(cleanOps(b))

// גרסה חסרה = 1 (עמוד/הגשה מלפני שהיו גרסאות)
const rev = (v) => (Number.isInteger(v) && v >= 1 ? v : 1)

const RECUT_HINT = 'אחרי האישור העמוד ימתין לזיהוי-מחדש בתוכנת-הספר ויחזור להגהה במעבר שני'
const RECUT_SKIPPED =
  'הגשה אחרת לעמוד הזה כבר יצאה בקובץ-התיקונים הראשי, ולכן תיקוני-החיתוך של ההגשה הזו ייצאו רק בקובץ הכפולים — העמוד לא יעבור לזיהוי-מחדש בגללם.'
const RELEASE_TITLE =
  'העמוד ממתין לזיהוי-מחדש בתוכנת-הספר. אם התוכנה לא תחזיר גרסה חדשה שלו (למשל תיקון-החיתוך נכשל שם) — שחררו אותו: הוא ייסגר בלי זיהוי-מחדש'

// onPageChanged (רשות) — מצב העמוד השתנה בלי שההגשה השתנתה (שחרור ממתנה)
export default function ReviewModal({ id, onClose, onDone, onPageChanged }) {
  const { showAlert, showConfirm } = useDialog()
  const [data, setData] = useState(null)
  const [editing, setEditing] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    fetch(`/api/admin/page-proof/submissions/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return
        if (!d.success) throw new Error(d.error || 'הטעינה נכשלה')
        setData(d)
      })
      .catch((e) => {
        showAlert('שגיאה', e.message)
        onClose()
      })
    return () => {
      alive = false
    }
  }, [id, showAlert, onClose])

  // Esc סוגר את הסקירה — אלא אם העורך או חלון שמעליו כבר טיפלו בו
  // (סגירת חלונית-הצעות, ביטול קישור, חלון העזרה)
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !editing && !e.defaultPrevented && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editing, onClose])

  const act = async (action, ops = null) => {
    if (action === 'reject') {
      const ok = await showConfirm('דחיית ההגשה', 'העמוד יחזור למאגר ויוצע למתייג אחר. להמשיך?')
      if (!ok) return
    }
    setBusy(true)
    try {
      const body = { action, note }
      if (ops) body.ops = cleanOps(ops)
      const res = await fetch(`/api/admin/page-proof/submissions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await res.json()
      if (!d.success) throw new Error(d.error || 'הפעולה נכשלה')
      if (d.recutSkipped) showAlert('תיקוני-החיתוך לא יחזרו מהתוכנה', RECUT_SKIPPED)
      // השלישי (רשות): מצב העמוד אחרי הפעולה — 'recut' = ממתין לזיהוי-מחדש
      onDone(id, d.status, { pageStatus: d.pageStatus ?? null, needsRecut: !!d.needsRecut })
    } catch (e) {
      showAlert('שגיאה', e.message)
    } finally {
      setBusy(false)
    }
  }

  // העמוד ממתין לזיהוי-מחדש שלא יגיע — נסגר בלי זיהוי-מחדש (ההגשה עצמה לא משתנה)
  const releaseRecut = async () => {
    const ok = await showConfirm(
      'שחרור העמוד מהמתנה',
      'העמוד ייסגר בלי זיהוי-מחדש: תיקוני-החיתוך שבהגשות שלו לא יחזרו מהתוכנה בגרסה חדשה (שאר התיקונים כבר בקובץ-התיקונים). עמוד כפול שחסרה לו הגשה — ייפתח לבודק נוסף. להמשיך?'
    )
    if (!ok) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/page-proof/submissions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'release_recut' }),
      })
      const d = await res.json()
      if (!d.success) throw new Error(d.error || 'הפעולה נכשלה')
      setData((cur) => (cur ? { ...cur, page: { ...cur.page, status: d.pageStatus } } : cur))
      showAlert('בוצע', d.pageStatus === 'done' ? 'העמוד שוחרר ונסגר כהושלם.' : 'העמוד שוחרר ונפתח לבודק נוסף.')
      onPageChanged?.(id, d.pageStatus)
    } catch (e) {
      showAlert('שגיאה', e.message)
    } finally {
      setBusy(false)
    }
  }

  const sub = data?.submission
  const pending = sub?.status === 'submitted'
  const canReject = pending || (sub?.status === 'approved' && !sub?.exportedAt)
  const oldRevision = !!sub && rev(sub.revision) !== rev(data.page?.revision)
  const subRecut = !!sub && (sub.needsRecut ?? needsRecut(sub.ops))

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-2" dir="rtl">
      <div className="mx-auto flex max-w-[1900px] flex-col gap-2 rounded-2xl bg-background p-3">
        {!data ? (
          <LoadingSpinner message="טוען הגשה..." />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="flex items-center gap-2 text-lg font-bold text-on-surface">
                <span aria-hidden="true" className="material-symbols-outlined text-primary">rate_review</span>
                {data.page.title} · עמוד {data.page.page}
              </h3>
              <span className="text-sm text-on-surface/70">
                {sub.userName} · {formatDateWithTime(sub.createdAt)} · {sub.ops.length} פעולות
                {data.page.required > 1 && ' · עמוד כפול'}
              </span>
              {sub.note && <span className="rounded bg-warning-alt-100 px-2 py-0.5 text-sm">הערת המתייג: {sub.note}</span>}
              {subRecut && (
                <span className="rounded bg-info-100 px-2 py-0.5 text-sm text-info-800">
                  כולל תיקוני-חיתוך — {RECUT_HINT}
                </span>
              )}
              {oldRevision && (
                <span className="rounded bg-warning-100 px-2 py-0.5 text-sm text-warning-800">
                  ההגשה נעשתה על גרסה {rev(sub.revision)} של העמוד, והוא הוחלף מאז בגרסה {rev(data.page.revision)} (חזר מזיהוי-מחדש). הפעולות
                  מוצגות על הגרסה הנוכחית ואולי לא יתאימו לה; אישור או דחייה משנים רק את ההגשה עצמה.
                </span>
              )}
              {data.siblings.length > 0 && (
                <span className="text-xs text-on-surface/60">
                  הגשות נוספות לעמוד: {data.siblings.map((s) => `${s.userName} (${s.status}, ${s.opCount})`).join(' · ')}
                </span>
              )}
              {sub.reviewedByName && (
                <span className="text-xs text-on-surface/60">
                  נבדק ע״י {sub.reviewedByName}{sub.reviewerEdited ? ' (עם תיקונים)' : ''}{sub.reviewNote ? ` — ${sub.reviewNote}` : ''}
                </span>
              )}
              {data.page?.status === 'recut' && (
                <span className="flex items-center gap-2 rounded bg-warning-alt-100 px-2 py-0.5 text-sm text-warning-alt-800">
                  העמוד ממתין לזיהוי-מחדש בתוכנת-הספר
                  <button
                    type="button"
                    onClick={releaseRecut}
                    disabled={busy}
                    title={RELEASE_TITLE}
                    className="rounded border border-warning-alt-300 bg-white px-2 py-0.5 text-xs hover:bg-warning-alt-50 disabled:opacity-40"
                  >
                    שחרור מהמתנה
                  </button>
                </span>
              )}
              <span className="flex-1" />
              {pending && !oldRevision && (
                <label className="flex items-center gap-1 text-sm">
                  <input type="checkbox" checked={editing} onChange={(e) => setEditing(e.target.checked)} />
                  עריכה לפני אישור
                </label>
              )}
              <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="הערת בודק" className="w-44 rounded-md border border-surface-variant bg-surface px-2 py-1 text-sm" />
              <button onClick={onClose} className="rounded-md px-3 py-1 hover:bg-surface-variant" disabled={busy}>
                סגירה
              </button>
            </div>

            <ProofEditor
              page={data.page}
              initialOps={sub.ops}
              readOnly={!editing}
              persist={false}
              toolbarClassName="sticky top-0 z-30"
              actions={({ ops, approval }) => (
                <>
                  {approval && approval.total > 0 && (
                    <span className="whitespace-nowrap rounded bg-surface-variant px-2 py-0.5 text-xs" title="פסקאות שהמתייג אישר מכלל פסקאות-התוכן בעמוד">
                      אושרו {approval.approved}/{approval.total} פסקאות
                    </span>
                  )}
                  {pending && (
                    <button
                      disabled={busy || !ops.length}
                      onClick={() => act('approve', editing && !sameOps(ops, sub.ops) ? ops : null)}
                      title={needsRecut(ops) && !oldRevision ? RECUT_HINT : undefined}
                      className="rounded-lg bg-success-600 px-4 py-1.5 font-bold text-white hover:bg-success-700 disabled:opacity-40"
                    >
                      אישור
                    </button>
                  )}
                  {canReject && (
                    <button disabled={busy} onClick={() => act('reject')} className="rounded-lg bg-danger-600 px-4 py-1.5 font-bold text-white hover:opacity-90 disabled:opacity-40">
                      דחייה
                    </button>
                  )}
                </>
              )}
            />
          </>
        )}
      </div>
    </div>
  )
}
