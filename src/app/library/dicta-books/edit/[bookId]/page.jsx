'use client'

import { useState, useEffect, useRef, useMemo, useCallback, useTransition } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import Button from '@/components/Button'
import { useDialog } from '@/components/DialogContext'
import { getAvatarColor, getInitial } from '@/lib/avatar-colors'
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
  'imageToText': 'Ctrl+Shift+KeyI',
}

export default function DictaEditorPage() {
  const params = useParams()
  const router = useRouter()
  const { data: session, status } = useSession()
  const { showAlert, showConfirm } = useDialog()
  const bookId = params?.bookId
  
  const currentUserId = session?.user?.id
  const isAdmin = session?.user?.role === 'admin'
  
  const [book, setBook] = useState(null)
  const [content, setContent] = useState('')
  const [savedContent, setSavedContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [showUploadDialog, setShowUploadDialog] = useState(false)
  const [showResetDialog, setShowResetDialog] = useState(false)
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
  const [toolbarExpanded, setToolbarExpanded] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('dicta_editor_toolbar_expanded')
      return saved === 'true'
    }
    return false
  })
  
  const hasLoadedPreviewState = useRef(false)
  const contentRef = useRef(null)
  const textareaRef = useRef(null)
  const previewRef = useRef(null)
  const scrollingSource = useRef(null) // מזהה איזה אלמנט התחיל את הגלילה

  const hasUnsavedChanges = content !== savedContent

  useEffect(() => {
    if (selectedFont) {
      localStorage.setItem('dicta_editor_font', selectedFont)
    }
  }, [selectedFont])

  useEffect(() => {
    if (hasLoadedPreviewState.current) {
      localStorage.setItem('dicta_editor_show_preview', showPreview.toString())
    }
  }, [showPreview])

  useEffect(() => {
    localStorage.setItem('dicta_editor_toolbar_expanded', toolbarExpanded.toString())
  }, [toolbarExpanded])

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasUnsavedChanges) {
        e.preventDefault()
        e.returnValue = ''
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [hasUnsavedChanges])

  useEffect(() => {
    const handleRouteChange = () => {
      if (hasUnsavedChanges) {
        const confirmLeave = window.confirm('ישנם שינויים לא שמורים. האם אתה בטוח שברצונך לעזוב את הדף?')
        if (!confirmLeave) {
          window.history.pushState(null, '', window.location.href)
          throw 'Route change aborted by user'
        }
      }
    }

    const handleClick = (e) => {
      const target = e.target.closest('a')
      if (target && target.href && hasUnsavedChanges) {
        const currentUrl = new URL(window.location.href)
        const targetUrl = new URL(target.href, window.location.origin)
        
        if (currentUrl.origin === targetUrl.origin && currentUrl.pathname !== targetUrl.pathname) {
          const confirmLeave = window.confirm('ישנם שינויים לא שמורים. האם אתה בטוח שברצונך לעזוב את הדף?')
          if (!confirmLeave) {
            e.preventDefault()
            e.stopPropagation()
          }
        }
      }
    }

    document.addEventListener('click', handleClick, true)

    return () => {
      document.removeEventListener('click', handleClick, true)
    }
  }, [hasUnsavedChanges])

  useEffect(() => {
    if (status === 'loading') return
    if (status === 'unauthenticated') {
      router.push('/library/auth/login')
      return
    }
    
    const loadBook = async () => {
      try {
        setLoading(true)
        const res = await fetch(`/api/dicta/books/${bookId}`)
        if (!res.ok) throw new Error('שגיאה בטעינת הספר')
        const data = await res.json()
        setBook(data)
        setContent(data.content || '')
        setSavedContent(data.content || '')
      } catch (error) {
        console.error('Error loading book:', error)
        showAlert('שגיאה', 'שגיאה בטעינת הספר')
      } finally {
        setLoading(false)
      }
    }
    
    if (bookId) loadBook()
  }, [bookId, status, router, showAlert])

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

    if (!hasLoadedPreviewState.current) {
      const savedPreviewState = localStorage.getItem('dicta_editor_show_preview')
      if (savedPreviewState !== null) {
        setShowPreview(savedPreviewState === 'true')
      }
      hasLoadedPreviewState.current = true
    }
  }, [])

  const handleContentChange = useCallback((newContent) => {
    setContent(newContent)
  }, [])

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
    
    // שמירת מיקום הגלילה לפני השינוי
    const scrollTop = textarea.scrollTop
    
    const insertion = selectedText ? `<${tag}>${selectedText}</${tag}>` : `<${tag}></${tag}>`;
    const newText = content.substring(0, start) + insertion + content.substring(end);
    
    setContent(newText);
    
    setTimeout(() => {
      const newPos = selectedText ? (start + insertion.length) : (start + tag.length + 2);
      textarea.focus();
      textarea.setSelectionRange(newPos, newPos);
      // החזרת מיקום הגלילה
      textarea.scrollTop = scrollTop;
    }, 0);
  }, [content])

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
    
    setContent(newText)
    
    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(start + finalReplacement.length, start + finalReplacement.length)
    }, 0)

    handleFindNext(textToFind, isRegexMode)
  }, [content, handleFindNext, showAlert])

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
    setContent(newContent)
    
    showAlert('הצלחה', `ההחלפה בוצעה בהצלחה! הוחלפו ${count} מופעים.`)
  }, [content, findText, replaceText, useRegex, showAlert])

  const handleRemoveDigits = useCallback(() => {
    const newContent = content.replace(/\d+/g, '')
    setContent(newContent)
    showAlert('הצלחה', 'הספרות הוסרו בהצלחה!')
  }, [content, showAlert])

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

    setContent(currentContent)
    showAlert('הצלחה', `בוצעו ${totalReplacements} החלפות מתוך ${savedSearches.length} חיפושים שמורים.`)
  }, [content, savedSearches, showAlert])

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

  const handleSave = useCallback(async (silent = false) => {
    try {
      setSaving(true)
      const res = await fetch(`/api/dicta/books/${bookId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      })
      
      if (!res.ok) throw new Error('שגיאה בשמירה')
      setSavedContent(content)
      if (!silent) {
        showAlert('הצלחה', 'העריכה נשמרה בהצלחה!')
      }
    } catch (error) {
      console.error('Error saving book:', error)
      showAlert('שגיאה', 'שגיאה בשמירת הספר')
    } finally {
      setSaving(false)
    }
  }, [bookId, content, showAlert])

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
    'save': { label: 'שמירה', action: () => handleSave(false) },
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
    'imageToText': { label: 'המרת תמונה לטקסט', action: () => setActiveTool('imageToText') },
    'shortcuts': { label: 'ערוך קיצורי מקלדת', action: () => setShowShortcutsDialog(true) },
  }), [handleSave, insertTag])

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

  const refreshContent = async () => {
    try {
      const res = await fetch(`/api/dicta/books/${bookId}`)
      if (!res.ok) throw new Error('שגיאה בטעינת הספר')
      const data = await res.json()
      setBook(data)
      setContent(data.content || '')
      setSavedContent(data.content || '')
    } catch (error) {
      console.error('Error refreshing book:', error)
      showAlert('שגיאה', 'שגיאה בטעינת הספר')
    }
  }

  const handleClaim = () => {
    showConfirm(
      'תפיסת ספר',
      'האם אתה בטוח שברצונך לתפוס את הספר לעריכה?',
      async () => {
        try {
          setClaiming(true)
          const res = await fetch(`/api/dicta/books/${bookId}/claim`, {
            method: 'POST',
          })
          
          if (res.ok) {
            await refreshContent()
            showAlert('הצלחה', 'הספר נתפס בהצלחה וכעת תוכל להתחיל לערוך אותו!')
          } else {
            const data = await res.json()
            
            // בדיקה אם המשתמש לא אישר תזכורות
            if (data.error === 'TERMS_REQUIRED' && data.redirectUrl) {
              showConfirm(
                'נדרש אישור תזכורות',
                'כדי לתפוס ספר לעריכה, עליך לאשר קבלת תזכורות במייל. האם ברצונך לעבור לדף האישור?',
                () => {
                  router.push(data.redirectUrl)
                }
              )
            } else {
              showAlert('שגיאה', data.error || 'אירעה בעיה בתפיסת הספר. ייתכן שהוא נתפס על ידי משתמש אחר.')
            }
          }
        } catch (error) {
          console.error('Error claiming book:', error)
          showAlert('שגיאה', 'אירעה שגיאה בתקשורת מול השרת.')
        } finally {
          setClaiming(false)
        }
      }
    )
  }

  const handleComplete = () => {
    if (!session) return showAlert('שגיאה', 'אינך מחובר למערכת')
    
    if (hasUnsavedChanges) {
      showConfirm(
        'שינויים לא שמורים',
        'שים לב, ישנם שינויים לא שמורים. האם להמשיך ללא שמירה?',
        () => {
          setShowUploadDialog(true)
        }
      )
    } else {
      setShowUploadDialog(true)
    }
  }

  const handleUploadConfirm = async () => {
    if (!content.trim()) return showAlert('שגיאה', 'הספר ריק')

    try {
      setCompleting(true)
      
      const cleanBookName = book.title.replace(/[^a-zA-Z0-9א-ת]/g, '_')
      const fileName = `${cleanBookName}_dicta.txt`
      const blob = new Blob([content], { type: 'text/plain' })
      const file = new File([blob], fileName, { type: 'text/plain' })

      const formData = new FormData()
      formData.append('file', file)
      formData.append('bookName', book.title)
      formData.append('userId', session.user._id || session.user.id)
      formData.append('userName', session.user.name)
      formData.append('uploadType', 'dicta')

      const uploadResponse = await fetch('/api/upload-book', { method: 'POST', body: formData })
      const uploadResult = await uploadResponse.json()

      if (!uploadResult.success) {
        throw new Error(uploadResult.error || 'שגיאה בהעלאה')
      }

      const completeResponse = await fetch(`/api/dicta/books/${bookId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete' })
      })

      if (completeResponse.ok) {
        setShowUploadDialog(false)
        showAlert('הצלחה', 'הטקסט הועלה בהצלחה והספר סומן כהושלם!')
        setTimeout(() => {
          router.push('/library/dicta-books')
        }, 1500)
      } else {
        showAlert('שגיאה', 'הטקסט הועלה אך אירעה בעיה בסימון הספר כהושלם.')
      }
    } catch (error) {
      console.error('Error completing book:', error)
      showAlert('שגיאה', error.message || 'אירעה שגיאה בתהליך ההעלאה')
    } finally {
      setCompleting(false)
    }
  }

  const handleReset = () => {
    setShowResetDialog(true)
  }

  const handleResetConfirm = async () => {
    try {
      setResetting(true)
      const res = await fetch(`/api/dicta/books/${bookId}/reset`, {
        method: 'POST',
      })
      
      const data = await res.json()
      
      if (!res.ok) {
        throw new Error(data.error || 'שגיאה באיפוס הספר')
      }
      
      setContent(data.book.content)
      setSavedContent(data.book.content)
      setShowResetDialog(false)
      showAlert('הצלחה', 'הספר אופס בהצלחה! נתוני הספר נמשכו מחדש מגיטהאב.')
    } catch (error) {
      console.error('Error resetting book:', error)
      showAlert('שגיאה', error.message || 'אירעה שגיאה באיפוס הספר')
    } finally {
      setResetting(false)
    }
  }

  const scrollToHeading = (index) => {
    // טיפול במצב של עריכה ללא תצוגה מקדימה (רק Textarea)
    if (editMode && !showPreview) {
      if (!textareaRef.current || !toc[index]) return;
      
      const textarea = textareaRef.current;
      // נחפש את מחרוזת ה-HTML המלאה של הכותרת כדי למנוע קפיצה למילה זהה בטקסט הרגיל
      const textToFind = toc[index].html; 
      const matchIndex = content.indexOf(textToFind);
      
      if (matchIndex !== -1) {
        // סימון הטקסט (אופציונלי, נחמד כדי להראות למשתמש איפה הכותרת)
        textarea.focus();
        textarea.setSelectionRange(matchIndex, matchIndex + textToFind.length);
        
        // חישוב מיקום הגלילה לפי מספר שורות (בדומה לחיפוש והחלפה שכבר יש לך בקוד)
        const textBeforeMatch = content.substring(0, matchIndex);
        const lines = textBeforeMatch.split('\n').length;
        // הערכה לגובה שורה (1.5 * גודל הגופן)
        const lineHeight = fontSize * 1.5; 
        const scrollPos = (lines - 4) * lineHeight;
        
        textarea.scrollTop = scrollPos > 0 ? scrollPos : 0;
      }
      return;
    }

    // ההתנהגות המקורית עבור מצב תצוגה מקדימה (Preview) או מצב קריאה בלבד (Read-only)
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl">טוען...</div>
      </div>
    )
  }

  if (!book) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl text-red-600">הספר לא נמצא</div>
      </div>
    )
  }

  const claimedById = book?.claimedBy?._id || book?.claimedBy
  const isOwner = currentUserId && claimedById === currentUserId
  const isCompleted = book?.status === 'completed'
  const canEdit = (!isCompleted && isOwner) || isAdmin
  const isAvailable = !claimedById && !isCompleted

  return (
    <div className="flex flex-col h-screen bg-gray-50" dir="rtl">
      <header className="glass-strong border-b border-surface-variant sticky top-0 z-40">
        <div className="container mx-auto px-4 py-3">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Link href="/library" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                  <img src="/logo.png" alt="לוגו אוצריא" className="w-10 h-10" />
                  <span className="text-lg font-bold text-black" style={{ fontFamily: 'FrankRuehl, serif' }}>ספריית אוצריא</span>
                </Link>

                <div className="w-px h-8 bg-surface-variant"></div>

                <Button
                  icon="arrow_forward"
                  variant="ghost"
                  onClick={() => router.push('/library/dicta-books')}
                  label="חזרה לדיקטה"
                />

                <div className="w-px h-8 bg-surface-variant"></div>

                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-lg font-bold text-on-surface">{book.title}</h1>
                    {canEdit && (
                      <Button
                        icon="restart_alt"
                        variant="ghost"
                        size="sm"
                        onClick={handleReset}
                        loading={resetting}
                        label="אפס"
                      />
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-on-surface/60">עריכת דיקטה</p>
                    {book.status === 'in-progress' && (
                      <span className="bg-orange-100 text-orange-800 px-2 py-0.5 rounded-full text-xs">
                        בעריכה
                      </span>
                    )}
                    {book.status === 'completed' && (
                      <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full text-xs">
                        הושלם
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <Link
                href="/library/dashboard"
                className="flex items-center justify-center hover:opacity-80 transition-opacity"
                title={session?.user?.name}
              >
                <div
                  className="w-10 h-10 rounded-full text-white flex items-center justify-center font-bold text-base shadow-md hover:shadow-lg transition-shadow"
                  style={{ backgroundColor: getAvatarColor(session?.user?.name || '') }}
                >
                  {getInitial(session?.user?.name || '')}
                </div>
              </Link>
            </div>

            <div className="flex items-center justify-between border-t border-surface-variant/50 pt-3">
              <div className="flex items-center gap-3">
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

          <div className="flex items-center bg-gray-100 rounded-lg p-1 gap-1 border border-gray-200 ml-2">
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
          
          {isAvailable ? (
            <Button
              icon="back_hand"
              variant="primary"
              onClick={handleClaim}
              loading={claiming}
              label="תפוס לעריכה"
            />
          ) : canEdit && !isCompleted ? (
            <div className="flex gap-2 items-center">
              <Button
                icon="task_alt"
                variant="ghost"
                onClick={handleComplete}
                loading={completing}
                label="סיום"
              />
              <Button
                icon="save"
                variant={hasUnsavedChanges ? "primary" : "ghost"}
                onClick={() => handleSave(false)}
                loading={saving}
                label={hasUnsavedChanges ? "שמירה *" : "שמירה"}
              />
              {hasUnsavedChanges && (
                <span className="text-red-600 text-sm font-medium mr-2">ישנם שינויים לא שמורים</span>
              )}
            </div>
          ) : canEdit && isCompleted ? (
            <div className="flex gap-2 items-center">
              <Button
                icon="upload"
                variant="ghost"
                onClick={handleComplete}
                loading={completing}
                label="העלה מחדש"
              />
              <Button
                icon="save"
                variant={hasUnsavedChanges ? "primary" : "ghost"}
                onClick={() => handleSave(false)}
                loading={saving}
                label={hasUnsavedChanges ? "שמירה *" : "שמירה"}
              />
              {hasUnsavedChanges && (
                <span className="text-red-600 text-sm font-medium mr-2">ישנם שינויים לא שמורים</span>
              )}
            </div>
              ) : null}
              </div>
            </div>
          </div>
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
              onClick={() => setActiveTool('imageToText')}
              className={`${toolbarExpanded ? 'flex items-center gap-3 px-4 py-3' : 'p-3'} hover:bg-gray-100 rounded-lg transition-colors mx-2`}
              title="המרת תמונה לטקסט"
            >
              <span className="material-symbols-outlined text-gray-700">image_search</span>
              {toolbarExpanded && <span className="text-sm text-gray-700">המרת תמונה</span>}
            </button>
            
            {/* Spacer to push button to bottom */}
            <div className="flex-1"></div>
            
            {/* Expand/Collapse button at bottom */}
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
              <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
                <div className="text-lg text-gray-600">טוען...</div>
              </div>
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
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => insertTag('h1')}
                    label="H1"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => insertTag('h2')}
                    label="H2"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => insertTag('h3')}
                    label="H3"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => insertTag('h4')}
                    label="H4"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => insertTag('h5')}
                    label="H5"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => insertTag('h6')}
                    label="H6"
                  />
                  
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
                  onChange={(e) => setContent(e.target.value)}
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
        isOpen={activeTool === 'imageToText'}
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

      {showUploadDialog && (
        <UploadDialog
          bookTitle={book?.title}
          onConfirm={handleUploadConfirm}
          onCancel={() => setShowUploadDialog(false)}
        />
      )}

      {showResetDialog && (
        <ResetDialog
          bookTitle={book?.title}
          onConfirm={handleResetConfirm}
          onCancel={() => setShowResetDialog(false)}
          loading={resetting}
        />
      )}
    </div>
  )
}

