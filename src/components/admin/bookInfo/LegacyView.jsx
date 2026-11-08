'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Button from '@/components/ui/Button'
import Checkbox from '@/components/ui/Checkbox'
import EmptyState from '@/components/ui/EmptyState'
import Notice from '@/components/ui/Notice'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import BulkActionBar, { ACTION_BUTTON, ACTION_TEXT } from '@/components/admin/list/BulkActionBar'
import BulkProgress from '@/components/admin/list/BulkProgress'
import { loginHref } from '@/components/admin/list/adminRequest'
import { useBulkLeaveGuard } from '@/components/admin/list/useBulkLeaveGuard'
import { checkedFields, toggleField, toggleRows } from '@/lib/adminBookInfoScreen/bookInfoQuery'
import { LEGACY_DESCRIPTION, publishProgressText, suggestionsCountText } from '@/lib/adminBookInfoScreen/bookInfoTerms'
import LegacyCard from './LegacyCard'
import { useLegacyActions } from './useLegacyActions'

const SELECT_ALL_ID = 'legacy-select-all'

/**
 * "הצעות ישנות" — הצעות מלפני שכל שינוי נפתח כבקשת מיזוג (BookInfoPendingChange). כרטיס לכל הצעה, ובו השדות.
 * בהתחלה שום שדה לא מסומן (כמו במסך הקודם): "בחר" בכרטיס מסמן את כל השדות שלו, והצעה "נבחרה" כשיש בה שדה מסומן.
 * פעולה מרובה ("פתח בקשות מיזוג" / "מחק") — על השדות המסומנים, בכל ההצעות שנבחרו (חוץ ממה שכבר באוויר).
 * הנתונים — מהמסך (data), כי הוא צריך את המספר ללשונית; onStateChange — כמה טופלו והאם פעולה מרובה באמצע.
 *
 * @param {{ data: { items: any[], setItems: Function, refresh: () => Promise<boolean> }, toast: any,
 *   refreshSignal: number, onRefreshed: (ok: boolean) => void, onStateChange?: (state: { done: number, running: boolean }) => void }} props
 */
