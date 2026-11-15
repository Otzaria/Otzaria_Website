'use client'

import ContextMenu from '@/components/ui/ContextMenu'
import { ToastProvider, useToast } from '@/components/ui/Toast'
import { applyFieldEdit } from '@/lib/editor/applyFieldEdit'
import ErrorReportDialog from './ErrorReportDialog'
import MyPageReports from './MyPageReports'
import PageMessageDialog from './PageMessageDialog'
import { postPageReport } from './pageReportsApi'
import {
  BROWSER_MENU_HINT,
  COPY_FALLBACK_MESSAGE,
  CUT_FALLBACK_MESSAGE,
  PASTE_FALLBACK_MESSAGE,
  buildErrorSubmission,
  buildMessageSubmission,
  editorMenuModel,
} from './reportLogic'

/**
 * תפריט הלחיצה הימנית בשדה הטקסט וחלונות הדיווח של עורך העמוד. המצב — usePageReports;
 * כאן ה-UI והפעולות (לוח ההעתקה, שליחת הדיווח והכנסת הסימון לטקסט).
 *
 * @param {ReturnType<typeof import('./usePageReports').usePageReports>['layerProps'] & {
 *   bookPath: string, pageNumber: number, canReportErrors: boolean, online: boolean,
 *   columnNames?: { right?: string, left?: string },
 *   applyColumnText: (column: 'right'|'left'|'content', text: string) => void,
 *   flushSave: () => unknown,
 *   scanCropFor?: (column: 'right'|'left'|'content', value: string, start: number, end: number) => object|null,
 *   submit?: typeof postPageReport
 * }} props
 */
export default function PageReportsLayer(props) {
  return (
    <ToastProvider>
      <PageReportsLayerInner {...props} />
    </ToastProvider>
  )
}