function UploadDialog({ bookTitle, onConfirm, onCancel }) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        onConfirm()
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onConfirm, onCancel])

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onCancel}>
      <div className="glass-strong rounded-2xl p-8 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-4xl text-green-600">upload_file</span>
          </div>
          <h2 className="text-2xl font-bold text-on-surface mb-2">סיום עבודה על {bookTitle}</h2>
          <p className="text-on-surface/70">האם ברצונך להעלות את הטקסט שערכת למערכת?</p>
        </div>
        <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-blue-600 mt-0.5">info</span>
            <div className="text-sm text-blue-800">
              <p className="font-bold mb-1">מה יקרה?</p>
              <ul className="space-y-1">
                <li>• הטקסט שערכת יועלה כקובץ חדש</li>
                <li>• הקובץ יסומן כ"דיקטה" ויישלח לאישור מנהל</li>
                <li>• הספר יסומן כהושלם</li>
              </ul>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <button onClick={onConfirm} className="flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-bold">
            <span className="material-symbols-outlined">upload</span>
            <span>כן, העלה את הטקסט</span>
          </button>
          <button
            onClick={onCancel}
            className="px-6 py-3 border-2 border-surface-variant text-on-surface rounded-lg hover:bg-surface transition-colors"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  )
}

function ResetDialog({ bookTitle, onConfirm, onCancel, loading }) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onCancel])

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onCancel}>
      <div className="glass-strong rounded-2xl p-8 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-4xl text-red-600">warning</span>
          </div>
          <h2 className="text-2xl font-bold text-on-surface mb-2">אפס עריכת ספר</h2>
          <p className="text-on-surface/70 font-bold">{bookTitle}</p>
        </div>
        <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-red-600 mt-0.5">error</span>
            <div className="text-sm text-red-800">
              <p className="font-bold mb-2">אזהרה: פעולה בלתי הפיכה!</p>
              <ul className="space-y-1">
                <li>• כל העריכות שביצעת יימחקו לצמיתות</li>
                <li>• הספר יחזור למצבו המקורי מגיטהאב</li>
                <li>• לא ניתן לשחזר את השינויים לאחר האיפוס</li>
              </ul>
              <p className="mt-3 font-bold">האם אתה בטוח שברצונך להמשיך?</p>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <button 
            onClick={onConfirm} 
            disabled={loading}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-bold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <span className="inline-block animate-spin rounded-full h-5 w-5 border-b-2 border-white"></span>
                <span>מאפס...</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined">restart_alt</span>
                <span>כן, אפס את הספר</span>
              </>
            )}
          </button>
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-6 py-3 border-2 border-surface-variant text-on-surface rounded-lg hover:bg-surface transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  )
}