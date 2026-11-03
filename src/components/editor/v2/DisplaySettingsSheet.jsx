'use client'

import { useEffect, useId, useRef, useState } from 'react'
import Button from '@/components/ui/Button'
import SegmentedControl from '@/components/ui/SegmentedControl'
import Switch from '@/components/ui/Switch'
import TitleOrnament from '@/components/ui/TitleOrnament'
import { cx } from '@/components/ui/cx'
import { PREF_RANGES } from '@/hooks/editorPrefs'
import { useOutsidePress } from '@/hooks/useOutsidePress'
import FontPicker from './FontPicker'
import { CONFUSABLE_SAMPLE, LINE_HEIGHT_OPTIONS, PARA_SPACING_OPTIONS, editorFontFamily } from './editorShellLogic'

export { CONFUSABLE_SAMPLE }

// מזהה קבוע של הגיליון: כפתור המתג שפותח אותו (EditorTopBar) מצביע עליו ב-aria-controls, וכך
// הגיליון מזהה אותו ולא נסגר בלחיצה עליו "מבחוץ" — הכפתור עצמו סוגר (מתג), בלי פתיחה מחדש
export const DISPLAY_SHEET_ID = 'editor-display-sheet'
const isSheetToggle = (target) => !!target.closest(`[aria-controls="${DISPLAY_SHEET_ID}"]`)

// דוגמאות הצבע של הערכות — שולחן + דף של כל ערכה, בצבעים קבועים (--editor-swatch-*, editor-themes.css)
// ולא מתפקידי הערכה הנוכחית: אחרת בערכת ערב גם דוגמת "בהיר" נצבעה כהה
const THEMES = [
  { value: 'light', label: 'בהיר עמום', swatch: ['bg-(--editor-swatch-light-desk)', 'bg-(--editor-swatch-light-sheet)'] },
  { value: 'paper', label: 'נייר', swatch: ['bg-(--editor-swatch-paper-desk)', 'bg-(--editor-swatch-paper-sheet)'] },
  { value: 'evening', label: 'ערב', swatch: ['bg-(--editor-swatch-evening-desk)', 'bg-(--editor-swatch-evening-sheet)'] }
]

const HIGHLIGHT = [
  { value: 'strong', label: 'חזק' },
  { value: 'normal', label: 'רגיל' }
]

// סידור השורות (העדפה lineSpacing — השם היסטורי; גובה השורה עצמו — lineHeight, "ריווח שורות")
const LINE_ARRANGEMENT = [
  { value: 'facing', label: 'שורה מול שורה' },
  { value: 'fixed', label: 'גלישה רגילה' }
]

const TEXT_VIEWS = [
  { value: 'rich', label: 'תצוגה מעוצבת' },
  { value: 'code', label: 'קוד' }
]

/**
 * גיליון "תצוגה ונוחות עיניים". בצד (צד הסוף — שמאל ב-RTL) במחשב, וגיליון תחתון בנייד.
 * לא מודאלי בכוונה: העורך נשאר גלוי ומתעדכן בזמן אמת תוך כדי שינוי. הפוקוס נכנס לגיליון
 * בפתיחה וחוזר למי שפתח בסגירה ב-Esc/בכפתור; Esc סוגר. לחיצה מחוץ לגיליון (טקסט, צילום, כל מקום
 * בדף) סוגרת אותו בלי לבלוע את הלחיצה ובלי להזיז פוקוס — לחיצה בטקסט מציבה בו את הסמן. לחיצות
 * בפורטלים שנפתחים מתוך הגיליון (תפריט, Tooltip) נחשבות "בפנים". ההורה מרנדר אותו רק כשהוא פתוח.
 *
 * מבוקר: value — ההעדפות (ראו DEFAULT_EDITOR_PREFS ב-hooks/editorPrefs.js), onChange(patch) — עדכון חלקי.
 *
 * @param {{ value: typeof import('@/hooks/editorPrefs').DEFAULT_EDITOR_PREFS,
 *   onChange: (patch: object) => void, onClose: () => void, onReset?: () => void, className?: string }} props
 */
