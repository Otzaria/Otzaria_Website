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
        heading_order: [],
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

      // המרת אותיות סופיות לרגילות, להשוואת גימטריה
      const finalForms = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' }
      const normalizeNumeral = (token) =>
        token.replace(/['"`׳״]/g, '').split('').map(c => finalForms[c] || c).join('')

      // בניית מספר עברי קנוני, כדי לאמת שטוקן הוא באמת מספר ולא מילה רגילה
      const numberToHebrew = (n) => {
        if (n <= 0 || n > 1100) return null
        const hundreds = ['', 'ק', 'ר', 'ש', 'ת', 'תק', 'תר', 'תש', 'תת', 'תתק', 'תתר']
        const tens = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ']
        const ones = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט']
        let out = hundreds[Math.floor(n / 100)] || ''
        const rem = n % 100
        if (rem === 15) out += 'טו'
        else if (rem === 16) out += 'טז'
        else out += tens[Math.floor(rem / 10)] + ones[rem % 10]
        return out
      }

      // האם הטוקן הוא מספר עברי תקני (ולא מילה רגילה כמו "תורה" / "משנה")
      const isValidNumeral = (token) => {
        const clean = normalizeNumeral(token)
        if (!clean) return false
        const n = toNumber(clean)
        return n > 0 && numberToHebrew(n) === clean
      }

      // חילוץ ערך הדף (מספר + עמוד) מתוך כותרת, לתמיכה בפורמטים שונים:
      // "דף ב עמוד א" / "דף ב:" / "ג:" / "ד." / "ד עמוד א" וכיו"ב
      const labelWords = new Set(['דף', 'פרק', 'עמוד', 'סימן', 'הלכה', 'משנה', 'פסקה', 'שער', 'מאמר', 'חלק', 'אות'])
      const parseDafValue = (rawText) => {
        const text = rawText.trim()

        // זיהוי העמוד: "עמוד ב" או סיומת ":" => עמוד ב; "עמוד א" / "." / ברירת מחדל => עמוד א
        let amud = 0
        if (/עמוד\s*ב/.test(text)) amud = 1
        else if (/עמוד\s*א/.test(text)) amud = 0
        else if (text.endsWith(':')) amud = 1
        else if (text.endsWith('.')) amud = 0

        // זיהוי מספר הדף: הטוקן הראשון שהוא מספר עברי תקין (תוך דילוג על מילות תווית
        // ועל מילים רגילות שאינן מספר), כדי לא לפרש "תורה"/"משנה" וכו' כמספר
        let dafNum = 0
        const tokens = text.replace(/[.:]/g, ' ').trim().split(/\s+/)
        for (const t of tokens) {
          if (!t || labelWords.has(t)) continue
          if (isValidNumeral(t)) { dafNum = toNumber(normalizeNumeral(t)); break }
        }
        // ערך ממוין: כל דף = שני עמודים, כך ש"ב עמוד ב" < "ג עמוד א"
        return { dafNum, value: dafNum * 2 + amud }
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

      // הכותרת הקרובה ביותר ברמה גבוהה יותר (ההורה בעץ), כדי לציין היכן בדיוק הבעיה
      const getParentContext = (level) => {
        for (let k = level - 1; k >= 2; k--) {
          if (previousHeadersByLevel[k]) return previousHeadersByLevel[k].content
        }
        return null
      }

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

          // פענוח אחיד לשתי הבדיקות: מאתר את המספר העברי התקין בכותרת
          // ומדלג על מילות תווית ומילים רגילות (כך "פרק שני"/"פרק שלישי" לא יסומנו כדילוג)
          const previousValue = parseDafValue(previousText)
          const currentValue = parseDafValue(headerText)
          const previousNum = previousValue.dafNum
          const currentNum = currentValue.dafNum

          // ציון הכותרת שברמה מעל, כדי לדעת היכן בדיוק חסר (למשל באיזה חלק בשו"ת)
          const parentContext = getParentContext(level)
          const parentSuffix = parentContext ? ` (תחת: ${parentContext})` : ''

          // פער קדימה בלבד (דילוג על כותרת): המספר עלה אך לא בדיוק לפי הצעד.
          // ירידה/כפילות אינן נכנסות לכאן אלא לבדיקת הסדר העולה, כדי לא לדווח פעמיים.
          if (previousNum > 0 && currentNum > previousNum && previousNum + step !== currentNum) {
            result.unmatched_tags.push(`כותרת נוכחית - ${previousText} || כותרת הבאה - ${headerText}${parentSuffix}`)
          }

          // בדיקת סדר עולה: כותרת כפולה או כותרת שאינה גדולה מקודמתה (כותרת זרה באמצע).
          // מדלג על פערים תקינים (ב -> ג -> ד) ועל שינויי פורמט, ובודק רק שהערך עולה.
          if (previousValue.dafNum > 0 && currentValue.dafNum > 0 && currentValue.value <= previousValue.value) {
            result.heading_order.push(`כותרת קודמת - ${previousText} || כותרת נוכחית - ${headerText}${parentSuffix}`)
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
    (errors.heading_order?.length > 0) ||
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

                {errors.heading_order?.length > 0 && (
                  <div>
                    <h4 className="font-bold text-amber-700 mb-2">כותרות לא בסדר עולה ({errors.heading_order.length}):</h4>
                    <ul className="text-sm space-y-1 bg-amber-50 p-3 rounded max-h-40 overflow-y-auto">
                      {errors.heading_order.map((item, i) => <li key={i}>• {item}</li>)}
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

