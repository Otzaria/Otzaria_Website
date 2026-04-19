'use client'

import { useState } from 'react'
import { useDialog } from '@/components/providers/DialogContext'

export default function SplitBookDialog({ book, onClose, onSuccess }) {
  const { showAlert, showConfirm } = useDialog()
  
  const [splitPosition, setSplitPosition] = useState(Math.floor((book?.content?.length || 0) / 2))
  const [firstBookTitle, setFirstBookTitle] = useState(`${book?.title} - חלק א`)
  const [secondBookTitle, setSecondBookTitle] = useState(`${book?.title} - חלק ב`)
  const [splitting, setSplitting] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [viewMode, setViewMode] = useState('preview') // 'preview' or 'full'

  const findNearestLineBreak = (content, position) => {
    const before = content.lastIndexOf('\n', position)
    const after = content.indexOf('\n', position)
    
    if (before === -1) return after !== -1 ? after : position
    if (after === -1) return before
    
    const distBefore = position - before
    const distAfter = after - position
    
    return distBefore < distAfter ? before : after
  }

  const findNearestParagraph = (content, position) => {
    const before = content.lastIndexOf('\n\n', position)
    const after = content.indexOf('\n\n', position)
    
    if (before === -1) return after !== -1 ? after : position
    if (after === -1) return before
    
    const distBefore = position - before
    const distAfter = after - position
    
    return distBefore < distAfter ? before : after
  }

  const handleSnapToLine = () => {
    if (!book?.content) return
    const newPos = findNearestLineBreak(book.content, splitPosition)
    setSplitPosition(newPos)
  }

  const handleSnapToParagraph = () => {
    if (!book?.content) return
    const newPos = findNearestParagraph(book.content, splitPosition)
    setSplitPosition(newPos)
  }

  const handleSearchAndSplit = () => {
    if (!book?.content || !searchText.trim()) return
    const index = book.content.indexOf(searchText)
    if (index !== -1) {
      setSplitPosition(index)
      setSearchText('')
    } else {
      showAlert('לא נמצא', 'הטקסט שחיפשת לא נמצא בספר')
    }
  }

  const handleClickOnLine = (lineIndex) => {
    if (!book?.content) return
    const lines = book.content.split('\n')
    let position = 0
    for (let i = 0; i < lineIndex; i++) {
      position += lines[i].length + 1
    }
    setSplitPosition(position)
  }

  const handleConfirmSplit = () => {
    if (!firstBookTitle.trim() || !secondBookTitle.trim()) {
      showAlert('שגיאה', 'יש להזין שמות לשני הספרים')
      return
    }
    
    showConfirm(
      'אישור פיצול ספר',
      `האם אתה בטוח שברצונך לפצל את הספר "${book.title}" ל-2 ספרים נפרדים? הספר המקורי יימחק.`,
      async () => {
        try {
          setSplitting(true)
          const response = await fetch('/api/dicta/books/split', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              bookId: book._id,
              splitPosition,
              firstBookTitle,
              secondBookTitle
            })
          })
          
          const data = await response.json()
          
          if (response.ok) {
            showAlert('הצלחה', data.message || 'הספר פוצל בהצלחה!')
            onSuccess()
            onClose()
          } else {
            showAlert('שגיאה', data.error || 'שגיאה בפיצול הספר')
          }
        } catch (e) {
          console.error(e)
          showAlert('שגיאה', 'שגיאה בפיצול הספר')
        } finally {
          setSplitting(false)
        }
      }
    )
  }

  if (!book) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200 h-screen w-screen">
      <div 
        className="bg-white rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden relative max-h-[90vh] flex flex-col" 
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 border-b bg-purple-50 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-purple-600">call_split</span>
            <h3 className="font-bold text-lg text-gray-800">פיצול ספר ל-2 ספרים</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-200 p-1">
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto flex-1">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">ספר מקורי</label>
            <div className="w-full p-3 bg-gray-50 rounded-lg text-gray-600 border border-gray-200 font-bold">
              {book.title}
            </div>
          </div>

          <div className="bg-yellow-50 border-2 border-yellow-200 rounded-xl p-4 mb-6">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-yellow-600 mt-0.5">warning</span>
              <div className="text-sm text-yellow-800">
                <p className="font-bold mb-1">שים לב!</p>
                <ul className="space-y-1">
                  <li>• הספר המקורי יימחק ובמקומו ייווצרו 2 ספרים חדשים</li>
                  <li>• הספר הראשון ישמור את הסטטוס והבעלות של הספר המקורי</li>
                  <li>• הספר השני יהיה פנוי לעריכה</li>
                  <li>• פעולה זו אינה הפיכה</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">שם הספר הראשון</label>
              <input
                type="text"
                value={firstBookTitle}
                onChange={(e) => setFirstBookTitle(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                placeholder="שם לחלק הראשון"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">שם הספר השני</label>
              <input
                type="text"
                value={secondBookTitle}
                onChange={(e) => setSecondBookTitle(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                placeholder="שם לחלק השני"
              />
            </div>
          </div>

          {/* כפתורי תצוגה */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setViewMode('preview')}
              className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                viewMode === 'preview'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              תצוגה מקדימה
            </button>
            <button
              onClick={() => setViewMode('full')}
              className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                viewMode === 'full'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              תצוגה מלאה (בחר שורה)
            </button>
          </div>

          {viewMode === 'preview' ? (
            <PreviewMode
              book={book}
              splitPosition={splitPosition}
              setSplitPosition={setSplitPosition}
              searchText={searchText}
              setSearchText={setSearchText}
              handleSnapToLine={handleSnapToLine}
              handleSnapToParagraph={handleSnapToParagraph}
              handleSearchAndSplit={handleSearchAndSplit}
            />
          ) : (
            <FullViewMode
              book={book}
              splitPosition={splitPosition}
              handleClickOnLine={handleClickOnLine}
            />
          )}
        </div>

        <div className="p-6 border-t bg-gray-50">
          <div className="flex justify-end gap-3">
            <button 
              onClick={onClose}
              disabled={splitting}
              className="px-5 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ביטול
            </button>
            <button 
              onClick={handleConfirmSplit}
              disabled={splitting}
              className="px-5 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium shadow-sm transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {splitting ? (
                <>
                  <span className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span>
                  <span>מפצל...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-sm">call_split</span>
                  <span>פצל ספר</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function PreviewMode({ 
  book, 
  splitPosition, 
  setSplitPosition, 
  searchText, 
  setSearchText,
  handleSnapToLine,
  handleSnapToParagraph,
  handleSearchAndSplit
}) {
  return (
    <>
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-gray-700">
            מיקום הפיצול (תו {splitPosition.toLocaleString()} מתוך {(book.content?.length || 0).toLocaleString()})
          </label>
          <input
            type="number"
            min="0"
            max={book.content?.length || 0}
            value={splitPosition}
            onChange={(e) => setSplitPosition(Math.max(0, Math.min(parseInt(e.target.value) || 0, book.content?.length || 0)))}
            className="w-24 px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-purple-500 outline-none"
          />
        </div>
        <input
          type="range"
          min="0"
          max={book.content?.length || 0}
          value={splitPosition}
          onChange={(e) => setSplitPosition(parseInt(e.target.value))}
          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
        />
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>התחלה</span>
          <span>אמצע</span>
          <span>סוף</span>
        </div>
        <div className="flex gap-2 mt-3">
          <button
            onClick={handleSnapToLine}
            className="flex-1 px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors text-sm font-medium flex items-center justify-center gap-1"
          >
            <span className="material-symbols-outlined text-sm">format_align_right</span>
            <span>התאם לשורה הקרובה</span>
          </button>
          <button
            onClick={handleSnapToParagraph}
            className="flex-1 px-3 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors text-sm font-medium flex items-center justify-center gap-1"
          >
            <span className="material-symbols-outlined text-sm">format_paragraph</span>
            <span>התאם לפסקה הקרובה</span>
          </button>
        </div>
      </div>

      {/* חיפוש טקסט */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">חפש טקסט ופצל שם</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearchAndSplit()}
            className="flex-1 p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-sm"
            placeholder="הזן טקסט לחיפוש..."
          />
          <button
            onClick={handleSearchAndSplit}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium"
          >
            חפש
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <BookPreview
          title="ספר ראשון"
          content={book.content?.substring(0, splitPosition).trim()}
          status={book.status}
          claimedBy={book.claimedBy}
          color="blue"
        />
        
        <BookPreview
          title="ספר שני"
          content={book.content?.substring(splitPosition).trim()}
          status="available"
          color="green"
        />
      </div>
    </>
  )
}

function FullViewMode({ book, splitPosition, handleClickOnLine }) {
  return (
    <>
      <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
        <div className="flex items-center gap-2 text-sm text-blue-800">
          <span className="material-symbols-outlined text-blue-600">info</span>
          <p>לחץ על שורה כדי לבחור אותה כמיקום הפיצול. השורה שנבחרה תהיה השורה הראשונה של הספר השני.</p>
        </div>
      </div>

      <div className="border border-gray-300 rounded-lg overflow-hidden bg-white">
        <div className="max-h-96 overflow-y-auto">
          {book.content?.split('\n').map((line, index) => {
            const lineStartPos = book.content.split('\n').slice(0, index).join('\n').length + (index > 0 ? 1 : 0)
            const isSelected = Math.abs(lineStartPos - splitPosition) < 10
            const isBefore = lineStartPos < splitPosition
            
            return (
              <div
                key={index}
                onClick={() => handleClickOnLine(index)}
                className={`px-4 py-2 cursor-pointer transition-colors border-b border-gray-100 hover:bg-purple-50 ${
                  isSelected 
                    ? 'bg-purple-200 border-l-4 border-l-purple-600 font-bold' 
                    : isBefore 
                      ? 'bg-blue-50' 
                      : 'bg-green-50'
                }`}
                dir="rtl"
              >
                <span className="text-xs text-gray-400 mr-2 select-none">{index + 1}</span>
                <span className="text-sm font-mono">{line || '\u00A0'}</span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <div className="font-bold text-blue-800 mb-1 flex items-center gap-2">
            <span>ספר ראשון</span>
            {book.status === 'in-progress' && (
              <span className="text-xs bg-orange-100 text-orange-800 px-2 py-0.5 rounded-full">בעריכה</span>
            )}
            {book.status === 'available' && (
              <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">פנוי</span>
            )}
          </div>
          <div className="text-blue-700">
            {(book.content?.substring(0, splitPosition).trim().split('\n').length || 0).toLocaleString()} שורות
          </div>
          {book.claimedBy && (
            <div className="text-xs text-blue-600 mt-1">נערך ע"י: {book.claimedBy.name}</div>
          )}
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
          <div className="font-bold text-green-800 mb-1 flex items-center gap-2">
            <span>ספר שני</span>
            <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">פנוי</span>
          </div>
          <div className="text-green-700">
            {(book.content?.substring(splitPosition).trim().split('\n').length || 0).toLocaleString()} שורות
          </div>
        </div>
      </div>
    </>
  )
}

function BookPreview({ title, content, status, claimedBy, color }) {
  const bgColor = color === 'blue' ? 'bg-blue-50' : 'bg-green-50'
  const textColor = color === 'blue' ? 'text-blue-600' : 'text-green-600'
  const titleColor = color === 'blue' ? 'text-blue-800' : 'text-green-800'
  
  return (
    <div className={`border border-gray-200 rounded-lg p-4 ${bgColor}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className={`material-symbols-outlined ${textColor} text-sm`}>book</span>
        <h4 className={`font-bold text-sm ${titleColor}`}>{title}</h4>
        {status === 'in-progress' && (
          <span className="text-xs bg-orange-100 text-orange-800 px-2 py-0.5 rounded-full">בעריכה</span>
        )}
        {status === 'available' && (
          <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">פנוי</span>
        )}
      </div>
      <div className="text-xs text-gray-600 mb-2 space-y-1">
        <div>{(content?.length || 0).toLocaleString()} תווים</div>
        <div>{(content?.split('\n').length || 0).toLocaleString()} שורות</div>
        <div>{(content?.split('\n\n').length || 0).toLocaleString()} פסקאות</div>
        {claimedBy && (
          <div className="text-blue-700 font-medium">נערך ע"י: {claimedBy.name}</div>
        )}
      </div>
      <div className="bg-white rounded p-3 text-xs text-gray-700 max-h-40 overflow-y-auto font-mono leading-relaxed" dir="rtl">
        {content?.substring(0, 500) || ''}
        {(content?.length || 0) > 500 && '...'}
      </div>
    </div>
  )
}

