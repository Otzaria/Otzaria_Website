'use client'

import Button from '@/components/ui/Button'
import Tooltip from '@/components/ui/Tooltip'
import { cx } from '@/components/ui/cx'
import { FOCUS_RING } from '@/components/ui/focusRing'
import Badge from '@/components/ui/Badge'
import SaveStatusIndicator from './SaveStatusIndicator'
import { DISPLAY_SHEET_ID } from './DisplaySettingsSheet'
import { claimStatusText } from './pageClaim'
import { withShortcut } from '@/lib/shortcuts'
import { shortcutKeys, toAriaKeys } from './editorShellLogic'

/**
 * הכותרת של העורך החדש (--editor-topbar-height: 56px). מחליפה את EditorHeader.jsx.
 * סגנון "אוורירי וקל": שטוחה, מרווחת, בלי הדגשות — כפתורי האייקון Button size="tool" (38px בעכבר,
 * 44px במגע; אייקון דק) עם רמז קומפקטי, והפעולה הראשית (תפוס/סיים עמוד) — filled באותו גובה
 * (size="tool", משקל medium). קיצורי המקלדת ברמזים וב-aria-keyshortcuts — מ-shortcuts
 * (קיצורי המשתמש), לא קבועים בקוד.
 *
 * בצד ההתחלה (ימין): חזרה לספר, שם הספר (OT Vilna, משקל 400 בלבד) ו"עמוד X מתוך Y" (תווית
 * בלבד — אין מעבר לעמוד קודם/הבא מתוך העורך). בצד הסוף: מצב השמירה, פקודות (Ctrl+K), תצוגה, הנחיות, חשבון (accountSlot)
 * וכפעולה ראשית אחת לפי מצב התפיסה (claimState, ראו pageClaim.js):
 *   available — "תפוס עמוד" (filled); mine — "סיים עמוד" (filled, Ctrl+Enter);
 *   other / completed — סטטוס בלבד ("בטיפול של…" / "הושלם"), בלי סיום; unknown — כלום.
 *
 * @param {{
 *   bookTitle: string, bookHref: string, onBack?: () => void, pageNumber: number, totalPages?: number,
 *   saveStatus: 'saved'|'saving'|'dirty'|'error', lastSavedAt?: Date|number|string|null, onRetrySave?: () => void,
 *   onOpenCommands: () => void, onOpenDisplay: () => void, onOpenGuidelines?: () => void,
 *   onFinish: () => void, finishDisabled?: boolean, accountSlot?: import('react').ReactNode,
 *   claimState?: 'available'|'mine'|'other'|'completed'|'unknown', holderName?: string|null, onClaim?: () => void,
 *   displayOpen?: boolean, titleAs?: 'h1'|'h2', className?: string, mobileCompact?: boolean,
 *   shortcuts?: Record<string, string>
 * }} props
 * onBack — אם ניתן, לחיצה רגילה על "חזרה לספר" קוראת לו במקום לנווט מיד (העורך שומר קודם את מה
 * שממתין ומנווט בעצמו). לחיצה עם Ctrl/Cmd/Shift/אמצעית (לשונית חדשה) נשארת קישור רגיל.
 * mobileCompact — במסך צר (מתחת ל-md) מסתירים את ההנחיות, החשבון והפעולה הראשית:
 * הם זמינים בחלון הפקודות ובסרגל התחתון של הנייד (MobileActionBar).
 */
