'use client'

// חלון סקירה ועריכה של עמוד בתיוג מבנה — הועבר כמו שהוא מהמסך הקודם (src/app/library/admin/ocr-layout/page.jsx).
// בתוכו כרטיסי המשימות של המתנדב (LayoutTaskCards: תמונה, ציור תיבות, גרירת גבולות) — עוצבו מחדש ברכיבי ui (כפתורים,
// בוררים), בלי לגעת בקנבס ובגרירה (PageCanvas). השתנתה גם המעטפת: הכפתורים (ui/Button), הצבעים והצל (טוקני הדיאלוג), "תויג בידי", הודעת שגיאה (onError
// במקום showAlert), ונגישות החלון (useDialogA11y — פוקוס פנימה ובחזרה, Tab נשאר בחלון, Esc). סגירה (Esc, X, לחיצה
// מחוץ לחלון) כשיש תיקונים שלא נשמרו — שואלת קודם. הבקשה (PATCH set-answers) — זהה.
import { useRef, useState } from 'react'
import Button from '@/components/ui/Button'
import { useDialogA11y } from '@/components/ui/useDialogA11y'
import { unsavedConfirm } from '@/hooks/useUnsavedChangesGuard'
import {
  PagenumTaskCard,
  HeaderTaskCard,
  StreamsTaskCard,
  ZonesFullCard,
} from '@/components/ocr/layout/LayoutTaskCards'
import { formatDateShort } from '@/lib/formatDate'
import { validateAnswer, confirmedAnswerFromPrefill } from '@/lib/ocr/layoutValidation'
import { patchLayout } from './trainingApi'

function taskToValue(t) {
  if (t.confirmed) return { confirmed: true, answer: null }
  if (t.answer) return { confirmed: false, answer: t.answer }
  return null
}

