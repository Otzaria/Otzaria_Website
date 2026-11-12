'use client'

import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Badge from '@/components/ui/Badge'
import Card from '@/components/ui/Card'
import Checkbox from '@/components/ui/Checkbox'
import MenuButton from '@/components/ui/MenuButton'
import Notice from '@/components/ui/Notice'
import Button from '@/components/ui/Button'
import { cx } from '@/components/ui/cx'
import RelativeTime from '@/components/ui/RelativeTime'
import DiffPreview from '@/components/library/DiffPreview'
import { EDIT_TYPE_LABELS } from '@/lib/dicta/edit-constants'
import { KIND_LABELS, isFindReplace, openInBookHref, partiallyHandled, pendingParts, suggestionBookName } from '@/lib/adminSuggestions/suggestionsQuery'
import { partsSummary } from '@/lib/adminSuggestions/suggestionTerms'
import FindReplaceLine from './FindReplaceLine'
import SuggestionActions from './SuggestionActions'
import { cardDomId } from './useSuggestionActions'

/**
 * כרטיס הצעה: בחירה, שם הספר ותגי הסוג, מי הציע ומתי, הערת המציע, ההבדלים, ולמטה — שורת פעולות אחת
 * (SuggestionActions): "אשר" / "דחה", וכשמסומנים חלקים — "אשר 2 חלקים" / "דחה 2 חלקים" במקומם.
 * ⋮: פתח בספר, (בחיפוש והחלפה) אשר את כל ההחלפות הזהות, ואחרון, באדום — חסום מעריכה.
 * אישור שלא הצליח כי הטקסט בספר השתנה — הודעה בתוך הכרטיס, עם "פתח בספר" גלוי.
 * rejecting — "דחה" נלחץ והבקשה עוד לא יצאה: הכרטיס מתעמעם, ובשורת הפעולות "בטל".
 * locked — פעולה מרובה באמצע, או שהמסך ננעל: הכפתורים מושבתים (aria-disabled — הפוקוס לא נופל).
 *
 * @param {{ edit: any, selected: boolean, onSelect: (ids: string[], checked: boolean) => void, busy: boolean, rejecting: boolean,
 *   locked: boolean, notice?: { title: string, body: string } | null, actions: any, onBlock: (edit: any) => void }} props
 */