export default function EditorTopBar({
  bookTitle,
  bookHref,
  onBack,
  pageNumber,
  totalPages,
  saveStatus,
  lastSavedAt,
  onRetrySave,
  onOpenCommands,
  onOpenDisplay,
  onOpenGuidelines,
  onFinish,
  finishDisabled = false,
  claimState = 'mine',
  holderName = null,
  onClaim,
  accountSlot,
  displayOpen,
  titleAs: Title = 'h1',
  className,
  mobileCompact = false,
  shortcuts = {}
}) {
  const hideOnMobile = mobileCompact ? 'max-md:hidden' : undefined
  const ariaKeys = (actionId) => toAriaKeys(shortcutKeys(shortcuts[actionId]))

  return (
    <header
      aria-label="כותרת העורך"
      className={cx('flex min-h-(--editor-topbar-height) items-center gap-2 border-b border-outline-subtle bg-surface px-2 sm:gap-3 sm:px-4', className)}
    >
      <Tooltip content="חזרה לספר" compact>
        {/* arrow_forward מצביע ימינה — "אחורה" ב-RTL; הגליף ב-direction: ltr ולא מתהפך */}
        <Button
          href={bookHref}
          onClick={onBack ? (e) => {
            if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
            e.preventDefault()
            onBack()
          } : undefined}
          variant="text"
          size="tool"
          iconOnly
          icon="arrow_forward"
          aria-label={`חזרה לספר ${bookTitle}`}
        />
      </Tooltip>

      <div className="flex min-w-0 items-center gap-2.5">
        {/* OT Vilna — משקל 400 בלבד (font-normal דורס את ה-700 של title-lg) */}
        <Title className="truncate font-display text-title-lg font-normal text-on-surface">{bookTitle}</Title>
        <span aria-hidden="true" className="hidden text-on-surface-variant sm:inline">‹</span>
        <span className="hidden whitespace-nowrap text-body-sm text-on-surface-variant sm:inline">
          עמוד <span className="text-on-surface tabular-nums">{pageNumber}</span>
          {totalPages != null && <> מתוך <span className="tabular-nums">{totalPages}</span></>}
        </span>
        {/* בנייד — רק מספר העמוד (בלי "מתוך"), כדי שיישאר מקום לשם הספר */}
        <span className="shrink-0 whitespace-nowrap rounded-(--radius-pill) bg-surface-container px-2 text-label-md text-on-surface-variant sm:hidden">
          עמ׳ <span className="text-on-surface tabular-nums">{pageNumber}</span>
        </span>
      </div>

      <span className="flex-1" />

      {/* בנייד — רק האייקון; הטקסט נשאר לקורא המסך */}
      <SaveStatusIndicator status={saveStatus} lastSavedAt={lastSavedAt} onRetry={onRetrySave} className="shrink-0" textClassName="max-md:sr-only" />

      <div className="flex items-center gap-1">
        <Tooltip content={withShortcut('פקודות וכלים', shortcuts, 'commandPalette')} compact>
          <Button variant="text" size="tool" iconOnly icon="keyboard" aria-label="פקודות וכלים" aria-keyshortcuts={ariaKeys('commandPalette')} onClick={onOpenCommands} />
        </Tooltip>
        <Tooltip content="תצוגה ונוחות עיניים" compact>
          <Button
            variant="text"
            size="tool"
            iconOnly
            icon="format_size"
            aria-label="תצוגה ונוחות עיניים"
            aria-expanded={displayOpen === undefined ? undefined : displayOpen}
            aria-controls={displayOpen ? DISPLAY_SHEET_ID : undefined}
            onClick={onOpenDisplay}
          />
        </Tooltip>
        {onOpenGuidelines && (
          <span className={cx('inline-flex', hideOnMobile)}>
            <Tooltip content="הנחיות לספר" compact>
              <Button variant="text" size="tool" iconOnly icon="help_outline" aria-label="הנחיות לספר" onClick={onOpenGuidelines} />
            </Tooltip>
          </span>
        )}
      </div>

      {accountSlot && <span className={cx('inline-flex', hideOnMobile)}>{accountSlot}</span>}

      <PrimaryAction
        claimState={claimState}
        holderName={holderName}
        onClaim={onClaim}
        onFinish={onFinish}
        finishDisabled={finishDisabled}
        finishTip={withShortcut('סיום העמוד', shortcuts, 'finish')}
        finishKeys={ariaKeys('finish')}
        className={hideOnMobile}
      />
    </header>
  )
}

/** הפעולה הראשית של הכותרת לפי מצב התפיסה: תפוס / סיים / סטטוס */
function PrimaryAction({ claimState, holderName, onClaim, onFinish, finishDisabled, finishTip, finishKeys, className }) {
  if (claimState === 'available') {
    return (
      <span className={cx('inline-flex', className)}>
        <Tooltip content="העמוד יסומן 'בטיפול' ויוצמד אליך" compact>
          <Button variant="filled" size="tool" icon="lock" onClick={onClaim} disabled={!onClaim} className="whitespace-nowrap">
            תפוס עמוד
          </Button>
        </Tooltip>
      </span>
    )
  }
  if (claimState === 'mine') {
    return (
      <span className={cx('inline-flex', className)}>
        <Tooltip content={finishTip} compact>
          <Button variant="filled" size="tool" icon="check" onClick={onFinish} disabled={finishDisabled} aria-keyshortcuts={finishKeys} className="whitespace-nowrap">
            סיים עמוד
          </Button>
        </Tooltip>
      </span>
    )
  }
  if (claimState === 'other' || claimState === 'completed') {
    const text = claimStatusText({ state: claimState, holderName })
    // השם המלא ברמז (ריחוף/פוקוס) — התג עצמו נחתך בכותרת צרה. shrink-0: שם הספר נחתך לפניו.
    return (
      <span className={cx('inline-flex min-w-0 shrink-0', className)}>
        <Tooltip content={text} compact>
          <span tabIndex={0} className={cx('inline-flex min-w-0 rounded-(--radius-pill)', FOCUS_RING)}>
            <Badge tone={claimState === 'completed' ? 'success' : 'warning'} icon={claimState === 'completed' ? 'task_alt' : 'lock_person'} className="min-w-0 max-w-[min(20rem,40vw)]">
              <span className="truncate">{text}</span>
            </Badge>
          </span>
        </Tooltip>
      </span>
    )
  }
  return null
}
