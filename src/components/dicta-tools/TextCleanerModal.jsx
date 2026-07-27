'use client'

import { useState } from 'react'
import Modal from '@/components/ui/Modal'

export default function TextCleanerModal({ isOpen, onClose, content, onContentChange }) {
  const [options, setOptions] = useState({
    remove_empty_lines: true,
    remove_double_spaces: true,
    remove_spaces_before: true,
    remove_spaces_after: true,
    remove_spaces_around_newlines: true,
    remove_leading_spaces: true,
    fix_spaces_near_tags: true,
    replace_double_quotes: true,
    normalize_quotes: true,
    clean_duplicate_tags: false
  })
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState('')

  const handleToggle = (key) => {
    setOptions(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const handleSubmit = () => {
    setResult('')
    setLoading(true)
    
    try {
      let newContent = content
      let changed = false
      
      if (options.remove_empty_lines) {
        const before = newContent
        newContent = newContent.replace(/\n\s*\n\s*\n/g, '\n\n')
        if (before !== newContent) changed = true
      }
      
      if (options.remove_double_spaces) {
        const before = newContent
        newContent = newContent.replace(/  +/g, ' ')
        if (before !== newContent) changed = true
      }
      
      if (options.remove_spaces_before) {
        const before = newContent
        newContent = newContent.replace(/\s+([.,;:!?])/g, '$1')
        if (before !== newContent) changed = true
      }
      
      if (options.remove_spaces_after) {
        const before = newContent
        newContent = newContent.replace(/\(\s+/g, '(')
        newContent = newContent.replace(/\[\s+/g, '[')
        if (before !== newContent) changed = true
      }
      
      if (options.remove_spaces_around_newlines) {
        const before = newContent
        newContent = newContent.replace(/\s+\n/g, '\n')
        newContent = newContent.replace(/\n\s+/g, '\n')
        if (before !== newContent) changed = true
      }
      
      if (options.remove_leading_spaces) {
        const before = newContent
        newContent = newContent.replace(/^[ \t]+/gm, '')
        if (before !== newContent) changed = true
      }
      
      if (options.fix_spaces_near_tags) {
        const before = newContent
        // הוסף רווח לפני תגים פותחים אם אין רווח
        newContent = newContent.replace(/(\S)<([a-z]+\d?)>/gi, '$1 <$2>')
        // הוסף רווח אחרי תגים סוגרים אם אין רווח
        newContent = newContent.replace(/<\/([a-z]+\d?)>(\S)/gi, '</$1> $2')
        // הסר רווחים מיותרים אחרי תגים פותחים
        newContent = newContent.replace(/<([a-z]+\d?)>\s+/gi, '<$1>')
        // הסר רווחים מיותרים לפני תגים סוגרים
        newContent = newContent.replace(/\s+<\/([a-z]+\d?)>/gi, '</$1>')
        if (before !== newContent) changed = true
      }
      
      if (options.replace_double_quotes) {
        const before = newContent
        newContent = newContent.replace(/""/g, '"')
        if (before !== newContent) changed = true
      }
      
      if (options.normalize_quotes) {
        const before = newContent
        newContent = newContent.replace(/[""]/g, '"')
        newContent = newContent.replace(/['']/g, "'")
        if (before !== newContent) changed = true
      }
      
      if (options.clean_duplicate_tags) {
        const before = newContent
        // ניקוי תגיות כפולות - מאומץ מהמימוש בצד השרת
        // מטפל בכל סוגי התגיות כולל h1-h6

        const getLastTagInfo = (text, tag, closeTagIndex) => {
          const openTag = `<${tag}>`
          const openIndex = text.lastIndexOf(openTag, closeTagIndex)
          if (openIndex === -1) return null
          const inner = text.slice(openIndex + openTag.length, closeTagIndex)
          // הערת אבטחה: false positive מאומת עבור התראת CodeQL js/incomplete-multi-character-sanitization (נסגרה ידנית ב-GitHub, ראו הסבר): used only to
          // count words for a duplicate-heading heuristic, not as an output sanitizer — the
          // book content itself is sanitized with DOMPurify at render time.
          const cleaned = inner.replace(/<[^>]*>/g, '').trim()
          const wordCount = cleaned ? cleaned.split(/\s+/).filter(Boolean).length : 0
          return { openTag, openIndex, inner, wordCount }
        }

        const isOnlyTagOnLine = (text, tagInfo, closeTagIndex) => {
          if (!tagInfo) return false
          const closeTag = `</${tagInfo.openTag.slice(1)}`
          const closeTagIndexEnd = closeTagIndex + closeTag.length
          const lineStart = text.lastIndexOf('\n', tagInfo.openIndex - 1) + 1
          const line = text.slice(lineStart, closeTagIndexEnd)
          const trimmed = line.trim()
          const expected = `${tagInfo.openTag}${tagInfo.inner}</${tagInfo.openTag.slice(1)}`
          return trimmed === expected
        }

        let previousText
        do {
          previousText = newContent
          // תגית סוגרת ותגית פותחת אותו דבר עם רווח או ללא רווח באמצע: </b> <b> או </b><b> -> רווח בלבד או ריק
          newContent = newContent.replace(/<\/(b|i|u|big|small|h[1-6])>(\s*)<\1>/g, (match, tag, whitespace, offset, fullText) => {
            const hasLineBreak = /\r?\n/.test(whitespace)
            if (!hasLineBreak) {
              return whitespace.length > 0 ? ' ' : ''
            }
            const info = getLastTagInfo(fullText, tag, offset)
            if (!info || info.wordCount !== 1) return match
            if (!isOnlyTagOnLine(fullText, info, offset)) return match
            return ' '
          })
        
          // שני סוגרים ואז שני פותחים באותו סדר הפוך: </b></i> <i><b> או </b></i><i><b> -> רווח או ריק
          newContent = newContent.replace(/<\/(b|i|u|big|small|h[1-6])><\/(b|i|u|big|small|h[1-6])>(\s*)<\2><\1>/g, (match, tag1, tag2, whitespace, offset, fullText) => {
            const hasLineBreak = /\r?\n/.test(whitespace)
            if (!hasLineBreak) {
              return whitespace.length > 0 ? ' ' : ''
            }
            const info = getLastTagInfo(fullText, tag1, offset)
            if (!info || info.wordCount !== 1) return match
            if (!isOnlyTagOnLine(fullText, info, offset)) return match
            return ' '
          })
        
          // שני סוגרים ואז שני פותחים באותו סדר: </b></i> <b><i> או </b></i><b><i> -> רווח או ריק
          newContent = newContent.replace(/<\/(b|i|u|big|small|h[1-6])><\/(b|i|u|big|small|h[1-6])>(\s*)<\1><\2>/g, (match, tag1, tag2, whitespace, offset, fullText) => {
            const hasLineBreak = /\r?\n/.test(whitespace)
            if (!hasLineBreak) {
              return whitespace.length > 0 ? ' ' : ''
            }
            const info = getLastTagInfo(fullText, tag1, offset)
            if (!info || info.wordCount !== 1) return match
            if (!isOnlyTagOnLine(fullText, info, offset)) return match
            return ' '
          })
        } while (newContent !== previousText)
        
        if (before !== newContent) changed = true
      }
      
      if (changed) {
        setResult('הטקסט נוקה בהצלחה!')
        onContentChange(newContent)
        setTimeout(() => {
          onClose()
          setResult('')
        }, 1500)
      } else {
        setResult('לא נמצאו שינויים לביצוע')
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
      title="ניקוי טקסט"
      size="md"
    >
      <div className="space-y-4">
        <div className="bg-info-50 p-4 rounded-lg text-sm text-neutral-700">
          <p>כלי זה מנקה שגיאות נפוצות בטקסט כמו רווחים מיותרים, שורות ריקות וכו'.</p>
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm cursor-pointer hover:bg-neutral-50 p-2 rounded">
            <input
              type="checkbox"
              checked={options.remove_empty_lines}
              onChange={() => handleToggle('remove_empty_lines')}
              className="w-4 h-4"
            />
            <span>הסרת שורות ריקות</span>
          </label>

          <label className="flex items-center gap-2 text-sm cursor-pointer hover:bg-neutral-50 p-2 rounded">
            <input
              type="checkbox"
              checked={options.remove_double_spaces}
              onChange={() => handleToggle('remove_double_spaces')}
              className="w-4 h-4"
            />
            <span>הסרת רווחים כפולים</span>
          </label>

          <label className="flex items-center gap-2 text-sm cursor-pointer hover:bg-neutral-50 p-2 rounded">
            <input
              type="checkbox"
              checked={options.remove_spaces_before}
              onChange={() => handleToggle('remove_spaces_before')}
              className="w-4 h-4"
            />
            <span>הסרת רווחים לפני פיסוק</span>
          </label>

          <label className="flex items-center gap-2 text-sm cursor-pointer hover:bg-neutral-50 p-2 rounded">
            <input
              type="checkbox"
              checked={options.remove_spaces_after}
              onChange={() => handleToggle('remove_spaces_after')}
              className="w-4 h-4"
            />
            <span>הסרת רווחים אחרי סוגריים פותחים</span>
          </label>

          <label className="flex items-center gap-2 text-sm cursor-pointer hover:bg-neutral-50 p-2 rounded">
            <input
              type="checkbox"
              checked={options.remove_spaces_around_newlines}
              onChange={() => handleToggle('remove_spaces_around_newlines')}
              className="w-4 h-4"
            />
            <span>הסרת רווחים סביב מעברי שורה</span>
          </label>

          <label className="flex items-center gap-2 text-sm cursor-pointer hover:bg-neutral-50 p-2 rounded">
            <input
              type="checkbox"
              checked={options.remove_leading_spaces}
              onChange={() => handleToggle('remove_leading_spaces')}
              className="w-4 h-4"
            />
            <span>הסרת רווחים בתחילת שורה</span>
          </label>

          <label className="flex items-center gap-2 text-sm cursor-pointer hover:bg-neutral-50 p-2 rounded">
            <input
              type="checkbox"
              checked={options.fix_spaces_near_tags}
              onChange={() => handleToggle('fix_spaces_near_tags')}
              className="w-4 h-4"
            />
            <span>רווחים חסרים/מיותרים ליד תגים</span>
          </label>

          <label className="flex items-center gap-2 text-sm cursor-pointer hover:bg-neutral-50 p-2 rounded">
            <input
              type="checkbox"
              checked={options.replace_double_quotes}
              onChange={() => handleToggle('replace_double_quotes')}
              className="w-4 h-4"
            />
            <span>החלפת גרשיים כפולים למרכאות</span>
          </label>

          <label className="flex items-center gap-2 text-sm cursor-pointer hover:bg-neutral-50 p-2 rounded">
            <input
              type="checkbox"
              checked={options.normalize_quotes}
              onChange={() => handleToggle('normalize_quotes')}
              className="w-4 h-4"
            />
            <span>אחדות מרכאות וגרשיים</span>
          </label>

          <label className="flex items-center gap-2 text-sm cursor-pointer hover:bg-neutral-50 p-2 rounded">
            <input
              type="checkbox"
              checked={options.clean_duplicate_tags}
              onChange={() => handleToggle('clean_duplicate_tags')}
              className="w-4 h-4"
            />
            <div className="flex flex-col">
              <span>נקה תגיות כפולות</span>
              <span className="text-xs text-neutral-500 mr-6">(למשל &lt;b&gt;חידושים&lt;/b&gt; &lt;b&gt;על&lt;/b&gt;, לא מומלץ להפעיל לפני גמר העריכה)</span>
            </div>
          </label>
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