function SuggestionCard({ edit, selected, onSelect, busy, rejecting, locked, notice, actions, onBlock }) {
  const router = useRouter()
  const cardRef = useRef(null)
  const [parts, setParts] = useState(() => new Set())
  const name = suggestionBookName(edit)
  const pending = pendingParts(edit)
  const many = pending > 1 || partiallyHandled(edit)
  const changes = edit.changes || []
  const titleId = `${cardDomId(edit._id)}-title`
  const findReplace = isFindReplace(edit)
  const inactive = busy || locked || rejecting

  // "דחה" מחליף את שורת הפעולות ב"בטל" (ולהפך) — הפוקוס עובר לכפתור החדש, לא לתחילת הדף. רק כשהפוקוס היה
  // בכרטיס (או אבד) — לא גוזלים אותו ממקום אחר.
  const [focusRequest, setFocusRequest] = useState(null)
  useEffect(() => {
    if (!focusRequest) return
    cardRef.current?.querySelector(focusRequest.selector)?.focus()
  }, [focusRequest])
  const keepFocus = (selector) => {
    const active = document.activeElement
    if (!active || active === document.body || cardRef.current?.contains(active)) setFocusRequest({ selector })
  }

  const togglePart = useCallback((idx) => setParts((prev) => {
    const next = new Set(prev)
    if (next.has(idx)) next.delete(idx)
    else next.add(idx)
    return next
  }), [])

  const runParts = async (kind) => {
    if (await actions.decideParts(edit, kind, [...parts])) setParts(new Set())
  }

  const menuItems = [
    { id: 'open', icon: 'menu_book', label: 'פתח בספר', onSelect: () => router.push(openInBookHref(edit)) },
    ...(findReplace ? [{ id: 'pattern', icon: 'done_all', label: 'אשר את כל ההחלפות הזהות', disabled: inactive, onSelect: () => actions.approveSamePattern(edit) }] : []),
    ...(edit.author ? [
      { separator: true, id: 'sep' },
      { id: 'block', icon: 'block', label: `חסום את ${edit.authorName || 'המציע'} מעריכה`, danger: true, onSelect: () => onBlock(edit) },
    ] : []),
  ]

  return (
    <Card
      as="li"
      ref={cardRef}
      id={cardDomId(edit._id)}
      data-suggestion-card=""
      tabIndex={-1}
      aria-labelledby={titleId}
      className="flex min-w-0 flex-col gap-3 p-3 outline-none focus-visible:outline-2 focus-visible:outline-primary sm:p-4"
    >
      <div className={cx('flex flex-col gap-3 transition-opacity', rejecting && 'opacity-50')}>
        <div className="flex items-start gap-1">
          <Checkbox
            label={`בחר את ההצעה ל${name}`}
            checked={selected}
            disabled={locked || rejecting}
            onChange={(checked) => onSelect([edit._id], checked)}
            className="-ms-1.5 -mt-1.5 sm:-ms-2"
          />
          <div className="min-w-0 flex-1">
            <h3 id={titleId} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-title-md text-on-surface">
              <span className="min-w-0 max-w-full [overflow-wrap:anywhere]">{name}</span>
              <Badge tone={edit.kind === 'find-replace' ? 'primary' : 'neutral'}>{KIND_LABELS[edit.kind] || KIND_LABELS.manual}</Badge>
              {edit.editType && <Badge tone="neutral">{EDIT_TYPE_LABELS[edit.editType] || edit.editType}</Badge>}
            </h3>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1 text-body-sm text-on-surface-variant">
              <bdi className="min-w-0 max-w-full [overflow-wrap:anywhere]">{edit.authorName || 'משתמש לא ידוע'}</bdi>
              {edit.createdAt && <><span aria-hidden="true">·</span><RelativeTime date={edit.createdAt} prefix="הציע" /></>}
              <span aria-hidden="true">·</span>
              <span>{partsSummary(edit, pending)}</span>
            </p>
            {edit.note && <p className="mt-1 text-body-sm text-on-surface [overflow-wrap:anywhere]"><span className="text-on-surface-variant">הערה: </span>{edit.note}</p>}
          </div>
          <MenuButton label={`פעולות נוספות: ההצעה ל${name}`} items={menuItems} />
        </div>

        {findReplace && <FindReplaceLine findReplace={edit.findReplace} />}

        {pending > 1 && !rejecting && <p className="text-body-sm text-on-surface-variant">אפשר לסמן חלקים כדי לאשר או לדחות רק אותם.</p>}
        {changes.length > 0 && (
          <DiffPreview
            changes={changes}
            total={edit.changeCount}
            selectable={changes.length > 1}
            selected={parts}
            onToggle={togglePart}
            partLabel={(idx) => `חלק ${idx + 1} בהצעה ל${name}`}
            disabled={inactive}
          />
        )}
      </div>

      {notice && (
        <Notice
          title={notice.title}
          action={<Button href={openInBookHref(edit)} variant="outlined" size="sm" icon="menu_book" className="bg-surface">פתח בספר</Button>}
        >
          {notice.body}
        </Notice>
      )}

      <SuggestionActions
        name={name}
        many={many}
        empty={changes.length === 0}
        parts={parts.size}
        rejecting={rejecting}
        disabled={busy || locked}
        onApprove={() => actions.decide(edit, 'approve')}
        onReject={() => { keepFocus('[data-cancel-reject]'); actions.decide(edit, 'reject') }}
        onCancelReject={() => { keepFocus('[data-reject]'); actions.cancelReject(edit) }}
        onParts={runParts}
        onClearParts={() => setParts(new Set())}
      />
    </Card>
  )
}

export default memo(SuggestionCard)
