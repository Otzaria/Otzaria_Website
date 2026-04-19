'use client'

import { useState } from 'react'
import Modal from '@/components/ui/Modal'

export default function AddPageNumberModal({ isOpen, onClose, content, onContentChange }) {
  const [replaceWith, setReplaceWith] = useState('נקודה ונקודותיים')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState('')

  const handleSubmit = () => {
    setResult('')
    setLoading(true)
    
    try {
      const lines = content.split('\n')
      let changesMade = false
      const updated = []
      let i = 0
      
      while (i < lines.length) {
        const line = lines[i]
        const match = line.match(/<h([2-9])>(דף \S+)<\/h\1>/)
        
        if (match) {
          const level = match[1]
          const title = match[2]
          const nextLineIndex = i + 1
          
          if (nextLineIndex < lines.length) {
            const nextLine = lines[nextLineIndex].trim()
            // דפוס מורכב יותר שתופס גם תגים
            const pattern = /(<[a-z]+>)?(ע["']+?[אב]|עמוד [אב])[.,:()\[\]'"״׳]?(<\/[a-z]+>)?\s?/
            const matchNextLine = nextLine.match(pattern)
            
            if (matchNextLine) {
              changesMade = true
              let newTitle = line
              
              if (replaceWith === "נקודה ונקודותיים") {
                if (matchNextLine[2].includes("א")) {
                  newTitle = `<h${level}>${title.replace(/\.+$/, "")}.</h${level}>`
                } else {
                  newTitle = `<h${level}>${title.replace(/\.+$/, "")}:</h${level}>`
                }
              } else if (replaceWith === 'ע"א וע"ב') {
                const suffix = matchNextLine[2].includes("א") ? 'ע"א' : 'ע"ב'
                newTitle = `<h${level}>${title.replace(/\.+$/, "")} ${suffix}</h${level}>`
              }
              
              updated.push(newTitle)
              
              // הסרת הדפוס מהשורה הבאה
              const modifiedNext = nextLine.replace(pattern, "").trim()
              if (modifiedNext !== "") {
                updated.push(modifiedNext)
              }
              
              i += 1 // דילוג על השורה הבאה
            } else {
              updated.push(line)
            }
          } else {
            updated.push(line)
          }
        } else {
          updated.push(line)
        }
        
        i += 1
      }
      
      if (changesMade) {
        const newContent = updated.join('\n')
        const count = updated.length - lines.length + (lines.length - updated.length)
        setResult('ההחלפה הושלמה בהצלחה!')
        onContentChange(newContent)
        setTimeout(() => {
          onClose()
          setResult('')
        }, 1500)
      } else {
        setResult('אין מה להחליף בקובץ זה')
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
      title="מיזוג מספרי דפים"
      size="md"
    >
      <div className="space-y-4">
        <div className="bg-blue-50 p-4 rounded-lg text-sm text-gray-700">
          <p>כלי זה מחפש כותרות "דף X" ואחריהן שורה עם "עמוד א/ב", וממזג אותם לכותרת אחת.</p>
          <p className="mt-2 font-bold">דוגמה:</p>
          <p className="opacity-70">&lt;h2&gt;דף כ&lt;/h2&gt;</p>
          <p className="opacity-70">עמוד א</p>
          <p className="mt-1 font-bold">יהפוך ל:</p>
          <p className="opacity-70">&lt;h2&gt;דף כ.&lt;/h2&gt;</p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">פורמט המיזוג</label>
          <select
            value={replaceWith}
            onChange={(e) => setReplaceWith(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="נקודה ונקודותיים">נקודה (.) לעמוד א' / נקודותיים (:) לעמוד ב'</option>
            <option value='ע"א וע"ב'>הוספת הסיומת ע"א / ע"ב</option>
          </select>
        </div>

        {result && (
          <div className={`p-3 rounded ${result.includes('שגיאה') || result.includes('אין') ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-700'}`}>
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
