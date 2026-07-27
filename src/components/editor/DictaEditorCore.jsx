'use client'

import { useState, useEffect, useRef, useMemo, useCallback, useTransition, useDeferredValue } from 'react'
import Button from '@/components/ui/Button'
import { useDialog } from '@/components/providers/DialogContext'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import CreateHeadersModal from '@/components/dicta-tools/CreateHeadersModal'
import SingleLetterHeadersModal from '@/components/dicta-tools/SingleLetterHeadersModal'
import ChangeHeadingModal from '@/components/dicta-tools/ChangeHeadingModal'
import PunctuateModal from '@/components/dicta-tools/PunctuateModal'
import PageBHeaderModal from '@/components/dicta-tools/PageBHeaderModal'
import ReplacePageBModal from '@/components/dicta-tools/ReplacePageBModal'
import HeaderErrorCheckerModal from '@/components/dicta-tools/HeaderErrorCheckerModal'
import TextCleanerModal from '@/components/dicta-tools/TextCleanerModal'
import AddPageNumberModal from '@/components/dicta-tools/AddPageNumberModal'
import EmbedImageModal from '@/components/dicta-tools/EmbedImageModal'
import ShortcutsDialog from '@/components/editor/modals/ShortcutsDialog'
import FindReplaceDialog from '@/components/editor/modals/FindReplaceDialog'
import SpellcheckDialog from '@/components/editor/modals/SpellcheckDialog'
import { getTextareaCaretTop } from '@/lib/editorUtils'
import { withShortcut } from '@/lib/shortcuts'
import DOMPurify from 'dompurify'
import { buildWholeWordRegex, findNextWholeWordInTextarea as findNextWholeWordInTextareaUtil } from '@/lib/hebrewWordUtils'

const DEFAULT_SHORTCUTS = {
  'save': 'Ctrl+KeyS',
  'toggleEdit': 'Ctrl+KeyE',
  'bold': 'Ctrl+KeyB',
  'italic': 'Ctrl+KeyI',
  'underline': 'Ctrl+KeyU',
  'h1': 'Ctrl+Digit1',
  'h2': 'Ctrl+Digit2',
  'h3': 'Ctrl+Digit3',
  'fontIncrease': 'Ctrl+Equal',
  'fontDecrease': 'Ctrl+Minus',
  'alignRight': 'Ctrl+KeyR',
  'alignCenter': 'Ctrl+Shift+KeyC',
  'alignLeft': 'Ctrl+KeyL',
  'findReplace': 'Ctrl+KeyF',
  'shortcuts': 'Alt+KeyK',
  'embedImage': 'Ctrl+Shift+KeyI',
  'removeTags': 'Ctrl+Shift+KeyX',
  'undo': 'Ctrl+KeyZ',
  'redo': 'Ctrl+KeyY',
}

// תקרת צעדי undo/redo - כל צעד שומר עותק מלא של המסמך, ללא תקרה הזיכרון תופח במסמך גדול
const MAX_HISTORY = 100

function buildTocFromContent(content) {
  if (!content) return []

  const headingRegex = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi
  const tocItems = []
  let match
  let index = 0

  while ((match = headingRegex.exec(content)) !== null) {
    const [, rawLevel, innerHtml] = match
    // הפענוח של &amp; מתבצע אחרון: אחרת "&amp;lt;" (שאמור להישאר "&lt;" מילולי)
    // היה מפוענח פעמיים ל-"<" בטעות (codeql: js/double-escaping).
    const headingText = innerHtml
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&amp;/gi, '&')
      .replace(/\s+/g, ' ')
      .trim()

    tocItems.push({
      id: `heading-${index}`,
      level: Math.min(Math.max(parseInt(rawLevel, 10), 1), 6),
      text: headingText,
      html: match[0],
      position: match.index
    })

    index += 1
  }

  return tocItems
}

/**
 * מאתר קטע מקישור עמוק (?find=) בתוכן הספר. הקטע המדווח מנוקה מתגי HTML
 * בעוד התוכן מכיל אותם, לכן אחרי התאמה מדויקת מנסים regex סובלני: תגים,
 * &nbsp; וישויות HTML בין/בתוך מילים, וגרשיים עבריים מול ASCII.
 */
function locateTextFlexible(content, phrase) {
  const cleaned = String(phrase || '').replace(/\s+/g, ' ').trim()
  if (!cleaned || !content) return null

  const exactIndex = content.indexOf(cleaned)
  if (exactIndex !== -1) return { start: exactIndex, end: exactIndex + cleaned.length }

  // סדר ההחלפות חשוב: & לפני החלפות שמוסיפות &quot;/&#39; לתבנית.
  // תקרת 15 מילים — מגנה מפני backtracking קטלוני בקטע ארוך, ו-15 המילים
  // הראשונות כמעט תמיד ייחודיות מספיק לאיתור.
  const tokens = cleaned.split(' ').slice(0, 15).map(token =>
    token
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/&/g, '&(?:amp;)?')
      .replace(/["״]/g, '(?:["״]|&quot;)')
      .replace(/['׳]/g, "(?:['׳]|&#39;)")
  )
  try {
    const tolerant = new RegExp(tokens.join('(?:\\s|&nbsp;|<[^>]*>)+'))
    const match = tolerant.exec(content)
    if (match) return { start: match.index, end: match.index + match[0].length }
  } catch (e) {
    console.warn('locateTextFlexible: invalid pattern', e)
  }
  return null
}

