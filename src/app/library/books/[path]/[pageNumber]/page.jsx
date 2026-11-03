'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
import ImagePanel from '@/components/editor/ImagePanel'
import TextEditor from '@/components/editor/TextEditor'
import FindReplaceDialog from '@/components/editor/modals/FindReplaceDialog'
import EmbedImageModal from '@/components/dicta-tools/EmbedImageModal'
import SplitDialog from '@/components/editor/modals/SplitDialog'
import InfoDialog from '@/components/editor/modals/InfoDialog'
import ShortcutsDialog from '@/components/editor/modals/ShortcutsDialog'
import SpellcheckDialog from '@/components/editor/modals/SpellcheckDialog'
import { useDialog } from '@/components/providers/DialogContext'
import { useLoading } from '@/components/providers/LoadingContext'
import { useAutoSave, UNSAVED_LEAVE_MESSAGE } from '@/hooks/useAutoSave'
import { mergeColumns } from '@/lib/editor/columnMerge'
import { getTextareaCaretTop } from '@/lib/editorUtils'
import { isEditorField, queryEditorField } from '@/lib/editor/editorField'
import { findNextWholeWordInTextarea as findNextWholeWordInTextareaUtil } from '@/lib/hebrewWordUtils'
import { buildSearchRegex, findNextOutsideTags, processSearchPattern, rangeInText, replaceOutsideTags } from '@/lib/editor/textOnlyReplace'
import { hasBookLibraryAccess, hasBooksAccess } from '@/lib/roles'
import { useRequireAuth } from '@/hooks/useRequireAuth'
import { useUndoAvailability } from '@/hooks/useUndoAvailability'
import { shortcutAllowed, shortcutContext } from './shortcutScope'
import { editorFieldHistory } from '@/components/editor/v2/textareaHistory'
import { pushStructuralUndo, resetFieldHistories } from '@/components/editor/v2/fieldHistoryStore'
import { usePageTracking } from '@/components/editor/v2/usePageTracking'
import { canStartLocalWordDetection, useLocalWordBoxes } from '@/hooks/useLocalWordBoxes'
import { useEditorPrefs } from '@/hooks/useEditorPrefs'
import { useTextViewToggle } from '@/hooks/useTextViewToggle'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useRestReminder } from '@/hooks/useRestReminder'
import { useCaretPosition } from '@/hooks/useCaretPosition'
import { useActiveFormats } from '@/hooks/useActiveFormats'
import { toggleFormat, clearFormatting } from '@/lib/editor/formatToggle'
import { applyFieldEdit, insertBlockAt, replaceFieldSelection, replaceFieldValue } from '@/lib/editor/applyFieldEdit'
import { PREF_RANGES, migrateLegacyEditorPrefs } from '@/hooks/editorPrefs'
import Button from '@/components/ui/Button'
import CommandPalette from '@/components/ui/CommandPalette'
import EditorShell from '@/components/editor/v2/EditorShell'
import EditorTopBar from '@/components/editor/v2/EditorTopBar'
import EditorStatusBar from '@/components/editor/v2/EditorStatusBar'
import EditorAccountButton from '@/components/editor/v2/EditorAccountButton'
import ScanToolbar from '@/components/editor/v2/ScanToolbar'
import TextToolbar from '@/components/editor/v2/TextToolbar'
import MobileActionBar from '@/components/editor/v2/MobileActionBar'
import { pageClaimState, canFinishPage } from '@/components/editor/v2/pageClaim'
import DisplaySettingsSheet from '@/components/editor/v2/DisplaySettingsSheet'
import FinishPageDialog from '@/components/editor/v2/FinishPageDialog'
import RestReminder from '@/components/editor/v2/RestReminder'
import { buildEditorCommands } from '@/components/editor/v2/editorCommands'
import {
  caretLineJump,
  clampZoom,
  countLines,
  countWords,
  editorFontFamily,
  editorStyleVars,
  fitZoomPercent,
  IMAGE_ZOOM,
  scanFilterCss,
  shortcutKeys,
  toggledEditorFont,
  toUiSaveStatus,
} from '@/components/editor/v2/editorShellLogic'
import '@/app/styles/editor-themes.css'
import { computeImagePanelWidth, computeColumnWidth } from './panelResizeGeometry'
import {
  buildShortcutCombination,
  findMatchingActionId,
  DEFAULT_SHORTCUTS,
  SHORTCUTS_VERSION,
  migrateUserShortcuts,
} from './keyboardShortcutMatching'

const SHORTCUTS_STORAGE_KEY = 'user_shortcuts'
const SHORTCUTS_VERSION_KEY = 'user_shortcuts_version'
// פעולות שהקיצור שלהן הוסר בהעברת גרסה (התנגשות) — מוצג בחלון הקיצורים עד "הבנתי"
const SHORTCUTS_UNBOUND_KEY = 'user_shortcuts_unbound'