export default function DisplaySettingsSheet({ value, onChange, onClose, onReset, className }) {
  const titleId = useId()
  const panelRef = useRef(null)
  const [opener] = useState(() => (typeof document !== 'undefined' ? document.activeElement : null))
  // סגירה בלחיצה בחוץ — הפוקוס נשאר במה שנלחץ (הטקסט), לא חוזר לכפתור הפתיחה
  const restoreFocus = useRef(true)

  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true })
    return () => {
      if (restoreFocus.current && opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true })
    }
  }, [opener])

  const outside = useOutsidePress(true, () => {
    restoreFocus.current = false
    onClose()
  }, { ignore: isSheetToggle })

  const onKeyDown = (event) => {
    if (event.key === 'Escape' && !event.defaultPrevented) {
      event.preventDefault()
      onClose()
    }
  }

  return (
    <aside
      ref={panelRef}
      id={DISPLAY_SHEET_ID}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onPointerDownCapture={outside.onPointerDownCapture}
      className={cx(
        'fixed z-(--z-overlay) flex flex-col bg-surface shadow-sheet outline-none',
        // נייד: גיליון תחתון
        'inset-x-0 bottom-0 max-h-[80dvh] rounded-t-(--radius-sheet)',
        // מחשב: גיליון צד בצד הסוף, מתחת לכותרת העורך (לא מכסה אותה — כפתור התצוגה נשאר נגיש)
        'md:inset-x-auto md:end-0 md:top-(--editor-topbar-height) md:bottom-0 md:max-h-none md:w-96 md:rounded-none md:border-s md:border-outline-variant',
        'animate-enter-up motion-reduce:animate-none',
        className
      )}
    >
      <div className="flex shrink-0 items-start gap-2 px-5 pb-3 pt-4">
        <div className="min-w-0 flex-1">
          <span aria-hidden="true" className="mx-auto mb-3 block h-1 w-10 rounded-(--radius-pill) bg-outline-variant md:hidden" />
          <h2 id={titleId} className="font-display text-headline-sm text-on-surface">תצוגה ונוחות עיניים</h2>
          <TitleOrnament className="mt-2" ratio="40%" min="80px" />
        </div>
        <Button variant="text" size="sm" iconOnly icon="close" aria-label="סגירה" onClick={onClose} />
      </div>

      <div className="custom-scrollbar min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <SheetSection title="ערכת צבעים">
          {(id) => (
            <SegmentedControl
              labelledBy={id}
              fullWidth
              value={value.theme}
              onChange={(theme) => onChange({ theme })}
              options={THEMES.map((t) => ({ value: t.value, label: <ThemeLabel {...t} /> }))}
            />
          )}
        </SheetSection>

        <SheetSection title="הטקסט שאתה מקליד">
          {() => (
            <div className="space-y-4">
              <FontField value={value.fontFamily} onChange={(fontFamily) => onChange({ fontFamily })} />
              <FieldRow label="תצוגת הטקסט" hint='"קוד": התגים עצמם (<b>…</b>) כמו שהם נשמרים'>
                {(id) => <SegmentedControl labelledBy={id} value={value.textView} onChange={(textView) => onChange({ textView })} options={TEXT_VIEWS} />}
              </FieldRow>
              {value.textView === 'rich' && (
                <div>
                  <Switch
                    label="חלון בתחילת פסקה"
                    description="השורה השנייה נכנסת ברוחב המילה הראשונה, כמו בספר"
                    checked={value.paraWindow}
                    onChange={(paraWindow) => onChange({ paraWindow })}
                  />
                  <Switch
                    label="סיום משולש"
                    description="השורות האחרונות של פסקה מצטמצמות בהדרגה, בלי מילה בודדת בסוף"
                    checked={value.paraFunnel}
                    onChange={(paraFunnel) => onChange({ paraFunnel })}
                  />
                </div>
              )}
              <RangeRow
                label="גודל"
                value={value.fontSize}
                range={PREF_RANGES.fontSize}
                valueText={`${value.fontSize} פיקסלים`}
                onChange={(fontSize) => onChange({ fontSize })}
              />
              <FieldRow label="ריווח שורות">
                {(id) => <SegmentedControl labelledBy={id} fullWidth value={value.lineHeight} onChange={(lineHeight) => onChange({ lineHeight })} options={LINE_HEIGHT_OPTIONS} />}
              </FieldRow>
              {/* ב-textarea (תצוגת קוד) אין דרך להוסיף רווח בין שורות בלי לשבור את שכבת הסימון — לכן רק במעוצבת */}
              {value.textView === 'rich' && (
                <FieldRow label="רווח בין פסקאות" hint="בתצוגה המעוצבת בלבד">
                  {(id) => <SegmentedControl labelledBy={id} fullWidth value={value.paraSpacing} onChange={(paraSpacing) => onChange({ paraSpacing })} options={PARA_SPACING_OPTIONS} />}
                </FieldRow>
              )}
              <FieldRow label="סידור השורות" hint='"שורה מול שורה": כל שורה בטקסט בשורה משלה, כמו בצילום, בלי גלישה (טקסט שמגיע כגוש — גולש)'>
                {(id) => <SegmentedControl labelledBy={id} value={value.lineSpacing} onChange={(lineSpacing) => onChange({ lineSpacing })} options={LINE_ARRANGEMENT} />}
              </FieldRow>
              <p
                aria-label="דוגמה: אותיות דומות"
                className="rounded-(--radius-control) border border-outline-variant bg-background px-4 py-3 text-on-surface"
                style={{ fontSize: `${value.fontSize}px`, fontFamily: editorFontFamily(value.fontFamily) }}
              >
                {CONFUSABLE_SAMPLE}
              </p>
            </div>
          )}
        </SheetSection>

        <SheetSection title="הצילום">
          {() => (
            <div className="space-y-4">
              <RangeRow label="בהירות" value={value.scanBrightness} range={PREF_RANGES.scanBrightness} valueText={`${value.scanBrightness}%`} onChange={(scanBrightness) => onChange({ scanBrightness })} />
              <RangeRow label="ניגודיות" value={value.scanContrast} range={PREF_RANGES.scanContrast} valueText={`${value.scanContrast}%`} onChange={(scanContrast) => onChange({ scanContrast })} />
            </div>
          )}
        </SheetSection>

        <SheetSection title="מעקב מילה">
          {() => (
            <div>
              <FieldRow label="עוצמת הסימון" hint="המילה והשורה שאתה עליהן — בצילום ובטקסט">
                {(id) => <SegmentedControl labelledBy={id} value={value.highlightStrength} onChange={(highlightStrength) => onChange({ highlightStrength })} options={HIGHLIGHT} />}
              </FieldRow>
              <Switch label="מסגרת על המילה בצילום" checked={value.trackingFrame} onChange={(trackingFrame) => onChange({ trackingFrame })} />
              <Switch label="גלילה מתואמת" description="הצילום זז כך שהשורה שלך מולך" checked={value.followScroll} onChange={(followScroll) => onChange({ followScroll })} />            </div>
          )}
        </SheetSection>

        <SheetSection title="מנוחה">
          {() => (
            <Switch
              label={`תזכורת כל ${value.restIntervalMin} דקות`}
              description="להסתכל 20 שניות על משהו רחוק"
              checked={value.restReminder}
              onChange={(restReminder) => onChange({ restReminder })}
            />
          )}
        </SheetSection>

        {onReset && (
          <Button variant="text" size="sm" icon="restart_alt" onClick={onReset}>
            החזרת ברירות המחדל
          </Button>
        )}
      </div>
    </aside>
  )
}

