'use client'

import MenuButton from '@/components/ui/MenuButton'
import { withShortcut } from '@/lib/shortcuts'
import { shortcutKeys, toAriaKeys } from './editorShellLogic'
import PaneToolbar from './PaneToolbar'
import TextViewToggle from './TextViewToggle'

/** אפשרויות היישור — אותן תוויות כמו בחלון הפקודות (editorCommands.js) */
export const ALIGN_OPTIONS = [
  { value: 'justify', actionId: 'alignJustify', label: 'יישור לשני הצדדים', icon: 'format_align_justify' },
  { value: 'right', actionId: 'alignRight', label: 'יישור לימין', icon: 'format_align_right' },
  { value: 'center', actionId: 'alignCenter', label: 'יישור למרכז', icon: 'format_align_center' },
  { value: 'left', actionId: 'alignLeft', label: 'יישור לשמאל', icon: 'format_align_left' }
]

const DEFAULT_FONT_RANGE = { min: 12, max: 40, step: 1 }

/**
 * שורת הכלים של פאנל הטקסט, בקבוצות (כל קבוצה בגלולה רכה — PaneToolbar):
 * ביטול/ביצוע מחדש · גודל הגופן (− / גודל / +, כמו הזום בצילום; מיד אחרי הביטול ותמיד גלוי — pinned) ·
 * הדגשה/נטוי/קו תחתון · כותרות H1–H3 · יישור (כפתור אחד שפותח תפריט בחירה; האייקון — היישור הנוכחי) ·
 * חיפוש והחלפה/בדיקת איות · הגדלה/הקטנה (big/small) · תמונה בטקסט/פיצול לטורים · "עוד" (חלון הפקודות).
 * תמיד גלויים (עד רוחב פאנל קטן מאוד): ביטול, עיצוב, כותרות, יישור וגודל הגופן; הנדירים (חיפוש,
 * big/small, תמונה ופיצול) עוברים ראשונים ל"עוד" (priority).
 * גודל הגופן והיישור — מאותה העדפה של העורך (prefs.fontSize / prefs.textAlign): מקור אמת אחד.
 * כשאין מקום — הקבוצות הפחות חשובות עוברות לתפריט "עוד" (PaneToolbar, לפי priority).
 * כפתורי העריכה לא מוציאים את הפוקוס מה-textarea (keepFocus).
 * ביטול/ביצוע מחדש אפורים (מושבתים) כשאין מה לבטל/לבצע — canUndo/canRedo (useUndoAvailability).
 * כפתורי העיצוב הם מתגים: "לחוץ" (aria-pressed) כשהסמן/הבחירה כבר בעיצוב הזה (activeFormats —
 * useActiveFormats), ולחיצה נוספת מסירה אותו (formatToggle.js). "נקה עיצוב" (onClearFormatting) —
 * קבוצה משלו אחרי העיצוב, ויוצא ל"עוד" ברוחב צר.
 * בסוף השורה — כפתור-מתג התצוגה (TextViewToggle, textView/onToggleTextView; "קוד" או "עיצוב" לפי היעד): תמיד גלוי (pinned),
 * כדי שמי שעבר לתצוגת הקוד ימצא את הדרך חזרה.
 *
 * @param {{
 *   onUndo: () => void, onRedo: () => void, canUndo?: boolean, canRedo?: boolean, onInsertTag: (tag: string) => void,
 *   textView?: 'rich'|'code', onToggleTextView?: () => void,
 *   onClearFormatting?: () => void, activeFormats?: Partial<Record<'b'|'i'|'u'|'big'|'small'|'h1'|'h2'|'h3', boolean>>,
 *   onFind: () => void, onSpellcheck?: () => void, onImageToText?: () => void,
 *   onSplit?: () => void, twoColumns?: boolean, onMore: () => void,
 *   fontSize?: number, onFontSizeChange?: (size: number) => void,
 *   fontSizeRange?: { min: number, max: number, step: number },
 *   textAlign?: 'justify'|'right'|'center'|'left', onTextAlignChange?: (align: string) => void,
 *   shortcuts?: Record<string, string>
 * }} props
 */