export default function EditPage() {
  const { session, status } = useRequireAuth()
  const router = useRouter()
  const params = useParams()
  const bookPath = decodeURIComponent(params.path)
  const pageNumber = parseInt(params.pageNumber)
  const { showAlert, showConfirm } = useDialog()
  const { startLoading, stopLoading } = useLoading()

  const [bookData, setBookData] = useState(null)
  const [pageData, setPageData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [globalInstructions, setGlobalInstructions] = useState(null);

  const [content, setContent] = useState('')
  const [leftColumn, setLeftColumn] = useState('')
  const [rightColumn, setRightColumn] = useState('')
  const [twoColumns, setTwoColumns] = useState(false)
  const [activeTextarea, setActiveTextarea] = useState(null)
  const [settingsLoaded, setSettingsLoaded] = useState(false)

  // העדפות התצוגה (ערכה, גופן, גודל, ריווח, בהירות הצילום, תזכורת מנוחה) — useEditorPrefs
  const { prefs, setPrefs, resetPrefs, ready: prefsReady } = useEditorPrefs()
  const isMobile = useMediaQuery('(max-width: 767px)')
  // טאבלט לאורך (768–1023): שני פאנלים זה לצד זה צרים מדי — הצילום מעל הטקסט, כמו בנייד
  const isPortraitTablet = useMediaQuery('(min-width: 768px) and (max-width: 1023px) and (orientation: portrait)')

  const allInstructions = useMemo(() => {
      const globalRawSections = globalInstructions?.sections || [];
      const globalData = {
          title: 'הנחיות גלובליות',
          sections: globalRawSections
      };

      const bookInfo = bookData?.editingInfo || {};
      const bookSections = bookInfo.sections || [];
      
      const bookInstData = {
          title: bookInfo.title || 'הנחיות עריכה לספר זה',
          sections: bookSections
      };

      return {
          bookInstructions: bookInstData,
          globalInstructions: globalData
      };
  }, [bookData, globalInstructions]); 
   
  const [imageZoom, setImageZoom] = useState(100)
  // בלי זום שמור (כניסה ראשונה) — התאמה לרוחב הפאנל כשהצילום נטען, במקום 100% שרירותי
  const fitZoomOnLoadRef = useRef(false)
  const [layoutOrientation, setLayoutOrientation] = useState('vertical')
  const [imagePanelWidth, setImagePanelWidth] = useState(52)
  // בנייד הצילום תמיד למעלה; הגודל נפרד מזה של המחשב (34% כברירת מחדל)
  const [mobileScanSize, setMobileScanSize] = useState(34)
  const [columnWidth, setColumnWidth] = useState(50)
  const [isColumnResizing, setIsColumnResizing] = useState(false)
  
  const splitContainerRef = useRef(null)
  const textEditorContainerRef = useRef(null)

  const columnWidthRef = useRef(columnWidth)

  useEffect(() => { columnWidthRef.current = columnWidth }, [columnWidth])

  const [swapPanels, setSwapPanels] = useState(false)
  
  const [isFullScreen, setIsFullScreen] = useState(false)
  const [showPalette, setShowPalette] = useState(false)
  const [showDisplay, setShowDisplay] = useState(false)

  const [showSplitDialog, setShowSplitDialog] = useState(false)
  const [rightColumnName, setRightColumnName] = useState('חלק 1')
  const [leftColumnName, setLeftColumnName] = useState('חלק 2')
  const [splitMode, setSplitMode] = useState('content')
  const [isContentSplit, setIsContentSplit] = useState(false)

  const [showFindReplace, setShowFindReplace] = useState(false)
  const [showSpellcheck, setShowSpellcheck] = useState(false)
  const [spellcheckTarget, setSpellcheckTarget] = useState('content')
  const [findText, setFindText] = useState('')
  const [replaceText, setReplaceText] = useState('')
  const [useRegex, setUseRegex] = useState(false)
  const [savedSearches, setSavedSearches] = useState([])

  const [showInfoDialog, setShowInfoDialog] = useState(false)
  const [showFinishDialog, setShowFinishDialog] = useState(false)

  // Shortcuts State
  const [showShortcutsDialog, setShowShortcutsDialog] = useState(false);
  const [userShortcuts, setUserShortcuts] = useState(() => ({ ...DEFAULT_SHORTCUTS }));
  const [unboundShortcuts, setUnboundShortcuts] = useState([]);
  const [showImageToText, setShowImageToText] = useState(false);

  const {
    save: debouncedSave,
    saveNow,
    flush: flushAutoSave,
    status: saveStatus,
  } = useAutoSave()

  useEffect(() => {
    const savedPanelWidth = localStorage.getItem('imagePanelWidth')
    const savedColumnWidth = localStorage.getItem('columnWidth')
    const savedOrientation = localStorage.getItem('layoutOrientation')
    const savedSwap = localStorage.getItem('swapPanels')
    const savedImageZoom = localStorage.getItem('imageZoom')
    const savedShortcuts = localStorage.getItem(SHORTCUTS_STORAGE_KEY)
    const savedShortcutsVersion = parseInt(localStorage.getItem(SHORTCUTS_VERSION_KEY), 10)

    if (savedPanelWidth) setImagePanelWidth(parseFloat(savedPanelWidth))
    if (savedColumnWidth) setColumnWidth(parseFloat(savedColumnWidth))
    if (savedOrientation) setLayoutOrientation(savedOrientation)
    if (savedSwap) setSwapPanels(savedSwap === 'true')
if (savedImageZoom) setImageZoom(parseFloat(savedImageZoom))
    else fitZoomOnLoadRef.current = true
    
    if (savedShortcuts) {
      let parsed = null;
      try {
        parsed = JSON.parse(savedShortcuts);
      } catch (e) { console.error('Error loading shortcuts', e); }
      // קיצורים שהמשתמש התאים נשמרים; פעולות חדשות מקבלות קיצור רק אם הוא פנוי
      const { shortcuts: migrated, changed, unbound } = migrateUserShortcuts(
        parsed, Number.isInteger(savedShortcutsVersion) ? savedShortcutsVersion : null
      );
      setUserShortcuts(migrated);
      if (changed) {
        localStorage.setItem(SHORTCUTS_STORAGE_KEY, JSON.stringify(migrated));
        localStorage.setItem(SHORTCUTS_VERSION_KEY, String(SHORTCUTS_VERSION));
      }
      if (unbound.length) localStorage.setItem(SHORTCUTS_UNBOUND_KEY, JSON.stringify(unbound));
    }
    try {
      const unboundSaved = JSON.parse(localStorage.getItem(SHORTCUTS_UNBOUND_KEY) || '[]');
      if (Array.isArray(unboundSaved) && unboundSaved.length) setUnboundShortcuts(unboundSaved);
    } catch { /* ערך פגום — מתעלמים */ }

    setSettingsLoaded(true);
  }, []);

  useEffect(() => {
    if (status === 'authenticated') {
        fetch('/api/user/saved-searches')
            .then(res => res.json())
            .then(data => {
                if (data.success && Array.isArray(data.savedSearches)) {
                    setSavedSearches(data.savedSearches);
                }
            })
            .catch(err => console.error('Failed to load saved searches from server:', err));
            
        const isLocallyHidden = localStorage.getItem(`hide_instructions_${bookPath}`);
        
        fetch('/api/user/preferences')
            .then(res => res.json())
            .then(data => {
                const isServerHidden = data.success && data.hiddenBooks && data.hiddenBooks.includes(bookPath);
                
                if (isServerHidden) {
                    localStorage.setItem(`hide_instructions_${bookPath}`, 'true');
                    setShowInfoDialog(false);
                } else {
                    if (!isLocallyHidden) {
                        setShowInfoDialog(true);
                    }
                }
            })
            .catch(err => {
                console.error('Failed to sync preferences:', err);
                if (!isLocallyHidden) setShowInfoDialog(true);
            });
    }
  }, [status, bookPath])

  // העברה מהעורך הישן (selectedFont, textZoom, textAlign) — רק כשאין עדיין רשומת העדפות; המפתחות
  // הישנים נמחקים תמיד (migrateLegacyEditorPrefs), כך שבחירה חדשה לא נדרסת משאריות
  useEffect(() => {
    if (!prefsReady) return
    try {
      const patch = migrateLegacyEditorPrefs(localStorage)
      if (Object.keys(patch).length > 0) setPrefs(patch)
    } catch {
      // אחסון חסום — נשארים עם ההעדפות
    }
  }, [prefsReady, setPrefs])

  // יישור הטקסט — בהעדפות (prefs.textAlign), מקור אחד ל-textarea, לשכבת ה-mirror ולתצוגה העשירה
  const textAlign = prefs.textAlign
  const setTextAlign = useCallback((value) => setPrefs({ textAlign: value }), [setPrefs])

  // גודל הטקסט (גלגלת+Ctrl, קיצורי הגדלה) — נשמר בהעדפות; מקבל ערך או פונקציה, כמו setState
  const setTextZoom = useCallback((value) => {
    setPrefs((p) => ({ fontSize: typeof value === 'function' ? value(p.fontSize) : value }))
  }, [setPrefs])

  useEffect(() => {
    if (settingsLoaded) localStorage.setItem('imageZoom', imageZoom.toString())
  }, [imageZoom, settingsLoaded])

  // נשמר גם כשהפריסה מתחלפת בקיצור מקלדת, לא רק מהכפתור בסרגל
  useEffect(() => {
    if (settingsLoaded) localStorage.setItem('layoutOrientation', layoutOrientation)
  }, [layoutOrientation, settingsLoaded])

  const toggleFullScreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen()
      } else if (document.exitFullscreen) {
        await document.exitFullscreen()
      }
    } catch (err) {
      console.error(err)
    }
  }, [])

  useEffect(() => {
    const handleFullScreenChange = () => {
      setIsFullScreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleFullScreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullScreenChange)
  }, [])

  useEffect(() => {
    if (status === 'authenticated') loadPageData()
  // טעינה מותנית-נתיב; loadPageData מוחרג למניעת לולאה
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, bookPath, pageNumber])

  useEffect(() => {
    if (bookData?.name) document.title = `עריכה: ${bookData.name} - עמוד ${pageNumber}`
  }, [bookData, pageNumber])

  const loadPageData = async () => {
    try {
      setLoading(true)
      setError(null)
    
      // מהספר רק העמוד הנוכחי (?page=) במקום כל עמודי הספר. תוכן העמוד נשלף רק
      // אחרי שבדיקת ההרשאה שלמטה עברה (ולא במקביל): כך תוכן של ספר מוסתר או של
      // עמוד נעול לא נשלח לדפדפן של מי שאינו מורשה, ואין בקשת 403 מיותרת.
      const bookRes = await fetch(`/api/book/${encodeURIComponent(bookPath)}?page=${pageNumber}`)
      const bookResult = await bookRes.json()

      if (bookResult.success) {
        setBookData(bookResult.book)
      
        if (bookResult.pages && bookResult.pages.length > 0) {
           const foundPage = bookResult.pages.find(p => p.number === pageNumber);
         
           if (foundPage) {
             
               const currentUserId = session?.user?._id || session?.user?.id;
               const isAdmin = hasBookLibraryAccess(session?.user?.role);

               const isClaimedByMe = foundPage.claimedById === currentUserId;
             
               const isAvailable = foundPage.status === 'available';

               const canEnter = isAvailable || isClaimedByMe || isAdmin;

               if (!canEnter) {
                   const holderName = foundPage.claimedBy || 'משתמש אחר';
                   setError(`אין לך הרשאה לערוך דף זה. הדף נמצא בטיפול על ידי ${holderName}.`);
                   setLoading(false);
                   return;
               }

               setPageData(foundPage);
           }
        }
      } else {
        throw new Error(bookResult.error)
      }

      const contentRes = await fetch(`/api/page-content?bookPath=${encodeURIComponent(bookPath)}&pageNumber=${pageNumber}`)
      const contentResult = await contentRes.json()

      if (contentResult.success && contentResult.data) {
        const { data } = contentResult
        setPageData(prev => ({...prev, ...data}));
        setContent(data.content || '')
        setLeftColumn(data.leftColumn || '')
        setRightColumn(data.rightColumn || '')
        setRightColumnName(data.rightColumnName || 'חלק 1')
        setLeftColumnName(data.leftColumnName || 'חלק 2')
        setTwoColumns(data.twoColumns || false)
      }
    } catch (err) {
      console.error(err);
      setError(err.message || 'שגיאה בטעינה')
    } finally {
      setLoading(false)
    }
  }

  const saveSearchesToServer = async (updatedList) => {
      setSavedSearches(updatedList); 
      try {
          const res = await fetch('/api/user/saved-searches', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ savedSearches: updatedList })
          });
          if (!res.ok) throw new Error('Failed to save');
      } catch (err) {
          console.error('Failed to save searches to server', err);
          showAlert('שגיאה', 'שגיאה בשמירת הנתונים בשרת. הנתונים נשמרו מקומית בלבד עד לריענון.');
      }
  };

  const addSavedSearch = (label, newFindText, newReplaceText, isRegex = false) => {
    const newSearch = {
      id: Date.now().toString(),
      label: label || newFindText,
      findText: newFindText,
      replaceText: newReplaceText,
      isRegex: isRegex
    };
    saveSearchesToServer([...savedSearches, newSearch]);
  };

  const addRemoveDigitsToSaved = () => {
    const newSearch = {
      id: Date.now().toString(),
      label: 'ניקוי ספרות',
      findText: '', 
      replaceText: '',
      isRemoveDigits: true
    };
    saveSearchesToServer([...savedSearches, newSearch]);
  };

  const moveSearch = (index, direction) => {
    const newSearches = [...savedSearches];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex >= 0 && targetIndex < newSearches.length) {
      [newSearches[index], newSearches[targetIndex]] = [newSearches[targetIndex], newSearches[index]];
      saveSearchesToServer(newSearches);
    }
  };

  const removeSavedSearch = (id) => {
    saveSearchesToServer(savedSearches.filter(s => s.id !== id));
  };

  const handleColumnChange = useCallback((column, newText) => {
    if (column === 'left') {
      setLeftColumn(newText)
      handleAutoSaveWrapper(content, newText, rightColumn, twoColumns)
    } else {
      setRightColumn(newText)
      handleAutoSaveWrapper(content, leftColumn, newText, twoColumns)
    }
  // handleAutoSaveWrapper מוגדר בהמשך; מכוון
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, leftColumn, rightColumn, twoColumns]); // handleAutoSaveWrapper added below

  // split — כשהקורא כבר יודע את הערך החדש (פיצול: ה-state עוד לא התעדכן בסגירה הזו)
  const handleAutoSaveWrapper = useCallback((newContent, left = leftColumn, right = rightColumn, two = twoColumns, split = isContentSplit) => {
    debouncedSave({
      bookPath, pageNumber, content: newContent, leftColumn: left, rightColumn: right,
      twoColumns: two, isContentSplit: split, rightColumnName, leftColumnName
    })
  }, [debouncedSave, bookPath, pageNumber, leftColumn, rightColumn, twoColumns, isContentSplit, rightColumnName, leftColumnName]);

  // שמירה מיידית של המצב הנוכחי (Ctrl+S, לפני סיום עמוד) — בלי לחכות ל-debounce
  const saveCurrentNow = useCallback(() => saveNow({
    bookPath, pageNumber, content, leftColumn, rightColumn,
    twoColumns, isContentSplit, rightColumnName, leftColumnName
  }), [saveNow, bookPath, pageNumber, content, leftColumn, rightColumn, twoColumns, isContentSplit, rightColumnName, leftColumnName]);

  const updateTextWithHistory = useCallback((newText, column) => {
    let el;
    if (column === 'right' || column === 'left') el = queryEditorField(document, column);
    else el = queryEditorField(document.querySelector('.editor-container'));

    const applyToState = (text) => {
        if (column === 'right') handleColumnChange('right', text);
        else if (column === 'left') handleColumnChange('left', text);
        else { setContent(text); handleAutoSaveWrapper(text); }
    };

    // מסלול אחד לכל שינוי תוכנתי של הטקסט (החלף הכול, בדיקת איות, חיפושים קבועים, ניקוי ספרות,
    // הטמעת תמונה): רק הטווח שהשתנה מוחלף, בצעד ביטול אחד, ובתצוגה המעוצבת — replaceRange של
    // השדה ולא execCommand על ה-contenteditable (שם התגים היו נקראים מחדש כטקסט ומשוכפלים)
    if (el) replaceFieldValue(el, newText, applyToState);
    else applyToState(newText);
  }, [handleColumnChange, handleAutoSaveWrapper]);

  const openSpellcheck = useCallback(() => {
    const target = twoColumns ? (activeTextarea || 'right') : 'content'
    setSpellcheckTarget(target)
    setShowSpellcheck(true)
  }, [twoColumns, activeTextarea])

  const spellcheckText = useMemo(() => {
    if (!twoColumns) return content
    return spellcheckTarget === 'left' ? leftColumn : rightColumn
  }, [twoColumns, spellcheckTarget, content, leftColumn, rightColumn])

  const handleSpellcheckApply = useCallback((newText) => {
    if (!twoColumns || spellcheckTarget === 'content') {
      updateTextWithHistory(newText, null)
      return
    }
    updateTextWithHistory(newText, spellcheckTarget)
  }, [twoColumns, spellcheckTarget, updateTextWithHistory])

  const runAllSavedReplacements = useCallback(() => {
    if (savedSearches.length === 0) return;
    
    let tempRight = rightColumn;
    let tempLeft = leftColumn;
    let tempContent = content;

    // רק בטקסט — לא בתוך תגים (<h2>, base64 של תמונות) ולא בישויות
    const apply = (regex, r) => {
      if (twoColumns) {
        tempRight = replaceOutsideTags(tempRight, regex, r).value;
        tempLeft = replaceOutsideTags(tempLeft, regex, r).value;
      } else {
        tempContent = replaceOutsideTags(tempContent, regex, r).value;
      }
    };

    savedSearches.forEach(search => {
      if (search.isRemoveDigits) {
         apply(/[0-9]/g, '');
         return; 
      }

      const r = processSearchPattern(search.replaceText);
      const regex = buildSearchRegex(search.findText, !!search.isRegex);
      if (!regex) return;
      apply(regex, r);
    });
    
    let changesMade = false;

    if (twoColumns) {
      if (tempRight !== rightColumn) {
          updateTextWithHistory(tempRight, 'right');
          changesMade = true;
      }
      if (tempLeft !== leftColumn) {
          updateTextWithHistory(tempLeft, 'left');
          changesMade = true;
      }
      // שתי קריאות ה-onChange נוצרות מאותו render וכל אחת רואה את הטור האחר
      // בערכו הישן. snapshot מלאה בסוף מונעת מה-debounce לשמור שילוב חלקי.
      if (changesMade) handleAutoSaveWrapper(content, tempLeft, tempRight, true)
    } else {
      if (tempContent !== content) {
          updateTextWithHistory(tempContent, null);
          changesMade = true;
      }
    }

    if (changesMade) {
      showAlert('הצלחה', 'כל הפעולות השמורות בוצעו בהצלחה');
    } else {
      showAlert('לידיעתך', 'לא נמצאו שינויים לביצוע');
    }
  }, [savedSearches, rightColumn, leftColumn, content, twoColumns, updateTextWithHistory, handleAutoSaveWrapper, showAlert]);

  const togglePanelOrder = useCallback(() => {
    const newState = !swapPanels
    setSwapPanels(newState)
    localStorage.setItem('swapPanels', newState.toString())
  }, [swapPanels]);

  const handleRemoveDigits = useCallback(() => {
    showConfirm(
        'ניקוי ספרות',
        'האם אתה בטוח שברצונך למחוק את כל הספרות (0-9) מהטקסט?',
        () => {
            const regex = /[0-9]/g; 
            // דרך השדה (ביטול בצעד אחד, בטוח בתצוגה המעוצבת) — לא עדכון state ישיר
            if (twoColumns) {
              const newRight = replaceOutsideTags(rightColumn, regex, '').value;
              const newLeft = replaceOutsideTags(leftColumn, regex, '').value;
              if (newRight !== rightColumn) updateTextWithHistory(newRight, 'right');
              if (newLeft !== leftColumn) updateTextWithHistory(newLeft, 'left');
              // שתי קריאות onChange באותו render רואות את הטור השני הישן. שומרים בסוף
              // תמונה מלאה של שני הטורים, אחרי עדכון השדות והיסטוריית הביטול שלהם.
              if (newRight !== rightColumn || newLeft !== leftColumn) {
                handleAutoSaveWrapper(content, newLeft, newRight, twoColumns);
              }
            } else {
              const newContent = replaceOutsideTags(content, regex, '').value;
              if (newContent !== content) updateTextWithHistory(newContent, null);
            }
        }
    )
  }, [showConfirm, twoColumns, rightColumn, leftColumn, content, updateTextWithHistory, handleAutoSaveWrapper]);

  const handleFinishClick = useCallback(async () => {
    if (!session) return showAlert('שגיאה', 'אינך מחובר למערכת');
    // סיום (כפתור, Ctrl+Enter, חלון הפקודות) — רק כשהעמוד תפוס על ידי המשתמש
    const claim = pageClaimState(pageData, session.user?._id || session.user?.id);
    if (!canFinishPage(claim)) {
      if (claim.state === 'available') showAlert('העמוד עוד לא נתפס', 'כדי לסיים את העמוד, תפוס אותו קודם (הכפתור "תפוס עמוד" בכותרת).');
      return;
    }
    // סיום רק אחרי שהתוכן הנוכחי נשמר בפועל — אחרת ההעלאה/הסימון כהושלם עלולים לצאת בלי השינויים האחרונים
    const saved = await saveCurrentNow();
    if (!saved) {
      showAlert('השמירה נכשלה', 'לא הצלחנו לשמור את השינויים האחרונים, ולכן אי אפשר לסיים את העמוד כרגע. בדקו את החיבור ונסו שוב.');
      return;
    }
    setShowFinishDialog(true);
  }, [session, pageData, saveCurrentNow, showAlert]);

  const handleClaim = async () => {
    if (!session) return showAlert('שגיאה', 'אינך מחובר למערכת');
    
    showConfirm(
      `עבודה על עמוד ${pageNumber}`,
      `האם אתה מעוניין לעבוד על עמוד זה?\nהעמוד יסומן כ"בטיפול" ויוצמד אליך.`,
      async () => {
          startLoading('תופס עמוד...');
          try {
              const userId = session.user._id || session.user.id;
              const response = await fetch(`/api/book/claim-page`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                      bookPath,
                      pageNumber,
                      userId: userId, 
                      userName: session.user.name
                  })
              });
              
              const result = await response.json();
              stopLoading(); 

              if (result.success) {
                  setPageData(prev => ({
                      ...prev, 
                      status: 'in-progress', 
                      claimedBy: session.user.name, 
                      claimedById: userId
                  }));
                  showAlert('הצלחה', 'העמוד נתפס על ידך בהצלחה! כעת ניתן לערוך ולשמור.');
              } else {
                  showAlert('שגיאה', result.error || 'שגיאה בתפיסת העמוד');
              }
          } catch (error) {
              stopLoading();
              console.error('Error claiming page:', error);
              showAlert('שגיאה', 'שגיאה בתפיסת העמוד');
          }
      }
    );
  };

  const completePageLogic = async () => {
    const safeBookId = bookData?.id || bookData?._id;
    const safePageId = pageData?.id || pageData?._id;
    if (!safePageId || !safeBookId) return showAlert('שגיאה', 'מזהים חסרים');

    startLoading('מעדכן סטטוס עמוד...');
    try {
      const response = await fetch(`/api/book/complete-page`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId: safePageId, bookId: safeBookId })
      });
      const result = await response.json();
      
      stopLoading(); 

      if (result.success) router.push(`/library/books/${encodeURIComponent(bookPath)}`);
      else showAlert('שגיאה', `שגיאה מהשרת: ${result.error}`);
    } catch (error) {
      stopLoading(); 
      console.error('Error completing page:', error);
      showAlert('שגיאה', 'שגיאה בסימון העמוד כהושלם');
    }
  };

  const handleUploadConfirm = async () => {
    let textContent = twoColumns ? `${rightColumnName}:\n${rightColumn}\n\n${leftColumnName}:\n${leftColumn}` : content;
    if (!textContent.trim()) return showAlert('שגיאה', 'העמוד ריק');

    const uploadFile = async (confirmOverwrite = false) => {
      startLoading('מעלה קובץ למערכת...');
      try {
        const cleanBookName = bookPath.replace(/[^a-zA-Z0-9א-ת]/g, '_'); 
        const fileName = `${cleanBookName}_page_${pageNumber}.txt`;
        const blob = new Blob([textContent], { type: 'text/plain' });
        const file = new File([blob], fileName, { type: 'text/plain' });

        const formData = new FormData();
        formData.append('file', file);
        formData.append('bookName', `${bookPath} - עמוד ${pageNumber}`);
        formData.append('userId', session.user._id || session.user.id);
        formData.append('userName', session.user.name);
        if (confirmOverwrite) {
          formData.append('confirmOverwrite', 'true');
        }

        const response = await fetch('/api/upload-book', { method: 'POST', body: formData });
        const result = await response.json();

        stopLoading(); 

        // אם נדרש אישור
        if (result.requiresConfirmation) {
          const confirmed = await showConfirm(
            'קובץ קיים',
            result.message
          );
          
          if (confirmed) {
            // נסה שוב עם אישור
            await uploadFile(true);
          }
          return;
        }

        if (result.success) {
          showAlert('הצלחה', 'הטקסט הועלה בהצלחה והעמוד סומן כהושלם!');
          await completePageLogic(); 
        } else {
          showAlert('שגיאה', `שגיאה בהעלאה: ${result.error || 'שגיאה לא ידועה'}`);
        }
      } catch (error) {
        stopLoading();
        console.error('Error uploading text:', error);
        showAlert('שגיאה', 'שגיאה בתהליך ההעלאה');
      }
    };

    await uploadFile();
  };

  const handleColumnResizeStart = (e) => {
    e.preventDefault()
    setIsColumnResizing(true)
  }

  // גרירת המפריד בין שני טורי הטקסט (בתוך TextEditor). המפריד בין הצילום לטקסט — PanelSplitter
  const handleMouseMove = useCallback((e) => {
    if (!isColumnResizing) return
    const editorContainer = textEditorContainerRef.current
    if (!editorContainer) return
    const rect = editorContainer.getBoundingClientRect()
    setColumnWidth(computeColumnWidth(rect, e.clientX))
  }, [isColumnResizing])

  const handleMouseUp = useCallback(() => {
    setIsColumnResizing(false)
    localStorage.setItem('columnWidth', columnWidthRef.current.toString())
  }, [])

  useEffect(() => {
    if (isColumnResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isColumnResizing, handleMouseMove, handleMouseUp])

  // החזרת הפוקוס לעורך אחרי שינוי מבנה (איחוד טורים): הטור הממוקד הוסר מה-DOM והפוקוס נפל ל-BODY
  const focusEditorSoon = useCallback(() => {
    setTimeout(() => {
      const el = queryEditorField(document.querySelector('.editor-container'))
      if (el && !el.contains(document.activeElement)) el.focus({ preventScroll: true })
    }, 50)
  }, []);

  const toggleColumns = useCallback(async () => {
    if (!twoColumns) {
      setShowSplitDialog(true)
      return
    }
    const right = rightColumn
    const left = leftColumn
    const ok = await showConfirm(
      'איחוד הטורים',
      'לאחד את שני הטורים לטור אחד? הטקסט של הטור השמאלי יצורף אחרי הטור הימני.',
    )
    if (!ok) {
      focusEditorSoon()
      return
    }
    const combined = mergeColumns(right, left)
    const prevContent = content
    const split = isContentSplit
    // הביטול הראשון בטור המאוחד מחזיר את שני הטורים עם התוכן שלהם (ההיסטוריה של כל טור נשמרה —
    // fieldHistoryStore — כי הערך שלו לא השתנה)
    pushStructuralUndo('content', combined, () => {
      setRightColumn(right)
      setLeftColumn(left)
      setContent(prevContent)
      setTwoColumns(true)
      handleAutoSaveWrapper(prevContent, left, right, true, split)
      focusEditorSoon()
    })
    setContent(combined)
    setTwoColumns(false)
    handleAutoSaveWrapper(combined, left, right, false)
    focusEditorSoon()
  }, [twoColumns, rightColumn, leftColumn, content, isContentSplit, handleAutoSaveWrapper, showConfirm, focusEditorSoon]);

  const handleDownloadImage = async () => {
    if (!pageData?.thumbnail) return showAlert('שגיאה', 'אין תמונה להורדה');
    try {
      const response = await fetch(pageData.thumbnail);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const cleanBookName = bookData?.name?.replace(/[^a-zA-Z0-9א-ת]/g, '_') || 'book';
      link.download = `${cleanBookName}_page_${pageNumber}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      window.open(pageData.thumbnail, '_blank');
    }
  };

  const confirmSplit = () => {
    setRightColumn(content)
    setLeftColumn('')
    setTwoColumns(true)
    const split = splitMode === 'content'
    setIsContentSplit(split)
    setShowSplitDialog(false)
    handleAutoSaveWrapper(content, '', content, true, split)
  }
  
  const getActiveTextarea = () => {
    let activeEl = null;
    if (activeTextarea === 'left' || activeTextarea === 'right') activeEl = queryEditorField(document, activeTextarea);
    else activeEl = queryEditorField(document.querySelector('.editor-container'));

    if (!activeEl) {
        if (twoColumns) activeEl = queryEditorField(document, 'right');
        else activeEl = queryEditorField(document.querySelector('.editor-container'));
    }
    return activeEl;
  }

  const normalizeHebrewQuotes = (value) => {
    if (!value) return '';
    return value.replace(/["']/g, m => (m === '"' ? '״' : '׳'));
  };

  const findNextInTextarea = (activeEl, textToFind, isRegexMode, suppressAlerts = false) => {
    if (!textToFind) {
      if (!suppressAlerts) showAlert('שגיאה', 'הזן טקסט לחיפוש');
      return false;
    }

    if (!activeEl) return false;

    const text = activeEl.value;
    const startPos = activeEl.selectionEnd;

    // רק בטקסט — לא בתוך תגים/ישויות (חפש הבא לא נעצר בתוך <big> או ב-base64 של תמונה)
    const regex = buildSearchRegex(textToFind, isRegexMode);
    if (!regex) {
      if (!suppressAlerts) showAlert('שגיאה', 'ביטוי רגולרי לא תקין');
      return false;
    }
    const hit = findNextOutsideTags(text, regex, startPos);
    const matchIndex = hit ? hit.index : -1;
    const matchLength = hit ? hit.length : 0;
    if (hit?.wrapped && !suppressAlerts) {
      showAlert('חיפוש', 'הגענו לסוף הקובץ, ממשיכים מההתחלה.');
    }

    if (matchIndex !== -1) {
      activeEl.focus();
      activeEl.setSelectionRange(matchIndex, matchIndex + matchLength);

      // שימוש בפונקציה המדויקת לחישוב מיקום הקורסור
      setTimeout(() => {
        const computedLineHeight = Number.parseFloat(window.getComputedStyle(activeEl).lineHeight);
        const lineHeight = Number.isFinite(computedLineHeight) ? computedLineHeight : 24;
        const caretTop = getTextareaCaretTop(activeEl, matchIndex);
        const scrollPos = Math.max(0, caretTop - (activeEl.clientHeight / 2) + lineHeight);

        activeEl.scrollTop = scrollPos;
      }, 10);
      return true;
    }

    if (!suppressAlerts) {
      showAlert('חיפוש', 'לא נמצאו מופעים.');
    }
    return false;
  };

  const handleFindNext = (textToFind, isRegexMode) => {
    if (!textToFind) return showAlert('שגיאה', 'הזן טקסט לחיפוש');

    const activeEl = getActiveTextarea();
    if (!activeEl) return;

    findNextInTextarea(activeEl, textToFind, isRegexMode, false);
  };

  const findNextWholeWordInTextarea = (activeEl, word, suppressAlerts = false) => {
    if (!word) {
      if (!suppressAlerts) showAlert('שגיאה', 'הזן טקסט לחיפוש')
      return false
    }

    if (!activeEl) return false

    return findNextWholeWordInTextareaUtil(activeEl, word, {
      text: activeEl.value || '',
      suppressAlerts,
      onWrap: () => showAlert('חיפוש', 'הגענו לסוף הקובץ, ממשיכים מההתחלה.'),
      onNotFound: () => showAlert('חיפוש', 'לא נמצאו מופעים.'),
      getCaretTop: getTextareaCaretTop,
      scrollDelay: 10
    })
  };

  const handleSpellcheckSelect = (word) => {
    if (!word) return;

    const activeEl = getActiveTextarea();
    if (!activeEl) return;

    const normalized = normalizeHebrewQuotes(word);
    const alt = normalized.replace(/[״׳]/g, m => (m === '״' ? '"' : "'"));
    const variants = Array.from(new Set([word, normalized, alt]));

    activeEl.focus();
    activeEl.setSelectionRange(0, 0);

    let found = false;
    for (let i = 0; i < variants.length; i += 1) {
      if (!found) found = findNextWholeWordInTextarea(activeEl, variants[i], true);
    }

    if (!found) {
      showAlert('חיפוש', 'לא נמצאו מופעים.');
    }
  };
  const handleReplaceCurrent = (textToReplace, textToFind, isRegexMode) => {
    if (!textToFind) return showAlert('שגיאה', 'הזן טקסט לחיפוש');

    const activeEl = getActiveTextarea();
    if (!activeEl) return;

    if (activeEl.selectionStart === activeEl.selectionEnd) {
        handleFindNext(textToFind, isRegexMode);
        return;
    }

    const patternStr = processSearchPattern(textToFind);
    const replacement = processSearchPattern(textToReplace || '');
    // בחירה שנוגעת בתג (או שאינה ההתאמה) — לא מחליפים בתוך קוד; עוברים להתאמה הבאה בטקסט
    const selStart = activeEl.selectionStart;
    const selEnd = activeEl.selectionEnd;
    const selRegex = buildSearchRegex(textToFind, isRegexMode);
    const selHit = selRegex && rangeInText(activeEl.value, selStart, selEnd)
      ? findNextOutsideTags(activeEl.value, selRegex, selStart)
      : null;
    if (!selHit || selHit.wrapped || selHit.index !== selStart || selHit.length !== selEnd - selStart) {
        handleFindNext(textToFind, isRegexMode);
        return;
    }

    let finalReplacement = replacement;

    if (isRegexMode) {
        try {
            const selectedText = activeEl.value.substring(activeEl.selectionStart, activeEl.selectionEnd);
            const regex = new RegExp(patternStr);
            
            finalReplacement = selectedText.replace(regex, replacement);
        } catch (e) {
            console.error("Regex replacement error:", e);
            return showAlert('שגיאה', 'ביטוי רגולרי לא תקין');
        }
    }

    // אותו מסלול בטוח לשתי התצוגות (ראו updateTextWithHistory)
    replaceFieldSelection(activeEl, finalReplacement, (newText) => {
        const col = activeEl.getAttribute('data-column');
        if (col === 'right') handleColumnChange('right', newText);
        else if (col === 'left') handleColumnChange('left', newText);
        else {
            setContent(newText);
            handleAutoSaveWrapper(newText);
        }
    });
    
    handleFindNext(textToFind, isRegexMode);
  };

  const handleReplaceAll = (overrideFind = null, overrideReplace = null, useRegexOverride = null) => {
    const textToFind = overrideFind !== null ? overrideFind : findText;
    const textToReplace = overrideReplace !== null ? overrideReplace : replaceText;
    const isRegexMode = useRegexOverride !== null ? useRegexOverride : useRegex;

    if (!textToFind) return showAlert('שגיאה', 'הזן טקסט לחיפוש');
    
    const replacement = processSearchPattern(textToReplace || '');

    const regex = buildSearchRegex(textToFind, isRegexMode);
    if (!regex) return showAlert('שגיאה', 'ביטוי רגולרי לא תקין');

    let totalOccurrences = 0;

    // רק בטקסט — לא בתוך תגים (<i> לא הופך ל-<X>) ולא בישויות
    const executeReplace = (text) => {
      if (!text) return text;
      const { value, count } = replaceOutsideTags(text, regex, replacement);
      totalOccurrences += count;
      return value;
    };

    if (twoColumns) {
      const newRight = executeReplace(rightColumn);
      const newLeft = executeReplace(leftColumn);

      if (newRight !== rightColumn) {
          updateTextWithHistory(newRight, 'right');
      }
      if (newLeft !== leftColumn) {
          updateTextWithHistory(newLeft, 'left');
      }

    } else {
      const newContent = executeReplace(content);
      if (newContent !== content) {
        updateTextWithHistory(newContent, null);
      }
    }

    if (totalOccurrences > 0) showAlert('הצלחה', `ההחלפה בוצעה בהצלחה! הוחלפו ${totalOccurrences} מופעים.`);
    else showAlert('לידיעתך', 'לא נמצאו תוצאות התואמות לחיפוש.');
  };

  // עריכת עיצוב (formatToggle.js — לוגיקה טהורה, אותה לשתי התצוגות), מוחלת כהחלפה אחת
  // (applyFieldEdit) — ביטול (Ctrl+Z) מחזיר את כל הפעולה בצעד אחד, גם ב-textarea וגם בתצוגה המעוצבת.
  const applyFormatEdit = useCallback((compute) => {
    let activeEl = document.activeElement;
    if (!isEditorField(activeEl)) {
        if (activeTextarea === 'left' || activeTextarea === 'right') activeEl = queryEditorField(document, activeTextarea);
        else activeEl = queryEditorField(document.querySelector('.editor-container'));
    }
    if (!isEditorField(activeEl)) return;

    applyFieldEdit(activeEl, compute, (newText) => {
      const col = activeEl.getAttribute('data-column');
      if (col === 'right') handleColumnChange('right', newText);
      else if (col === 'left') handleColumnChange('left', newText);
      else {
          setContent(newText);
          handleAutoSaveWrapper(newText);
      }
    });
  }, [activeTextarea, handleColumnChange, handleAutoSaveWrapper]);

  // כפתור עיצוב: לחיצה שנייה מסירה (A+ על <small> — חזרה לרגיל)
  const insertTag = useCallback((tag) => applyFormatEdit((v, s, e) => toggleFormat(v, s, e, tag)), [applyFormatEdit]);
  // "נקה עיצוב" (Ctrl+\)
  const clearFormat = useCallback(() => applyFormatEdit(clearFormatting), [applyFormatEdit]);

  const handlersRef = useRef({ insertTag, handleFinishClick });

  useEffect(() => {
    const fetchGlobalInstructions = async () => {
      try {
        const res = await fetch('/api/global-instructions'); 
        const data = await res.json();
        
        if (data.success && data.instructions) {
          setGlobalInstructions(data.instructions);
        }
      } catch (err) {
        console.error('Failed to fetch global instructions:', err);
      }
    };

    fetchGlobalInstructions();
  }, []);

  useEffect(() => {
    handlersRef.current = { insertTag, handleFinishClick };
  }, [insertTag, handleFinishClick]);

  const persistUserShortcuts = (newShortcuts) => {
    setUserShortcuts(newShortcuts);
    localStorage.setItem(SHORTCUTS_STORAGE_KEY, JSON.stringify(newShortcuts));
    localStorage.setItem(SHORTCUTS_VERSION_KEY, String(SHORTCUTS_VERSION));
  };

  const saveUserShortcuts = (newShortcuts) => {
    persistUserShortcuts(newShortcuts);
    showAlert('הצלחה', 'קיצורי המקלדת עודכנו בהצלחה');
  };

  // תצוגה מעוצבת ↔ קוד (Alt+Shift+M, חלון הפקודות, גיליון התצוגה) — הסמן נשאר במקומו
  const toggleTextView = useTextViewToggle({ setPrefs, activeColumn: twoColumns ? (activeTextarea === 'left' ? 'left' : 'right') : null })

  const actionsMap = useMemo(() => ({
    'save': { label: 'שמור עכשיו', action: saveCurrentNow },
    'bold': { label: 'מודגש (B)', action: () => insertTag('b') },
    'italic': { label: 'נטוי (I)', action: () => insertTag('i') },
    'underline': { label: 'קו תחתון (U)', action: () => insertTag('u') },
    'h1': { label: 'כותרת H1', action: () => insertTag('h1') },
    'h2': { label: 'כותרת H2', action: () => insertTag('h2') },
    'h3': { label: 'כותרת H3', action: () => insertTag('h3') },
    'bigger': { label: 'הגדל גופן טקסט', action: () => insertTag('big') },
    'smaller': { label: 'הקטן גופן טקסט', action: () => insertTag('small') },
    'clearFormatting': { label: 'נקה עיצוב', action: () => clearFormat() },
    'finish': { label: 'סיים והעלה (פתח חלונית)', action: handleFinishClick },
    
    'zoomIn': { label: 'זום אין תמונה', action: () => setImageZoom(z => Math.min(300, z + 10)) },
    'zoomOut': { label: 'זום אאוט תמונה', action: () => setImageZoom(z => Math.max(25, z - 10)) },

    'split': { label: 'פיצול לשני טורים', action: toggleColumns },
    'layout': { label: 'שנה כיוון פריסה', action: () => setLayoutOrientation(prev => prev === 'vertical' ? 'horizontal' : 'vertical') },
    'togglePanel': { label: 'החלף צדדים (תמונה/טקסט)', action: togglePanelOrder },
    'fullScreen': { label: 'מסך מלא', action: toggleFullScreen },
    'findReplace': { label: 'פתח חיפוש והחלפה', action: () => setShowFindReplace(true) },
    'imageToText': { label: 'המרת תמונה לטקסט', action: () => setShowImageToText(true) },
    'shortcuts': { label: 'ערוך קיצורי מקלדת', action: () => setShowShortcutsDialog(true) },
    
    'removeDigits': { label: 'ניקוי ספרות', action: handleRemoveDigits },
    'runSavedSearches': { label: 'בצע חיפושים קבועים', action: runAllSavedReplacements },

    'textZoomIn': {
      label: 'הגדל תצוגת טקסט',
      action: () => setTextZoom(z => z + 2)
    },
    'textZoomOut': {
      label: 'הקטן תצוגת טקסט',
      action: () => setTextZoom(z => z - 2)
    },
    'commandPalette': {
      label: 'חלון הפקודות',
      action: () => setShowPalette(open => !open)
    },
    'toggleTextView': { label: 'תצוגה מעוצבת / קוד', action: toggleTextView },
    'alignRight': { 
      label: 'יישור טקסט לימין', 
      action: () => setTextAlign('right') 
    },
    'alignCenter': { 
      label: 'יישור טקסט למרכז', 
      action: () => setTextAlign('center') 
    },
    'alignLeft': { 
      label: 'יישור טקסט לשמאל', 
      action: () => setTextAlign('left') 
    },
    'alignJustify': { 
      label: 'יישור טקסט מלא (Justify)', 
      action: () => setTextAlign('justify') 
    },

  }), [handleFinishClick, saveCurrentNow, insertTag, clearFormat, toggleColumns, togglePanelOrder, toggleFullScreen, handleRemoveDigits, runAllSavedReplacements, setTextZoom, setTextAlign, toggleTextView]);

  const availableActions = useMemo(() => {
    return Object.entries(actionsMap).map(([id, def]) => ({
      id,
      label: def.label
    }));
  }, [actionsMap]);

  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      // בתוך חלון הקיצורים, חלון הפקודות או חלון הסיום — הקיצורים הגלובליים לא פועלים
      // (חלון הסיום מטפל ב-Ctrl+Enter בעצמו; חלון הפקודות — בחצים וב-Enter). Ctrl+K סוגר את חלון הפקודות.
      if (showShortcutsDialog || showFinishDialog) return;
      if (showPalette) {
        if (buildShortcutCombination(e) === userShortcuts.commandPalette) {
          e.preventDefault();
          setShowPalette(false);
        }
        return;
      }

      if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;

      const combination = buildShortcutCombination(e);
      const foundActionId = findMatchingActionId(userShortcuts, combination);

      // עיצוב — רק מתוך שדה הטקסט; שאר הקיצורים — לא מתוך חלון או שדה קלט אחר (shortcutScope.js)
      if (foundActionId && actionsMap[foundActionId] && shortcutAllowed(foundActionId, shortcutContext(e.target))) {
        e.preventDefault();
        e.stopPropagation();
        actionsMap[foundActionId].action();
      } else if (foundActionId === 'save') {
        // שמירה חסומה כאן (חלון/שדה אחר) — לפחות לא לפתוח את "שמירת הדף" של הדפדפן
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleGlobalKeyDown, { capture: true });
  }, [userShortcuts, actionsMap, showShortcutsDialog, showFinishDialog, showPalette]);

  const handleCloseInfoDialog = async (doNotShowAgain) => {
    setShowInfoDialog(false);
    
    if (doNotShowAgain && bookPath) {
      localStorage.setItem(`hide_instructions_${bookPath}`, 'true');

      try {
        await fetch('/api/user/preferences', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            action: 'hide_instructions',
            bookPath: bookPath 
          })
        });
      } catch (err) {
        console.error('Failed to save preference to server', err);
      }
    }
  };

  // ===== מעקב שורה/מילה בצילום (עורך העמוד החדש, שלבים 2–3) — בלוק אחד =====
  // scanTracking.imagePanelProps → <ImagePanel>, scanTracking.textEditorProps → <TextEditor>,
  // scanTracking.tracking → שורת המצב ({ level, source, line, word, lineCount, wordCount, ... })
  // "זהה מילים בעמוד" — תיבות מילים מקומיות (tesseract בדפדפן) לעמוד בלי פריסת OCR
  // שמירת התיבות בשרת — רק למי שתפס את העמוד או למנהל ספרים (כמו canWritePageLayout); אחרת רק מקומית
  const canSaveWords = pageClaimState(pageData, session?.user?._id || session?.user?.id).state === 'mine' || hasBooksAccess(session?.user?.role)
  const trackingPageKey = `${bookPath}\u0000${pageNumber}`
  const [officialLayoutFor, setOfficialLayoutFor] = useState({ key: trackingPageKey, has: false })
  // איפוס state לפי זהות העמוד בזמן render, כדי שהעמוד החדש לא יירש החלטה מהקודם.
  if (officialLayoutFor.key !== trackingPageKey) {
    setOfficialLayoutFor({ key: trackingPageKey, has: false })
  }
  const hasOfficialWordLayout = officialLayoutFor.key === trackingPageKey && officialLayoutFor.has
  // PageLayout הוא fallback בלבד. נותנים ל-ocr-data חלון קצר לחזור; אם יש layout רשמי
  // ברמת מילה מבטלים את הטיימר/הבקשה. כך אין waterfall בעמודים בלי OCR ואין payload כפול ברוב העמודים.
  const localWords = useLocalWordBoxes({
    pageId: pageData?.id || pageData?._id,
    imageUrl: pageData?.thumbnail,
    canSave: canSaveWords,
    autoCheck: !hasOfficialWordLayout,
    checkDelayMs: 150,
  })
  const scanTracking = usePageTracking({
    bookPath, pageNumber, imageUrl: pageData?.thumbnail,
    twoColumns, activeTextarea, textContainerRef: textEditorContainerRef, imageZoom,
    text: twoColumns ? (activeTextarea === 'left' ? leftColumn : rightColumn) : content,
    enabled: !loading && !error,
    extraSource: localWords.source,
    // העדפות התצוגה: "מול הסריקה" → שורה מול שורה (בלי גלישה) — רק כשהטקסט באמת מחולק
    // לשורות כמו הצילום; טקסט שמגיע כגוש גולש תמיד (effectiveWrap ב-usePageTracking)
    wrap: prefs.lineSpacing === 'facing' ? 'off' : 'soft',
    highlight: prefs.highlightStrength,
    showFrame: prefs.trackingFrame,
    followScroll: prefs.followScroll
  })
  if (scanTracking.tracking.hasOfficialWordLayout && !hasOfficialWordLayout) {
    setOfficialLayoutFor({ key: trackingPageKey, has: true })
  }
  const wordDetecting = localWords.status === 'detecting' || localWords.status === 'saving'
  const canDetectWords = Boolean(pageData?.thumbnail) && Boolean(pageData?.id || pageData?._id) && canStartLocalWordDetection(localWords.status)
  const detectWords = canDetectWords ? localWords.detect : undefined
  const trackingNote = localWords.status === 'detecting'
    ? `מזהה מילים… ${Math.round(localWords.progress * 100)}%`
    : localWords.status === 'saving' ? 'שומר את המילים שזוהו…' : (localWords.error || localWords.notice)
  // ===== סוף בלוק המעקב =====

  // ================= מעטפת העורך החדש (שלב 1) =================

  // מצב השמירה לתצוגה + מתי הסתיימה השמירה האחרונה ("נשמר לפני רגע")
  const uiSaveStatus = toUiSaveStatus(saveStatus)
  const [lastSavedAt, setLastSavedAt] = useState(null)
  const prevSaveStatusRef = useRef(saveStatus)
  useEffect(() => {
    if (prevSaveStatusRef.current === 'saving' && saveStatus === 'saved') {
      setLastSavedAt(Date.now())
    }
    prevSaveStatusRef.current = saveStatus
  }, [saveStatus])

  const bookHref = `/library/books/${encodeURIComponent(bookPath)}`

  // חזרה לספר: קודם שומרים את מה שממתין (ומחכים לשמירה שבדרך); אם נכשלה — שואלים לפני יציאה
  const leaveToBook = useCallback(async () => {
    const saved = await flushAutoSave()
    if (saved) router.push(bookHref)
    else showConfirm('השמירה נכשלה', UNSAVED_LEAVE_MESSAGE, () => router.push(bookHref))
  }, [flushAutoSave, router, bookHref, showConfirm])
  const totalPages = Number.isInteger(bookData?.totalPages) ? bookData.totalPages : undefined

  // תפיסה / שחרור
  const currentUserId = session?.user?._id || session?.user?.id
  const isPageAvailable = pageData?.status === 'available'
  const canReleasePage = pageData?.status === 'in-progress' && Boolean(currentUserId) && pageData?.claimedById === currentUserId
  const claim = pageClaimState(pageData, currentUserId)

  const handleRelease = useCallback(() => {
    const pageId = pageData?.id || pageData?._id
    if (!pageId) return showAlert('שגיאה', 'מזהה העמוד חסר')
    showConfirm(
      'שחרור העמוד',
      'לשחרר את העמוד? הוא יחזור להיות פנוי למתנדבים אחרים.',
      async () => {
        startLoading('משחרר את העמוד...')
        try {
          // לא משחררים עמוד עם שינויים שלא נשמרו — אחרי השחרור כבר אין הרשאה לשמור אותם
          const saved = await flushAutoSave()
          if (!saved) {
            stopLoading()
            showAlert('השמירה נכשלה', 'לא הצלחנו לשמור את השינויים האחרונים, ולכן העמוד לא שוחרר. בדקו את החיבור ונסו שוב.')
            return
          }
          const response = await fetch('/api/book/release-page', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pageId })
          })
          const result = await response.json()
          stopLoading()
          if (result.success) {
            setPageData(prev => ({ ...prev, status: 'available', claimedBy: null, claimedById: null }))
            showAlert('בוצע', 'העמוד שוחרר')
          } else {
            showAlert('שגיאה', result.error || 'שגיאה בשחרור העמוד')
          }
        } catch (err) {
          stopLoading()
          console.error('Error releasing page:', err)
          showAlert('שגיאה', 'שגיאה בשחרור העמוד')
        }
      }
    )
  }, [pageData, showAlert, showConfirm, startLoading, stopLoading, flushAutoSave])

  // היסטוריית הביטול שייכת לשדה הלוגי ושורדת מעבר תצוגה (fieldHistoryStore) — אבל לא מעבר עמוד
  useEffect(() => {
    resetFieldHistories()
    return resetFieldHistories
  }, [bookPath, pageNumber])

  // האם יש מה לבטל/לבצע מחדש — מתאפס בטעינת העמוד ובהחלפת ה-textarea-ים (פיצול/איחוד טורים)
  const undoState = useUndoAvailability(textEditorContainerRef, `${bookPath}#${pageNumber}#${loading}#${twoColumns}#${prefs.textView}`)

  // פעולות על ה-textarea הפעיל (ביטול/ביצוע מחדש; מעבר שורה בנייד)
  const runTextCommand = (command) => {
    const el = getActiveTextarea()
    if (!el) return
    el.focus()
    // שתי התצוגות מנהלות היסטוריה משלהן (richHistory / textareaHistory) — לא של הדפדפן
    const history = editorFieldHistory(el)
    if (history) {
      if (command === 'undo') history.undo()
      else if (command === 'redo') history.redo()
      return
    }
    document.execCommand(command)
  }

  const jumpLine = (direction) => {
    const el = getActiveTextarea()
    if (!el) return
    const next = caretLineJump(el.value, el.selectionStart, direction)
    el.focus()
    el.setSelectionRange(next, next)
    const computedLineHeight = Number.parseFloat(window.getComputedStyle(el).lineHeight)
    const lineHeight = Number.isFinite(computedLineHeight) ? computedLineHeight : 24
    const caretTop = getTextareaCaretTop(el, next)
    if (caretTop < el.scrollTop || caretTop > el.scrollTop + el.clientHeight - lineHeight) {
      el.scrollTop = Math.max(0, caretTop - el.clientHeight / 2)
    }
  }

  // זום הצילום
  const zoomBy = (delta) => setImageZoom(z => clampZoom(z + delta))
  const handleFitZoom = () => {
    // לפי מאפיין ולא ref: הפונקציה עוברת גם לחלון הפקודות (נבנה בזמן render)
    const host = document.querySelector('[data-editor-shell] [data-scan-host]')
    const img = host?.querySelector('img')
    // 48 — הריפוד של ImagePanel (p-4 משני הצדדים) ופס הגלילה
    const zoom = fitZoomPercent({
      containerWidth: host?.clientWidth ?? 0,
      imageWidth: img?.naturalWidth ?? 0,
      padding: 48
    })
    if (zoom) setImageZoom(zoom)
  }

  // הפריסה: בנייד הצילום תמיד מעל הטקסט
  const effectiveOrientation = isMobile || isPortraitTablet ? 'horizontal' : layoutOrientation
  const effectiveSwap = isMobile ? false : swapPanels
  const scanSize = isMobile ? mobileScanSize : imagePanelWidth
  const handleScanSizeChange = (size) => (isMobile ? setMobileScanSize(size) : setImagePanelWidth(size))
  const handleSplitterPointer = (clientX, clientY) => {
    const rect = splitContainerRef.current?.getBoundingClientRect()
    if (!rect) return
    handleScanSizeChange(computeImagePanelWidth(rect, clientX, clientY, effectiveOrientation, effectiveSwap))
  }
  const handleScanSizeCommit = (size) => {
    if (isMobile) return
    try { localStorage.setItem('imagePanelWidth', String(size)) } catch { /* אחסון חסום */ }
  }

  // שורת המצב: מיקום הסמן, ספירת מילים, תזכורת מנוחה
  // (מתעדכן ב-rAF, לא בתוך אירוע ה-input — אחרת Enter נבלע; ראו useCaretPosition)
  const caretPos = useCaretPosition('.editor-container')
  // העיצוב שתחת הסמן — מצב "לחוץ" של B/I/U, הכותרות ו-big/small בשורת הכלים
  const activeFormatState = useActiveFormats('.editor-container')

  const editedText = twoColumns ? `${rightColumn}\n${leftColumn}` : content
  const wordCount = useMemo(() => countWords(editedText), [editedText])
  const textLineCount = useMemo(() => countLines(editedText), [editedText])

  const rest = useRestReminder({ enabled: prefs.restReminder, intervalMin: prefs.restIntervalMin })

  // מצב המעקב לשורת המצב — מבלוק המעקב (usePageTracking) למעלה
  const tracking = scanTracking.tracking

  const statusShortcuts = [
    { keys: shortcutKeys(userShortcuts.commandPalette), label: 'פקודות' },
    { keys: shortcutKeys(userShortcuts.save), label: 'שמירה' },
    { keys: shortcutKeys(userShortcuts.finish), label: 'סיום' },
  ].filter(s => s.keys)

  const paletteCommands = showPalette ? buildEditorCommands({
    shortcuts: userShortcuts,
    state: {
      twoColumns,
      hasImage: Boolean(pageData?.thumbnail),
      canUndo: undoState.canUndo,
      canRedo: undoState.canRedo,
      isFullScreen,
      layoutOrientation,
      fontFamily: prefs.fontFamily,
      lineHeight: prefs.lineHeight,
      paraSpacing: prefs.paraSpacing,
      textView: prefs.textView,
      canDetectWords,
      wordDetecting,
      canClaim: isPageAvailable,
      canRelease: canReleasePage,
      canFinish: canFinishPage(claim),
    },
    run: {
      findReplace: () => setShowFindReplace(true),
      runSavedSearches: runAllSavedReplacements,
      spellcheck: openSpellcheck,
      undo: () => runTextCommand('undo'),
      redo: () => runTextCommand('redo'),
      insertTag,
      clearFormatting: clearFormat,
      imageToText: () => setShowImageToText(true),
      removeDigits: handleRemoveDigits,
      split: toggleColumns,
      align: setTextAlign,
      detectWords: () => detectWords?.(),
      zoomIn: () => zoomBy(IMAGE_ZOOM.step),
      zoomOut: () => zoomBy(-IMAGE_ZOOM.step),
      zoomFit: handleFitZoom,
      zoomReset: () => setImageZoom(100),
      downloadImage: handleDownloadImage,
      display: () => setShowDisplay(true),
      layout: () => setLayoutOrientation(prev => (prev === 'vertical' ? 'horizontal' : 'vertical')),
      swapPanels: togglePanelOrder,
      fullScreen: toggleFullScreen,
      setFont: (fontFamily) => setPrefs({ fontFamily }),
      setLineHeight: (lineHeight) => setPrefs({ lineHeight }),
      setParaSpacing: (paraSpacing) => setPrefs({ paraSpacing }),
      toggleFontSerif: () => setPrefs({ fontFamily: toggledEditorFont(prefs.fontFamily) }),
      toggleTextView,
      textZoomIn: () => setTextZoom(z => z + 2),
      textZoomOut: () => setTextZoom(z => z - 2),
      shortcuts: () => setShowShortcutsDialog(true),
      save: saveCurrentNow,
      finish: handleFinishClick,
      claim: handleClaim,
      release: handleRelease,
      guidelines: () => setShowInfoDialog(true),
      backToBook: leaveToBook,
    },
  }) : []

  // גובה מלא כמו העורך עצמו (h-dvh) — אחרת הפוטר של הספרייה מופיע מתחת
  // ל"טוען..." ונדחף בבת אחת מסך שלם למטה כשהעורך נטען (layout shift)
  if (loading) return <main id="main-content" className="h-dvh text-center p-20">טוען...</main>
  if (error) return <main id="main-content" className="text-center p-20 text-error">{error}</main>

  return (
    <EditorShell
      theme={prefs.theme}
      styleVars={editorStyleVars(prefs)}
      fullScreen={isFullScreen}
      isMobile={isMobile}
      orientation={effectiveOrientation}
      swap={effectiveSwap}
      scanSize={scanSize}
      onScanSizeChange={handleScanSizeChange}
      onScanSizeCommit={handleScanSizeCommit}
      onSplitterPointer={handleSplitterPointer}
      splitContainerRef={splitContainerRef}
      scanFilter={scanFilterCss(prefs)}
      topBar={
        <EditorTopBar
          bookTitle={bookData?.name || bookPath}
          bookHref={bookHref}
          onBack={leaveToBook}
          pageNumber={pageNumber}
          totalPages={totalPages}
          saveStatus={uiSaveStatus}
          lastSavedAt={lastSavedAt}
          onRetrySave={saveCurrentNow}
          onOpenCommands={() => setShowPalette(true)}
          onOpenDisplay={() => setShowDisplay(open => !open)}
          displayOpen={showDisplay}
          onOpenGuidelines={() => setShowInfoDialog(true)}
          onFinish={handleFinishClick}
          claimState={claim.state}
          holderName={claim.holderName}
          onClaim={handleClaim}
          accountSlot={<EditorAccountButton name={session?.user?.name} />}
          mobileCompact
          shortcuts={userShortcuts}
        />
      }
      scanToolbar={isMobile ? null : (
        <ScanToolbar
          zoom={imageZoom}
          onZoomIn={() => zoomBy(IMAGE_ZOOM.step)}
          onZoomOut={() => zoomBy(-IMAGE_ZOOM.step)}
          onZoomReset={() => setImageZoom(100)}
          onFit={handleFitZoom}
          onDownload={handleDownloadImage}
          onMore={() => setShowPalette(true)}
          hasImage={Boolean(pageData?.thumbnail)}
          shortcuts={userShortcuts}
        />
      )}
      scan={
        <ImagePanel
          thumbnailUrl={pageData?.thumbnail} pageNumber={pageNumber}
          imageZoom={imageZoom}
          setImageZoom={setImageZoom}
          // הגודל והמפריד — של EditorShell; כאן הפאנל ממלא את המכל שלו
          layoutOrientation="vertical" imagePanelWidth={100} showSplitter={false}
          onImageLoad={() => { if (fitZoomOnLoadRef.current) { fitZoomOnLoadRef.current = false; handleFitZoom() } }}
          {...scanTracking.imagePanelProps}
        />
      }
      textToolbar={isMobile ? null : (
        <TextToolbar
          onUndo={() => runTextCommand('undo')}
          onRedo={() => runTextCommand('redo')}
          canUndo={undoState.canUndo}
          canRedo={undoState.canRedo}
          onInsertTag={insertTag}
          onClearFormatting={clearFormat}
          activeFormats={activeFormatState}
          textView={prefs.textView}
          onToggleTextView={toggleTextView}
          onFind={() => setShowFindReplace(true)}
          onSpellcheck={openSpellcheck}
          onImageToText={() => setShowImageToText(true)}
          onSplit={toggleColumns}
          twoColumns={twoColumns}
          onMore={() => setShowPalette(true)}
          fontSize={prefs.fontSize}
          onFontSizeChange={setTextZoom}
          fontSizeRange={PREF_RANGES.fontSize}
          textAlign={textAlign}
          onTextAlignChange={setTextAlign}
          shortcuts={userShortcuts}
        />
      )}
      text={
        <TextEditor
          ref={textEditorContainerRef}
          content={content} leftColumn={leftColumn} rightColumn={rightColumn}
          twoColumns={twoColumns} rightColumnName={rightColumnName} leftColumnName={leftColumnName}
          handleAutoSave={(txt) => { setContent(txt); handleAutoSaveWrapper(txt); }}
          handleColumnChange={handleColumnChange}
          setActiveTextarea={setActiveTextarea}
          selectedFont={editorFontFamily(prefs.fontFamily)}
          columnWidth={columnWidth} onColumnResizeStart={handleColumnResizeStart}
          textAlign={textAlign}
          textZoom={prefs.fontSize}
          setTextZoom={setTextZoom}
          textView={prefs.textView}
          paraWindow={prefs.paraWindow}
          paraFunnel={prefs.paraFunnel}
          {...scanTracking.textEditorProps}
        />
      }
      statusBar={
        <EditorStatusBar
          tracking={tracking}
          onTrackingClick={(tracking.canImprove || tracking.level === 'line' || tracking.level === 'off') ? detectWords : undefined}
          trackingNote={trackingNote}
          trackingClickLabel="זהה מילים בעמוד"
          position={caretPos ?? undefined}
          wordCount={wordCount}
          suspectCount={0}
          restRemainingMs={rest.remainingMs}
          shortcuts={statusShortcuts}
        />
      }
      mobileBar={
        <MobileActionBar
          onPrevLine={() => jumpLine(-1)}
          onNextLine={() => jumpLine(1)}
          onZoom={() => zoomBy(IMAGE_ZOOM.step)}
          onTools={() => setShowPalette(true)}
          onFinish={handleFinishClick}
          claimState={claim.state}
          onClaim={handleClaim}
        />
      }
    >
      {showDisplay && (
        <DisplaySettingsSheet
          value={prefs}
          onChange={setPrefs}
          onReset={resetPrefs}
          onClose={() => setShowDisplay(false)}
        />
      )}

      {rest.due && (
        <div className="pointer-events-none fixed bottom-12 end-4 z-(--z-sticky) max-md:inset-x-4 max-md:bottom-20">
          <div className="pointer-events-auto">
            <RestReminder onSnooze={rest.snooze} onDone={rest.done} intervalMin={prefs.restIntervalMin} />
          </div>
        </div>
      )}

      <CommandPalette open={showPalette} onClose={() => setShowPalette(false)} commands={paletteCommands} />

      <FindReplaceDialog
        isOpen={showFindReplace} onClose={() => setShowFindReplace(false)}
        findText={findText} setFindText={setFindText}
        replaceText={replaceText} setReplaceText={setReplaceText}
        handleReplaceAll={handleReplaceAll}
        handleFindNext={handleFindNext}
        handleReplaceCurrent={handleReplaceCurrent}
        savedSearches={savedSearches}
        addSavedSearch={addSavedSearch}
        removeSavedSearch={removeSavedSearch}
        moveSearch={moveSearch}
        runAllSavedReplacements={runAllSavedReplacements}
        handleRemoveDigits={handleRemoveDigits}
        onAddRemoveDigitsToSaved={addRemoveDigitsToSaved}
        useRegex={useRegex}
        setUseRegex={setUseRegex}
        returnFocus={getActiveTextarea}
      />

      <SpellcheckDialog
        isOpen={showSpellcheck}
        onClose={() => setShowSpellcheck(false)}
        text={spellcheckText}
        onApplyText={handleSpellcheckApply}
        onSelectWord={handleSpellcheckSelect}
        title="בדיקת איות"
        returnFocus={getActiveTextarea}
      />

      <EmbedImageModal
        isOpen={showImageToText}
        onClose={() => setShowImageToText(false)}
        // בשני טורים — הטור הפעיל (האחרון שהיה בו הסמן), לא תמיד הימני
        content={twoColumns ? (activeTextarea === 'left' ? leftColumn : rightColumn) : content}
        onContentChange={(newContent) => updateTextWithHistory(newContent, twoColumns ? (activeTextarea === 'left' ? 'left' : 'right') : null)}
        // במקום הסמן בשדה הפעיל (בשני טורים — הטור שבו עבדו), באותו מסלול בטוח: ביטול בצעד אחד
        onInsert={(html) => {
          const column = twoColumns ? (activeTextarea === 'left' ? 'left' : 'right') : null
          const el = column ? queryEditorField(document, column) : queryEditorField(document.querySelector('.editor-container'))
          if (!el) return updateTextWithHistory(`${twoColumns ? (column === 'left' ? leftColumn : rightColumn) : content}\n${html}`, column)
          applyFieldEdit(el, (v, s, e) => insertBlockAt(v, s, e, html), (newText) => {
            if (column) handleColumnChange(column, newText)
            else { setContent(newText); handleAutoSaveWrapper(newText) }
          })
        }}
      />

      <SplitDialog
        isOpen={showSplitDialog} onClose={() => setShowSplitDialog(false)}
        splitMode={splitMode} setSplitMode={setSplitMode}
        rightColumnName={rightColumnName} setRightColumnName={setRightColumnName}
        leftColumnName={leftColumnName} setLeftColumnName={setLeftColumnName}
        confirmSplit={confirmSplit}
      />

      <InfoDialog
        isOpen={showInfoDialog} onClose={handleCloseInfoDialog}
        bookInstructions={allInstructions.bookInstructions}
        globalInstructions={allInstructions.globalInstructions}
        examplePage={bookData?.examplePage}
        bookPath={bookPath}
      />

      <ShortcutsDialog
        isOpen={showShortcutsDialog}
        onClose={() => setShowShortcutsDialog(false)}
        availableActions={availableActions}
        shortcuts={userShortcuts}
        saveShortcuts={saveUserShortcuts}
        resetToDefaults={() => persistUserShortcuts({ ...DEFAULT_SHORTCUTS })}
        unbound={unboundShortcuts}
        onDismissUnbound={() => {
          setUnboundShortcuts([]);
          try { localStorage.removeItem(SHORTCUTS_UNBOUND_KEY); } catch { /* חסום */ }
        }}
      />

      {showFinishDialog && (
        <FinishPageDialog
          bookTitle={bookData?.name || bookPath}
          pageNumber={pageNumber}
          suspectCount={0}
          textLineCount={textLineCount}
          scanLineCount={null}
          saveStatus={uiSaveStatus}
          lastSavedAt={lastSavedAt}
          showNote={false}
          submitLabel="סיים והעלה"
          // החלון נסגר לפני ההעלאה: אישור דריסה, הודעות והטעינה מגיעים מהחלונות הגלובליים
          onSubmit={() => { setShowFinishDialog(false); handleUploadConfirm() }}
          onClose={() => setShowFinishDialog(false)}
        >
          <FinishUploadInfo onOpenSpellcheck={() => { setShowFinishDialog(false); openSpellcheck() }} />
        </FinishPageDialog>
      )}
    </EditorShell>
  )
}

/** "מה יקרה" בסיום — הזרימה הקיימת: הטקסט עולה כקובץ לאישור מנהל, והעמוד מסומן כהושלם */
function FinishUploadInfo({ onOpenSpellcheck }) {
  return (
    <div className="mt-4 rounded-(--radius-card) bg-surface p-3 text-body-sm text-on-surface-variant">
      <p className="text-title-sm text-on-surface">מה יקרה</p>
      <ul className="mt-1 list-disc space-y-0.5 ps-5">
        <li>הטקסט יועלה כקובץ חדש ויישלח לאישור מנהל.</li>
        <li>העמוד יסומן כהושלם.</li>
      </ul>
      <div className="mt-2 flex flex-wrap items-center gap-x-2">
        <span>לפני הסיום כדאי לעבור על בדיקת האיות.</span>
        <Button variant="text" size="sm" icon="spellcheck" onClick={onOpenSpellcheck}>לבדיקת איות</Button>
      </div>
    </div>
  )
}
