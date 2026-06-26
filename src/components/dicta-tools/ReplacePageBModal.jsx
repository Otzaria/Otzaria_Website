'use client'

import { useState } from 'react'
import Modal from '@/components/ui/Modal'

export default function ReplacePageBModal({ isOpen, onClose, content, onContentChange }) {
  const [replaceType, setReplaceType] = useState('נקודותיים')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState('')

  const handleSubmit = () => {
    setResult('')
    setLoading(true)
    
    try {
      let newContent = content
      let previousTitle = ""
      let previousLevel = ""
      let replacementsMade = 0
      
      // החלפת כותרות "עמוד ב" בהתאם לכותרת הקודמת
      newContent = newContent.replace(/<h([1-9])>(.*?)<\/h\1>/g, (match, level, title) => {
        // אם זו כותרת דף - שמור אותה
        if (/^דף \S+\.?/.test(title)) {
          previousTitle = title.trim()
          previousLevel = level
          return match
        }
        
        // אם זו כותרת "עמוד ב" - החלף אותה
        if (title === "עמוד ב") {
          replacementsMade++
          
          if (replaceType === "נקודותיים") {
            return `<h${previousLevel}>${previousTitle.replace(/\.+$/, "")}:</h${previousLevel}>`
          }
          
          if (replaceType === 'ע"ב') {
            const modifiedTitle = previousTitle.replace(/( ע"א| עמוד א)/, "")
            return `<h${previousLevel}>${modifiedTitle.replace(/\.+$/, "")} ע"ב</h${previousLevel}>`
          }
        }
        
        return match
      })
      
      if (replacementsMade > 0) {
        setResult(`בוצעו ${replacementsMade} החלפות בהצלחה!`)
        onContentChange(newContent)
        setTimeout(() => {
          onClose()
          setResult('')
        }, 1500)
      } else {
        setResult('לא נמצאו כותרות "עמוד ב" להחלפה')
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
      title='החלפת כותרות "עמוד ב"'
      size="md"
    >
      <div className="space-y-4">
        <div className="bg-info-50 p-4 rounded-lg text-sm text-neutral-700">
          <p>כלי זה מחליף כותרות "עמוד ב" בפורמט מותאם.</p>
          <p className="mt-2">דורש הרצה מוקדמת של "יצירת כותרות עמוד ב".</p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">סוג החלפה</label>
          <select
            value={replaceType}
            onChange={(e) => setReplaceType(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-info-500 outline-none"
          >
            <option value="נקודותיים">נקודותיים (:)</option>
            <option value='ע"ב'>ע"ב</option>
          </select>
        </div>

        {result && (
          <div className={`p-3 rounded ${result.includes('שגיאה') ? 'bg-danger-100 text-danger-700' : 'bg-success-100 text-success-700'}`}>
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
            className="px-6 py-2.5 border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors"
          >
            סגור
          </button>
        </div>
      </div>
    </Modal>
  )
}

