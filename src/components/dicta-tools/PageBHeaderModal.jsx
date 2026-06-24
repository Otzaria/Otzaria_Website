'use client'

import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import FormInput from '@/components/ui/FormInput'

export default function PageBHeaderModal({ isOpen, onClose, content, onContentChange }) {
  const [headerLevel, setHeaderLevel] = useState(2)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState('')

  const handleSubmit = () => {
    setResult('')
    setLoading(true)
    
    try {
      // פונקציה לבניית regex שמתעלם מתגים
      const buildTagAgnosticPattern = (word, optionalEndChars = "['\"']*") => {
        const anyTags = "(?:<[^>]+>\\s*)*"
        let pattern = ""
        for (const char of word) {
          pattern += anyTags + char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        }
        pattern += anyTags
        if (optionalEndChars) pattern += optionalEndChars + anyTags
        return pattern
      }
      
      // פונקציה לעיבוד שורה
      const stripAndReplace = (text, counter) => {
        const anyTags = "(?:<[^>]+>\\s*)*"
        const nonWord = "(?:[^\\w<>]|$)"
        let pattern = "^\\s*" + anyTags
        
        // דפוס אופציונלי ל"שם"
        const shemPattern = buildTagAgnosticPattern("שם", "")
        pattern += `(?<shem>${shemPattern}\\s*)?`
        
        // דפוס אופציונלי ל"גמרא"
        const gmarahVariants = ["גמרא", "בגמרא", "גמ'", "בגמ'"]
        const gmarahPatterns = gmarahVariants.map(word => buildTagAgnosticPattern(word, ""))
        const gmarahPattern = `(?<gmarah>${gmarahPatterns.join("|")})\\s*`
        pattern += `(?:${gmarahPattern})?`
        
        // דפוס ל"עמוד ב" או "ע"ב"
        const abVariants = ["עמוד ב", "ע\"ב", "ע''ב", "ע'ב"]
        const abPatterns = abVariants.map(word => `(?<!\\w)${buildTagAgnosticPattern(word)}(?!\\w)`)
        const abPattern = `(?<ab>${abPatterns.join("|")})`
        pattern += abPattern + nonWord + `(?<rest>.*)`
        
        const matchPattern = new RegExp(pattern, "iu")
        
        // בדיקה אם כבר יש כותרת
        if (/<h\d>.*?<\/h\d>/i.test(text)) return text
        
        const match = matchPattern.exec(text)
        if (!match) return text
        
        counter.count++
        const header = `<h${headerLevel}>עמוד ב</h${headerLevel}>`
        const restOfLine = (match.groups?.rest || "").trimStart()
        let gmarahText = match.groups?.gmarah || ""
        
        if (gmarahText) {
          gmarahText = gmarahText.replace(new RegExp(anyTags, "g"), "").trim()
        }
        
        if (gmarahText) {
          return restOfLine ? `${header}\n${gmarahText} ${restOfLine}\n` : `${header}\n${gmarahText}\n`
        }
        return restOfLine ? `${header}\n${restOfLine}\n` : `${header}\n`
      }
      
      const lines = content.split('\n')
      const counter = { count: 0 }
      const newLines = lines.map(line => stripAndReplace(line, counter))
      const newContent = newLines.join('').replace(/\n\s*\n/g, '\n')
      
      if (counter.count > 0) {
        setResult(`נוצרו ${counter.count} כותרות "עמוד ב" בהצלחה!`)
        onContentChange(newContent)
        setTimeout(() => {
          onClose()
          setResult('')
        }, 1500)
      } else {
        setResult('לא נמצאו אזכורים של "עמוד ב"')
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
      title='יצירת כותרות "עמוד ב"'
      size="md"
    >
      <div className="space-y-4">
        <div className="bg-info-50 p-4 rounded-lg text-sm text-neutral-700">
          <p>כלי זה מזהה אזכורים של "עמוד ב" / "ע"ב" בטקסט ויוצר מהם כותרות.</p>
          <p className="mt-2">שימושי במיוחד בספרי תלמוד ופרשנות.</p>
        </div>

        <FormInput
          label="רמת כותרת"
          type="number"
          value={headerLevel}
          onChange={(e) => setHeaderLevel(parseInt(e.target.value) || 2)}
          placeholder="2-6"
        />

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

