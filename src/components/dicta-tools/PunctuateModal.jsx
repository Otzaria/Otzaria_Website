'use client'

import { useState } from 'react'
import Modal from '@/components/ui/Modal'

export default function PunctuateModal({ isOpen, onClose, content, onContentChange }) {
  const [addEnding, setAddEnding] = useState('הוסף נקודה')
  const [emphasizeStart, setEmphasizeStart] = useState(true)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState('')

  const handleSubmit = () => {
    setResult('')
    setLoading(true)
    
    try {
      let newContent = content
      let changed = false
      
      // פיצול לשורות
      const lines = newContent.split('\n')
      const processedLines = lines.map(line => {
        let processedLine = line.replace(/\r$/, '')
        const words = processedLine.split(/\s+/).filter(Boolean)
        
        // בדיקה שיש יותר מ-10 מילים ושזו לא כותרת
        if (words.length > 10 && !/<h[2-8]>/.test(processedLine)) {
          // הוספת סימן בסוף אם אין
          if (addEnding !== 'ללא שינוי') {
            if (processedLine.endsWith(',')) {
              processedLine = processedLine.slice(0, -1)
              processedLine += addEnding === 'הוסף נקודה' ? '.' : ':'
              changed = true
            } else if (!/[.!?:]$/.test(processedLine) && !['</small>', '</big>', '</b>'].some(tag => processedLine.endsWith(tag))) {
              processedLine += addEnding === 'הוסף נקודה' ? '.' : ':'
              changed = true
            }
          }
          
          // הדגשת המילה הראשונה
          if (emphasizeStart) {
            const firstWord = words[0]
            if (!['<b>', '<small>', '<big>', '<h2>', '<h3>', '<h4>', '<h5>', '<h6>'].some(tag => firstWord.includes(tag))) {
              if (!(firstWord.startsWith('<') && firstWord.endsWith('>'))) {
                processedLine = `<b>${firstWord}</b> ${words.slice(1).join(' ')}`
                changed = true
              }
            }
          }
        }
        
        return processedLine
      })
      
      if (changed) {
        newContent = processedLines.join('\n')
        setResult('השינויים בוצעו בהצלחה!')
        onContentChange(newContent)
        setTimeout(() => {
          onClose()
          setResult('')
        }, 1500)
      } else {
        setResult('לא בוצעו שינויים')
      }
    } catch (error) {
      setResult('שגיאה בביצוע הפעולה')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setResult('')
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="הדגשה וניקוד"
      size="md"
    >
      <div className="space-y-4">
        <div className="bg-blue-50 p-4 rounded-lg text-sm text-gray-700">
          <p>כלי זה מוסיף נקודה או נקודותיים בסוף שורות ארוכות ומדגיש את המילה הראשונה.</p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">הוספת סימן בסוף</label>
          <select
            value={addEnding}
            onChange={(e) => setAddEnding(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="הוסף נקודה">הוסף נקודה</option>
            <option value="הוסף נקודותיים">הוסף נקודותיים</option>
            <option value="ללא שינוי">ללא שינוי</option>
          </select>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={emphasizeStart}
            onChange={(e) => setEmphasizeStart(e.target.checked)}
            className="w-4 h-4"
          />
          <span>הדגש את המילה הראשונה בשורה</span>
        </label>

        {result && (
          <div className={`p-3 rounded ${result.includes('שגיאה') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
            {result}
          </div>
        )}

        <div className="flex gap-3 pt-4">
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 bg-primary text-white px-6 py-2.5 rounded-lg hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'מעבד...' : 'הפעל'}
          </button>
          <button
            onClick={handleClose}
            className="px-6 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            סגור
          </button>
        </div>
      </div>
    </Modal>
  )
}

