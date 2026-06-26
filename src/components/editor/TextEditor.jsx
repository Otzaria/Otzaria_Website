import { forwardRef } from 'react'

// רכיב כפתור קטן לשימוש חוזר
const MiniBtn = ({ onClick, active, icon, title, rotate }) => (
  <button
    onClick={onClick}
    className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${
      active ? 'bg-info-50 text-info-600' : 'text-neutral-500 hover:bg-white hover:text-neutral-900'
    }`}
    title={title}
  >
    <span className="material-symbols-outlined text-[16px]" style={{ transform: rotate ? 'rotate(90deg)' : 'none' }}>
      {icon}
    </span>
  </button>
);

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
  textAlign,
  setTextAlign, // קבלת הפונקציה לשינוי יישור
  textZoom,
  setTextZoom
}, ref) => {

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
      {/* סרגל כלים צף וממורכז - גודל ויישור */}
      <div className="flex items-center gap-2 mb-3 bg-neutral-50/80 backdrop-blur-sm border border-neutral-200 rounded-md p-1 px-2 w-fit mx-auto shadow-sm sticky top-0 z-10">
        
        {/* שליטה בגודל */}
        <div className="flex items-center gap-0.5">
           <MiniBtn onClick={() => setTextZoom(Math.max(10, textZoom - 1))} icon="remove" title="הקטן גופן" />
           <span className="text-[10px] font-medium w-6 text-center select-none text-neutral-600">{textZoom}</span>
           <MiniBtn onClick={() => setTextZoom(Math.min(60, textZoom + 1))} icon="add" title="הגדל גופן" />
        </div>

        <div className="w-px h-3 bg-neutral-300 mx-1"></div>

        {/* שליטה ביישור */}
        <div className="flex items-center gap-0.5">
           <MiniBtn onClick={() => setTextAlign('right')} active={textAlign === 'right'} icon="format_align_right" title="יישור לימין" />
           <MiniBtn onClick={() => setTextAlign('center')} active={textAlign === 'center'} icon="format_align_center" title="מרכז" />
           <MiniBtn onClick={() => setTextAlign('left')} active={textAlign === 'left'} icon="format_align_left" title="יישור לשמאל" />
           <MiniBtn onClick={() => setTextAlign('justify')} active={textAlign === 'justify'} icon="format_align_justify" title="יישור לשני הצדדים" />
        </div>
      </div>

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
            <textarea
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
              className="flex-1 p-4 bg-white border-2 border-surface-variant rounded-lg resize-none focus:outline-none focus:border-primary transition-colors leading-relaxed"
              dir="rtl"
              spellCheck={false}
            />
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
            <textarea
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
              className="flex-1 p-4 bg-white border-2 border-surface-variant rounded-lg resize-none focus:outline-none focus:border-primary transition-colors leading-relaxed"
              dir="rtl"
              spellCheck={false}
            />
          </div>
        </div>
      ) : (
        <textarea
          value={content}
          onChange={(e) => handleAutoSave(e.target.value)}
          onFocus={() => setActiveTextarea(null)}
          placeholder="התחל להקליד את הטקסט מהעמוד כאן..."
          style={{ 
            fontFamily: selectedFont, 
            textAlign: textAlign,
            fontSize: `${textZoom}px`
          }}
          className="w-full h-full p-4 bg-white border-2 border-surface-variant rounded-lg resize-none focus:outline-none focus:border-primary transition-colors leading-relaxed"
          dir="rtl"
              spellCheck={false}
        />
      )}
    </div>
  )
})

TextEditor.displayName = 'TextEditor'
export default TextEditor

