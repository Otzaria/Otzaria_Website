'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'
import Checkbox from '@/components/ui/Checkbox'
import MenuButton from '@/components/ui/MenuButton'
import SelectMenu from '@/components/ui/SelectMenu'
import { cx } from '@/components/ui/cx'
import { groupBookStatus, orderGroupItems } from '@/lib/adminUploads/uploadGroups'
import { filesCountText } from '@/lib/adminUploads/uploadTerms'
import PrimaryActionButton from './PrimaryActionButton'
import UploadItemRow from './UploadItemRow'
import UploadMeta from './UploadMeta'
import UploadMetadata, { uploadMetadataItems } from './UploadMetadata'
import { groupMenuItems, primaryAction } from './uploadRowActions'
import {
  AREA_BOOK, AREA_CHECK, AREA_CONTROLS, AREA_MENU, AREA_PRIMARY, AREA_STATUS, ITEMS_STEP, ROW_GRID, ROW_PADDING, TRASH_ROW_GRID,
} from './uploadRowLayout'

/**
 * שורת ספר ברשימה: תיבת בחירה, שם הספר ופרטים (ממי, מתי, כמה), מצב הספר, פעולה ראשית אחת ו-⋮.
 * ספר עם כמה קבצים (או ספר שלם עם פרטים) נפתח בכפתור שבשורת הפרטים ("91 עמודים ▾"), ומציג את
 * הקבצים שבו — כל אחד עם בחירה, "הורד" ו-⋮ משלו, לפי סדר העמודים. לחיצה על השם פותחת גם היא
 * (נוחות לעכבר; למקלדת ולקורא המסך — הכפתור, עם aria-expanded).
 *
 * אין חץ לפני השם: תיבת הבחירה ומיד אחריה השם, באותו קו בדיוק בכל השורות.
 * מצב הספר — תג שקט ברוחב התוכן (SelectMenu variant="tag"), שנפתח לבורר; לא הדבר הבולט בשורה.
 *
 * variant — uploads / trash (באשפה: בלי מצב; הפעולה הראשית "שחזר", וב-⋮ "מחק לצמיתות").
 * הבחירה לפי מזהי העלאות: תיבת הספר בוחרת את כל הקבצים הגלויים בו (וחלקית — "מעורב").
 * busy — יש בקשה פתוחה על העלאה בספר: הפקדים של הספר מושבתים (בלי בקשה כפולה ובלי מירוץ במצב).
 *
 * @param {{ group: any, variant: 'uploads' | 'trash', selected: Set<string>, onSelect: (ids: string[], checked: boolean) => void,
 *   expanded: boolean, onToggleExpand: (key: string) => void, statusOptions: { value: string, label: string, color: string }[],
 *   permissions: { batchDownload: boolean, message: boolean }, actions: any, pending: Set<string>, sort?: string }} props
 */
