import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

export default function FindReplaceDialog({
  isOpen,
  onClose,
  findText,
  setFindText,
  replaceText,
  setReplaceText,
  handleReplaceAll,
  handleFindNext,
  handleReplaceCurrent,
  savedSearches,
  addSavedSearch,
  removeSavedSearch,
  moveSearch,
  runAllSavedReplacements,
  handleRemoveDigits,
  onAddRemoveDigitsToSaved,
  useRegex = false, 
  setUseRegex = () => {},
  editMode = true
}) {
  const [view, setView] = useState('main') 

  const [newLabel, setNewLabel] = useState('')
  const [newFind, setNewFind] = useState('')
  const [newReplace, setNewReplace] = useState('')
  const [newIsRegex, setNewIsRegex] = useState(false)

  const [position, setPosition] = useState({ x: 100, y: 100 })
  const [isDragging, setIsDragging] = useState(false)
  const dragStartOffset = useRef({ x: 0, y: 0 })

  useEffect(() => {
    if (isOpen && typeof window !== 'undefined') {
        if (position.x === 100 && position.y === 100) {
             const startX = window.innerWidth > 800 ? (window.innerWidth / 2) : 20;
             setPosition({ x: startX, y: 100 })
        }
    }
  }, [isOpen])

  // לוגיקת גרירה
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging) return
      
      const newX = e.clientX - dragStartOffset.current.x
      const newY = e.clientY - dragStartOffset.current.y

      setPosition({ x: newX, y: newY })
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging])

  const handleMouseDown = (e) => {
    setIsDragging(true)
    dragStartOffset.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y
    }
  }

  const handleCloseInternal = () => {
    onClose();
    setTimeout(() => {
        setView('main');
        setNewLabel('');
        setNewFind('');
        setNewReplace('');
        setNewIsRegex(false);
    }, 100);
  };

  if (typeof document === 'undefined' || !isOpen) return null;

  const getTitle = () => {
      switch(view) {
          case 'list': return 'חיפושים קבועים';
          case 'add': return 'הוספת חיפוש חדש';
          default: return 'חיפוש והחלפה';
      }
  }

  const getIcon = () => {
      switch(view) {
          case 'list': return 'list_alt';
          case 'add': return 'add_circle';
          default: return 'find_replace';
      }
  }

  return createPortal(
    <div 
        className="fixed z-[9999] bg-white glass-strong rounded-2xl shadow-2xl border border-surface-variant flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        style={{ 
            left: `${position.x}px`, 
            top: `${position.y}px`,
            width: '400px',
            maxHeight: '180vh'
        }}
    >
        {/* כותרת - משמשת כידית הגרירה */}
        <div 
            className="flex items-center justify-between p-4 border-b border-surface-variant bg-surface/50 cursor-move select-none"
            onMouseDown={handleMouseDown}
        >
          <h2 className="text-lg font-bold text-on-surface flex items-center gap-2 pointer-events-none">
            <span className="material-symbols-outlined text-primary">{getIcon()}</span>
            <span>{getTitle()}</span>
          </h2>
          <button 
            onClick={handleCloseInternal} 
            className="text-on-surface/50 hover:text-red-500 hover:bg-red-50 p-1 rounded-full transition-colors cursor-pointer"
            onMouseDown={(e) => e.stopPropagation()} 
          >
            <span className="material-symbols-outlined text-xl block">close</span>
          </button>
        </div>

        <div className="p-5 overflow-y-auto custom-scrollbar">
          
          {view === 'main' && (
            <div className="space-y-4">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <div className="flex items-center gap-2">
                        <label className="block text-xs font-bold text-on-surface">חפש:</label>
                        <label className="flex items-center gap-1 cursor-pointer select-none">
                            <input 
                                type="checkbox" 
                                checked={useRegex} 
                                onChange={(e) => setUseRegex(e.target.checked)}
                                className="w-3 h-3 rounded border-gray-300 text-primary focus:ring-primary"
                            />
                            <span className="text-[10px] text-gray-500">Regex</span>
                        </label>
                    </div>
                    <button onClick={() => setFindText(prev => prev + '^13')} className="text-[10px] bg-gray-50 hover:bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded border border-gray-200 flex items-center gap-1 transition-colors">
                      <span className="material-symbols-outlined text-[10px]">keyboard_return</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    value={findText}
                    onChange={(e) => setFindText(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-surface-variant rounded-md focus:outline-none focus:ring-2 focus:ring-primary shadow-sm text-sm"
                    dir={useRegex ? "ltr" : "rtl"}
                    autoFocus
                    placeholder={useRegex ? "ביטוי רגולרי..." : "הזן טקסט..."}
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-bold text-on-surface">החלף ב:</label>
                    <button onClick={() => setReplaceText(prev => prev + '^13')} className="text-[10px] bg-gray-50 hover:bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded border border-gray-200 flex items-center gap-1 transition-colors">
                      <span className="material-symbols-outlined text-[10px]">keyboard_return</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    value={replaceText}
                    onChange={(e) => setReplaceText(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-surface-variant rounded-md focus:outline-none focus:ring-2 focus:ring-primary shadow-sm text-sm"
                    dir={useRegex ? "ltr" : "rtl"}
                    placeholder={useRegex ? "$1, $2..." : "הזן טקסט..."}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                    <button 
                        onClick={() => editMode && handleFindNext(findText, useRegex)} 
                        disabled={!editMode}
                        className={`col-span-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md font-bold transition-all shadow-sm text-sm ${
                            editMode 
                                ? 'bg-blue-600 text-white hover:bg-blue-700 cursor-pointer' 
                                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        }`}
                        title={editMode ? "חפש הבא" : "לחצנים אלו זמינים במצב עריכה ידנית בלבד"}
                    >
                        <span className="material-symbols-outlined text-sm">search</span>
                        <span>חפש הבא</span>
                    </button>
                    <button 
                        onClick={() => editMode && handleReplaceCurrent(replaceText, findText, useRegex)} 
                        disabled={!editMode}
                        className={`col-span-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md font-bold transition-all shadow-sm text-sm ${
                            editMode 
                                ? 'bg-primary text-on-primary hover:bg-accent cursor-pointer' 
                                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        }`}
                        title={editMode ? "החלף" : "לחצנים אלו זמינים במצב עריכה ידנית בלבד"}
                    >
                        <span className="material-symbols-outlined text-sm">find_replace</span>
                        <span>החלף</span>
                    </button>
                    <button 
                        onClick={() => handleReplaceAll(undefined, undefined, useRegex)} 
                        className="col-span-2 flex items-center justify-center gap-2 px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 font-bold transition-all shadow-sm mt-1 text-sm"
                    >
                        <span className="material-symbols-outlined text-sm">published_with_changes</span>
                        <span>החלף הכל</span>
                    </button>
                </div>

                <div className="pt-3 border-t border-surface-variant space-y-2">
                    <button 
                        onClick={handleRemoveDigits} 
                        className="w-full flex items-center justify-center gap-2 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-md border border-red-200 transition-colors text-xs font-medium"
                    >
                        <span className="text-[10px] font-bold line-through">123</span>
                        <span>נקה ספרות (מיידי)</span>
                    </button>

                    <button 
                        onClick={() => setView('list')}
                        className="w-full flex items-center justify-center gap-2 px-3 py-1.5 bg-gray-50 text-gray-700 rounded-md hover:bg-gray-100 transition-colors text-xs font-medium border border-gray-200"
                    >
                        <span className="material-symbols-outlined text-sm">list</span>
                        חיפושים קבועים
                    </button>
                </div>
            </div>
          )}

          {view === 'list' && (
            <div className="space-y-3">
                 <button 
                    onClick={runAllSavedReplacements}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 font-bold transition-all shadow-sm mb-2 text-sm"
                >
                    <span className="material-symbols-outlined text-sm">playlist_play</span>
                    חפש והחלף הכל (לפי סדר)
                </button>
                
                <div className="flex gap-2">
                    <button 
                        onClick={() => {
                            setNewLabel('');
                            setNewFind('');
                            setNewReplace('');
                            setNewIsRegex(false);
                            setView('add');
                        }}
                        className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-xs font-medium"
                    >
                        <span className="material-symbols-outlined text-xs">add</span>
                        חדש
                    </button>

                    <button 
                        onClick={() => {
                            if (onAddRemoveDigitsToSaved) {
                                onAddRemoveDigitsToSaved();
                            } else {
                                alert("חסרה הפונקציה בקובץ האב");
                            }
                        }}
                        className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-red-50 text-red-700 rounded-md hover:bg-red-100 border border-red-100 transition-colors text-xs font-medium"
                    >
                        <span className="text-[10px] font-bold line-through bg-red-100 border-red-200 border px-1 rounded">123</span>
                        הוסף ניקוי ספרות
                    </button>
                </div>

                <div className="max-h-[200px] overflow-y-auto space-y-1.5 pr-1 mt-1 custom-scrollbar">
                    {savedSearches && savedSearches.length > 0 ? (
                        savedSearches.map((search, index) => {
                            const isRemoveDigitsItem = search.isRemoveDigits;
                            const isRegexItem = search.isRegex;

                            return (
                            <div key={search.id} className={`p-2 rounded-md border flex items-center justify-between gap-2 group transition-colors ${isRemoveDigitsItem ? 'bg-red-50 border-red-100 hover:border-red-300' : 'bg-gray-50 border-gray-200 hover:border-primary/50'}`}>
                                <div className="flex-1 min-w-0">
                                    {isRemoveDigitsItem ? (
                                        <div className="flex items-center gap-2 text-red-700 font-medium">
                                             <span className="text-[10px] font-bold line-through bg-red-100 border-red-200 border px-1 rounded">123</span>
                                             <span className="truncate text-xs">{search.label || 'ניקוי ספרות'}</span>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="flex items-center gap-2">
                                                <div className="font-bold text-xs text-gray-800 truncate">{search.label || search.findText}</div>
                                                {isRegexItem && <span className="text-[9px] text-gray-500 bg-gray-200 px-1 rounded">Regex</span>}
                                            </div>
                                            <div className="text-[10px] text-gray-500 truncate flex items-center gap-1 mt-0.5">
                                                <span className={`bg-white px-1 border rounded max-w-[60px] truncate ${isRegexItem ? 'font-mono' : ''}`} dir={isRegexItem ? 'ltr' : 'rtl'}>{search.findText}</span>
                                                <span className="material-symbols-outlined text-[10px]">arrow_back</span>
                                                <span className="bg-white px-1 border rounded max-w-[60px] truncate">{search.replaceText || 'ריק'}</span>
                                            </div>
                                        </>
                                    )}
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                     <button 
                                        onClick={() => isRemoveDigitsItem ? handleRemoveDigits() : handleReplaceAll(search.findText, search.replaceText, isRegexItem)}
                                        className={`p-1 rounded border transition-colors ${isRemoveDigitsItem ? 'text-red-600 hover:bg-red-100 bg-red-50/50 border-red-200' : 'text-blue-600 hover:bg-blue-50 bg-blue-50/50 border-blue-100'}`}
                                        title="הרץ פעולה זו כעת (החלף הכל)"
                                    >
                                        <span className="material-symbols-outlined text-sm">play_arrow</span>
                                    </button>
                                    <div className="flex flex-col">
                                        <button onClick={() => moveSearch(index, 'up')} disabled={index === 0} className="p-0.5 text-gray-400 hover:text-gray-700 hover:bg-gray-200 rounded disabled:opacity-30">
                                            <span className="material-symbols-outlined text-[10px]">keyboard_arrow_up</span>
                                        </button>
                                        <button onClick={() => moveSearch(index, 'down')} disabled={index === savedSearches.length - 1} className="p-0.5 text-gray-400 hover:text-gray-700 hover:bg-gray-200 rounded disabled:opacity-30">
                                            <span className="material-symbols-outlined text-[10px]">keyboard_arrow_down</span>
                                        </button>
                                    </div>
                                    <button onClick={() => removeSavedSearch(search.id)} className="p-1 text-red-500 hover:bg-red-50 rounded" title="מחק">
                                        <span className="material-symbols-outlined text-sm">delete</span>
                                    </button>
                                </div>
                            </div>
                        )})
                    ) : (
                        <div className="text-center text-gray-500 py-2 text-xs">אין חיפושים שמורים</div>
                    )}
                </div>

                <button 
                    onClick={() => setView('main')}
                    className="w-full mt-2 flex items-center justify-center gap-2 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors text-xs font-medium"
                >
                    <span className="material-symbols-outlined text-xs">arrow_forward</span>
                    חזרה לחיפוש רגיל
                </button>
            </div>
          )}

          {view === 'add' && (
            <div className="space-y-3">
                <div>
                    <label className="block text-xs font-bold text-on-surface mb-1">שם החיפוש (אופציונלי):</label>
                    <input
                        type="text"
                        value={newLabel}
                        onChange={(e) => setNewLabel(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-surface-variant rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-xs"
                        placeholder="לדוגמה: הסרת סוגריים"
                    />
                </div>
                <div>
                    <div className="flex justify-between items-center mb-1">
                        <div className="flex items-center gap-2">
                             <label className="block text-xs font-bold text-on-surface">טקסט לחיפוש:</label>
                             <label className="flex items-center gap-1 cursor-pointer select-none">
                                <input 
                                    type="checkbox" 
                                    checked={newIsRegex} 
                                    onChange={(e) => setNewIsRegex(e.target.checked)}
                                    className="w-3 h-3 rounded border-gray-300 text-primary focus:ring-primary"
                                />
                                <span className="text-[10px] text-gray-500">Regex</span>
                            </label>
                        </div>
                        <button onClick={() => setNewFind(prev => prev + '^13')} className="text-[10px] bg-gray-50 hover:bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded border border-gray-200 flex items-center gap-1">
                            <span className="material-symbols-outlined text-[10px]">keyboard_return</span>
                            (^13)
                        </button>
                    </div>
                    <input
                        type="text"
                        value={newFind}
                        onChange={(e) => setNewFind(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-surface-variant rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-xs"
                        dir={newIsRegex ? "ltr" : "rtl"}
                    />
                </div>
                <div>
                    <div className="flex justify-between items-center mb-1">
                        <label className="block text-xs font-bold text-on-surface">טקסט להחלפה:</label>
                        <button onClick={() => setNewReplace(prev => prev + '^13')} className="text-[10px] bg-gray-50 hover:bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded border border-gray-200 flex items-center gap-1">
                            <span className="material-symbols-outlined text-[10px]">keyboard_return</span>
                        </button>
                    </div>
                    <input
                        type="text"
                        value={newReplace}
                        onChange={(e) => setNewReplace(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-surface-variant rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-xs"
                        dir={newIsRegex ? "ltr" : "rtl"}
                    />
                </div>

                <div className="flex gap-2 pt-2">
                     <button 
                        onClick={() => setView('list')}
                        className="flex-1 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 font-bold text-xs"
                    >
                        ביטול
                    </button>
                    <button 
                        onClick={() => {
                            if (!newFind) return alert('חובה להזין טקסט לחיפוש');
                            addSavedSearch(newLabel, newFind, newReplace, newIsRegex);
                            setView('list');
                        }}
                        className="flex-1 px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-bold text-xs"
                    >
                        שמור
                    </button>
                </div>

                <div className="my-3 border-t border-gray-100 relative">
                    <span className="absolute top-[-8px] left-1/2 -translate-x-1/2 bg-white px-2 text-[10px] text-gray-400">או</span>
                </div>

                <button 
                    onClick={() => {
                        if (onAddRemoveDigitsToSaved) {
                            onAddRemoveDigitsToSaved();
                            setView('list');
                        } else {
                            alert("פונקציה זו טרם הוטמעה בקומפוננטת האב");
                        }
                    }}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-red-50 text-red-700 rounded-md hover:bg-red-100 font-bold border border-red-100 transition-colors text-xs"
                >
                     <span className="text-[10px] font-bold line-through bg-red-100 border-red-200 border px-1 rounded">123</span>
                     הוסף פעולת "ניקוי ספרות" לרשימה
                </button>

            </div>
          )}

        </div>
      </div>,
    document.body
  )
}