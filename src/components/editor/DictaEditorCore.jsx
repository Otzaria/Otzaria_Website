'use client'

import { useState, useEffect, useRef, useMemo, useCallback, useTransition } from 'react'
import Button from '@/components/Button'
import { useDialog } from '@/components/DialogContext'
import LoadingSpinner from '@/components/LoadingSpinner'
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

export default function DictaEditorCore({ 
  initialContent = '', 
  title = 'ללא שם', 
  canEdit = true, 
  isCompleted = false,
  onSave, 
  saving = false,
  hasUnsavedChangesOuter = false,
  setHasUnsavedChanges = () => {},
  headerStartElement = null,
  headerEndElement = null,
  singleLineHeader = false
}) {
  const { showAlert } = useDialog()
  
  console.log('DictaEditorCore v2 - singleLineHeader:', singleLineHeader)
  
  const [content, setContent] = useState(initialContent)
  const [fontSize, setFontSize] = useState(18)
  const [selectedFont, setSelectedFont] = useState("'Times New Roman'")
  const [textAlign, setTextAlign] = useState('right')
  const [toc, setToc] = useState([])
  const [activeTool, setActiveTool] = useState(null)
  const [editMode, setEditMode] = useState(false)
  const [showShortcutsDialog, setShowShortcutsDialog] = useState(false)
  const [userShortcuts, setUserShortcuts] = useState(DEFAULT_SHORTCUTS)
  const [showFindReplace, setShowFindReplace] = useState(false)
  const [findText, setFindText] = useState('')
  const [replaceText, setReplaceText] = useState('')
  const [useRegex, setUseRegex] = useState(false)
  const [savedSearches, setSavedSearches] = useState([])
  const [showPreview, setShowPreview] = useState(true)
  const [isPending, startTransition] = useTransition()
  
  const [toolbarExpanded, setToolbarExpanded] = useState(false)
  const [headerCompact, setHeaderCompact] = useState(false)
  
  // מנגנון undo/redo
  const [history, setHistory] = useState([initialContent])
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
  const contentRef = useRef(null)
  const textareaRef = useRef(null)
  const previewRef = useRef(null)
  const scrollingSource = useRef(null)

  useEffect(() => {
    setContent(initialContent)
    setHistory([initialContent])
    setHistoryIndex(0)
  }, [initialContent])

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

  const updateTextWithHistory = useCallback((newText) => {
    setContent(newText)
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1)
      newHistory.push(newText)
      return newHistory
    })
    setHistoryIndex(prev => prev + 1)
  }, [historyIndex])
  
  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1
      setHistoryIndex(newIndex)
      setContent(history[newIndex])
    }
  }, [historyIndex, history])
  
  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1
      setHistoryIndex(newIndex)
      setContent(history[newIndex])
    }
  }, [historyIndex, history])

  const handleContentChange = useCallback((newContent) => {
    updateTextWithHistory(newContent)
  }, [updateTextWithHistory])
  
  const handleTextareaChange = useCallback((e) => {
    const newContent = e.target.value
    setContent(newContent)
    // הוספה להיסטוריה עם debounce קל
    if (handleTextareaChange.timeout) {
      clearTimeout(handleTextareaChange.timeout)
    }
    handleTextareaChange.timeout = setTimeout(() => {
      setHistory(prev => {
        const newHistory = prev.slice(0, historyIndex + 1)
        if (newHistory[newHistory.length - 1] !== newContent) {
          newHistory.push(newContent)
          setHistoryIndex(newHistory.length - 1)
        }
        return newHistory
      })
    }, 500)
  }, [historyIndex])

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
    
    const insertion = selectedText ? `<${tag}>${selectedText}</${tag}>` : `<${tag}></${tag}>`
    const newText = content.substring(0, start) + insertion + content.substring(end)
    
    updateTextWithHistory(newText)
    
    setTimeout(() => {
      const newPos = selectedText ? (start + insertion.length) : (start + tag.length + 2)
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
    const cleanedText = selectedText.replace(/<[^>]*>/g, '')
    const newText = content.substring(0, start) + cleanedText + content.substring(end)
    
    updateTextWithHistory(newText)
    
    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(start, start + cleanedText.length)
      textarea.scrollTop = scrollTop
    }, 0)
  }, [content, showAlert, updateTextWithHistory])

  const handleFindNext = useCallback((textToFind, isRegexMode) => {
    if (!textToFind) return showAlert('שגיאה', 'הזן טקסט לחיפוש')
    if (!textareaRef.current) return

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
            showAlert('חיפוש', 'הגענו לסוף הקובץ, ממשיכים מההתחלה.')
          }
        }
      } catch (e) {
        return showAlert('שגיאה', 'ביטוי רגולרי לא תקין')
      }
    } else {
      matchIndex = text.indexOf(patternStr, startPos)
      if (matchIndex === -1) {
        matchIndex = text.indexOf(patternStr, 0)
        if (matchIndex !== -1) {
          showAlert('חיפוש', 'הגענו לסוף הקובץ, ממשיכים מההתחלה.')
        }
      }
      matchLength = patternStr.length
    }

    if (matchIndex !== -1) {
      textarea.focus()
      textarea.setSelectionRange(matchIndex, matchIndex + matchLength)
      
      const lineHeight = 24
      const lines = text.substr(0, matchIndex).split('\n').length
      const scrollPos = (lines - 5) * lineHeight
      textarea.scrollTop = scrollPos > 0 ? scrollPos : 0
    } else {
      showAlert('חיפוש', 'לא נמצאו מופעים.')
    }
  }, [content, showAlert])

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

  useEffect(() => {
    if (!content) return
    
    const parser = new DOMParser()
    const doc = parser.parseFromString(content, 'text/html')
    const headings = doc.querySelectorAll('h1, h2, h3, h4, h5, h6')
    
    const tocItems = Array.from(headings).map((heading, index) => ({
      id: `heading-${index}`,
      level: Math.min(Math.max(parseInt(heading.tagName[1]), 1), 6),
      text: heading.textContent,
      html: heading.outerHTML
    }))
    
    setToc(tocItems)
  }, [content])

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

  const actionsMap = useMemo(() => ({
    'save': { label: 'שמירה', action: () => onSave && onSave(content) },
    'toggleEdit': { label: 'מעבר בין עריכה לתצוגה', action: () => setEditMode(prev => !prev) },
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
  }), [onSave, content, insertTag, removeTags, undo, redo])

  const availableActions = useMemo(() => {
    return Object.entries(actionsMap).map(([id, def]) => ({
      id,
      label: def.label
    }))
  }, [actionsMap])

  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (showShortcutsDialog) return

      if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return

      const modifiers = []
      if (e.ctrlKey) modifiers.push('Ctrl')
      if (e.altKey) modifiers.push('Alt')
      if (e.shiftKey) modifiers.push('Shift')
      if (e.metaKey) modifiers.push('Meta')
      
      const code = e.code

      const combination = [...modifiers, code].join('+')
      
      const foundActionId = Object.keys(userShortcuts).find(actionId => {
        const savedCombo = userShortcuts[actionId]
        return savedCombo === combination
      })

      if (foundActionId && actionsMap[foundActionId]) {
        e.preventDefault()
        e.stopPropagation()
        actionsMap[foundActionId].action()
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', handleGlobalKeyDown, { capture: true })
  }, [userShortcuts, actionsMap, showShortcutsDialog])

  const scrollToHeading = (index) => {
    if (editMode && !showPreview) {
      if (!textareaRef.current || !toc[index]) return;
      
      const textarea = textareaRef.current;
      const textToFind = toc[index].html; 
      const matchIndex = content.indexOf(textToFind);
      
      if (matchIndex !== -1) {
        textarea.focus();
        textarea.setSelectionRange(matchIndex, matchIndex + textToFind.length);
        
        const textBeforeMatch = content.substring(0, matchIndex);
        const lines = textBeforeMatch.split('\n').length;
        const lineHeight = fontSize * 1.5; 
        const scrollPos = (lines - 4) * lineHeight;
        
        textarea.scrollTop = scrollPos > 0 ? scrollPos : 0;
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
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50" dir="rtl">
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
                        title="חיפוש והחלפה"
                      />
                      <Button
                        icon="keyboard"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowShortcutsDialog(true)}
                        title="קיצורי מקשים"
                      />
                      <Button
                        icon={editMode ? 'visibility' : 'edit'}
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          startTransition(() => {
                            setEditMode(!editMode)
                          })
                        }}
                        title={editMode ? 'תצוגה' : 'עריכה ידנית'}
                      />
                    </>
                  )}

                  <div className="flex items-center bg-gray-100 rounded-lg p-0.5 gap-0.5 border border-gray-200">
                    <Button
                      icon="format_align_right"
                      variant={textAlign === 'right' ? 'primary' : 'ghost'}
                      size="sm"
                      onClick={() => setTextAlign('right')}
                      title="יישור לימין"
                    />
                    <Button
                      icon="format_align_center"
                      variant={textAlign === 'center' ? 'primary' : 'ghost'}
                      size="sm"
                      onClick={() => setTextAlign('center')}
                      title="יישור למרכז"
                    />
                    <Button
                      icon="format_align_left"
                      variant={textAlign === 'left' ? 'primary' : 'ghost'}
                      size="sm"
                      onClick={() => setTextAlign('left')}
                      title="יישור לשמאל"
                    />
                    <Button
                      icon="format_align_justify"
                      variant={textAlign === 'justify' ? 'primary' : 'ghost'}
                      size="sm"
                      onClick={() => setTextAlign('justify')}
                      title="יישור מלא"
                    />
                  </div>

                  <Button
                    icon="remove"
                    variant="ghost"
                    size="sm"
                    onClick={() => setFontSize(prev => Math.max(12, prev - 2))}
                    title="הקטן גופן"
                  />
                  <span className="text-xs font-medium w-5 text-center">{fontSize}</span>
                  <Button
                    icon="add"
                    variant="ghost"
                    size="sm"
                    onClick={() => setFontSize(prev => Math.min(32, prev + 2))}
                    title="הגדל גופן"
                  />

                  <div className="relative">
                    <select 
                      value={selectedFont} 
                      onChange={(e) => setSelectedFont(e.target.value)} 
                      className="appearance-none pl-1 pr-5 h-7 bg-white border border-gray-200 rounded-md text-xs font-medium focus:outline-none hover:bg-gray-50 cursor-pointer"
                    >
                      <option value="'Times New Roman'">Times</option>
                      <option value="monospace">Mono</option>
                      <option value="Arial">Arial</option>
                      <option value="'Courier New'">Courier</option>
                      <option value="Georgia">Georgia</option>
                      <option value="Verdana">Verdana</option>
                    </select>
                    <span className="material-symbols-outlined text-sm absolute left-0.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">expand_more</span>
                  </div>
                  
                  {canEdit && !isCompleted && (
                    <>
                      <Button
                        icon="save"
                        variant={hasUnsavedChangesOuter ? "primary" : "ghost"}
                        size="sm"
                        onClick={() => onSave && onSave(content)}
                        loading={saving}
                        title={hasUnsavedChangesOuter ? "שמור שינויים" : "שמירה"}
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
                      />
                      <Button
                        icon="keyboard"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowShortcutsDialog(true)}
                        label="קיצורי מקשים"
                      />
                      <Button
                        icon={editMode ? 'visibility' : 'edit'}
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          startTransition(() => {
                            setEditMode(!editMode)
                          })
                        }}
                        label={editMode ? 'תצוגה' : 'עריכה ידנית'}
                      />
                    </>
                  )}

                  <div className="flex items-center bg-gray-100 rounded-lg p-1 gap-1 border border-gray-200 mx-2">
                    <Button
                      icon="format_align_right"
                      variant={textAlign === 'right' ? 'primary' : 'ghost'}
                      size="sm"
                      onClick={() => setTextAlign('right')}
                    />
                    <Button
                      icon="format_align_center"
                      variant={textAlign === 'center' ? 'primary' : 'ghost'}
                      size="sm"
                      onClick={() => setTextAlign('center')}
                    />
                    <Button
                      icon="format_align_left"
                      variant={textAlign === 'left' ? 'primary' : 'ghost'}
                      size="sm"
                      onClick={() => setTextAlign('left')}
                    />
                    <Button
                      icon="format_align_justify"
                      variant={textAlign === 'justify' ? 'primary' : 'ghost'}
                      size="sm"
                      onClick={() => setTextAlign('justify')}
                    />
                  </div>

                  <Button
                    icon="remove"
                    variant="ghost"
                    size="sm"
                    onClick={() => setFontSize(prev => Math.max(12, prev - 2))}
                  />
                  <span className="text-sm font-medium w-6 text-center">{fontSize}</span>
                  <Button
                    icon="add"
                    variant="ghost"
                    size="sm"
                    onClick={() => setFontSize(prev => Math.min(32, prev + 2))}
                  />

                  <div className="w-px h-6 bg-gray-300 mx-2"></div>

                  <div className="relative">
                    <select 
                      value={selectedFont} 
                      onChange={(e) => setSelectedFont(e.target.value)} 
                      className="appearance-none pl-2 pr-6 h-8 bg-white border border-gray-200 rounded-md text-xs font-medium focus:outline-none hover:bg-gray-50 cursor-pointer"
                    >
                      <option value="'Times New Roman'">Times New Roman</option>
                      <option value="monospace">Monospace</option>
                      <option value="Arial">Arial</option>
                      <option value="'Courier New'">Courier New</option>
                      <option value="Georgia">Georgia</option>
                      <option value="Verdana">Verdana</option>
                    </select>
                    <span className="material-symbols-outlined text-sm absolute left-1 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">expand_more</span>
                  </div>
                  
                  {canEdit && !isCompleted && (
                    <div className="flex gap-2 items-center mr-auto">
                      <Button
                        icon="save"
                        variant={hasUnsavedChangesOuter ? "primary" : "ghost"}
                        onClick={() => onSave && onSave(content)}
                        loading={saving}
                        label={hasUnsavedChangesOuter ? "שמירה *" : "שמירה"}
                      />
                      {hasUnsavedChangesOuter && (
                        <span className="text-red-600 text-sm font-medium mr-2">ישנם שינויים לא שמורים</span>
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
                      />
                      <Button
                        icon="keyboard"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowShortcutsDialog(true)}
                        label="קיצורי מקשים"
                      />
                      <Button
                        icon={editMode ? 'visibility' : 'edit'}
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          startTransition(() => {
                            setEditMode(!editMode)
                          })
                        }}
                        label={editMode ? 'תצוגה' : 'עריכה ידנית'}
                      />
                    </>
                  )}

                  <div className="flex items-center bg-gray-100 rounded-lg p-1 gap-1 border border-gray-200 mx-2">
                    <Button
                      icon="format_align_right"
                      variant={textAlign === 'right' ? 'primary' : 'ghost'}
                      size="sm"
                      onClick={() => setTextAlign('right')}
                    />
                    <Button
                      icon="format_align_center"
                      variant={textAlign === 'center' ? 'primary' : 'ghost'}
                      size="sm"
                      onClick={() => setTextAlign('center')}
                    />
                    <Button
                      icon="format_align_left"
                      variant={textAlign === 'left' ? 'primary' : 'ghost'}
                      size="sm"
                      onClick={() => setTextAlign('left')}
                    />
                    <Button
                      icon="format_align_justify"
                      variant={textAlign === 'justify' ? 'primary' : 'ghost'}
                      size="sm"
                      onClick={() => setTextAlign('justify')}
                    />
                  </div>

                  <Button
                    icon="remove"
                    variant="ghost"
                    size="sm"
                    onClick={() => setFontSize(prev => Math.max(12, prev - 2))}
                  />
                  <span className="text-sm font-medium w-6 text-center">{fontSize}</span>
                  <Button
                    icon="add"
                    variant="ghost"
                    size="sm"
                    onClick={() => setFontSize(prev => Math.min(32, prev + 2))}
                  />

                  <div className="w-px h-6 bg-gray-300 mx-2"></div>

                  <div className="relative">
                    <select 
                      value={selectedFont} 
                      onChange={(e) => setSelectedFont(e.target.value)} 
                      className="appearance-none pl-2 pr-6 h-8 bg-white border border-gray-200 rounded-md text-xs font-medium focus:outline-none hover:bg-gray-50 cursor-pointer"
                    >
                      <option value="'Times New Roman'">Times New Roman</option>
                      <option value="monospace">Monospace</option>
                      <option value="Arial">Arial</option>
                      <option value="'Courier New'">Courier New</option>
                      <option value="Georgia">Georgia</option>
                      <option value="Verdana">Verdana</option>
                    </select>
                    <span className="material-symbols-outlined text-sm absolute left-1 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">expand_more</span>
                  </div>
                  
                  {canEdit && !isCompleted && (
                    <div className="flex gap-2 items-center mr-auto">
                      <Button
                        icon="save"
                        variant={hasUnsavedChangesOuter ? "primary" : "ghost"}
                        onClick={() => onSave && onSave(content)}
                        loading={saving}
                        label={hasUnsavedChangesOuter ? "שמירה *" : "שמירה"}
                      />
                      {hasUnsavedChangesOuter && (
                        <span className="text-red-600 text-sm font-medium mr-2">ישנם שינויים לא שמורים</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {canEdit && (
          <aside className={`${toolbarExpanded ? 'w-56' : 'w-20'} bg-white border-l flex flex-col py-4 gap-2 overflow-y-auto shadow-sm transition-all duration-300`}>
            {toolbarExpanded && (
              <div className="px-4 mb-2">
                <span className="text-sm font-medium text-gray-700">כלי עריכה</span>
              </div>
            )}
            
            <button
              onClick={() => setActiveTool('createHeaders')}
              className={`${toolbarExpanded ? 'flex items-center gap-3 px-4 py-3' : 'p-3'} hover:bg-gray-100 rounded-lg transition-colors mx-2`}
              title="יצירת כותרות"
            >
              <span className="material-symbols-outlined text-gray-700">title</span>
              {toolbarExpanded && <span className="text-sm text-gray-700">יצירת כותרות</span>}
            </button>
            
            <button
              onClick={() => setActiveTool('singleLetterHeaders')}
              className={`${toolbarExpanded ? 'flex items-center gap-3 px-4 py-3' : 'p-3'} hover:bg-gray-100 rounded-lg transition-colors mx-2`}
              title="כותרות אותיות"
            >
              <span className="material-symbols-outlined text-gray-700">format_size</span>
              {toolbarExpanded && <span className="text-sm text-gray-700">כותרות אותיות</span>}
            </button>
            
            <button
              onClick={() => setActiveTool('changeHeading')}
              className={`${toolbarExpanded ? 'flex items-center gap-3 px-4 py-3' : 'p-3'} hover:bg-gray-100 rounded-lg transition-colors mx-2`}
              title="שינוי רמת כותרת"
            >
              <span className="material-symbols-outlined text-gray-700">format_indent_increase</span>
              {toolbarExpanded && <span className="text-sm text-gray-700">שינוי רמת כותרת</span>}
            </button>
            
            <button
              onClick={() => setActiveTool('punctuate')}
              className={`${toolbarExpanded ? 'flex items-center gap-3 px-4 py-3' : 'p-3'} hover:bg-gray-100 rounded-lg transition-colors mx-2`}
              title="הדגשה וניקוד"
            >
              <span className="material-symbols-outlined text-gray-700">format_bold</span>
              {toolbarExpanded && <span className="text-sm text-gray-700">הדגשה וניקוד</span>}
            </button>
            
            <button
              onClick={() => setActiveTool('pageBHeader')}
              className={`${toolbarExpanded ? 'flex items-center gap-3 px-4 py-3' : 'p-3'} hover:bg-gray-100 rounded-lg transition-colors mx-2`}
              title="כותרות עמוד ב"
            >
              <span className="material-symbols-outlined text-gray-700">find_in_page</span>
              {toolbarExpanded && <span className="text-sm text-gray-700">כותרות עמוד ב</span>}
            </button>
            
            <button
              onClick={() => setActiveTool('replacePageB')}
              className={`${toolbarExpanded ? 'flex items-center gap-3 px-4 py-3' : 'p-3'} hover:bg-gray-100 rounded-lg transition-colors mx-2`}
              title="החלפת עמוד ב"
            >
              <span className="material-symbols-outlined text-gray-700">swap_horiz</span>
              {toolbarExpanded && <span className="text-sm text-gray-700">החלפת עמוד ב</span>}
            </button>

            <button
              onClick={() => setActiveTool('addPageNumber')}
              className={`${toolbarExpanded ? 'flex items-center gap-3 px-4 py-3' : 'p-3'} hover:bg-gray-100 rounded-lg transition-colors mx-2`}
              title="מיזוג דף ועמוד"
            >
              <span className="material-symbols-outlined text-gray-700">auto_stories</span>
              {toolbarExpanded && <span className="text-sm text-gray-700">מיזוג דף ועמוד</span>}
            </button>
            
            <button
              onClick={() => setActiveTool('headerCheck')}
              className={`${toolbarExpanded ? 'flex items-center gap-3 px-4 py-3' : 'p-3'} hover:bg-gray-100 rounded-lg transition-colors mx-2`}
              title="בדיקת שגיאות בכותרות"
            >
              <span className="material-symbols-outlined text-gray-700">bug_report</span>
              {toolbarExpanded && <span className="text-sm text-gray-700">בדיקת שגיאות</span>}
            </button>
            
            <button
              onClick={() => setActiveTool('cleanText')}
              className={`${toolbarExpanded ? 'flex items-center gap-3 px-4 py-3' : 'p-3'} hover:bg-gray-100 rounded-lg transition-colors mx-2`}
              title="ניקוי טקסט"
            >
              <span className="material-symbols-outlined text-gray-700">cleaning_services</span>
              {toolbarExpanded && <span className="text-sm text-gray-700">ניקוי טקסט</span>}
            </button>
            
            <button
              onClick={() => setActiveTool('embedImage')}
              className={`${toolbarExpanded ? 'flex items-center gap-3 px-4 py-3' : 'p-3'} hover:bg-gray-100 rounded-lg transition-colors mx-2`}
              title="הטמעת תמונה"
            >
              <span className="material-symbols-outlined text-gray-700">image</span>
              {toolbarExpanded && <span className="text-sm text-gray-700">הטמעת תמונה</span>}
            </button>
            
            <div className="flex-1"></div>
            
            <div className="border-t pt-2 mt-2">
              <button
                onClick={() => setToolbarExpanded(!toolbarExpanded)}
                className={`${toolbarExpanded ? 'flex items-center gap-3 px-4 py-3' : 'p-3'} hover:bg-gray-100 rounded-lg transition-colors mx-2 w-full`}
                title={toolbarExpanded ? "כווץ סרגל" : "הרחב סרגל"}
              >
                <span className="material-symbols-outlined text-gray-600">
                  {toolbarExpanded ? 'chevron_right' : 'chevron_left'}
                </span>
                {toolbarExpanded && <span className="text-sm text-gray-600">{toolbarExpanded ? 'כווץ' : 'הרחב'}</span>}
              </button>
            </div>
          </aside>
        )}

        <main className="flex-1 overflow-auto bg-white flex">
          {isPending ? (
            <div className="flex-1 flex items-center justify-center">
              <LoadingSpinner message="טוען..." />
            </div>
          ) : editMode && canEdit ? (
            <>
              <div className={`${showPreview ? 'flex-1' : 'w-full'} flex flex-col h-full border-l`}>
                <div className="bg-gray-50 border-b px-4 py-2 flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    icon="format_bold"
                    variant="ghost"
                    size="sm"
                    onClick={() => insertTag('b')}
                    label="מודגש"
                  />
                  <Button
                    icon="format_italic"
                    variant="ghost"
                    size="sm"
                    onClick={() => insertTag('i')}
                    label="נטוי"
                  />
                  <Button
                    icon="format_underlined"
                    variant="ghost"
                    size="sm"
                    onClick={() => insertTag('u')}
                    label="קו תחתון"
                  />
                  
                  <div className="w-px h-6 bg-gray-300 mx-1"></div>
                  
                  <Button variant="ghost" size="sm" onClick={() => insertTag('h1')} label="H1" />
                  <Button variant="ghost" size="sm" onClick={() => insertTag('h2')} label="H2" />
                  <Button variant="ghost" size="sm" onClick={() => insertTag('h3')} label="H3" />
                  <Button variant="ghost" size="sm" onClick={() => insertTag('h4')} label="H4" />
                  <Button variant="ghost" size="sm" onClick={() => insertTag('h5')} label="H5" />
                  <Button variant="ghost" size="sm" onClick={() => insertTag('h6')} label="H6" />
                  
                  <div className="w-px h-6 bg-gray-300 mx-1"></div>
                  
                  <Button
                    icon="text_increase"
                    variant="ghost"
                    size="sm"
                    onClick={() => insertTag('big')}
                    label="גדול"
                  />
                  <Button
                    icon="text_decrease"
                    variant="ghost"
                    size="sm"
                    onClick={() => insertTag('small')}
                    label="קטן"
                  />
                  
                  <div className="w-px h-6 bg-gray-300 mx-1"></div>
                  
                  <Button
                    icon="format_clear"
                    variant="ghost"
                    size="sm"
                    onClick={removeTags}
                    label="הסר תגים"
                    title="הסרת תגי HTML מהטקסט הנבחר"
                  />
                  </div>
                  
                  {!showPreview && (
                    <button
                      onClick={() => setShowPreview(true)}
                      className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 px-2 py-1 rounded transition-colors"
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
                  className="flex-1 p-6 border-0 resize-none focus:ring-0 outline-none"
                  style={{ fontSize: `${fontSize}px`, fontFamily: selectedFont, direction: 'rtl', textAlign: textAlign }}
                />
              </div>
              
              {showPreview && (
              <div className="w-1/2 flex flex-col bg-gray-50">
                <div className="px-6 pt-6 pb-2 bg-gray-50 sticky top-0 z-10 border-b border-gray-200 flex items-center justify-between">
                  <span className="text-xs text-gray-500 font-medium">תצוגה מקדימה</span>
                  <button
                    onClick={() => setShowPreview(false)}
                    className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 px-2 py-1 rounded transition-colors"
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
                    dangerouslySetInnerHTML={{ __html: content }}
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
                dangerouslySetInnerHTML={{ __html: content }}
              />
            </div>
          )}
        </main>

        <aside className="w-64 bg-white border-r p-4 overflow-y-auto shadow-sm">
          <h3 className="font-bold text-lg mb-4 text-gray-800">תוכן עניינים</h3>
          {toc.length === 0 ? (
            <p className="text-sm text-gray-500">אין כותרות בספר</p>
          ) : (
            <ul className="space-y-2">
              {toc.map((item, index) => (
                <li
                  key={item.id}
                  className="cursor-pointer hover:bg-gray-100 p-2 rounded transition-colors"
                  style={{ paddingRight: `${(item.level - 1) * 12}px` }}
                  onClick={() => scrollToHeading(index)}
                >
                  <span className="text-sm text-gray-700">{item.text}</span>
                </li>
              ))}
            </ul>
          )}
        </aside>
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
      />
    </div>
  )
}