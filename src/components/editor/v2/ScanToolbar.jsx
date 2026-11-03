'use client'

import Tooltip from '@/components/ui/Tooltip'
import { cx } from '@/components/ui/cx'
import { TOUCH_TARGET_OVERLAY } from '@/components/ui/buttonStyles'
import { FOCUS_RING } from '@/components/ui/focusRing'
import { withShortcut } from '@/lib/shortcuts'
import { shortcutKeys } from './editorShellLogic'
import PaneToolbar from './PaneToolbar'

/**
 * שורת הכלים של פאנל הצילום, בקבוצות: זום − / אחוז / + · התאמה לרוחב ·
 * הורדת הצילום · "עוד" (חלון הפקודות).
 * כשאין מקום — הקבוצות הפחות חשובות עוברות לתפריט "עוד" (PaneToolbar, לפי priority).
 *
 * @param {{
 *   zoom: number, onZoomIn: () => void, onZoomOut: () => void, onZoomReset: () => void, onFit: () => void,
 *   onDownload?: () => void,
 *   onMore?: () => void, hasImage?: boolean, shortcuts?: Record<string, string>
 * }} props
 */
export default function ScanToolbar({
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onFit,
  onDownload,
  onMore,
  hasImage = true,
  shortcuts = {}
}) {
  const tip = (base, actionId) => withShortcut(base, shortcuts, actionId)
  const keys = (actionId) => shortcutKeys(shortcuts[actionId])

  const groups = [
    {
      id: 'zoom',
      priority: 1,
      items: [
        { id: 'zoomOut', icon: 'remove', label: 'הקטנת הצילום', tip: tip('הקטנת הצילום', 'zoomOut'), shortcut: keys('zoomOut'), onClick: onZoomOut },
        {
          id: 'zoomReset',
          icon: 'zoom_in',
          label: `זום ${zoom}% — חזרה ל-100%`,
          onClick: onZoomReset,
          render: () => (
            <Tooltip content="חזרה ל-100%" compact>
              <button
                type="button"
                onClick={onZoomReset}
                aria-label={`זום ${zoom}%. חזרה ל-100%`}
                className={cx('min-h-(--button-height-tool) min-w-12 rounded-(--button-radius-tool) px-1.5 text-body-md text-(--tool-fg) tabular-nums hover:bg-(--tool-bg-hover)', TOUCH_TARGET_OVERLAY, FOCUS_RING)}
              >
                {zoom}%
              </button>
            </Tooltip>
          )
        },
        { id: 'zoomIn', icon: 'add', label: 'הגדלת הצילום', tip: tip('הגדלת הצילום', 'zoomIn'), shortcut: keys('zoomIn'), onClick: onZoomIn }
      ]
    },
    {
      id: 'view',
      priority: 3,
      items: [
        { id: 'fit', icon: 'fit_page_width', label: 'התאמה לרוחב', onClick: onFit, disabled: !hasImage },
      ]
    },
    {
      id: 'file',
      priority: 5,
      items: [
        { id: 'download', icon: 'download', label: 'הורדת הצילום למחשב', onClick: onDownload, disabled: !hasImage, hidden: !onDownload }
      ]
    }
  ]

  return (
    <PaneToolbar
      label="צילום"
      groups={groups}
      onAllCommands={onMore}
      allCommandsShortcut={keys('commandPalette')}
    />
  )
}