export default function TextToolbar({
  onUndo,
  onRedo,
  canUndo = true,
  canRedo = true,
  onInsertTag,
  onClearFormatting,
  activeFormats = {},
  textView = 'rich',
  onToggleTextView,
  onFind,
  onSpellcheck,
  onImageToText,
  onSplit,
  twoColumns = false,
  onMore,
  fontSize,
  onFontSizeChange,
  fontSizeRange = DEFAULT_FONT_RANGE,
  textAlign = 'justify',
  onTextAlignChange,
  shortcuts = {}
}) {
  const tip = (base, actionId) => withShortcut(base, shortcuts, actionId)
  const keys = (actionId) => shortcutKeys(shortcuts[actionId])
  const tag = (id, tagName, label, look) => ({
    id, label, tip: tip(label, id), shortcut: keys(id), keepFocus: true, onClick: () => onInsertTag(tagName),
    pressed: Boolean(activeFormats[tagName]), ...look
  })

  const { min, max, step } = fontSizeRange
  const hasFontSize = Boolean(onFontSizeChange) && Number.isFinite(fontSize)
  const setSize = (next) => onFontSizeChange?.(Math.min(max, Math.max(min, next)))
  const currentAlign = ALIGN_OPTIONS.find((o) => o.value === textAlign) ?? ALIGN_OPTIONS[0]
  const alignItems = ALIGN_OPTIONS.map((o) => ({
    id: o.actionId,
    label: o.label,
    icon: o.icon,
    shortcut: keys(o.actionId),
    radio: true,
    pressed: o.value === currentAlign.value,
    onSelect: () => onTextAlignChange?.(o.value)
  }))

  const groups = [
    {
      id: 'history',
      priority: 1,
      items: [
        { id: 'undo', icon: 'undo', mirror: true, label: 'ביטול', tip: 'ביטול (Ctrl+Z)', shortcut: ['Ctrl', 'Z'], keepFocus: true, onClick: onUndo, disabled: !canUndo },
        { id: 'redo', icon: 'redo', mirror: true, label: 'ביצוע מחדש', tip: 'ביצוע מחדש (Ctrl+Y)', shortcut: ['Ctrl', 'Y'], keepFocus: true, onClick: onRedo, disabled: !canRedo }
      ]
    },
    {
      id: 'fontSize',
      // גודל הגופן תמיד גלוי — לא יוצא לתפריט "עוד"
      pinned: true,
      items: [
        {
          id: 'textZoomOut', icon: 'remove', label: 'הקטנת גופן הטקסט', tip: tip('הקטנת גופן הטקסט', 'textZoomOut'),
          shortcut: keys('textZoomOut'), keepFocus: true, onClick: () => setSize(fontSize - step), disabled: fontSize <= min, hidden: !hasFontSize
        },
        {
          id: 'fontSizeValue',
          label: 'גודל הגופן',
          hidden: !hasFontSize,
          render: () => (
            <output className="min-w-7 text-center text-body-md text-on-surface-variant tabular-nums" aria-live="polite">
              <span className="sr-only">גודל הגופן </span>{fontSize}
            </output>
          )
        },
        {
          id: 'textZoomIn', icon: 'add', label: 'הגדלת גופן הטקסט', tip: tip('הגדלת גופן הטקסט', 'textZoomIn'),
          shortcut: keys('textZoomIn'), keepFocus: true, onClick: () => setSize(fontSize + step), disabled: fontSize >= max, hidden: !hasFontSize
        }
      ]
    },
    {
      id: 'format',
      priority: 1,
      items: [
        // B כבד (800) — גם כשכל השאר דק; I ו-U נשארים אייקונים דקים (נטוי / קו תחתון בעצמם)
        tag('bold', 'b', 'הדגשה', { glyph: 'B', glyphClassName: 'font-extrabold' }),
        tag('italic', 'i', 'נטוי', { icon: 'format_italic' }),
        tag('underline', 'u', 'קו תחתון', { icon: 'format_underlined' })
      ]
    },
    {
      id: 'clear',
      priority: 3,
      items: [
        {
          id: 'clearFormatting', icon: 'format_clear', label: 'נקה עיצוב', tip: tip('נקה עיצוב', 'clearFormatting'),
          shortcut: keys('clearFormatting'), keepFocus: true, onClick: onClearFormatting, hidden: !onClearFormatting
        }
      ]
    },
    {
      id: 'headings',
      priority: 2,
      items: [
        // טקסט דק ולא format_h1–h3: הספרות המרובעות של האייקונים נקראו כהפוכות
        tag('h1', 'h1', 'כותרת רמה 1', { glyph: 'H1' }),
        tag('h2', 'h2', 'כותרת רמה 2', { glyph: 'H2' }),
        tag('h3', 'h3', 'כותרת רמה 3', { glyph: 'H3' })
      ]
    },
    {
      id: 'align',
      priority: 2,
      items: [
        {
          id: 'align',
          icon: currentAlign.icon,
          label: 'יישור הטקסט',
          hidden: !onTextAlignChange,
          menu: alignItems,
          render: () => (
            <MenuButton
              icon={currentAlign.icon}
              label="יישור הטקסט"
              tip={`יישור הטקסט: ${currentAlign.label}`}
              items={alignItems}
              keepFocus
              size="tool"
            />
          )
        }
      ]
    },
    {
      id: 'find',
      priority: 4,
      items: [
        { id: 'findReplace', icon: 'find_replace', label: 'חיפוש והחלפה', tip: tip('חיפוש והחלפה', 'findReplace'), shortcut: keys('findReplace'), onClick: onFind },
        { id: 'spellcheck', icon: 'spellcheck', label: 'בדיקת איות', onClick: onSpellcheck, hidden: !onSpellcheck }
      ]
    },
    {
      id: 'size',
      priority: 6,
      items: [
        tag('bigger', 'big', 'הגדלת קטע', { icon: 'text_increase' }),
        tag('smaller', 'small', 'הקטנת קטע', { icon: 'text_decrease' })
      ]
    },
    {
      id: 'insert',
      priority: 5,
      items: [
        { id: 'imageToText', icon: 'image', label: 'הוספת תמונה לטקסט', tip: tip('הוספת תמונה לטקסט', 'imageToText'), shortcut: keys('imageToText'), onClick: onImageToText, hidden: !onImageToText },
        {
          id: 'split',
          icon: twoColumns ? 'call_merge' : 'call_split',
          label: twoColumns ? 'איחוד לטור אחד' : 'פיצול לשני טורים',
          tip: tip(twoColumns ? 'איחוד לטור אחד' : 'פיצול לשני טורים', 'split'),
          shortcut: keys('split'),
          pressed: twoColumns,
          onClick: onSplit,
          hidden: !onSplit
        }
      ]
    },
    {
      id: 'view',
      // מתג התצוגה תמיד גלוי — לא יוצא לתפריט "עוד"
      pinned: true,
      items: [
        {
          id: 'toggleTextView',
          label: 'החלפת תצוגה',
          hidden: !onToggleTextView,
          render: () => (
            <TextViewToggle
              value={textView}
              onToggle={onToggleTextView}
              tip={tip('החלפת תצוגה', 'toggleTextView')}
              keyshortcuts={toAriaKeys(keys('toggleTextView'))}
            />
          )
        }
      ]
    }
  ]

  return (
    <PaneToolbar
      label="טקסט"
      groups={groups}
      onAllCommands={onMore}
      allCommandsShortcut={keys('commandPalette')}
    />
  )
}
