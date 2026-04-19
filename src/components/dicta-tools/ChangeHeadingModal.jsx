'use client'

import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import FormInput from '@/components/ui/FormInput'

export default function ChangeHeadingModal({ isOpen, onClose, content, onContentChange }) {
  const [currentLevel, setCurrentLevel] = useState('2')
  const [newLevel, setNewLevel] = useState('3')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState('')

  const handleSubmit = () => {
    setResult('')
    setLoading(true)
    
    try {
      let newContent = content
      let count = 0
      
      // החלפת כל תגי הכותרת מהרמה הנוכחית לרמה החדשה
      const openTagRegex = new RegExp(`<h${currentLevel}>`, 'g')
      const closeTagRegex = new RegExp(`</h${currentLevel}>`, 'g')
      
      const matches = newContent.match(openTagRegex)
      count = matches ? matches.length : 0
      
      if (count > 0) {
        newContent = newContent.replace(openTagRegex, `<h${newLevel}>`)
        newContent = newContent.replace(closeTagRegex, `</h${newLevel}>`)
        
        setResult(`שונו ${count} כותרות מרמה ${currentLevel} לרמה ${newLevel}`)
        onContentChange(newContent)
        setTimeout(() => {
          onClose()
          setResult('')
        }, 1500)
      } else {
        setResult(`לא נמצאו כותרות ברמה ${currentLevel}`)
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
      title="שינוי רמת כותרת"
      size="md"
    >
      <div className="space-y-4">
        <div className="bg-blue-50 p-4 rounded-lg text-sm text-gray-700">
          <p>כלי זה משנה את רמת הכותרות מרמה אחת לאחרת.</p>
          <p className="mt-2">למשל: להמיר את כל כותרות ה-H2 ל-H3.</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormInput
            label="רמה נוכחית"
            type="number"
            value={currentLevel}
            onChange={(e) => {
              const val = parseInt(e.target.value) || 2;
              setCurrentLevel(Math.min(Math.max(val, 1), 6).toString());
            }}
            min="1"
            max="6"
            placeholder="1-6"
          />
          
          <FormInput
            label="רמה חדשה"
            type="number"
            value={newLevel}
            onChange={(e) => {
              const val = parseInt(e.target.value) || 3;
              setNewLevel(Math.min(Math.max(val, 1), 6).toString());
            }}
            min="1"
            max="6"
            placeholder="1-6"
          />
        </div>

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

