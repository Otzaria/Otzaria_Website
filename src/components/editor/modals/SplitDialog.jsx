import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

export default function SplitDialog({
  isOpen,
  onClose,
  splitMode,
  setSplitMode,
  rightColumnName,
  setRightColumnName,
  leftColumnName,
  setLeftColumnName,
  confirmSplit
}) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    // mount guard לרינדור פורטל בצד הלקוח בלבד (מניעת hydration mismatch)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
  }, [])

  if (!isOpen || !mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="flex flex-col bg-white glass-strong rounded-2xl w-full max-w-md shadow-2xl border-2 border-primary animate-in zoom-in-95 duration-200">
        
        <div className="p-6 pb-2">
          <h3 className="text-2xl font-bold text-on-surface mb-2">פיצול עמוד</h3>
          <p className="text-on-surface/60 text-sm">בחר את סוג הפיצול הרצוי לעמוד זה</p>
        </div>
        
        <div className="p-6 pt-4 space-y-6">
          <div className="space-y-3">
            <label className={`flex items-start gap-3 p-4 border-2 rounded-xl cursor-pointer transition-all ${
              splitMode === 'content' ? 'border-primary bg-primary/5' : 'border-surface-variant hover:bg-surface-variant/50'
            }`}>
              <div className="mt-0.5">
                <input type="radio" name="splitMode" value="content" checked={splitMode === 'content'} onChange={(e) => setSplitMode(e.target.value)} className="accent-primary w-4 h-4" />
              </div>
              <div>
                <span className="font-bold block text-on-surface">פיצול תוכן</span>
                <span className="text-xs text-on-surface/70">העמוד מכיל שני חלקים שונים של טקסט (למשל גמרא ורש"י).</span>
              </div>
            </label>
            
            <label className={`flex items-start gap-3 p-4 border-2 rounded-xl cursor-pointer transition-all ${
              splitMode === 'visual' ? 'border-primary bg-primary/5' : 'border-surface-variant hover:bg-surface-variant/50'
            }`}>
              <div className="mt-0.5">
                <input type="radio" name="splitMode" value="visual" checked={splitMode === 'visual'} onChange={(e) => setSplitMode(e.target.value)} className="accent-primary w-4 h-4" />
              </div>
              <div>
                <span className="font-bold block text-on-surface">חלוקה ויזואלית</span>
                <span className="text-xs text-on-surface/70">רק לנוחות העריכה (למשל שני טורים של אותו טקסט).</span>
              </div>
            </label>
          </div>

          {splitMode === 'content' && (
            <div className="space-y-3 pt-2 animate-in fade-in slide-in-from-top-2">
              <div>
                <label className="block text-xs font-bold mb-1 text-on-surface/70">כותרת עמודה ימנית</label>
                <input type="text" value={rightColumnName} onChange={(e) => setRightColumnName(e.target.value)} className="w-full px-4 py-2 border border-surface-variant rounded-lg focus:outline-none focus:ring-2 focus:ring-primary" placeholder="חלק 1" />
              </div>
              <div>
                <label className="block text-xs font-bold mb-1 text-on-surface/70">כותרת עמודה שמאלית</label>
                <input type="text" value={leftColumnName} onChange={(e) => setLeftColumnName(e.target.value)} className="w-full px-4 py-2 border border-surface-variant rounded-lg focus:outline-none focus:ring-2 focus:ring-primary" placeholder="חלק 2" />
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3 p-6 pt-0">
          <button onClick={confirmSplit} className="flex-1 px-4 py-3 bg-primary text-on-primary rounded-lg font-bold hover:bg-accent transition-colors shadow-md">פצל עמוד</button>
          <button onClick={onClose} className="flex-1 px-4 py-3 border border-surface-variant text-on-surface rounded-lg hover:bg-surface-variant transition-colors font-medium">ביטול</button>
        </div>
      </div>
    </div>,
    document.body
  )
}