export default function LegacyView({ data, toast, refreshSignal, onRefreshed, onStateChange }) {
  const [confirm, confirmElement] = useConfirm()
  const rows = data.items
  const [selection, setSelection] = useState({})
  const fieldsFor = useCallback((row) => checkedFields(selection, row), [selection])
  const clearFields = useCallback((id) => setSelection((s) => {
    if (!(id in s)) return s
    const next = { ...s }
    delete next[id]
    return next
  }), [])

  const { actions, busy, errors, published, done, deleting, progress, stopping, stopBulk, locked, clear } = useLegacyActions({
    data, fieldsFor, clearFields, toast, confirm,
  })
  const running = progress !== null
  // פרסום מרובה באמצע: יציאה מהלשונית / מהמסך (קישור, "אחורה") שואלת, ו"עצור וצא" עוצר אותו. מחיקה שממתינה
  // ל"בטל" — רק אזהרת הדפדפן ברענון / סגירה
  useBulkLeaveGuard({
    running,
    pending: deleting.size > 0,
    stop: stopBulk,
    confirm,
    body: 'פתיחת בקשות המיזוג עוד רצה. מה שכבר נשלח נשאר; מה שעוד לא נשלח — לא יישלח.',
  })

  // למסך: כמה טופלו (המספר בלשונית יורד) והאם פעולה מרובה באמצע ("רענן" מושבת)
  useEffect(() => { onStateChange?.({ done: done.size, running }) }, [done.size, running, onStateChange])
  // יציאה מהלשונית: מה שטופל יוצא מהנתונים (אחרת היה חוזר ככרטיס פעיל), והמספר — לפי מה שנשאר
  const doneRef = useRef(done)
  useEffect(() => { doneRef.current = done }, [done])
  const { setItems } = data
  useEffect(() => () => {
    const gone = doneRef.current
    if (gone.size > 0) setItems((list) => list.filter((r) => !gone.has(r.id)))
    onStateChange?.({ done: 0, running: false })
  }, [setItems, onStateChange])

  // "רענן" במסך — הסימונים יורדים, והבחירה מתאפסת
  const seen = useRef(refreshSignal)
  const { refresh } = data
  useEffect(() => {
    if (seen.current === refreshSignal) return
    seen.current = refreshSignal
    refresh().then((ok) => {
      if (ok) {
        clear()
        setSelection({})
      }
      onRefreshed(ok)
    })
  }, [refreshSignal, refresh, clear, onRefreshed])

  // ----- בחירה: הצעות שאפשר לפעול עליהן (לא טופלו, לא ממתינות למחיקה, לא באוויר) -----
  const available = useMemo(() => rows.filter((r) => !done.has(r.id) && !deleting.has(r.id) && !busy.has(r.id)), [rows, done, deleting, busy])
  const chosen = available.filter((r) => fieldsFor(r).length > 0)
  const allChosen = available.length > 0 && available.every((r) => fieldsFor(r).length === r.changedFields.length)
  const selectRows = useCallback((ids, checked) => {
    if (running) return
    setSelection((s) => toggleRows(s, rows.filter((r) => ids.includes(r.id)), checked))
  }, [running, rows])
  const onToggleField = useCallback((id, field, checked) => {
    if (running) return
    const row = rows.find((r) => r.id === id)
    if (row) setSelection((s) => toggleField(s, row, field, checked))
  }, [running, rows])

  const [working, setWorking] = useState(false)
  const onBulk = async (kind) => {
    if (working || locked || chosen.length === 0) return
    setWorking(true)
    try {
      await (kind === 'publish' ? actions.bulkPublish(chosen) : actions.bulkDelete(chosen))
    } finally {
      setWorking(false)
    }
  }

  if (rows.length === 0) {
    return <EmptyState icon="task_alt" title="אין הצעות ישנות" description="כל ההצעות הישנות טופלו." />
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-body-md text-on-surface-variant">{LEGACY_DESCRIPTION}</p>

      {locked && (
        <Notice
          tone="error"
          role="alert"
          title={locked.sessionExpired ? 'פג תוקף ההתחברות' : 'אין לך הרשאה לפעולה הזו'}
          action={locked.sessionExpired ? <Button href={loginHref()} variant="filled" size="sm" icon="login">התחבר</Button> : undefined}
        >
          {locked.sessionExpired ? 'התחבר מחדש כדי להמשיך. מה שלא נשלח נשאר כאן.' : 'הפעולות על ההצעות הושבתו.'}
        </Notice>
      )}

      <BulkActionBar
        count={chosen.length}
        countText={chosen.length === 1 ? 'הצעה אחת נבחרה' : `${suggestionsCountText(chosen.length)} נבחרו`}
        label="פעולות על ההצעות שנבחרו"
        locked={running}
        selectAll={(
          <Checkbox
            id={SELECT_ALL_ID}
            label={allChosen ? 'בטל את הבחירה' : 'בחר את כל ההצעות'}
            checked={allChosen}
            indeterminate={chosen.length > 0 && !allChosen}
            disabled={available.length === 0 || running || Boolean(locked)}
            onChange={(checked) => selectRows(available.map((r) => r.id), checked)}
          />
        )}
        idle={<p className="flex-1 text-body-sm tabular-nums text-on-surface-variant">{suggestionsCountText(available.length)}</p>}
        actions={progress ? (
          <BulkProgress text={publishProgressText(progress)} value={progress.done} max={progress.total} onStop={stopBulk} stopping={stopping} focusStop />
        ) : (
          <>
            {/* הפעולה הראשית — עם מילה גם בטלפון; המחיקה והניקוי — אייקון */}
            <Button className={ACTION_BUTTON} variant="text" size="sm" icon="call_merge" softDisabled={working} onClick={() => onBulk('publish')} aria-label="פתח בקשות מיזוג מהשדות המסומנים">
              פתח בקשות
            </Button>
            <Button className={`${ACTION_BUTTON} text-error! hover:bg-error-container/60!`} variant="text" size="sm" icon="delete" softDisabled={working} onClick={() => onBulk('delete')} aria-label="מחק את השדות המסומנים בהצעות שנבחרו">
              <span className={ACTION_TEXT}>מחק</span>
            </Button>
          </>
        )}
        onClear={() => { if (!running) setSelection({}) }}
      />

      <ul aria-label="ההצעות הישנות" className="flex flex-col gap-3">
        {rows.map((row) => (
          <LegacyCard
            key={row.id}
            row={row}
            fields={fieldsFor(row)}
            onSelect={selectRows}
            onToggleField={onToggleField}
            quiet={chosen.length > 0}
            busy={busy.has(row.id)}
            locked={running || Boolean(locked)}
            deleting={deleting.has(row.id)}
            error={errors.get(row.id) || null}
            published={published.get(row.id) || []}
            done={done.get(row.id) || null}
            onPublish={actions.publish}
            onDelete={actions.remove}
            onCancelDelete={actions.cancelDelete}
          />
        ))}
      </ul>
      {confirmElement}
    </div>
  )
}