function PageReportsLayerInner({
  menu, dialog, closeMenu, closeDialog, openErrorFromMenu, openPageMessage, fieldFor, focusField,
  bookPath, pageNumber, canReportErrors, online, columnNames = {}, applyColumnText, flushSave,
  scanCropFor = null, submit = postPageReport
}) {
  const toast = useToast()

  // עריכה בשדה — באותו מסלול כמו שאר העריכות בעורך: צעד ביטול אחד, ובתצוגה המעוצבת replaceRange
  const editField = (el, column, compute) => applyFieldEdit(el, compute, (text) => applyColumnText(column, text))

  const copy = async (m, cut) => {
    const text = m.value.slice(m.start, m.end)
    if (!text) return
    let ok = false
    try {
      await navigator.clipboard.writeText(text)
      ok = true
    } catch {
      // בלי הרשאה ללוח — דרך הדפדפן (אירוע copy/cut של השדה; בתצוגה המעוצבת הבקר מטפל בו)
      const el = focusField(m.column, m.start, m.end)
      try { ok = !!el && document.execCommand(cut ? 'cut' : 'copy') } catch { ok = false }
      if (!ok) toast.show({ message: cut ? CUT_FALLBACK_MESSAGE : COPY_FALLBACK_MESSAGE, tone: 'info' })
      return
    }
    if (ok && cut) {
      const el = fieldFor(m.column)
      if (!el || el.value !== m.value) return
      editField(el, m.column, (v) => ({ value: v.slice(0, m.start) + v.slice(m.end), start: m.start, end: m.start }))
    }
  }

  const paste = async (m) => {
    let text
    try {
      text = await navigator.clipboard.readText()
    } catch {
      toast.show({ message: PASTE_FALLBACK_MESSAGE, tone: 'info' })
      return
    }
    if (!text) return
    const el = fieldFor(m.column)
    if (!el) return
    el.focus({ preventScroll: true })
    // הטקסט השתנה בזמן ההמתנה ללוח (למשל אישור הרשאה) — לבחירה הנוכחית
    const same = el.value === m.value
    editField(el, m.column, (v, s, e) => {
      const a = same ? m.start : s
      const b = same ? m.end : e
      return { value: v.slice(0, a) + text + v.slice(b), start: a + text.length, end: a + text.length }
    })
  }

  const runMenuItem = (id) => {
    if (!menu) return
    const m = menu
    if (id === 'reportError') openErrorFromMenu(m)
    else if (id === 'pageMessage') openPageMessage()
    else if (id === 'copy') copy(m, false)
    else if (id === 'cut') copy(m, true)
    else if (id === 'paste') paste(m)
  }

  const submitError = async ({ original, proposed, note }) => {
    if (dialog?.kind !== 'error') return null
    const { column, start, end, text } = dialog
    const el = fieldFor(column)
    if (!el) return 'שדה הטקסט לא נמצא. סגרו את החלון ונסו שוב.'
    const value = el.value
    // גם מה שלפני הבחירה — אחרת אותו טקסט במופע אחר (שהוזז) היה מסומן, וה-offset שגוי
    if (value.slice(start, end) !== text || value.slice(0, start) !== dialog.value.slice(0, start)) return 'הטקסט בעורך השתנה מאז שסימנתם. סגרו את החלון וסמנו שוב.'
    // האזור בצילום — תוספת בלבד: כל תקלה בחישוב → בלי אזור, והדיווח נשלח כרגיל
    let cropRect = null
    try { cropRect = scanCropFor ? scanCropFor(column, value, start, end) : null } catch { cropRect = null }
    const built = buildErrorSubmission({ bookPath, pageNumber, column, value, start, end, original, proposed, note, cropRect })
    if (!built.ok) return built.error
    try {
      await submit(built.body)
    } catch (err) {
      return err?.message || 'שליחת הדיווח נכשלה.'
    }
    // הדיווח נשמר — רק עכשיו משנים את הטקסט
    const current = fieldFor(column)
    if (!current || current.value !== value) {
      closeDialog()
      toast.show({ message: `הדיווח נשלח, אבל הטקסט בעורך השתנה בינתיים ולכן הסימון לא נוסף. אפשר להוסיף אותו ידנית: ${built.marker}`, tone: 'info', duration: null })
      return null
    }
    editField(current, column, () => ({ value: built.newValue, start: built.caret, end: built.caret }))
    flushSave()
    closeDialog()
    toast.show({ message: 'הדיווח נשלח למנהלים, והסימון נוסף לטקסט', tone: 'success' })
    return null
  }

  const submitMessage = async (message) => {
    const built = buildMessageSubmission({ bookPath, pageNumber, message })
    if (!built.ok) return built.error
    try {
      await submit(built.body)
    } catch (err) {
      return err?.message || 'שליחת ההודעה נכשלה.'
    }
    closeDialog()
    toast.show({ message: 'ההודעה נשלחה למנהלים', tone: 'success' })
    return null
  }

  const menuItems = menu
    ? editorMenuModel({ hasSelection: menu.start !== menu.end, canReport: canReportErrors, online }).map((item) => (
      'separator' in item ? item : { ...item, onSelect: () => runMenuItem(item.id) }
    ))
    : []

  const columnLabel = dialog?.kind === 'error' && dialog.column !== 'content' ? columnNames[dialog.column] || null : null

  return (
    <>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems}
          onClose={closeMenu}
          label="פעולות על הטקסט"
          footer={BROWSER_MENU_HINT}
        />
      )}

      {dialog?.kind === 'error' && (
        <ErrorReportDialog
          initialText={dialog.text}
          columnLabel={columnLabel}
          onSubmit={submitError}
          onClose={closeDialog}
        />
      )}

      {dialog?.kind === 'message' && (
        <PageMessageDialog pageNumber={pageNumber} onSubmit={submitMessage} onClose={closeDialog}>
          <MyPageReports bookPath={bookPath} pageNumber={pageNumber} />
        </PageMessageDialog>
      )}
    </>
  )
}