export default function DictaEditorCore({
  initialContent = '',
  initialFind = '',
  title = 'ללא שם',
  canEdit = true, 
  isCompleted = false,
  onSave, 
  saving = false,
  hasUnsavedChangesOuter = false,
  setHasUnsavedChanges = () => {},
  headerStartElement = null,
  headerEndElement = null,
  singleLineHeader = false,
  enableSpellcheck = true,
  saveLabel = 'שמירה'
}) {
  const { showAlert } = useDialog()

  const [content, setContent] = useState(initialContent)
  // התצוגה המקדימה ותוכן העניינים נגזרים מערך מושהה כדי שההקלדה תישאר חלקה
  // גם במסמכים גדולים - ה-sanitize וה-regex הכבדים רצים רק כשהמשתמש עוצר.
  const deferredContent = useDeferredValue(content)
  // ניקוי HTML לפני רינדור כדי למנוע XSS. DOMPurify תלוי ב-window ולכן רץ רק
  // בצד הלקוח; ב-SSR מוחזר תוכן ריק וההידרציה בצד הלקוח מבצעת את הניקוי.
  const sanitizedContent = useMemo(
    () => (typeof window !== 'undefined' ? DOMPurify.sanitize(deferredContent || '') : ''),
    [deferredContent]
  )
  const [fontSize, setFontSize] = useState(18)
  const [selectedFont, setSelectedFont] = useState("'Times New Roman'")
  const [textAlign, setTextAlign] = useState('right')
  const [activeTool, setActiveTool] = useState(null)
  const [editMode, setEditMode] = useState(false)
  const [showShortcutsDialog, setShowShortcutsDialog] = useState(false)
  const [userShortcuts, setUserShortcuts] = useState(DEFAULT_SHORTCUTS)
  const [showFindReplace, setShowFindReplace] = useState(false)
  const [showSpellcheck, setShowSpellcheck] = useState(false)
  const [findText, setFindText] = useState('')
  const [replaceText, setReplaceText] = useState('')
  const [useRegex, setUseRegex] = useState(false)
  const [savedSearches, setSavedSearches] = useState([])
  const [showPreview, setShowPreview] = useState(true)
  const [isPending, startTransition] = useTransition()
  
  const [toolbarExpanded, setToolbarExpanded] = useState(false)
  const [headerCompact, setHeaderCompact] = useState(false)
  
  // מנגנון undo/redo
  const [history, setHistory] = useState([{ content: initialContent, selection: { start: 0, end: 0 } }])
  const [historyIndex, setHistoryIndex] = useState(0)

  // טעינת מצב toolbar מ-localStorage רק בצד הלקוח
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('dicta_editor_toolbar_expanded')
      if (saved === 'true') {
        setToolbarExpanded(true)
      }
      const savedCompact = localStorage.getItem('dicta_editor_header_compact')
      if (savedCompact === 'true') {
        setHeaderCompact(true)
      }
    }
  }, [])
  
  const hasLoadedPreviewState = useRef(false)
  const mainRef = useRef(null)
  const contentRef = useRef(null)
  const textareaRef = useRef(null)
  const previewRef = useRef(null)
  const scrollingSource = useRef(null)
  const timeoutRef = useRef(null)
  const pendingScrollRestoreRef = useRef(null)

  useEffect(() => {
    setContent(initialContent)
    setHistory([{ content: initialContent, selection: { start: 0, end: 0 } }])
    setHistoryIndex(0)
  }, [initialContent])

  // מיקוד אוטומטי בקטע שהגיע בקישור עמוק (?find=) — פעם אחת בטעינה:
  // מאתרים את הקטע, עוברים למצב עריכה, והאפקט השני (תלוי editMode) מסמן וגולל.
  const initialFindHandledRef = useRef(false)
  const pendingInitialSelectionRef = useRef(null)
  useEffect(() => {
    if (initialFindHandledRef.current || !initialFind || !initialContent) return
    initialFindHandledRef.current = true
    if (!canEdit) return
    const match = locateTextFlexible(initialContent, initialFind)
    if (!match) {
      showAlert('הקטע לא אותר', 'הקטע מהדיווח לא נמצא בגרסה הנוכחית של הספר — ייתכן שכבר תוקן. ניתן לחפש ידנית דרך "חיפוש והחלפה".')
      return
    }
    pendingInitialSelectionRef.current = match
    setEditMode(true)
  }, [initialFind, initialContent, canEdit, showAlert])

  useEffect(() => {
    if (!editMode || !pendingInitialSelectionRef.current) return
    const frame = window.requestAnimationFrame(() => {
      const textarea = textareaRef.current
      const sel = pendingInitialSelectionRef.current
      if (!textarea || !sel) return
      pendingInitialSelectionRef.current = null
      textarea.focus()
      textarea.setSelectionRange(sel.start, sel.end)
      const computedLineHeight = Number.parseFloat(window.getComputedStyle(textarea).lineHeight)
      const lineHeight = Number.isFinite(computedLineHeight) ? computedLineHeight : 24
      const caretTop = getTextareaCaretTop(textarea, sel.start)
      textarea.scrollTop = Math.max(0, caretTop - (textarea.clientHeight / 2) + lineHeight)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [editMode])

  useEffect(() => {
    setHasUnsavedChanges(content !== initialContent)
  }, [content, initialContent, setHasUnsavedChanges])

  useEffect(() => {
    if (selectedFont) {
      localStorage.setItem('dicta_editor_font', selectedFont)
    }
  }, [selectedFont])

  useEffect(() => {
    localStorage.setItem('dicta_editor_font_size', fontSize.toString())
  }, [fontSize])

  useEffect(() => {
    localStorage.setItem('dicta_editor_text_align', textAlign)
  }, [textAlign])

  useEffect(() => {
    if (hasLoadedPreviewState.current) {
      localStorage.setItem('dicta_editor_show_preview', showPreview.toString())
    }
  }, [showPreview])

  useEffect(() => {
    localStorage.setItem('dicta_editor_toolbar_expanded', toolbarExpanded.toString())
  }, [toolbarExpanded])

  useEffect(() => {
    localStorage.setItem('dicta_editor_header_compact', headerCompact.toString())
  }, [headerCompact])

  useEffect(() => {
    const saved = localStorage.getItem('dicta_editor_shortcuts')
    if (saved) {
      try {
        setUserShortcuts(JSON.parse(saved))
      } catch (e) {
        console.error('Failed to parse shortcuts:', e)
      }
    }

    const savedSearchesData = localStorage.getItem('dicta_saved_searches')
    if (savedSearchesData) {
      try {
        setSavedSearches(JSON.parse(savedSearchesData))
      } catch (e) {
        console.error('Failed to parse saved searches:', e)
      }
    }

    const savedFont = localStorage.getItem('dicta_editor_font')
    if (savedFont) {
      setSelectedFont(savedFont)
    }

    const savedFontSize = localStorage.getItem('dicta_editor_font_size')
    if (savedFontSize) {
      setFontSize(parseInt(savedFontSize))
    }

    const savedTextAlign = localStorage.getItem('dicta_editor_text_align')
    if (savedTextAlign) {
      setTextAlign(savedTextAlign)
    }

    if (!hasLoadedPreviewState.current) {
      const savedPreviewState = localStorage.getItem('dicta_editor_show_preview')
      if (savedPreviewState !== null) {
        setShowPreview(savedPreviewState === 'true')
      }
      hasLoadedPreviewState.current = true
    }
  }, [])

  const updateTextWithHistory = useCallback((newText, selectionStart = null, selectionEnd = null) => {
    // ניקוי timeout מושהה כדי למנוע race condition
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    
    // מניעת הוספה להיסטוריה אם התוכן לא השתנה
    if (newText === content) {
      return
    }
    
    const textarea = textareaRef.current
    const start = selectionStart !== null ? selectionStart : (textarea?.selectionStart || 0)
    const end = selectionEnd !== null ? selectionEnd : (textarea?.selectionEnd || 0)
    
    setContent(newText)
    const newHistory = history.slice(0, historyIndex + 1)
    newHistory.push({ content: newText, selection: { start, end } })
    if (newHistory.length > MAX_HISTORY) {
      newHistory.splice(0, newHistory.length - MAX_HISTORY)
    }
    setHistory(newHistory)
    setHistoryIndex(newHistory.length - 1)
  }, [content, history, historyIndex])
  
  const undo = useCallback(() => {
    // ניקוי timeout מושהה כדי למנוע race condition
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1
      const historyItem = history[newIndex]
      setHistoryIndex(newIndex)
      setContent(historyItem.content)
      
      // שחזור הבחירה
      setTimeout(() => {
        const textarea = textareaRef.current
        if (textarea && historyItem.selection) {
          textarea.focus()
          textarea.setSelectionRange(historyItem.selection.start, historyItem.selection.end)
        }
      }, 0)
    }
  }, [historyIndex, history])
  
  const redo = useCallback(() => {
    // ניקוי timeout מושהה כדי למנוע race condition
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1
      const historyItem = history[newIndex]
      setHistoryIndex(newIndex)
      setContent(historyItem.content)
      
      // שחזור הבחירה
      setTimeout(() => {
        const textarea = textareaRef.current
        if (textarea && historyItem.selection) {
          textarea.focus()
          textarea.setSelectionRange(historyItem.selection.start, historyItem.selection.end)
        }
      }, 0)
    }
  }, [historyIndex, history])

  const handleContentChange = useCallback((newContent) => {
    updateTextWithHistory(newContent)
  }, [updateTextWithHistory])

  const handleSpellcheckApply = useCallback((newText) => {
    updateTextWithHistory(newText)
  }, [updateTextWithHistory])
  
  const handleTextareaChange = useCallback((e) => {
    const newContent = e.target.value
    const selectionStart = e.target.selectionStart
    const selectionEnd = e.target.selectionEnd
    
    setContent(newContent)
    // הוספה להיסטוריה עם debounce קל
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    timeoutRef.current = setTimeout(() => {
      // השוואה למצב האחרון בהיסטוריה לפני הוספה
      const lastItem = history[historyIndex]
      if (!lastItem || lastItem.content !== newContent) {
        const newHistory = history.slice(0, historyIndex + 1)
        newHistory.push({ content: newContent, selection: { start: selectionStart, end: selectionEnd } })
        if (newHistory.length > MAX_HISTORY) {
          newHistory.splice(0, newHistory.length - MAX_HISTORY)
        }
        setHistory(newHistory)
        setHistoryIndex(newHistory.length - 1)
      }
    }, 500)
  }, [history, historyIndex])

  const getScrollPercentage = useCallback((element) => {
    if (!element) return 0

    const maxScroll = element.scrollHeight - element.clientHeight
    if (maxScroll <= 0) return 0

    return element.scrollTop / maxScroll
  }, [])

  const setScrollPercentage = useCallback((element, percentage) => {
    if (!element) return

    const maxScroll = element.scrollHeight - element.clientHeight
    if (maxScroll <= 0) {
      element.scrollTop = 0
      return
    }

    element.scrollTop = Math.max(0, Math.min(maxScroll, percentage * maxScroll))
  }, [])

  const captureCurrentScrollState = useCallback(() => {
    if (editMode) {
      return { percentage: getScrollPercentage(textareaRef.current) }
    }

    return { percentage: getScrollPercentage(mainRef.current) }
  }, [editMode, getScrollPercentage])

  const handleToggleEditMode = useCallback(() => {
    pendingScrollRestoreRef.current = captureCurrentScrollState()
    startTransition(() => {
      setEditMode(prev => !prev)
    })
  }, [captureCurrentScrollState, startTransition])

  const handleTogglePreview = useCallback((nextShowPreview) => {
    pendingScrollRestoreRef.current = captureCurrentScrollState()
    setShowPreview(nextShowPreview)
  }, [captureCurrentScrollState])

  useEffect(() => {
    const pending = pendingScrollRestoreRef.current
    if (!pending) return

    const restore = () => {
      if (editMode) {
        setScrollPercentage(textareaRef.current, pending.percentage)

        if (showPreview) {
          setScrollPercentage(previewRef.current, pending.percentage)
        }
      } else {
        setScrollPercentage(mainRef.current, pending.percentage)
      }

      pendingScrollRestoreRef.current = null
    }

    const frame = window.requestAnimationFrame(restore)
    return () => window.cancelAnimationFrame(frame)
  }, [editMode, showPreview, setScrollPercentage])

  const handleTextareaScroll = useCallback(() => {
    if (!textareaRef.current || !previewRef.current) return
    if (scrollingSource.current === 'preview') return
    
    scrollingSource.current = 'textarea'
    
    const textarea = textareaRef.current
    const preview = previewRef.current
    
    const scrollPercentage = textarea.scrollTop / (textarea.scrollHeight - textarea.clientHeight)
    preview.scrollTop = scrollPercentage * (preview.scrollHeight - preview.clientHeight)
    
    clearTimeout(textareaRef.current.scrollTimeout)
    textareaRef.current.scrollTimeout = setTimeout(() => {
      scrollingSource.current = null
    }, 50)
  }, [])

  const handlePreviewScroll = useCallback(() => {
    if (!textareaRef.current || !previewRef.current) return
    if (scrollingSource.current === 'textarea') return
    
    scrollingSource.current = 'preview'
    
    const textarea = textareaRef.current
    const preview = previewRef.current
    
    const scrollPercentage = preview.scrollTop / (preview.scrollHeight - preview.clientHeight)
    textarea.scrollTop = scrollPercentage * (textarea.scrollHeight - textarea.clientHeight)
    
    clearTimeout(previewRef.current.scrollTimeout)
    previewRef.current.scrollTimeout = setTimeout(() => {
      scrollingSource.current = null
    }, 50)
  }, [])

  const insertTag = useCallback((tag) => {
    if (!textareaRef.current) return
    
    const textarea = textareaRef.current
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selectedText = content.substring(start, end)
    
    const scrollTop = textarea.scrollTop
    
    // הסרת רווחים מלפני ואחרי הטקסט הנבחר
    const trimmedText = selectedText.trim()
    const leadingSpaces = selectedText.match(/^\s*/)[0]
    const trailingSpaces = selectedText.match(/\s*$/)[0]
    
    // בדיקה אם זה תג כותרת
    const isHeadingTag = /^h[1-6]$/.test(tag)
    
    let cleanText = trimmedText
    let insertion
    
    if (isHeadingTag && trimmedText) {
      // עבור כותרות: הסרת כל התגים הקיימים מהטקסט
      // הערת אבטחה: false positive מאומת עבור התראת CodeQL js/incomplete-multi-character-sanitization (נסגרה ידנית ב-GitHub, ראו הסבר): this is an editor
      // convenience action (strip tags before wrapping in a heading), not the security
      // boundary — final content is always run through DOMPurify.sanitize() before render
      // (see sanitizedContent above / dangerouslySetInnerHTML usage below).
      cleanText = trimmedText.replace(/<[^>]*>/g, '')
      insertion = `<${tag}>${cleanText}</${tag}>`
      
      // הוספת ירידת שורה אחרי הכותרת אם אין כבר
      const textAfterSelection = content.substring(end)
      const hasNewlineAfter = textAfterSelection.startsWith('\n')
      const hasNewlineInTrailing = trailingSpaces.includes('\n')
      const needsNewline = !hasNewlineAfter && !hasNewlineInTrailing && textAfterSelection.length > 0
      if (needsNewline) {
        insertion += '\n'
      }
    } else {
      // עבור תגים רגילים: התנהגות קיימת
      insertion = trimmedText ? `<${tag}>${trimmedText}</${tag}>` : `<${tag}></${tag}>`
    }
    
    const newText = content.substring(0, start) + leadingSpaces + insertion + trailingSpaces + content.substring(end)
    
    updateTextWithHistory(newText)
    
    setTimeout(() => {
      const newPos = trimmedText ? (start + leadingSpaces.length + insertion.length) : (start + tag.length + 2)
      textarea.focus()
      textarea.setSelectionRange(newPos, newPos)
      textarea.scrollTop = scrollTop
    }, 0)
  }, [content, updateTextWithHistory])

  const removeTags = useCallback(() => {
    if (!textareaRef.current) return
    
    const textarea = textareaRef.current
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selectedText = content.substring(start, end)
    
    if (!selectedText) {
      showAlert('שגיאה', 'יש לבחור טקסט להסרת תגים')
      return
    }
    
    const scrollTop = textarea.scrollTop
    
    // הסרת כל תגי ה-HTML מהטקסט הנבחר
    // הערת אבטחה: false positive מאומת עבור התראת CodeQL js/incomplete-multi-character-sanitization (נסגרה ידנית ב-GitHub, ראו הסבר): editor convenience
    // action, not the security boundary — see note on the identical pattern above; rendering
    // always goes through DOMPurify.sanitize() first.
    const cleanedText = selectedText.replace(/<[^>]*>/g, '')
    const newText = content.substring(0, start) + cleanedText + content.substring(end)
    
    updateTextWithHistory(newText)
    
    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(start, start + cleanedText.length)
      textarea.scrollTop = scrollTop
    }, 0)
  }, [content, showAlert, updateTextWithHistory])

  const normalizeHebrewQuotes = useCallback((value) => {
    if (!value) return ''
    return value.replace(/["']/g, m => (m === '"' ? '״' : '׳'))
  }, [])

  const handleFindNextInternal = useCallback((textToFind, isRegexMode, suppressAlerts = false) => {
    if (!textToFind) {
      if (!suppressAlerts) showAlert('שגיאה', 'הזן טקסט לחיפוש')
      return false
    }
    if (!textareaRef.current) return false

    const textarea = textareaRef.current
    const text = content
    const processPattern = (str) => str.replaceAll('^13', '\n')
    const patternStr = processPattern(textToFind)
    
    const startPos = textarea.selectionEnd || 0
    let matchIndex = -1
    let matchLength = 0

    if (isRegexMode) {
      try {
        const regex = new RegExp(patternStr, 'g')
        regex.lastIndex = startPos
        const match = regex.exec(text)
        
        if (match) {
          matchIndex = match.index
          matchLength = match[0].length
        } else {
          regex.lastIndex = 0
          const matchFromStart = regex.exec(text)
          if (matchFromStart) {
            matchIndex = matchFromStart.index
            matchLength = matchFromStart[0].length
            if (!suppressAlerts) {
              showAlert('חיפוש', 'הגענו לסוף הקובץ, ממשיכים מההתחלה.')
            }
          }
        }
      } catch (e) {
        if (!suppressAlerts) showAlert('שגיאה', 'ביטוי רגולרי לא תקין')
        return false
      }
    } else {
      matchIndex = text.indexOf(patternStr, startPos)
      if (matchIndex === -1) {
        matchIndex = text.indexOf(patternStr, 0)
        if (matchIndex !== -1 && !suppressAlerts) {
          showAlert('חיפוש', 'הגענו לסוף הקובץ, ממשיכים מההתחלה.')
        }
      }
      matchLength = patternStr.length
    }

    if (matchIndex !== -1) {
      textarea.focus()
      textarea.setSelectionRange(matchIndex, matchIndex + matchLength)
      
      // שימוש בפונקציה המדויקת לחישוב מיקום הקורסור
      setTimeout(() => {
        const computedLineHeight = Number.parseFloat(window.getComputedStyle(textarea).lineHeight)
        const lineHeight = Number.isFinite(computedLineHeight) ? computedLineHeight : 24
        const caretTop = getTextareaCaretTop(textarea, matchIndex)
        const scrollPos = Math.max(0, caretTop - (textarea.clientHeight / 2) + lineHeight)
        
        textarea.scrollTop = scrollPos
      }, 10)
      return true
    }

    if (!suppressAlerts) {
      showAlert('חיפוש', 'לא נמצאו מופעים.')
    }
    return false
  }, [content, showAlert])

  const handleFindNext = useCallback((textToFind, isRegexMode) => {
    return handleFindNextInternal(textToFind, isRegexMode, false)
  }, [handleFindNextInternal])


  const clearSpellcheckHighlights = useCallback(() => {
    if (typeof document === 'undefined') return
    const containers = []
    if (previewRef.current) containers.push(previewRef.current)
    if (contentRef.current) containers.push(contentRef.current)
    containers.forEach(container => {
      container.querySelectorAll('span.spellcheck-highlight').forEach(mark => {
        const textNode = document.createTextNode(mark.textContent || '')
        mark.replaceWith(textNode)
      })
    })
  }, [])

  const findNextWholeWordInTextarea = useCallback((textarea, word, suppressAlerts = false) => {
    return findNextWholeWordInTextareaUtil(textarea, word, {
      text: content,
      suppressAlerts,
      onWrap: () => showAlert('חיפוש', 'הגענו לסוף הקובץ, ממשיכים מההתחלה.'),
      getCaretTop: getTextareaCaretTop,
      scrollDelay: 0
    })
  }, [content, showAlert])

  const highlightFirstOccurrence = useCallback((container, word) => {
    if (!container || !word || typeof document === 'undefined') return false
    const testRe = buildWholeWordRegex(word, false)
    const execRe = buildWholeWordRegex(word, true)
    if (!testRe || !execRe) return false

    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        if (!node.nodeValue) return NodeFilter.FILTER_REJECT
        return testRe.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP
      }
    })

    let node = walker.nextNode()
    while (node) {
      const text = node.nodeValue || ''
      execRe.lastIndex = 0
      const match = execRe.exec(text)
      if (match) {
        const prefixLen = match[1] ? match[1].length : 0
        const matchText = match[2] || word
        const index = match.index + prefixLen
        const before = text.slice(0, index)
        const after = text.slice(index + matchText.length)

        const highlight = document.createElement('span')
        highlight.className = 'spellcheck-highlight'
        highlight.textContent = matchText

        const frag = document.createDocumentFragment()
        if (before) frag.appendChild(document.createTextNode(before))
        frag.appendChild(highlight)
        if (after) frag.appendChild(document.createTextNode(after))

        node.parentNode.replaceChild(frag, node)
        highlight.scrollIntoView({ block: 'center', behavior: 'smooth' })
        return true
      }
      node = walker.nextNode()
    }

    return false
  }, [])

  const highlightOccurrenceByIndex = useCallback((container, variants, targetIndex) => {
    if (!container || !variants || variants.length === 0) return false
    
    // Create a combined regex for all variants
    const validVariants = variants.filter(word => word && typeof word === 'string')
    if (validVariants.length === 0) return false
    
    // Escape special regex characters and create combined pattern
    const escapedVariants = validVariants.map(word => 
      word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    )
    const combinedPattern = `(^|\\s|[^\\u05D0-\\u05EA])(${escapedVariants.join('|')})(?=\\s|[^\\u05D0-\\u05EA]|$)`
    
    let combinedRegex
    try {
      combinedRegex = new RegExp(combinedPattern, 'g')
    } catch (e) {
      console.warn('Failed to create combined regex:', e)
      return false
    }

    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        if (!node.nodeValue) return NodeFilter.FILTER_REJECT
        return combinedRegex.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP
      }
    })

    let currentIndex = 0
    let node = walker.nextNode()
    
    while (node) {
      const text = node.nodeValue || ''
      combinedRegex.lastIndex = 0
      let match
      
      while ((match = combinedRegex.exec(text)) !== null) {
        if (currentIndex === targetIndex) {
          const prefixLen = match[1] ? match[1].length : 0
          const matchText = match[2]
          const index = match.index + prefixLen
          const before = text.slice(0, index)
          const after = text.slice(index + matchText.length)

          const highlight = document.createElement('span')
          highlight.className = 'spellcheck-highlight'
          highlight.textContent = matchText

          const frag = document.createDocumentFragment()
          if (before) frag.appendChild(document.createTextNode(before))
          frag.appendChild(highlight)
          if (after) frag.appendChild(document.createTextNode(after))

          node.parentNode.replaceChild(frag, node)
          highlight.scrollIntoView({ block: 'center', behavior: 'smooth' })
          return true
        }
        currentIndex++
      }
      node = walker.nextNode()
    }
    
    return false
  }, [])

  const _highlightFirstOccurrenceAny = useCallback((container, variants) => {
    if (!container || !variants || variants.length === 0) return false
    for (let i = 0; i < variants.length; i += 1) {
      if (highlightFirstOccurrence(container, variants[i])) return true
    }
    return false
  }, [highlightFirstOccurrence])

  const buildWordVariants = useCallback((word) => {
    if (!word) return []
    const normalized = normalizeHebrewQuotes(word)
    const alt = normalized.replace(/[״׳]/g, m => (m === '״' ? '"' : "'"))
    const variants = [word, normalized, alt].filter(Boolean)
    return Array.from(new Set(variants))
  }, [normalizeHebrewQuotes])

  const handleSpellcheckSelect = useCallback((word, ignoreCount = 0) => {
    if (!word) return
    const variants = buildWordVariants(word)

    if (editMode && textareaRef.current) {
      const textarea = textareaRef.current
      textarea.focus()
      let found = false
      
      // Try each variant until we find one
      for (const variant of variants) {
        if (found) break
        
        // Start from the beginning of the text
        textarea.setSelectionRange(0, 0)
        
        // Skip the ignored occurrences by calling findNext multiple times
        let currentSkipped = 0
        let foundCurrent = true
        
        while (currentSkipped <= ignoreCount && foundCurrent) {
          foundCurrent = findNextWholeWordInTextarea(textarea, variant, {
            suppressAlerts: true
          })
          
          if (!foundCurrent) break
          
          if (currentSkipped === ignoreCount) {
            found = true
            break
          }
          
          // Move cursor to after the current match to find the next one
          const currentEnd = textarea.selectionEnd
          textarea.setSelectionRange(currentEnd, currentEnd)
          currentSkipped++
        }
        
        if (found) break
      }
      
      if (!found) {
        showAlert('חיפוש', 'לא נמצאו מופעים נוספים.')
      }
      return
    }

    clearSpellcheckHighlights()
    if (!editMode && contentRef.current) {
      // For non-edit mode, highlight the occurrence based on ignore count
      highlightOccurrenceByIndex(contentRef.current, variants, ignoreCount)
    }
  }, [buildWordVariants, clearSpellcheckHighlights, editMode, findNextWholeWordInTextarea, showAlert, highlightOccurrenceByIndex])
  const handleReplaceCurrent = useCallback((textToReplace, textToFind, isRegexMode) => {
    if (!textToFind) return showAlert('שגיאה', 'הזן טקסט לחיפוש')
    if (!textareaRef.current) return

    const textarea = textareaRef.current

    if (textarea.selectionStart === textarea.selectionEnd) {
      handleFindNext(textToFind, isRegexMode)
      return
    }

    const processPattern = (str) => str.replaceAll('^13', '\n')
    const patternStr = processPattern(textToFind)
    const replacement = processPattern(textToReplace || '')

    let finalReplacement = replacement

    if (isRegexMode) {
      try {
        const selectedText = textarea.value.substring(textarea.selectionStart, textarea.selectionEnd)
        const regex = new RegExp(patternStr)
        finalReplacement = selectedText.replace(regex, replacement)
      } catch (e) {
        console.error('Regex replacement error:', e)
        return showAlert('שגיאה', 'ביטוי רגולרי לא תקין')
      }
    }

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const newText = content.substring(0, start) + finalReplacement + content.substring(end)
    
    updateTextWithHistory(newText)
    
    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(start + finalReplacement.length, start + finalReplacement.length)
    }, 0)

    handleFindNext(textToFind, isRegexMode)
  }, [content, handleFindNext, showAlert, updateTextWithHistory])

  const handleReplaceAll = useCallback((overrideFind = null, overrideReplace = null, useRegexOverride = null) => {
    const textToFind = overrideFind !== null ? overrideFind : findText
    const textToReplace = overrideReplace !== null ? overrideReplace : replaceText
    const isRegexMode = useRegexOverride !== null ? useRegexOverride : useRegex

    if (!textToFind) return showAlert('שגיאה', 'הזן טקסט לחיפוש')
    
    const processPattern = (str) => str.replaceAll('^13', '\n')
    const patternStr = processPattern(textToFind)
    const replacement = processPattern(textToReplace || '')

    const createRegex = (global) => {
      try {
        if (isRegexMode) {
          return new RegExp(patternStr, global ? 'g' : '')
        } else {
          const escaped = patternStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          return new RegExp(escaped, global ? 'g' : '')
        }
      } catch (e) {
        return null
      }
    }

    const regex = createRegex(true)
    if (!regex) return showAlert('שגיאה', 'ביטוי רגולרי לא תקין')

    const matches = content.match(regex)
    const count = matches ? matches.length : 0
    
    if (count === 0) {
      return showAlert('לידיעתך', 'לא נמצאו תוצאות התואמות לחיפוש.')
    }

    const newContent = content.replace(regex, replacement)
    updateTextWithHistory(newContent)
    
    showAlert('הצלחה', `ההחלפה בוצעה בהצלחה! הוחלפו ${count} מופעים.`)
  }, [content, findText, replaceText, useRegex, showAlert, updateTextWithHistory])

  const handleRemoveDigits = useCallback(() => {
    const newContent = content.replace(/\d+/g, '')
    updateTextWithHistory(newContent)
    showAlert('הצלחה', 'הספרות הוסרו בהצלחה!')
  }, [content, showAlert, updateTextWithHistory])

  const addSavedSearch = useCallback((label, newFindText, newReplaceText, isRegex = false) => {
    const newSearch = {
      id: Date.now().toString(),
      label: label || newFindText,
      findText: newFindText,
      replaceText: newReplaceText,
      isRegex: isRegex
    }
    const updated = [...savedSearches, newSearch]
    setSavedSearches(updated)
    localStorage.setItem('dicta_saved_searches', JSON.stringify(updated))
    showAlert('הצלחה', 'החיפוש נשמר בהצלחה!')
  }, [savedSearches, showAlert])

  const removeSavedSearch = useCallback((id) => {
    const updated = savedSearches.filter(s => s.id !== id)
    setSavedSearches(updated)
    localStorage.setItem('dicta_saved_searches', JSON.stringify(updated))
  }, [savedSearches])

  const moveSearch = useCallback((index, direction) => {
    const newSearches = [...savedSearches]
    if (direction === 'up' && index > 0) {
      [newSearches[index - 1], newSearches[index]] = [newSearches[index], newSearches[index - 1]]
    } else if (direction === 'down' && index < newSearches.length - 1) {
      [newSearches[index], newSearches[index + 1]] = [newSearches[index + 1], newSearches[index]]
    }
    setSavedSearches(newSearches)
    localStorage.setItem('dicta_saved_searches', JSON.stringify(newSearches))
  }, [savedSearches])

  const runAllSavedReplacements = useCallback(() => {
    if (savedSearches.length === 0) {
      return showAlert('שגיאה', 'אין חיפושים שמורים')
    }

    let currentContent = content
    let totalReplacements = 0

    savedSearches.forEach(search => {
      if (search.isRemoveDigits) {
        currentContent = currentContent.replace(/\d+/g, '')
      } else {
        const processPattern = (str) => str.replaceAll('^13', '\n')
        const patternStr = processPattern(search.findText)
        const replacement = processPattern(search.replaceText || '')

        try {
          let regex
          if (search.isRegex) {
            regex = new RegExp(patternStr, 'g')
          } else {
            const escaped = patternStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            regex = new RegExp(escaped, 'g')
          }

          const matches = currentContent.match(regex)
          if (matches) {
            totalReplacements += matches.length
            currentContent = currentContent.replace(regex, replacement)
          }
        } catch (e) {
          console.error('Error in saved search:', e)
        }
      }
    })

    updateTextWithHistory(currentContent)
    showAlert('הצלחה', `בוצעו ${totalReplacements} החלפות מתוך ${savedSearches.length} חיפושים שמורים.`)
  }, [content, savedSearches, showAlert, updateTextWithHistory])

  const onAddRemoveDigitsToSaved = useCallback(() => {
    const newSearch = {
      id: Date.now().toString(),
      label: 'ניקוי ספרות',
      isRemoveDigits: true
    }
    const updated = [...savedSearches, newSearch]
    setSavedSearches(updated)
    localStorage.setItem('dicta_saved_searches', JSON.stringify(updated))
    showAlert('הצלחה', 'פעולת ניקוי ספרות נוספה לרשימה!')
  }, [savedSearches, showAlert])

  const toc = useMemo(() => buildTocFromContent(deferredContent), [deferredContent])

  const saveUserShortcuts = useCallback((newShortcuts) => {
    setUserShortcuts(newShortcuts)
    localStorage.setItem('dicta_editor_shortcuts', JSON.stringify(newShortcuts))
    showAlert('הצלחה', 'קיצורי המקלדת עודכנו בהצלחה')
  }, [showAlert])

  const resetShortcutsToDefaults = useCallback(() => {
    setUserShortcuts(DEFAULT_SHORTCUTS)
    localStorage.setItem('dicta_editor_shortcuts', JSON.stringify(DEFAULT_SHORTCUTS))
    showAlert('הצלחה', 'קיצורי המקלדת אופסו')
  }, [showAlert])

  // בונה טולטיפ הכולל את קיצור המקלדת המוגדר לפעולה (גלובלי או של המשתמש)
  const tip = useCallback((base, actionId) => withShortcut(base, userShortcuts, actionId), [userShortcuts])

  const actionsMap = useMemo(() => ({
    'save': { label: saveLabel, action: () => onSave && onSave(content) },
    'toggleEdit': { label: 'מעבר בין עריכה לתצוגה', action: handleToggleEditMode },
    'fontIncrease': { label: 'הגדל גופן', action: () => setFontSize(prev => Math.min(32, prev + 2)) },
    'fontDecrease': { label: 'הקטן גופן', action: () => setFontSize(prev => Math.max(12, prev - 2)) },
    'alignRight': { label: 'יישור לימין', action: () => setTextAlign('right') },
    'alignCenter': { label: 'יישור למרכז', action: () => setTextAlign('center') },
    'alignLeft': { label: 'יישור לשמאל', action: () => setTextAlign('left') },
    'alignJustify': { label: 'יישור מלא', action: () => setTextAlign('justify') },
    'bold': { label: 'מודגש (B)', action: () => insertTag('b') },
    'italic': { label: 'נטוי (I)', action: () => insertTag('i') },
    'underline': { label: 'קו תחתון (U)', action: () => insertTag('u') },
    'h1': { label: 'כותרת H1', action: () => insertTag('h1') },
    'h2': { label: 'כותרת H2', action: () => insertTag('h2') },
    'h3': { label: 'כותרת H3', action: () => insertTag('h3') },
    'h4': { label: 'כותרת H4', action: () => insertTag('h4') },
    'h5': { label: 'כותרת H5', action: () => insertTag('h5') },
    'h6': { label: 'כותרת H6', action: () => insertTag('h6') },
    'bigger': { label: 'הגדל גופן טקסט', action: () => insertTag('big') },
    'smaller': { label: 'הקטן גופן טקסט', action: () => insertTag('small') },
    'removeTags': { label: 'הסרת תגים', action: removeTags },
    'undo': { label: 'ביטול (Undo)', action: undo },
    'redo': { label: 'ביצוע מחדש (Redo)', action: redo },
    'findReplace': { label: 'חיפוש והחלפה', action: () => setShowFindReplace(true) },
    'createHeaders': { label: 'יצירת כותרות', action: () => setActiveTool('createHeaders') },
    'singleLetterHeaders': { label: 'כותרות אותיות', action: () => setActiveTool('singleLetterHeaders') },
    'changeHeading': { label: 'שינוי רמת כותרת', action: () => setActiveTool('changeHeading') },
    'punctuate': { label: 'הדגשה וניקוד', action: () => setActiveTool('punctuate') },
    'pageBHeader': { label: 'כותרות עמוד ב', action: () => setActiveTool('pageBHeader') },
    'replacePageB': { label: 'החלפת עמוד ב', action: () => setActiveTool('replacePageB') },
    'addPageNumber': { label: 'מיזוג דף ועמוד', action: () => setActiveTool('addPageNumber') },
    'headerCheck': { label: 'בדיקת שגיאות בכותרות', action: () => setActiveTool('headerCheck') },
    'cleanText': { label: 'ניקוי טקסט', action: () => setActiveTool('cleanText') },
    'embedImage': { label: 'הטמעת תמונה', action: () => setActiveTool('embedImage') },
    'shortcuts': { label: 'ערוך קיצורי מקלדת', action: () => setShowShortcutsDialog(true) },
  }), [onSave, content, saveLabel, handleToggleEditMode, insertTag, removeTags, undo, redo])

  const availableActions = useMemo(() => {
    // actionsMap הוא אובייקט ממומואיז (useMemo) רגיל ולא ref; קריאת def.label בטוחה ברינדור.
    // eslint-disable-next-line react-hooks/refs
    return Object.entries(actionsMap).map(([id, def]) => ({
      id,
      label: def.label
    }))
  }, [actionsMap])

  // refs לערכים העדכניים כדי לרשום את מאזין המקלדת פעם אחת בלבד ולא בכל הקלדה
  const actionsMapRef = useRef(actionsMap)
  const userShortcutsRef = useRef(userShortcuts)
  const showShortcutsDialogRef = useRef(showShortcutsDialog)
  // סנכרון ה-refs מתבצע ב-effect (לא ישירות ברינדור) כדי לא לגעת ב-ref.current תוך כדי רינדור
  useEffect(() => {
    actionsMapRef.current = actionsMap
    userShortcutsRef.current = userShortcuts
    showShortcutsDialogRef.current = showShortcutsDialog
  })

  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (showShortcutsDialogRef.current) return

      if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return

      const modifiers = []
      if (e.ctrlKey) modifiers.push('Ctrl')
      if (e.altKey) modifiers.push('Alt')
      if (e.shiftKey) modifiers.push('Shift')
      if (e.metaKey) modifiers.push('Meta')

      const code = e.code

      const combination = [...modifiers, code].join('+')

      const shortcuts = userShortcutsRef.current
      const foundActionId = Object.keys(shortcuts).find(actionId => {
        return shortcuts[actionId] === combination
      })

      if (foundActionId && actionsMapRef.current[foundActionId]) {
        e.preventDefault()
        e.stopPropagation()
        actionsMapRef.current[foundActionId].action()
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', handleGlobalKeyDown, { capture: true })
  }, [])

  const scrollToHeading = useCallback((index) => {
    if (editMode) {
      if (!textareaRef.current || !toc[index]) return;
      
      const textarea = textareaRef.current;
      const heading = toc[index];
      const matchIndex = heading.position;
      
      if (matchIndex !== -1) {
        textarea.focus();
        textarea.setSelectionRange(matchIndex, matchIndex + heading.html.length);
        
        const computedLineHeight = Number.parseFloat(window.getComputedStyle(textarea).lineHeight);
        const lineHeight = Number.isFinite(computedLineHeight) ? computedLineHeight : fontSize * 1.5;
        const caretTop = getTextareaCaretTop(textarea, matchIndex);
        const scrollPos = Math.max(0, caretTop - (textarea.clientHeight / 2) + lineHeight);
        
        textarea.scrollTop = scrollPos;
      }
      return;
    }

    const targetRef = (editMode && showPreview) ? previewRef : contentRef;
    if (!targetRef.current) return;
    
    const container = (editMode && showPreview) 
      ? targetRef.current.querySelector('div[class*="prose"]') || targetRef.current
      : targetRef.current;
    
    const headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6');
    if (headings[index]) {
      headings[index].scrollIntoView({ behavior: 'smooth', block: 'center' });
      headings[index].style.backgroundColor = '#fff3cd';
      setTimeout(() => {
        headings[index].style.backgroundColor = '';
      }, 2000);
    }
  }, [editMode, showPreview, fontSize, toc])

  // כפתור השמירה לא קושר את content (שמשתנה בכל הקלדה) כדי שה-header הממומואיז יישאר יציב
  const latestContentRef = useRef(content)
  // סנכרון ה-ref מתבצע ב-effect (לא ישירות ברינדור) כדי לא לגעת ב-ref.current תוך כדי רינדור
  useEffect(() => {
    latestContentRef.current = content
  })
  const handleSaveClick = useCallback(() => {
    if (onSave) onSave(latestContentRef.current)
  }, [onSave])

  // memoization של אזורים שאינם תלויים בתוכן - מונע reconciliation שלהם בכל הקלדה
  const tocSidebar = useMemo(() => (
    <aside className="w-64 bg-white border-r p-4 overflow-y-auto shadow-sm">
      <h3 className="font-bold text-lg mb-4 text-neutral-800">תוכן עניינים</h3>
      {toc.length === 0 ? (
        <p className="text-sm text-neutral-500">אין כותרות בספר</p>
      ) : (
        <ul className="space-y-2">
          {toc.map((item, index) => (
            <li
              key={item.id}
              className="cursor-pointer hover:bg-neutral-100 p-2 rounded transition-colors"
              style={{ paddingRight: `${(item.level - 1) * 12}px` }}
              onClick={() => scrollToHeading(index)}
            >
              <span className="text-sm text-neutral-700">{item.text}</span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  ), [toc, scrollToHeading])

  const toolsSidebar = useMemo(() => {
    if (!canEdit) return null
    const toolButton = (tool, icon, label, title = label) => (
      <button
        onClick={() => setActiveTool(tool)}
        className={`${toolbarExpanded ? 'flex items-center gap-3 px-4 py-3' : 'p-3'} hover:bg-neutral-100 rounded-lg transition-colors mx-2`}
        title={tip(title, tool)}
      >
        <span className="material-symbols-outlined text-neutral-700">{icon}</span>
        {toolbarExpanded && <span className="text-sm text-neutral-700">{label}</span>}
      </button>
    )

    return (
      <aside className={`${toolbarExpanded ? 'w-56' : 'w-20'} bg-white border-l flex flex-col py-4 gap-2 overflow-y-auto shadow-sm transition-all duration-300`}>
        {toolbarExpanded && (
          <div className="px-4 mb-2">
            <span className="text-sm font-medium text-neutral-700">כלי עריכה</span>
          </div>
        )}
        {toolButton('createHeaders', 'title', 'יצירת כותרות')}
        {toolButton('singleLetterHeaders', 'format_size', 'כותרות אותיות')}
        {toolButton('changeHeading', 'format_indent_increase', 'שינוי רמת כותרת')}
        {toolButton('punctuate', 'format_bold', 'הדגשה וניקוד')}
        {toolButton('pageBHeader', 'find_in_page', 'כותרות עמוד ב')}
        {toolButton('replacePageB', 'swap_horiz', 'החלפת עמוד ב')}
        {toolButton('addPageNumber', 'auto_stories', 'מיזוג דף ועמוד')}
        {toolButton('headerCheck', 'bug_report', 'בדיקת שגיאות', 'בדיקת שגיאות בכותרות')}
        {toolButton('cleanText', 'cleaning_services', 'ניקוי טקסט')}
        {toolButton('embedImage', 'image', 'הטמעת תמונה')}
        <div className="flex-1"></div>
        <div className="border-t pt-2 mt-2">
          <button
            onClick={() => setToolbarExpanded(!toolbarExpanded)}
            className={`${toolbarExpanded ? 'flex items-center gap-3 px-4 py-3' : 'p-3'} hover:bg-neutral-100 rounded-lg transition-colors mx-2 w-full`}
            title={toolbarExpanded ? 'כווץ סרגל' : 'הרחב סרגל'}
          >
            <span className="material-symbols-outlined text-neutral-600">
              {toolbarExpanded ? 'chevron_right' : 'chevron_left'}
            </span>
            {toolbarExpanded && <span className="text-sm text-neutral-600">{toolbarExpanded ? 'כווץ' : 'הרחב'}</span>}
          </button>
        </div>
      </aside>
    )
  }, [canEdit, toolbarExpanded, tip])

  // ה-header אינו תלוי בתוכן (השמירה דרך handleSaveClick) - ממומואיז כדי לא לרנדר ~100 כפתורים בכל הקלדה
  const headerNode = useMemo(() => (
      <header className="glass-strong border-b border-surface-variant sticky top-0 z-40">
        <div className={singleLineHeader && headerCompact ? 'px-2 py-2' : 'container mx-auto px-4 py-3'}>
          {singleLineHeader ? (
            headerCompact ? (
              // שורה אחת קומפקטית - כל המסכים
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  {headerStartElement}
                  <h1 className="text-base font-bold text-on-surface">{title}</h1>
                  
                  <Button
                    icon="unfold_more"
                    variant="ghost"
                    size="sm"
                    onClick={() => setHeaderCompact(false)}
                    title="הרחב כותרת"
                  />
                  
                  {canEdit && (
                    <>
                      <div className="w-px h-5 bg-surface-variant"></div>
                      <Button
                        icon="find_replace"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowFindReplace(true)}
                        title={tip("חיפוש והחלפה", 'findReplace')}
                      />
                      {enableSpellcheck && (
                      <Button
                        icon="spellcheck"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowSpellcheck(true)}
                        title="בדיקת איות"
                      />
                      )}
                      <Button
                        icon="keyboard"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowShortcutsDialog(true)}
                        title={tip("קיצורי מקשים", 'shortcuts')}
                      />
                      <Button
                        icon={editMode ? 'visibility' : 'edit'}
                        variant="ghost"
                        size="sm"
                        onClick={handleToggleEditMode}
                        title={tip(editMode ? 'תצוגה' : 'עריכה ידנית', 'toggleEdit')}
                      />
                    </>
                  )}

                  <div className="flex items-center bg-neutral-100 rounded-lg p-0.5 gap-0.5 border border-neutral-200">
                    <Button
                      icon="format_align_right"
                      variant={textAlign === 'right' ? 'primary' : 'ghost'}
                      size="sm"
                      onClick={() => setTextAlign('right')}
                      title={tip("יישור לימין", 'alignRight')}
                    />
                    <Button
                      icon="format_align_center"
                      variant={textAlign === 'center' ? 'primary' : 'ghost'}
                      size="sm"
                      onClick={() => setTextAlign('center')}
                      title={tip("יישור למרכז", 'alignCenter')}
                    />
                    <Button
                      icon="format_align_left"
                      variant={textAlign === 'left' ? 'primary' : 'ghost'}
                      size="sm"
                      onClick={() => setTextAlign('left')}
                      title={tip("יישור לשמאל", 'alignLeft')}
                    />
                    <Button
                      icon="format_align_justify"
                      variant={textAlign === 'justify' ? 'primary' : 'ghost'}
                      size="sm"
                      onClick={() => setTextAlign('justify')}
                      title={tip("יישור מלא", 'alignJustify')}
                    />
                  </div>

                  <Button
                    icon="remove"
                    variant="ghost"
                    size="sm"
                    onClick={() => setFontSize(prev => Math.max(12, prev - 2))}
                    title={tip("הקטן גופן", 'fontDecrease')}
                  />
                  <span className="text-xs font-medium w-5 text-center">{fontSize}</span>
                  <Button
                    icon="add"
                    variant="ghost"
                    size="sm"
                    onClick={() => setFontSize(prev => Math.min(32, prev + 2))}
                    title={tip("הגדל גופן", 'fontIncrease')}
                  />

                  <div className="relative">
                    <select 
                      value={selectedFont} 
                      onChange={(e) => setSelectedFont(e.target.value)} 
                      className="appearance-none pl-1 pr-5 h-7 bg-white border border-neutral-200 rounded-md text-xs font-medium focus:outline-none hover:bg-neutral-50 cursor-pointer"
                    >
                      <option value="'Times New Roman'">Times</option>
                      <option value="monospace">Mono</option>
                      <option value="Arial">Arial</option>
                      <option value="'Courier New'">Courier</option>
                      <option value="Georgia">Georgia</option>
                      <option value="Verdana">Verdana</option>
                    </select>
                    <span className="material-symbols-outlined text-sm absolute left-0.5 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-500">expand_more</span>
                  </div>
                  
                  {canEdit && !isCompleted && (
                    <>
                      <Button
                        icon="save"
                        variant={hasUnsavedChangesOuter ? "primary" : "ghost"}
                        size="sm"
                        onClick={handleSaveClick}
                        loading={saving}
                        title={tip(hasUnsavedChangesOuter ? "שמור שינויים" : "שמירה", 'save')}
                      />
                    </>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {headerEndElement}
                </div>
              </div>
            ) : (
              // שתי שורות מורחבות - כל המסכים
              <>
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {headerStartElement}
                  <div>
                    <h1 className="text-lg font-bold text-on-surface">{title}</h1>
                    <p className="text-xs text-on-surface/60">עריכה אופליין</p>
                  </div>
                </div>
                <div>
                  {headerEndElement}
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-surface-variant/50 pt-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <Button
                    icon="unfold_less"
                    variant="ghost"
                    size="sm"
                    onClick={() => setHeaderCompact(true)}
                    title="כווץ כותרת"
                  />
                  <div className="w-px h-6 bg-surface-variant"></div>
                  
                  {canEdit && (
                    <>
                      <Button
                        icon="find_replace"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowFindReplace(true)}
                        label="חיפוש"
                        title={tip("חיפוש והחלפה", 'findReplace')}
                      />
                      {enableSpellcheck && (
                      <Button
                        icon="spellcheck"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowSpellcheck(true)}
                        label="איות"
                      />
                      )}
                      <Button
                        icon="keyboard"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowShortcutsDialog(true)}
                        label="קיצורי מקשים"
                        title={tip("קיצורי מקשים", 'shortcuts')}
                      />
                      <Button
                        icon={editMode ? 'visibility' : 'edit'}
                        variant="ghost"
                        size="sm"
                        onClick={handleToggleEditMode}
                        label={editMode ? 'תצוגה' : 'עריכה ידנית'}
                        title={tip(editMode ? 'תצוגה' : 'עריכה ידנית', 'toggleEdit')}
                      />
                    </>
                  )}

                  <div className="flex items-center bg-neutral-100 rounded-lg p-1 gap-1 border border-neutral-200 mx-2">
                    <Button
                      icon="format_align_right"
                      variant={textAlign === 'right' ? 'primary' : 'ghost'}
                      size="sm"
                      onClick={() => setTextAlign('right')}
                      title={tip("יישור לימין", 'alignRight')}
                    />
                    <Button
                      icon="format_align_center"
                      variant={textAlign === 'center' ? 'primary' : 'ghost'}
                      size="sm"
                      onClick={() => setTextAlign('center')}
                      title={tip("יישור למרכז", 'alignCenter')}
                    />
                    <Button
                      icon="format_align_left"
                      variant={textAlign === 'left' ? 'primary' : 'ghost'}
                      size="sm"
                      onClick={() => setTextAlign('left')}
                      title={tip("יישור לשמאל", 'alignLeft')}
                    />
                    <Button
                      icon="format_align_justify"
                      variant={textAlign === 'justify' ? 'primary' : 'ghost'}
                      size="sm"
                      onClick={() => setTextAlign('justify')}
                      title={tip("יישור מלא", 'alignJustify')}
                    />
                  </div>

                  <Button
                    icon="remove"
                    variant="ghost"
                    size="sm"
                    onClick={() => setFontSize(prev => Math.max(12, prev - 2))}
                    title={tip("הקטן גופן", 'fontDecrease')}
                  />
                  <span className="text-sm font-medium w-6 text-center">{fontSize}</span>
                  <Button
                    icon="add"
                    variant="ghost"
                    size="sm"
                    onClick={() => setFontSize(prev => Math.min(32, prev + 2))}
                    title={tip("הגדל גופן", 'fontIncrease')}
                  />

                  <div className="w-px h-6 bg-neutral-300 mx-2"></div>

                  <div className="relative">
                    <select 
                      value={selectedFont} 
                      onChange={(e) => setSelectedFont(e.target.value)} 
                      className="appearance-none pl-2 pr-6 h-8 bg-white border border-neutral-200 rounded-md text-xs font-medium focus:outline-none hover:bg-neutral-50 cursor-pointer"
                    >
                      <option value="'Times New Roman'">Times New Roman</option>
                      <option value="monospace">Monospace</option>
                      <option value="Arial">Arial</option>
                      <option value="'Courier New'">Courier New</option>
                      <option value="Georgia">Georgia</option>
                      <option value="Verdana">Verdana</option>
                    </select>
                    <span className="material-symbols-outlined text-sm absolute left-1 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-500">expand_more</span>
                  </div>
                  
                  {canEdit && !isCompleted && (
                    <div className="flex gap-2 items-center mr-auto">
                      <Button
                        icon="save"
                        variant={hasUnsavedChangesOuter ? "primary" : "ghost"}
                        onClick={handleSaveClick}
                        loading={saving}
                        label={hasUnsavedChangesOuter ? `${saveLabel} *` : saveLabel}
                        title={tip(saveLabel, 'save')}
                      />
                      {hasUnsavedChangesOuter && (
                        <span className="text-danger-600 text-sm font-medium mr-2">ישנם שינויים לא שמורים</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
            </>
            )
          ) : (
            // שתי שורות - לאונליין
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                
                <div className="flex items-center gap-4">
                  {headerStartElement}
                  <div>
                    <div className="flex items-center gap-2">
                      <h1 className="text-lg font-bold text-on-surface">{title}</h1>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-on-surface/60">עריכת דיקטה</p>
                    </div>
                  </div>
                </div>

                <div>
                  {headerEndElement}
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-surface-variant/50 pt-3">
                <div className="flex items-center gap-3 flex-wrap">
                  {canEdit && (
                    <>
                      <Button
                        icon="find_replace"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowFindReplace(true)}
                        label="חיפוש"
                        title={tip("חיפוש והחלפה", 'findReplace')}
                      />
                      {enableSpellcheck && (
                      <Button
                        icon="spellcheck"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowSpellcheck(true)}
                        label="איות"
                      />
                      )}
                      <Button
                        icon="keyboard"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowShortcutsDialog(true)}
                        label="קיצורי מקשים"
                        title={tip("קיצורי מקשים", 'shortcuts')}
                      />
                      <Button
                        icon={editMode ? 'visibility' : 'edit'}
                        variant="ghost"
                        size="sm"
                        onClick={handleToggleEditMode}
                        label={editMode ? 'תצוגה' : 'עריכה ידנית'}
                        title={tip(editMode ? 'תצוגה' : 'עריכה ידנית', 'toggleEdit')}
                      />
                    </>
                  )}

                  <div className="flex items-center bg-neutral-100 rounded-lg p-1 gap-1 border border-neutral-200 mx-2">
                    <Button
                      icon="format_align_right"
                      variant={textAlign === 'right' ? 'primary' : 'ghost'}
                      size="sm"
                      onClick={() => setTextAlign('right')}
                      title={tip("יישור לימין", 'alignRight')}
                    />
                    <Button
                      icon="format_align_center"
                      variant={textAlign === 'center' ? 'primary' : 'ghost'}
                      size="sm"
                      onClick={() => setTextAlign('center')}
                      title={tip("יישור למרכז", 'alignCenter')}
                    />
                    <Button
                      icon="format_align_left"
                      variant={textAlign === 'left' ? 'primary' : 'ghost'}
                      size="sm"
                      onClick={() => setTextAlign('left')}
                      title={tip("יישור לשמאל", 'alignLeft')}
                    />
                    <Button
                      icon="format_align_justify"
                      variant={textAlign === 'justify' ? 'primary' : 'ghost'}
                      size="sm"
                      onClick={() => setTextAlign('justify')}
                      title={tip("יישור מלא", 'alignJustify')}
                    />
                  </div>

                  <Button
                    icon="remove"
                    variant="ghost"
                    size="sm"
                    onClick={() => setFontSize(prev => Math.max(12, prev - 2))}
                    title={tip("הקטן גופן", 'fontDecrease')}
                  />
                  <span className="text-sm font-medium w-6 text-center">{fontSize}</span>
                  <Button
                    icon="add"
                    variant="ghost"
                    size="sm"
                    onClick={() => setFontSize(prev => Math.min(32, prev + 2))}
                    title={tip("הגדל גופן", 'fontIncrease')}
                  />

                  <div className="w-px h-6 bg-neutral-300 mx-2"></div>

                  <div className="relative">
                    <select 
                      value={selectedFont} 
                      onChange={(e) => setSelectedFont(e.target.value)} 
                      className="appearance-none pl-2 pr-6 h-8 bg-white border border-neutral-200 rounded-md text-xs font-medium focus:outline-none hover:bg-neutral-50 cursor-pointer"
                    >
                      <option value="'Times New Roman'">Times New Roman</option>
                      <option value="monospace">Monospace</option>
                      <option value="Arial">Arial</option>
                      <option value="'Courier New'">Courier New</option>
                      <option value="Georgia">Georgia</option>
                      <option value="Verdana">Verdana</option>
                    </select>
                    <span className="material-symbols-outlined text-sm absolute left-1 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-500">expand_more</span>
                  </div>
                  
                  {canEdit && !isCompleted && (
                    <div className="flex gap-2 items-center mr-auto">
                      <Button
                        icon="save"
                        variant={hasUnsavedChangesOuter ? "primary" : "ghost"}
                        onClick={handleSaveClick}
                        loading={saving}
                        label={hasUnsavedChangesOuter ? `${saveLabel} *` : saveLabel}
                        title={tip(saveLabel, 'save')}
                      />
                      {hasUnsavedChangesOuter && (
                        <span className="text-danger-600 text-sm font-medium mr-2">ישנם שינויים לא שמורים</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </header>
  ), [singleLineHeader, headerCompact, headerStartElement, headerEndElement, title, canEdit, enableSpellcheck, isCompleted, editMode, textAlign, fontSize, selectedFont, hasUnsavedChangesOuter, saving, saveLabel, handleToggleEditMode, handleSaveClick, tip])

  return (
    <div className="flex flex-col h-screen bg-neutral-50" dir="rtl">
      {headerNode}

      <div className="flex flex-1 overflow-hidden">
        {toolsSidebar}

        <main ref={mainRef} className="flex-1 overflow-auto bg-white flex">
          {isPending ? (
            <div className="flex-1 flex items-center justify-center">
              <LoadingSpinner message="טוען..." />
            </div>
          ) : editMode && canEdit ? (
            <>
              <div className={`${showPreview ? 'flex-1' : 'w-full'} flex flex-col h-full border-l`}>
                <div className="bg-neutral-50 border-b px-4 py-2 flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    icon="format_bold"
                    variant="ghost"
                    size="sm"
                    onClick={() => insertTag('b')}
                    label="מודגש"
                    title={tip("מודגש", 'bold')}
                  />
                  <Button
                    icon="format_italic"
                    variant="ghost"
                    size="sm"
                    onClick={() => insertTag('i')}
                    label="נטוי"
                    title={tip("נטוי", 'italic')}
                  />
                  <Button
                    icon="format_underlined"
                    variant="ghost"
                    size="sm"
                    onClick={() => insertTag('u')}
                    label="קו תחתון"
                    title={tip("קו תחתון", 'underline')}
                  />
                  
                  <div className="w-px h-6 bg-neutral-300 mx-1"></div>
                  
                  <Button variant="ghost" size="sm" onClick={() => insertTag('h1')} label="H1" title={tip("כותרת H1", 'h1')} />
                  <Button variant="ghost" size="sm" onClick={() => insertTag('h2')} label="H2" title={tip("כותרת H2", 'h2')} />
                  <Button variant="ghost" size="sm" onClick={() => insertTag('h3')} label="H3" title={tip("כותרת H3", 'h3')} />
                  <Button variant="ghost" size="sm" onClick={() => insertTag('h4')} label="H4" title={tip("כותרת H4", 'h4')} />
                  <Button variant="ghost" size="sm" onClick={() => insertTag('h5')} label="H5" title={tip("כותרת H5", 'h5')} />
                  <Button variant="ghost" size="sm" onClick={() => insertTag('h6')} label="H6" title={tip("כותרת H6", 'h6')} />
                  
                  <div className="w-px h-6 bg-neutral-300 mx-1"></div>
                  
                  <Button
                    icon="text_increase"
                    variant="ghost"
                    size="sm"
                    onClick={() => insertTag('big')}
                    label="גדול"
                    title={tip("הגדל גופן טקסט", 'bigger')}
                  />
                  <Button
                    icon="text_decrease"
                    variant="ghost"
                    size="sm"
                    onClick={() => insertTag('small')}
                    label="קטן"
                    title={tip("הקטן גופן טקסט", 'smaller')}
                  />
                  
                  <div className="w-px h-6 bg-neutral-300 mx-1"></div>
                  
                  <Button
                    icon="format_clear"
                    variant="ghost"
                    size="sm"
                    onClick={removeTags}
                    label="הסר תגים"
                    title={tip("הסרת תגי HTML מהטקסט הנבחר", 'removeTags')}
                  />
                  </div>
                  
                  {!showPreview && (
                    <button
                      onClick={() => handleTogglePreview(true)}
                      className="flex items-center gap-1 text-xs text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 px-2 py-1 rounded transition-colors"
                      title="הצג תצוגה מקדימה"
                    >
                      <span className="material-symbols-outlined text-sm">visibility</span>
                      <span>הצג תצוגה מקדימה</span>
                    </button>
                  )}
                </div>
                
                <textarea
                  ref={textareaRef}
                  value={content}
                  onChange={handleTextareaChange}
                  onScroll={handleTextareaScroll}
                  spellCheck={false}
                  className="flex-1 p-6 border-0 resize-none focus:ring-0 outline-none"
                  style={{ fontSize: `${fontSize}px`, fontFamily: selectedFont, direction: 'rtl', textAlign: textAlign, lineHeight: 1.5 }}
                />
              </div>
              
              {showPreview && (
              <div className="w-1/2 flex flex-col bg-neutral-50">
                <div className="px-6 pt-6 pb-2 bg-neutral-50 sticky top-0 z-10 border-b border-neutral-200 flex items-center justify-between">
                  <span className="text-xs text-neutral-500 font-medium">תצוגה מקדימה</span>
                  <button
                    onClick={() => handleTogglePreview(false)}
                    className="flex items-center gap-1 text-xs text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 px-2 py-1 rounded transition-colors"
                    title="הסתר תצוגה מקדימה"
                  >
                    <span className="material-symbols-outlined text-sm">visibility_off</span>
                    <span>הסתר</span>
                  </button>
                </div>
                <div 
                  ref={previewRef}
                  className="flex-1 overflow-auto px-6 pb-6"
                  onScroll={handlePreviewScroll}
                >
                  <div
                    className="max-w-4xl mx-auto prose prose-lg [&_h1]:font-bold [&_h2]:font-bold [&_h3]:font-bold [&_h4]:font-bold [&_h5]:font-bold [&_h6]:font-bold bg-white p-6 rounded-lg shadow-sm"
                    style={{ fontSize: `${fontSize}px`, fontFamily: selectedFont, textAlign: textAlign, whiteSpace: 'pre-wrap' }}
                    dangerouslySetInnerHTML={{ __html: sanitizedContent }}
                  />
                </div>
              </div>
              )}
            </>
          ) : (
            <div className="flex-1 p-6">
              <div
                ref={contentRef}
                className="max-w-4xl mx-auto prose prose-lg [&_h1]:font-bold [&_h2]:font-bold [&_h3]:font-bold [&_h4]:font-bold [&_h5]:font-bold [&_h6]:font-bold"
                style={{ fontSize: `${fontSize}px`, fontFamily: selectedFont, textAlign: textAlign, whiteSpace: 'pre-wrap' }}
                dangerouslySetInnerHTML={{ __html: sanitizedContent }}
              />
            </div>
          )}
        </main>

        {tocSidebar}
      </div>

      <CreateHeadersModal
        isOpen={activeTool === 'createHeaders'}
        onClose={() => setActiveTool(null)}
        content={content}
        onContentChange={handleContentChange}
      />
      
      <SingleLetterHeadersModal
        isOpen={activeTool === 'singleLetterHeaders'}
        onClose={() => setActiveTool(null)}
        content={content}
        onContentChange={handleContentChange}
      />
      
      <ChangeHeadingModal
        isOpen={activeTool === 'changeHeading'}
        onClose={() => setActiveTool(null)}
        content={content}
        onContentChange={handleContentChange}
      />
      
      <PunctuateModal
        isOpen={activeTool === 'punctuate'}
        onClose={() => setActiveTool(null)}
        content={content}
        onContentChange={handleContentChange}
      />
      
      <PageBHeaderModal
        isOpen={activeTool === 'pageBHeader'}
        onClose={() => setActiveTool(null)}
        content={content}
        onContentChange={handleContentChange}
      />
      
      <ReplacePageBModal
        isOpen={activeTool === 'replacePageB'}
        onClose={() => setActiveTool(null)}
        content={content}
        onContentChange={handleContentChange}
      />
      
      <HeaderErrorCheckerModal
        isOpen={activeTool === 'headerCheck'}
        onClose={() => setActiveTool(null)}
        content={content}
        onContentChange={handleContentChange}
      />
      
      <TextCleanerModal
        isOpen={activeTool === 'cleanText'}
        onClose={() => setActiveTool(null)}
        content={content}
        onContentChange={handleContentChange}
      />

      <AddPageNumberModal
        isOpen={activeTool === 'addPageNumber'}
        onClose={() => setActiveTool(null)}
        content={content}
        onContentChange={handleContentChange}
      />

      <EmbedImageModal
        isOpen={activeTool === 'embedImage'}
        onClose={() => setActiveTool(null)}
        content={content}
        onContentChange={handleContentChange}
      />

      <ShortcutsDialog
        isOpen={showShortcutsDialog}
        onClose={() => setShowShortcutsDialog(false)}
        shortcuts={userShortcuts}
        availableActions={availableActions}
        saveShortcuts={saveUserShortcuts}
        resetToDefaults={resetShortcutsToDefaults}
      />

      <FindReplaceDialog
        isOpen={showFindReplace}
        onClose={() => setShowFindReplace(false)}
        findText={findText}
        setFindText={setFindText}
        replaceText={replaceText}
        setReplaceText={setReplaceText}
        handleReplaceAll={handleReplaceAll}
        handleFindNext={handleFindNext}
        handleReplaceCurrent={handleReplaceCurrent}
        savedSearches={savedSearches}
        addSavedSearch={addSavedSearch}
        removeSavedSearch={removeSavedSearch}
        moveSearch={moveSearch}
        runAllSavedReplacements={runAllSavedReplacements}
        handleRemoveDigits={handleRemoveDigits}
        onAddRemoveDigitsToSaved={onAddRemoveDigitsToSaved}
        useRegex={useRegex}
        setUseRegex={setUseRegex}
        editMode={editMode}
      />

      {enableSpellcheck && (
      <SpellcheckDialog
        isOpen={showSpellcheck}
        onClose={() => setShowSpellcheck(false)}
        text={content}
        onApplyText={handleSpellcheckApply}
        onSelectWord={handleSpellcheckSelect}
        title="בדיקת איות"
      />
      )}
    </div>
  )
}



