// מודאל סקירה/עריכה: תצוגת התשובה על העמוד באותם כרטיסים של המתנדב.
// שינוי בכרטיס מסמן את המשימה כ"נערכה" ונשלח ב-set-answers בשמירה.
// busy — האישור של העמוד כבר נשלח (לחיצה כפולה על "אשר" לא שולחת שוב). confirm — מ-useConfirm של המסך.
export default function LayoutReviewModal({ page, busy = false, onClose, onSaved, onApprove, onError, confirm }) {
  const panelRef = useRef(null)
  const pressedOutside = useRef(false)
  const [values, setValues] = useState(() => page.tasks.map(taskToValue))
  const [dirty, setDirty] = useState(() => page.tasks.map(() => false))
  const [saving, setSaving] = useState(false)

  const setValue = (i, v) => {
    setValues((prev) => prev.map((x, j) => (j === i ? v : x)))
    setDirty((prev) => prev.map((x, j) => (j === i ? true : x)))
  }

  const anyDirty = dirty.some(Boolean)
  const allValid = page.tasks.every((t, i) => {
    const v = values[i]
    if (!v) return !dirty[i] // משימה שלא נגעו בה נשארת כמו שהיא
    if (v.confirmed) return true
    return validateAnswer(t.kind, v.answer, t.prefill, page.imageWidth, page.imageHeight) === null
  })

  const save = async () => {
    if (!anyDirty || !allValid || saving) return
    setSaving(true)
    try {
      // רק משימות שנערכו נשלחות; "נכון" של מנהל ממומש מה-prefill בצד הלקוח
      const answers = page.tasks.map((t, i) => {
        if (!dirty[i] || !values[i]) return {}
        return {
          answer: values[i].confirmed
            ? confirmedAnswerFromPrefill(t.kind, t.prefill)
            : values[i].answer,
        }
      })
      const data = await patchLayout(page.id, { action: 'set-answers', answers }, 'לא הצלחנו לשמור את התיקונים.')
      onSaved(page.id, data.tasks)
      setDirty(page.tasks.map(() => false))
    } catch (e) {
      onError(e, 'לא הצלחנו לשמור את התיקונים.')
    } finally {
      setSaving(false)
    }
  }

  const imageBase = `/api/ocr-layout/${page.id}/image`

  const requestClose = async () => {
    if (saving) return
    if (anyDirty && !(await confirm(unsavedConfirm('התיקונים שעשית בעמוד הזה לא נשמרו, והם יאבדו.')))) return
    onClose()
  }
  useDialogA11y(panelRef, requestClose)

  return (
    // לחיצה מחוץ לחלון סוגרת רק אם גם התחילה מחוצה לו (גרירה בכרטיס שמסתיימת בחוץ — לא סוגרת)
    <div
      className="fixed inset-0 z-(--dialog-z) flex items-start justify-center overflow-y-auto bg-(--dialog-scrim) p-2 sm:p-4"
      onMouseDown={(e) => { pressedOutside.current = e.target === e.currentTarget }}
      onClick={(e) => { if (e.target === e.currentTarget && pressedOutside.current) requestClose() }}
    >
      <div
        ref={panelRef}
        dir="rtl"
        role="dialog"
        aria-modal="true"
        aria-label={`סקירה: ${page.edition} / ${page.pageStem}`}
        tabIndex={-1}
        className="my-6 flex w-full max-w-5xl flex-col gap-4 rounded-(--dialog-radius) bg-(--dialog-bg) p-4 shadow-(--dialog-shadow) outline-none sm:p-6"
      >
        {/* הכותרת דביקה (נשארת למעלה כשגוללים בחלון הארוך) ובשורה אחת: השם נחתך, ופעולה ראשית אחת —
            "שמור תיקונים" כשיש תיקונים, ואחרי השמירה במקומה "אשר" */}
        <div className="sticky top-0 z-(--z-raised) -mx-4 -mt-4 flex items-center gap-2 rounded-t-(--dialog-radius) bg-(--dialog-bg) px-4 pb-2 pt-4 sm:-mx-6 sm:-mt-6 sm:px-6 sm:pt-6">
          <h2 className="min-w-0 flex-1 truncate text-title-lg text-on-surface" title={`${page.edition} / ${page.pageStem} · ${page.batch}`}>
            <bdi>{page.edition} / {page.pageStem}</bdi>
            <span className="text-body-sm text-on-surface-variant"> · <bdi>{page.batch}</bdi></span>
          </h2>
          <div className="flex shrink-0 items-center gap-2">
            {anyDirty ? (
              <Button variant="filled" size="sm" icon="save" onClick={save} disabled={!allValid} loading={saving}>
                שמור תיקונים
              </Button>
            ) : (
              page.status === 'submitted' && onApprove && (
                <Button variant="filled" size="sm" icon="check" onClick={() => onApprove(page)} loading={busy}>
                  אשר
                </Button>
              )
            )}
            <Button variant="text" size="sm" icon="close" iconOnly aria-label="סגור" onClick={requestClose} />
          </div>
        </div>

        {page.answeredByName && (
          <div className="flex items-center gap-1 text-body-sm text-on-surface-variant">
            תויג בידי <span className="text-on-surface">{page.answeredByName}</span>
            {page.answeredAt && <span>· {formatDateShort(page.answeredAt)}</span>}
          </div>
        )}

        {page.tasks.map((t, i) => (
          <div key={i} className="rounded-(--radius-card) bg-surface p-3 sm:p-4">
            {t.kind === 'pagenum' && (
              <PagenumTaskCard
                prefill={t.prefill}
                imgSrc={`${imageBase}?task=${i}`}
                value={values[i]}
                onChange={(v) => setValue(i, v)}
              />
            )}
            {t.kind === 'header' && (
              <HeaderTaskCard
                prefill={t.prefill}
                imageUrl={imageBase}
                imageWidth={page.imageWidth}
                imageHeight={page.imageHeight}
                value={values[i]}
                onChange={(v) => setValue(i, v)}
              />
            )}
            {t.kind === 'streams' && (
              <StreamsTaskCard
                prefill={t.prefill}
                imageUrl={imageBase}
                imageWidth={page.imageWidth}
                imageHeight={page.imageHeight}
                value={values[i]}
                onChange={(v) => setValue(i, v)}
              />
            )}
            {t.kind === 'zones-full' && (
              <ZonesFullCard
                prefill={t.prefill}
                imageUrl={imageBase}
                pagenumImgSrc={t.prefill.pagenum ? `${imageBase}?task=${i}&part=pagenum` : null}
                imageWidth={page.imageWidth}
                imageHeight={page.imageHeight}
                value={values[i]}
                onChange={(v) => setValue(i, v)}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
