import { forwardRef, useState } from 'react'
import TextMirror, { MIRROR_GUTTER_PX } from './v2/TextMirror'
import { richFieldFor } from './v2/richField'

const TextEditor = forwardRef(({
  content,
  leftColumn,
  rightColumn,
  twoColumns,
  rightColumnName,
  leftColumnName,
  handleAutoSave,
  handleColumnChange,
  setActiveTextarea,
  selectedFont,
  columnWidth,
  onColumnResizeStart,
  // יישור וגודל — מהעדפות העורך; הכפתורים בשורת הכלים (TextToolbar), לא בתוך הרכיב
  textAlign,
  textZoom,
  setTextZoom,
  // רשות (עורך העמוד החדש): שכבת mirror מאחורי ה-textarea — { column, line, word, estimated,
  // lineNumbers, showSuspects, strength }; column = הטור שבו הסמן ('content' / 'right' / 'left').
  // wrap — 'off' לשורה-מול-שורה (מצב "מול הסריקה"). בלי שניהם — בדיוק כמו קודם.
  mirror,
  wrap,
  // 'rich' — התצוגה המעוצבת (RichTextArea, richField.jsx) במקום ה-textarea; 'code' / חסר — textarea
  textView,
  // עימוד ספר בתצוגה המעוצבת בלבד: "חלון" בתחילת פסקה וסיום משולש (תצוגה, המחרוזת לא משתנה)
  paraWindow = false,
  paraFunnel = false
}, ref) => {
  // ה-textarea עצמם (callback ref → state) — שכבת ה-mirror מסנכרנת אליהם את הגלילה
  const [contentTa, setContentTa] = useState(null)
  const [rightTa, setRightTa] = useState(null)
  const [leftTa, setLeftTa] = useState(null)

  // textarea עם mirror מאחוריו — רק כש-mirror הועבר; אחרת ה-textarea המקורי כמות שהוא
  const withMirror = (textarea, { taEl, text, column, wrapperClass }) => {
    if (textView === 'rich') return richFieldFor(textarea, { mirror, column, wrapperClass, paraWindow, paraFunnel })
    if (!mirror) return textarea
    const gutter = mirror.lineNumbers ? { paddingInlineStart: `${MIRROR_GUTTER_PX + 16}px` } : null
    const active = (mirror.column || 'content') === column
    return (
      <div className={wrapperClass}>
        <TextMirror
          text={text}
          textarea={taEl}
          column={column}
          currentLine={active && Number.isInteger(mirror.line) ? mirror.line : -1}
          currentWord={active && Number.isInteger(mirror.word) ? mirror.word : -1}
          estimated={!!mirror.estimated}
          lineNumbers={!!mirror.lineNumbers}
          showSuspects={!!mirror.showSuspects}
          wrap={wrap === 'off' ? 'off' : 'soft'}
          strength={mirror.strength}
          className="px-6 py-5 bg-[var(--editor-text-bg,var(--color-surface))] border-2 border-transparent rounded-lg leading-relaxed"
          style={{ fontFamily: selectedFont, textAlign, fontSize: `${textZoom}px`, ...gutter }}
        />
        {textarea}
      </div>
    )
  }
  const mirrorTaProps = (setTa) => mirror
    ? {
        ref: setTa,
        style: {
          fontFamily: selectedFont,
          textAlign: textAlign,
          fontSize: `${textZoom}px`,
          scrollbarGutter: 'stable',
          ...(wrap === 'off' ? { whiteSpace: 'pre' } : null),
          ...(mirror.lineNumbers ? { paddingInlineStart: `${MIRROR_GUTTER_PX + 16}px` } : null)
        }
      }
    : {}
  const surface = mirror ? 'relative z-[1] bg-transparent' : 'bg-[var(--editor-text-bg,var(--color-surface))]'

  const handleWheel = (e) => {
    if (e.ctrlKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -1 : 1;
      setTextZoom(prev => Math.max(10, Math.min(60, prev + delta)));
    }
    e.stopPropagation();
  };

  return (
    <div
      ref={ref}
      className="flex flex-col overflow-auto p-4 editor-container text-editor-container"
      style={{ flex: 1 }}
      onWheel={handleWheel}
    >
      {twoColumns ? (
        <div className="flex flex-row h-full gap-0">
          <div 
            className="flex flex-col h-full" 
            style={{ width: `${columnWidth}%` }}
          >
            <div className="flex items-center gap-2 mb-2 px-2">
              <span className="material-symbols-outlined text-primary text-sm">article</span>
              <span className="text-sm font-bold text-on-surface">{rightColumnName}</span>
            </div>
            {withMirror(<textarea
              data-column="right"
              value={rightColumn}
              onChange={(e) => handleColumnChange('right', e.target.value)}
              onFocus={() => setActiveTextarea('right')}
              placeholder={`טקסט ${rightColumnName}...`}
              style={{ 
                fontFamily: selectedFont, 
                textAlign: textAlign,
                fontSize: `${textZoom}px`
              }}
              className={`flex-1 px-6 py-5 ${surface} border-2 border-surface-variant rounded-lg resize-none focus:outline-none focus:border-primary transition-colors leading-relaxed`}
              dir="rtl"
              spellCheck={false}
              wrap={wrap}
              {...mirrorTaProps(setRightTa)}
            />, { taEl: rightTa, text: rightColumn, column: 'right', wrapperClass: 'relative flex-1 flex flex-col min-h-0' })}
          </div>

          <div
            className="w-2 hover:bg-primary/30 cursor-col-resize flex-shrink-0 transition-colors mx-1 rounded-full"
            onMouseDown={onColumnResizeStart}
          />

          <div className="flex flex-col h-full flex-1">
            <div className="flex items-center gap-2 mb-2 px-2">
              <span className="material-symbols-outlined text-primary text-sm">article</span>
              <span className="text-sm font-bold text-on-surface">{leftColumnName}</span>
            </div>
            {withMirror(<textarea
              data-column="left"
              value={leftColumn}
              onChange={(e) => handleColumnChange('left', e.target.value)}
              onFocus={() => setActiveTextarea('left')}
              placeholder={`טקסט ${leftColumnName}...`}
              style={{ 
                fontFamily: selectedFont, 
                textAlign: textAlign,
                fontSize: `${textZoom}px`
              }}
              className={`flex-1 px-6 py-5 ${surface} border-2 border-surface-variant rounded-lg resize-none focus:outline-none focus:border-primary transition-colors leading-relaxed`}
              dir="rtl"
              spellCheck={false}
              wrap={wrap}
              {...mirrorTaProps(setLeftTa)}
            />, { taEl: leftTa, text: leftColumn, column: 'left', wrapperClass: 'relative flex-1 flex flex-col min-h-0' })}
          </div>
        </div>
      ) : (
        withMirror(<textarea
          value={content}
          onChange={(e) => handleAutoSave(e.target.value)}
          onFocus={() => setActiveTextarea(null)}
          placeholder="התחל להקליד את הטקסט מהעמוד כאן..."
          style={{ 
            fontFamily: selectedFont, 
            textAlign: textAlign,
            fontSize: `${textZoom}px`
          }}
          className={`w-full h-full px-6 py-5 ${surface} border-2 border-surface-variant rounded-lg resize-none focus:outline-none focus:border-primary transition-colors leading-relaxed`}
          dir="rtl"
              spellCheck={false}
          wrap={wrap}
          {...mirrorTaProps(setContentTa)}
        />, { taEl: contentTa, text: content, column: 'content', wrapperClass: 'relative w-full h-full' })
      )}
    </div>
  )
})

TextEditor.displayName = 'TextEditor'
export default TextEditor

