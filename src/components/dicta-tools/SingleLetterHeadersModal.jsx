'use client'

import { useState } from 'react'
import Modal from '@/components/Modal'
import FormInput from '@/components/FormInput'

const GEMATRIA_REMOVE_TOKENS = ["<b>", "</b>", "<big>", "</big>", "<i>", "</i>", "</small>", "</small>", "<span>", "</span>", "<br>", "</br>", "<p>", "</p>", ":", '"', ",", ";", "[", "]", "(", ")", "{", "}", ".", "'", "״", "”", "’", "׳", "‘", "„", "`", "´", "“", "❝", "❞", "ˮ", "″", "ʺ", "ˈ", "´", "ʹ", "′", "ʾ", "ʽ"]
const GEMATRIA_AA = ["ק", "ר", "ש", "ת", "תק", "תר", "תש", "תת", "תתק", "יה", "יו", "קיה", "קיו", "ריה", "ריו", "שיה", "שיו", "תיה", "תיו", "תקיה", "תקיו", "תריה", "תריו", "תשיה", "תשיו", "תתיה", "תתיו", "תתקיה", "תתקיו"]
const GEMATRIA_BB = ["ם", "ן", "ץ", "ף", "ך"]
const GEMATRIA_CC = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "ששי", "שביעי", "שמיני", "תשיעי", "עשירי", "חי", "יוד", "למד", "נון", "טל", "דש", "שדמ", "ער", "שדם", "תשדם", "תשדמ", "ערה", "ערב", "עדר", "רחצ"]
const GEMATRIA_APPEND_LIST = GEMATRIA_AA.flatMap(item => GEMATRIA_BB.map(suffix => item + suffix))
const GEMATRIA_CACHE = new Map()

function toHebrewGematria(num) {
  if (num <= 0) return ''

  let remaining = num
  let result = ''
  const values = [400, 300, 200, 100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]
  const letters = ["ת", "ש", "ר", "ק", "צ", "פ", "ע", "ס", "נ", "מ", "ל", "כ", "י", "ט", "ח", "ז", "ו", "ה", "ד", "ג", "ב", "א"]

  for (let i = 0; i < values.length; i++) {
    while (remaining >= values[i]) {
      if (remaining === 15) {
        result += 'טו'
        remaining = 0
        break
      }
      if (remaining === 16) {
        result += 'טז'
        remaining = 0
        break
      }
      result += letters[i]
      remaining -= values[i]
    }
  }

  return result
}

function getGematriaSet(maxValue) {
  if (!GEMATRIA_CACHE.has(maxValue)) {
    const withoutGershayim = Array.from({ length: maxValue - 1 }, (_, i) => toHebrewGematria(i + 1))
      .concat(GEMATRIA_BB, GEMATRIA_CC, GEMATRIA_APPEND_LIST, GEMATRIA_AA)
    GEMATRIA_CACHE.set(maxValue, new Set(withoutGershayim))
  }

  return GEMATRIA_CACHE.get(maxValue)
}