export default function UploadGroupRow({ group, variant, selected, onSelect, expanded, onToggleExpand, statusOptions, permissions, actions, pending, sort }) {
  const [shown, setShown] = useState(ITEMS_STEP)
  const { visible } = group
  const ids = visible.map((u) => u.id)
  const selectedCount = ids.filter((id) => selected.has(id)).length
  const metadata = visible.length === 1 ? uploadMetadataItems(visible[0]) : []
  const expandable = visible.length > 1 || metadata.length > 0
  const panelId = `upload-group-${group.key.replace(/[^\p{L}\p{N}]+/gu, '-')}`
  const status = groupBookStatus(group.uploads)
  const busy = group.uploads.some((u) => pending.has(u.id))
  const primary = primaryAction({ group, variant, permissions, actions, onExpand: () => onToggleExpand(group.key) })
  const menuItems = groupMenuItems({ group, variant, permissions, actions })
  const grid = variant === 'trash' ? TRASH_ROW_GRID : ROW_GRID
  const partial = visible.length < group.uploads.length
  const items = expanded ? orderGroupItems(visible) : []

  return (
    <li data-row={group.key} className={cx('transition-colors', selectedCount > 0 && 'bg-surface-selected')}>
      <div className={cx(grid, ROW_PADDING)}>
        <div className={AREA_CHECK}>
          <Checkbox
            data-row-focus=""
            label={visible.length > 1 ? `בחר את ${group.title} (${filesCountText(visible.length)})` : `בחר את ${group.title}`}
            checked={selectedCount > 0 && selectedCount === ids.length}
            indeterminate={selectedCount > 0 && selectedCount < ids.length}
            onChange={(checked) => onSelect(ids, checked)}
          />
        </div>

        <div className={AREA_BOOK}>
          <h3 className="text-title-sm text-on-surface">
            {/* לחיצה על השם פותחת (עכבר); הפקד הנגיש — הכפתור שבשורת הפרטים */}
            <span
              className={cx('break-words', expandable && 'cursor-pointer hover:text-primary')}
              onClick={expandable ? () => onToggleExpand(group.key) : undefined}
            >
              {group.title}
            </span>
          </h3>
          <UploadMeta
            group={group}
            variant={variant}
            sort={sort}
            toggle={expandable ? { expanded, controls: panelId, onToggle: () => onToggleExpand(group.key) } : undefined}
          />
        </div>

        <div className={AREA_CONTROLS}>
          {variant === 'uploads' && (
            <div className={AREA_STATUS}>
              <SelectMenu
                variant="tag"
                hideLabel
                label={partial ? `מצב הספר ${group.title} (חל על כל ${filesCountText(group.uploads.length)} שבספר)` : `מצב הספר ${group.title}`}
                title={partial ? `מצב הספר — לכל ${filesCountText(group.uploads.length)}` : 'מצב הספר'}
                options={statusOptions}
                value={status}
                placeholder="מצבים שונים"
                searchable={false}
                disabled={busy}
                onChange={(value) => actions.setStatus(group.uploads, value)}
                className="max-w-full"
              />
            </div>
          )}
          <div className={AREA_PRIMARY}>
            <PrimaryActionButton action={primary} disabled={busy} />
          </div>
        </div>

        <div className={AREA_MENU}>
          {menuItems.length > 0 && <MenuButton label={`פעולות נוספות: ${group.title}`} items={busy ? menuItems.map((i) => (i.separator ? i : { ...i, disabled: true })) : menuItems} />}
        </div>
      </div>

      {expandable && expanded && (
        <div id={panelId} className="border-t border-outline-variant bg-surface-container-low pb-1">
          {metadata.length > 0 && (
            <div className="px-4 py-3 sm:ps-[calc(var(--touch-target)+0.5rem+1.75rem+0.5rem)]">
              <UploadMetadata upload={visible[0]} />
            </div>
          )}
          {visible.length > 1 && (
            <>
              <ul aria-label={`הקבצים של ${group.title}`} className="divide-y divide-outline-variant/60">
                {items.slice(0, shown).map((upload) => (
                  <UploadItemRow
                    key={upload.id}
                    upload={upload}
                    group={group}
                    variant={variant}
                    selected={selected.has(upload.id)}
                    onSelect={onSelect}
                    showStatus={variant === 'uploads' && status === null}
                    statusOptions={statusOptions}
                    permissions={permissions}
                    actions={actions}
                    busy={pending.has(upload.id)}
                  />
                ))}
              </ul>
              {visible.length > shown && (
                <div className="px-2 py-2 ps-[calc(var(--touch-target)+0.5rem)]">
                  <Button variant="text" size="sm" icon="expand_more" onClick={() => setShown((n) => n + ITEMS_STEP)}>
                    הצג עוד {Math.min(ITEMS_STEP, visible.length - shown).toLocaleString('he-IL')} (מתוך {visible.length.toLocaleString('he-IL')})
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </li>
  )
}