function SheetSection({ title, children }) {
  const id = useId()
  return (
    <section aria-labelledby={id}>
      <h3 id={id} className="mb-3 text-title-sm text-on-surface">{title}</h3>
      {children(id)}
    </section>
  )
}

function FontField({ value, onChange }) {
  const id = useId()
  return (
    <div>
      <span id={id} className="mb-2 block text-body-md text-on-surface">גופן</span>
      <FontPicker labelledBy={id} value={value} onChange={onChange} />
    </div>
  )
}

function FieldRow({ label, hint, children }) {
  const id = useId()
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <span id={id} className="block text-body-md text-on-surface">{label}</span>
        {hint && <span className="block text-body-sm text-on-surface-variant">{hint}</span>}
      </div>
      {children(id)}
    </div>
  )
}

function RangeRow({ label, value, range, valueText, onChange }) {
  const id = useId()
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="block text-body-md text-on-surface">{label}</label>
        {/* הערך נקרא דרך aria-valuetext של המחוון */}
        <span aria-hidden="true" className="block text-body-sm text-on-surface-variant tabular-nums">{valueText}</span>
      </div>
      <input
        id={id}
        type="range"
        min={range.min}
        max={range.max}
        step={range.step}
        value={value}
        aria-valuetext={valueText}
        onChange={(event) => onChange(Number(event.target.value))}
        className="min-h-(--touch-target) w-40 shrink-0 cursor-pointer accent-primary"
      />
    </div>
  )
}

function ThemeLabel({ label, swatch }) {
  return (
    <span className="flex flex-col items-center gap-1.5">
      <span aria-hidden="true" className="flex h-8 w-full overflow-hidden rounded-(--radius-xs) border border-outline-variant">
        <span className={cx('flex-1', swatch[0])} />
        <span className={cx('flex-1', swatch[1])} />
      </span>
      {label}
    </span>
  )
}