function escapeHtml(text) {
  return text.replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export default function SingleLetterHeadersModal({ isOpen, onClose, content, onContentChange }) {
  const [startChar, setStartChar] = useState('')
  const [endChar, setEndChar] = useState('')
  const [level, setLevel] = useState(3)
  const [maxNum, setMaxNum] = useState(999)
  const [ignoreTags, setIgnoreTags] = useState('<big> </big> <i> </i> <small> </small> <span> </span> <br> </br> <p> </p>')
  const [removeTags, setRemoveTags] = useState(', : " \' . ( ) [ ] { }')
  const [boldOnly, setBoldOnly] = useState(true)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState('')

  const handleSubmit = () => {
    setResult('')
    setLoading(true)
    
    try {
      const ignoreArray = ignoreTags.split(' ').filter(Boolean)
      const removeArray = removeTags.split(' ').filter(Boolean)
      const fixedRemoveTags = [
        '<b>', '</b>', '<big>', '</big>', '<i>', '</i>', '</small>', '<span>', '</span>', '<br>', '</br>', '<p>', '</p>'
      ]
      const fullRemoveArray = fixedRemoveTags.concat(removeArray)
      
      // פונקציה להסרת תגים
      const stripHtml = (text, tagsToRemove) => {
        let result = text
        tagsToRemove.forEach(tag => {
          result = result.split(tag).join('')
        })
        return result
      }

      // פונקציה לבדיקת גימטריה
      const isGematria = (text, maxValue) => {
        let cleaned = text
        GEMATRIA_REMOVE_TOKENS.forEach(tag => {
          cleaned = cleaned.replaceAll(tag, '')
        })
        return getGematriaSet(maxValue).has(cleaned)
      }
      
      // הגדרת סיומת וסימן התחלה
      let localEndSuffix = endChar
      let localStart = startChar
      let localIgnore = [...ignoreArray]
      
      if (boldOnly) {
        localEndSuffix += '</b>'
        localStart = `<b>${localStart}`
      } else {
        localIgnore = localIgnore.concat(['<b>', '</b>'])
      }
      
      const lines = content.split('\n')
      const allLines = lines.slice(0, 1) // שמירת השורה הראשונה
      let count = 0
      
      for (const line of lines.slice(1)) {
        const words = line.split(/\s+/).filter(Boolean)
        
        try {
          if (words.length > 0) {
            const firstWord = words[0]
            const stripped = stripHtml(firstWord, localIgnore)
            
            // בדיקה אם המילה הראשונה מסתיימת בסיומת הנדרשת
            if (stripped.endsWith(localEndSuffix) && 
                stripped.startsWith(localStart)) {
              
              // הסרת תו התחלה והסוף לבדיקת גימטריה
              let textForGematria = stripped
              if (localStart && textForGematria.startsWith(localStart)) {
                textForGematria = textForGematria.slice(localStart.length)
              }
              if (localEndSuffix && textForGematria.endsWith(localEndSuffix)) {
                textForGematria = textForGematria.slice(0, -localEndSuffix.length)
              }
              
              // הסרת תגי <b> ו-</b> אם נשארו (במקרה של boldOnly)
              textForGematria = textForGematria.replace(/<\/?b>/g, '')
              
              // בדיקת גימטריה על הטקסט הנקי
              if (isGematria(textForGematria, maxNum + 1)) {
                const cleanWord = escapeHtml(stripHtml(firstWord, fullRemoveArray))
                const headingLine = `<h${level}>${cleanWord}</h${level}>`
                allLines.push(headingLine)
                
                if (words.length > 1) {
                  allLines.push(words.slice(1).join(' '))
                }
                count++
              } else {
                allLines.push(line)
              }
            } else {
              allLines.push(line)
            }
          } else {
            allLines.push(line)
          }
        } catch (error) {
          allLines.push(line)
        }
      }
      
      if (count > 0) {
        const newContent = allLines.join('\n')
        setResult(`נוצרו ${count} כותרות בהצלחה!`)
        onContentChange(newContent)
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
      title="כותרות אותיות"
      size="lg"
    >
      <div className="space-y-4">
        <div className="bg-red-50 p-4 rounded-lg text-sm text-red-700 font-bold">
          ⚠️ מומלץ מאוד ליצור גיבוי של הספר לפני הפעלת כלי זה!
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormInput
            label="תו התחלה"
            value={startChar}
            onChange={(e) => setStartChar(e.target.value)}
            placeholder='למשל: "["'
          />
          
          <FormInput
            label="תו סוף"
            value={endChar}
            onChange={(e) => setEndChar(e.target.value)}
            placeholder='למשל: "."'
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormInput
            label="רמת כותרת"
            type="number"
            value={level}
            onChange={(e) => setLevel(parseInt(e.target.value) || 3)}
          />
          
          <FormInput
            label="מקסימום"
            type="number"
            value={maxNum}
            onChange={(e) => setMaxNum(parseInt(e.target.value) || 999)}
          />
        </div>

        <FormInput
          label="התעלם מ:"
          value={ignoreTags}
          onChange={(e) => setIgnoreTags(e.target.value)}
        />

        <FormInput
          label="הסר:"
          value={removeTags}
          onChange={(e) => setRemoveTags(e.target.value)}
        />

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={boldOnly}
            onChange={(e) => setBoldOnly(e.target.checked)}
            className="w-4 h-4"
          />
          <span>לחפש מודגש בלבד</span>
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
