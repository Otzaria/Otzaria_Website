'use client'

// התצוגה המעוצבת של שדה הטקסט בעורך העמוד: במקום לראות <b>שם.</b> — רואים "שם." מודגש.
// div עם contenteditable שחושף ממשק תואם-textarea (value, selectionStart/End, setSelectionRange,
// select, אירועי input) כך שהקוד הקיים — הוספת תגים, חיפוש והחלפה, מעקב המילה, שמירה
// אוטומטית — עובד בלי שינוי. המחרוזת השמורה לא משתנה (richMap/richEdit); ההתנהגות כולה
// ב-richController.js, כאן רק האלמנטים וה-props.
//
// עימוד ספר (paraWindow — "חלון" בתחילת פסקה, paraFunnel — סיום משולש): קישוטי תצוגה בלבד,
// bookLayout.js; המחרוזת וההיסטים לא משתנים.
//
// מבנה: עטיפה (relative) → <style> → רצועה מאחור (רקע השדה, פס שורת המסך כשהשורה גולשת) →
// השדה עצמו (שקוף, מעל). סימון המילה — CSS Custom Highlight; פס השורה — רקע השורה.

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { createRichController } from './richController'
import { RICH_BASE_CSS, bandVars, highlightCss } from './richStyles'
import { MIRROR_HIGHLIGHT } from './TextMirror'
import { RICH_FIELD_ATTR } from '@/lib/editor/editorField'

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

function setRef(ref, value) {
  if (typeof ref === 'function') ref(value)
  else if (ref && typeof ref === 'object') ref.current = value
}

/**
 * @param {{ value?: string, onChange?: Function, onFocus?: Function, onBlur?: Function, placeholder?: string,
 *   style?: object, className?: string, dir?: string, wrap?: string, ref?: any, wrapperClassName?: string,
 *   tracking?: import('./richController').RichTracking | null, paraWindow?: boolean, paraFunnel?: boolean,
 *   'data-column'?: string, [key: string]: any }} props
 *   שאר ה-props של ה-textarea (spellCheck, rows) — מתעלמים
 */
export default function RichTextArea({
  value = '',
  onChange,
  onFocus,
  onBlur,
  placeholder,
  style,
  className,
  dir = 'rtl',
  wrap,
  ref,
  wrapperClassName,
  tracking = null,
  paraWindow = false,
  paraFunnel = false,
  'data-column': dataColumn,
  spellCheck: _spellCheck,
  rows: _rows,
  ...rest
}) {
  const hostRef = useRef(/** @type {HTMLDivElement|null} */ (null))
  const layerRef = useRef(/** @type {HTMLDivElement|null} */ (null))
  const ctlRef = useRef(/** @type {ReturnType<typeof createRichController>|null} */ (null))
  const book = paraWindow || paraFunnel ? { window: paraWindow, funnel: paraFunnel } : null
  const propsRef = useRef({ onChange, tracking, book })
  const column = dataColumn || 'content'

  useIsoLayoutEffect(() => {
    propsRef.current = { onChange, tracking, book }
  })

  // העדפות העימוד, הגופן, הגודל או היישור אולי השתנו — הבקר משווה חתימה ומעמד מחדש רק אם צריך
  useEffect(() => {
    ctlRef.current?.checkBook()
  })

  useIsoLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return undefined
    const ctl = createRichController(host, layerRef.current, { column, getProps: () => propsRef.current })
    ctlRef.current = ctl
    return () => {
      ctl.destroy()
      ctlRef.current = null
    }
  }, [column])

  // אחרי ההתקנה (אותו commit) ובכל ערך חדש — הבקר מזהה הד של עריכה שלו
  useIsoLayoutEffect(() => {
    ctlRef.current?.syncValue(value)
  }, [value, column])

  const line = tracking?.line
  const word = tracking?.word
  const estimated = tracking?.estimated
  const showSuspects = tracking?.showSuspects
  const trackStrength = tracking?.strength
  const hasTracking = tracking != null
  useEffect(() => {
    ctlRef.current?.scheduleDecorations()
  }, [line, word, estimated, showSuspects, trackStrength, hasTracking, value])

  const hostCallbackRef = useCallback((el) => {
    hostRef.current = el
    setRef(ref, el)
  }, [ref])

  const strength = trackStrength === 'normal' ? 'normal' : 'strong'
  const wrapOff = wrap === 'off'
  return (
    <div className={wrapperClassName || 'relative w-full h-full'} style={{ position: 'relative' }}>
      <style>{RICH_BASE_CSS + highlightCss(column, strength)}</style>
      <div
        ref={layerRef}
        aria-hidden="true"
        className="absolute inset-0 rounded-lg bg-surface border-2 border-transparent pointer-events-none overflow-hidden"
      >
        <div data-row-band="" style={{ position: 'absolute', display: 'none', background: MIRROR_HIGHLIGHT[strength].band }} />
        <div data-word-fallback="" />
      </div>
      <div
        {...rest}
        ref={hostCallbackRef}
        {...{ [RICH_FIELD_ATTR]: '' }}
        data-column={dataColumn}
        data-numbers={tracking?.lineNumbers ? '' : undefined}
        data-placeholder={placeholder}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-placeholder={placeholder}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        translate="no"
        dir={dir}
        onFocus={onFocus}
        onBlur={onBlur}
        className={`${className || ''} relative z-[1] !bg-transparent overflow-auto`}
        style={{
          ...style,
          ...bandVars(strength),
          whiteSpace: wrapOff ? 'pre' : 'pre-wrap',
          overflowWrap: wrapOff ? 'normal' : 'break-word',
          wordBreak: 'normal'
        }}
      />
    </div>
  )
}
