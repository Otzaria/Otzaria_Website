'use client'

import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import FormInput from '@/components/ui/FormInput'

export default function CreateHeadersModal({ isOpen, onClose, content, onContentChange }) {
  const [findWord, setFindWord] = useState('דף')
  const [endNumber, setEndNumber] = useState(999)
  const [level, setLevel] = useState(2)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState('')

  const handleSubmit = () => {
    setResult('')
    setLoading(true)
    
    try {
      // הסרת תגי HTML מטקסט
      const htmlTags = ["<b>", "</b>", "<big>", "</big>", ":", '"', ",", ";", "[", "]", "(", ")", "'", "״", ".", "‚"]
      const stripTags = (text) => {
        let result = text
        htmlTags.forEach(tag => {
          result = result.split(tag).join('')
        })
        return result.trim()
      }
      
      // בדיקה אם מספר עברי תקין
      const isGematria = (text, maxValue) => {
        const hebrewNumerals = {
          'א': 1, 'ב': 2, 'ג': 3, 'ד': 4, 'ה': 5, 'ו': 6, 'ז': 7, 'ח': 8, 'ט': 9,
          'י': 10, 'כ': 20, 'ך': 20, 'ל': 30, 'מ': 40, 'ם': 40, 'נ': 50, 'ן': 50, 
          'ס': 60, 'ע': 70, 'פ': 80, 'ף': 80, 'צ': 90, 'ץ': 90,
          'ק': 100, 'ר': 200, 'ש': 300, 'ת': 400
        }
        
        let value = 0
        for (let char of text) {
          if (hebrewNumerals[char]) {
            value += hebrewNumerals[char]
          } else if (!/['"״׳]/.test(char)) {
            return false // תו לא חוקי
          }
        }
        return value > 0 && value < maxValue
      }
      
      const findClean = stripTags(findWord)
      const lines = content.split('\n')
      const allLines = []
      let count = 0
      let i = 0
      
      while (i < lines.length) {
        const line = lines[i]
        const words = line.split(/\s+/).filter(Boolean)
        
        try {
          // מקרה 1: שתי מילים או יותר בשורה
          if (words.length >= 2 && stripTags(words[0]) === findClean && isGematria(stripTags(words[1]), endNumber + 1)) {
            count++
            const headingLine = `<h${level}>${stripTags(words[0])} ${stripTags(words[1])}</h${level}>`
            allLines.push(headingLine)
            if (words.length > 2) {
              allLines.push(words.slice(2).join(' '))
            }
          }
          // מקרה 2: מילה אחת בשורה והמספר בשורה הבאה
          else if (words.length === 1 && stripTags(words[0]) === findClean && i + 1 < lines.length) {
            const nextLine = lines[i + 1]
            const nextWords = nextLine.split(/\s+/).filter(Boolean)
            
            if (nextWords.length >= 1 && isGematria(stripTags(nextWords[0]), endNumber + 1)) {
              count++
              const headingLine = `<h${level}>${stripTags(words[0])} ${stripTags(nextWords[0])}</h${level}>`
              allLines.push(headingLine)
              if (nextWords.length > 1) {
                allLines.push(nextWords.slice(1).join(' '))
              }
              i++ // דלג על השורה הבאה
            } else {
              allLines.push(line)
            }
          } else {
            allLines.push(line)
          }
        } catch (error) {
          allLines.push(line)
        }
        
        i++
      }
      
      if (count > 0) {
        setResult(`נוצרו ${count} כותרות בהצלחה!`)
        onContentChange(allLines.join('\n'))
        setTimeout(() => {
          onClose()
          setResult('')
        }, 1500)
      } else {
        setResult('לא נמצאו תוצאות תואמות')
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
      title="יצירת כותרות"
      size="md"
    >
      <div className="space-y-4">
        <div className="bg-blue-50 p-4 rounded-lg text-sm text-gray-700 space-y-2">
          <p>בתיבת 'מילה לחפש' יש לבחור או להקליד את המילה בה אנו רוצים שתתחיל הכותרת.</p>
          <p>לדוג': פרק/פסוק/סימן/סעיף/הלכה/שאלה/עמוד/סק/ענף</p>
          <p className="font-bold text-red-600">שים לב!</p>
          <p>אין להקליד רווח אחרי המילה, וכן אין להקליד את התו גרש (') או גרשיים (") וכן אין להקליד יותר ממילה אחת</p>
        </div>

        <FormInput
          label="מילה לחיפוש"
          value={findWord}
          onChange={(e) => setFindWord(e.target.value)}
          placeholder="דף"
        />

        <div className="grid grid-cols-2 gap-4">
          <FormInput
            label="עד מספר"
            type="number"
            value={endNumber}
            onChange={(e) => setEndNumber(parseInt(e.target.value) || 0)}
          />
          
          <FormInput
            label="רמת כותרת"
            type="number"
            value={level}
            onChange={(e) => {
              const val = parseInt(e.target.value) || 2;
              setLevel(Math.min(Math.max(val, 1), 6));
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

