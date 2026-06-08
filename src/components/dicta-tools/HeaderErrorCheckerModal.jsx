'use client'

import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import FormInput from '@/components/ui/FormInput'

export default function HeaderErrorCheckerModal({ isOpen, onClose, content }) {
  const [reStart, setReStart] = useState('')
  const [reEnd, setReEnd] = useState('')
  const [gershayim, setGershayim] = useState(false)
  const [isShas, setIsShas] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState(null)

  const handleSubmit = () => {
    setErrors(null)
    setLoading(true)
    
    try {
      const result = {
        unmatched_regex: [],
        unmatched_tags: [],
        opening_without_closing: [],
        closing_without_opening: [],
        heading_errors: [],
        missing_levels: []
      }
      
      // פונקציה להמרת גימטריה למספר
      const toNumber = (text) => {
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
          }
        }
        return value
      }
      
      // בדיקת תגים פתוחים וסוגרים - לפי שורות כמו בקוד המקורי
      const lines = content.split('\n')
      lines.forEach((line, lineIndex) => {
        const allTags = []
        const tagRegex = /<(\/?[a-z]+\d?)>/gi
        let match
        
        while ((match = tagRegex.exec(line)) !== null) {
          const tagName = match[1]
          const position = match.index
          
          if (tagName.startsWith('/')) {
            allTags.push(['close', tagName.slice(1), position])
          } else {
            allTags.push(['open', tagName, position])
          }
        }
        
        // מיון לפי מיקום
        allTags.sort((a, b) => a[2] - b[2])
        
        const openStack = []
        for (const [tagType, tagName] of allTags) {
          if (tagType === 'open') {
            openStack.push(tagName)
          } else {
            // חיפוש תג פתוח תואם
            let found = false
            for (let i = openStack.length - 1; i >= 0; i--) {
              if (openStack[i] === tagName) {
                openStack.splice(i, 1)
                found = true
                break
              }
            }
            if (!found) {
              result.closing_without_opening.push(`שורה ${lineIndex + 1}: </${tagName}> || ${line.trim()}`)
            }
          }
        }
        
        // תגים שנשארו פתוחים בשורה זו
        openStack.forEach(tag => {
          result.opening_without_closing.push(`שורה ${lineIndex + 1}: <${tag}> || ${line.trim()}`)
        })
      })
      
      // בדיקת כותרות שלא לבד בשורה
      lines.forEach((line, lineIndex) => {
        const headingMatch = line.match(/<h[2-6]>.*?<\/h[2-6]>/)
        if (headingMatch) {
          const start = headingMatch.index
          const end = start + headingMatch[0].length
          const before = line.slice(0, start).trim()
          const after = line.slice(end).trim()
          
          if (before || after) {
            result.heading_errors.push(`שורה ${lineIndex + 1}: ${line.trim()}`)
          }
        }
      })
      
      // בניית regex לבדיקת כותרות
      let pattern
      if (reStart && reEnd) {
        pattern = new RegExp(`^[${escapeRegex(reStart)}]*[א-ת]([א-ת \\-]*[א-ת])?[${escapeRegex(reEnd)}]*$`)
      } else if (reStart) {
        pattern = new RegExp(`^[${escapeRegex(reStart)}]*[א-ת]([א-ת \\-]*[א-ת])?$`)
      } else if (reEnd) {
        pattern = new RegExp(`^[א-ת]([א-ת \\-]*[א-ת])?[${escapeRegex(reEnd)}]*$`)
      } else {
        // נבדק: לינארי — קבוצה אופציונלית בודדת (?), עוגן '$' חוסם נסיגה
        // eslint-disable-next-line security/detect-unsafe-regex
        pattern = new RegExp('^[א-ת]([א-ת \\-]*[א-ת])?$')
      }
      
      // בדיקת כותרות לפי סדר המסמך, כדי לא להשוות בין ענפים שונים בעץ הכותרות
      const headersByLevel = {}
      const orderedHeaders = []
      for (let level = 2; level <= 6; level++) {
        headersByLevel[level] = []
      }
      
      const headerRegex = /<h([2-6])>(.*?)<\/h\1>/g
      let headerMatch
      
      while ((headerMatch = headerRegex.exec(content)) !== null) {
        const level = parseInt(headerMatch[1])
        const headerContent = headerMatch[2].trim()
        const fullHeader = headerMatch[0]
        const headerEntry = { level, content: headerContent, full: fullHeader }
        
        headersByLevel[level].push(headerEntry)
        orderedHeaders.push(headerEntry)
      }
      
      // בדיקת רמות חסרות
      const usedLevels = Object.keys(headersByLevel).filter(level => headersByLevel[level].length > 0).map(Number)
      if (usedLevels.length > 0) {
        const maxLevel = Math.max(...usedLevels)
        for (let i = 2; i <= maxLevel; i++) {
          if (!usedLevels.includes(i)) {
            result.missing_levels.push(i)
          }
        }
      }
      
      const step = isShas ? 2 : 1
      const previousHeadersByLevel = {}

      for (const header of orderedHeaders) {
        const { level, content: headerText } = header

        // מעבר לרמה גבוהה יותר פותח ענף חדש ולכן מאפס את כל הרמות שמתחתיה
        for (let deeperLevel = level + 1; deeperLevel <= 6; deeperLevel++) {
          previousHeadersByLevel[deeperLevel] = null
        }

        // בדיקת regex
        if (pattern && !pattern.test(headerText)) {
          if (!(gershayim && (headerText.includes("'") || headerText.includes('"')))) {
            result.unmatched_regex.push(header.full)
          }
        }

        // חילוץ החלק המספרי
        const headerParts = headerText.split(' ')
        const currentHeading = headerParts.length > 1 ? headerParts[1] : headerText

        // בדיקת גרשיים
        if ((currentHeading.includes("'") || currentHeading.includes('"')) && !gershayim) {
          result.unmatched_tags.push(currentHeading)
        }

        // בדיקת רצף רק מול כותרת קודמת מאותה רמה ובאותו ענף
        const previousHeader = previousHeadersByLevel[level]
        if (previousHeader) {
          const previousText = previousHeader.content
          const previousParts = previousText.split(' ')
          const previousHeading = previousParts.length > 1 ? previousParts[1] : previousText

          const previousNum = toNumber(previousHeading)
          const currentNum = toNumber(currentHeading)

          if (previousNum > 0 && currentNum > 0 && previousNum + step !== currentNum) {
            result.unmatched_tags.push(`כותרת נוכחית - ${previousText} || כותרת הבאה - ${headerText}`)
          }
        }

        previousHeadersByLevel[level] = header
      }
      
      setErrors(result)
    } catch (error) {
      setErrors({ error: 'שגיאה בביצוע הבדיקה' })
      console.error(error)
    } finally {
      setLoading(false)
    }
  }
  
  const escapeRegex = (text) => {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  const handleClose = () => {
    setErrors(null)
    onClose()
  }

  const hasErrors = errors && (
    (errors.unmatched_regex?.length > 0) ||
    (errors.unmatched_tags?.length > 0) ||
    (errors.opening_without_closing?.length > 0) ||
    (errors.closing_without_opening?.length > 0) ||
    (errors.heading_errors?.length > 0) ||
    (errors.missing_levels?.length > 0)
  )

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="בדיקת שגיאות בכותרות"
      size="xl"
    >
      <div className="space-y-4">
        <div className="bg-blue-50 p-4 rounded-lg text-sm text-gray-700">
          <p>כלי זה בודק שגיאות נפוצות בכותרות ובתגי HTML.</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormInput
            label="תווים מותרים בהתחלה"
            value={reStart}
            onChange={(e) => setReStart(e.target.value)}
            placeholder='למשל: ".(["'
          />
          
          <FormInput
            label="תווים מותרים בסוף"
            value={reEnd}
            onChange={(e) => setReEnd(e.target.value)}
            placeholder='למשל: ".])"'
          />
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={gershayim}
              onChange={(e) => setGershayim(e.target.checked)}
              className="w-4 h-4"
            />
            <span>התעלם מכותרות עם גרשיים</span>
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isShas}
              onChange={(e) => setIsShas(e.target.checked)}
              className="w-4 h-4"
            />
            <span>מצב ש"ס (דילוג דפים)</span>
          </label>
        </div>

        {errors?.error && (
          <div className="p-3 rounded bg-red-100 text-red-700">
            {errors.error}
          </div>
        )}

        {errors && !errors.error && (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {!hasErrors ? (
              <div className="p-3 rounded bg-green-100 text-green-700">
                ✓ לא נמצאו שגיאות!
              </div>
            ) : (
              <>
                {errors.unmatched_regex?.length > 0 && (
                  <div>
                    <h4 className="font-bold text-red-700 mb-2">כותרות לא תואמות regex ({errors.unmatched_regex.length}):</h4>
                    <ul className="text-sm space-y-1 bg-red-50 p-3 rounded max-h-40 overflow-y-auto">
                      {errors.unmatched_regex.map((item, i) => <li key={i}>• {item}</li>)}
                    </ul>
                  </div>
                )}

                {errors.unmatched_tags?.length > 0 && (
                  <div>
                    <h4 className="font-bold text-orange-700 mb-2">כותרות לא עוקבות ({errors.unmatched_tags.length}):</h4>
                    <ul className="text-sm space-y-1 bg-orange-50 p-3 rounded max-h-40 overflow-y-auto">
                      {errors.unmatched_tags.map((item, i) => <li key={i}>• {item}</li>)}
                    </ul>
                  </div>
                )}

                {errors.opening_without_closing?.length > 0 && (
                  <div>
                    <h4 className="font-bold text-purple-700 mb-2">תגים פתוחים ללא סגירה ({errors.opening_without_closing.length}):</h4>
                    <ul className="text-sm space-y-1 bg-purple-50 p-3 rounded max-h-40 overflow-y-auto">
                      {errors.opening_without_closing.map((item, i) => <li key={i}>• {item}</li>)}
                    </ul>
                  </div>
                )}

                {errors.closing_without_opening?.length > 0 && (
                  <div>
                    <h4 className="font-bold text-blue-700 mb-2">תגים סוגרים ללא פתיחה ({errors.closing_without_opening.length}):</h4>
                    <ul className="text-sm space-y-1 bg-blue-50 p-3 rounded max-h-40 overflow-y-auto">
                      {errors.closing_without_opening.map((item, i) => <li key={i}>• {item}</li>)}
                    </ul>
                  </div>
                )}

                {errors.heading_errors?.length > 0 && (
                  <div>
                    <h4 className="font-bold text-pink-700 mb-2">כותרות עם טקסט נוסף ({errors.heading_errors.length}):</h4>
                    <ul className="text-sm space-y-1 bg-pink-50 p-3 rounded max-h-40 overflow-y-auto">
                      {errors.heading_errors.map((item, i) => <li key={i}>• {item}</li>)}
                    </ul>
                  </div>
                )}

                {errors.missing_levels?.length > 0 && (
                  <div>
                    <h4 className="font-bold text-gray-700 mb-2">רמות כותרת חסרות:</h4>
                    <p className="text-sm bg-gray-50 p-3 rounded">H{errors.missing_levels.join(', H')}</p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <div className="flex gap-3 pt-4">
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 bg-primary text-white px-6 py-2.5 rounded-lg hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'בודק...' : 'בדוק'}
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

