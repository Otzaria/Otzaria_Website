import { useState } from 'react'
import AppIcon from '@/components/ui/AppIcon'
import Button from '@/components/ui/Button'
import FloatingPanel from '@/components/ui/FloatingPanel'
import { cx } from '@/components/ui/cx'
import { CHECKBOX, fieldClasses } from '@/components/ui/fieldStyles'
import { FOCUS_RING_INSET } from '@/components/ui/focusRing'

const DIALOG_WIDTH = 400
const POSITION_STORAGE_KEY = 'findReplaceDialogPosition'
const REGEX_GUIDE_URL = 'https://tchumim.com/topic/1463/regex-%D7%91%D7%99%D7%98%D7%95%D7%99%D7%99%D7%9D-%D7%A8%D7%92%D7%95%D7%9C%D7%A8%D7%99%D7%99%D7%9D'

// ברירת המחדל: באמצע המסך הרחב, או בקצה במסך צר. המיקום עצמו נצמד לחלון ב-FloatingPanel.
function getDefaultPosition(vp) {
  return { x: vp.width > 800 ? vp.width / 2 : 16, y: 100 }
}

const FIELD = fieldClasses({ className: 'text-body-sm' })
const LABEL = 'text-label-lg text-on-surface'
const ARROW_BUTTON = cx(
  'flex h-5 w-8 items-center justify-center rounded-(--radius-xs) text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface disabled:opacity-30',
  FOCUS_RING_INSET
)

/** "123" מחוק — הסימן של ניקוי ספרות */
function DigitsGlyph() {
  return <span aria-hidden="true" className="text-label-md line-through">123</span>
}

/** כפתור שמוסיף ירידת שורה (^13) לשדה */
function NewlineButton({ onClick }) {
  return <Button variant="text" size="sm" iconOnly icon="keyboard_return" aria-label="הוספת ירידת שורה (^13)" title="הוספת ירידת שורה (^13)" onClick={onClick} />
}

function RegexToggle({ checked, onChange }) {
  return (
    <>
      <label className="flex min-h-(--touch-target) cursor-pointer select-none items-center gap-1.5 text-body-sm text-on-surface-variant">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className={CHECKBOX} />
        <bdi dir="ltr">Regex</bdi>
      </label>
      {checked && (
        <a href={REGEX_GUIDE_URL} target="_blank" rel="noopener noreferrer" className="text-body-sm text-primary underline hover:text-primary-hover">
          מדריך לביטויים רגולריים
        </a>
      )}
    </>
  )
}

export default function FindReplaceDialog({
  isOpen,
  onClose,
  findText,
  setFindText,
  replaceText,
  setReplaceText,
  handleReplaceAll,
  handleFindNext,
  handleReplaceCurrent,
  savedSearches,
  addSavedSearch,
  removeSavedSearch,
  moveSearch,
  runAllSavedReplacements,
  handleRemoveDigits,
  onAddRemoveDigitsToSaved,
  useRegex = false,
  setUseRegex = () => {},
  editMode = true,
  returnFocus
}) {
  const [view, setView] = useState('main')

  const [newLabel, setNewLabel] = useState('')
  const [newFind, setNewFind] = useState('')
  const [newReplace, setNewReplace] = useState('')
  const [newIsRegex, setNewIsRegex] = useState(false)

  const handleCloseInternal = () => {
    onClose();
    setTimeout(() => {
        setView('main');
        setNewLabel('');
        setNewFind('');
        setNewReplace('');
        setNewIsRegex(false);
    }, 100);
  };

  if (!isOpen) return null;

  const getTitle = () => {
      switch(view) {
          case 'list': return 'חיפושים קבועים';
          case 'add': return 'הוספת חיפוש חדש';
          default: return 'חיפוש והחלפה';
      }
  }

  const getIcon = () => {
      switch(view) {
          case 'list': return 'list_alt';
          case 'add': return 'add_circle';
          default: return 'find_replace';
      }
  }

  const editOnlyTitle = 'זמין במצב עריכה ידנית בלבד'

  return (
    <FloatingPanel
      title={getTitle()}
      icon={getIcon()}
      onClose={handleCloseInternal}
      storageKey={POSITION_STORAGE_KEY}
      escapeWithin=".editor-container"
      returnFocus={returnFocus}
      width={DIALOG_WIDTH}
      defaultPosition={getDefaultPosition}
    >
      {view === 'main' && (
        <div className="space-y-4">
          <div>
            <div className="mb-1 flex flex-wrap items-center gap-x-3">
              <label htmlFor="find-text" className={LABEL}>חפש</label>
              <RegexToggle checked={useRegex} onChange={setUseRegex} />
              <span className="ms-auto"><NewlineButton onClick={() => setFindText(prev => prev + '^13')} /></span>
            </div>
            <input
              id="find-text"
              type="text"
              value={findText}
              onChange={(e) => setFindText(e.target.value)}
              className={FIELD}
              dir={useRegex ? 'ltr' : 'rtl'}
              autoFocus
              data-autofocus=""
              placeholder={useRegex ? 'ביטוי רגולרי...' : 'הזן טקסט...'}
            />
          </div>

          <div>
            <div className="mb-1 flex items-center gap-x-3">
              <label htmlFor="replace-text" className={LABEL}>החלף ב</label>
              <span className="ms-auto"><NewlineButton onClick={() => setReplaceText(prev => prev + '^13')} /></span>
            </div>
            <input
              id="replace-text"
              type="text"
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
              className={FIELD}
              dir={useRegex ? 'ltr' : 'rtl'}
              placeholder={useRegex ? '$1, $2...' : 'הזן טקסט...'}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="tonal"
              icon="search"
              onClick={() => editMode && handleFindNext(findText, useRegex)}
              disabled={!editMode}
              title={editMode ? undefined : editOnlyTitle}
            >
              חפש הבא
            </Button>
            <Button
              variant="tonal"
              icon="find_replace"
              onClick={() => editMode && handleReplaceCurrent(replaceText, findText, useRegex)}
              disabled={!editMode}
              title={editMode ? undefined : editOnlyTitle}
            >
              החלף
            </Button>
            <Button
              variant="filled"
              icon="published_with_changes"
              onClick={() => handleReplaceAll(undefined, undefined, useRegex)}
              className="col-span-2 whitespace-nowrap"
            >
              החלפת הכול
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2 border-t border-outline-variant pt-3">
            <Button variant="outlined" icon={<DigitsGlyph />} onClick={handleRemoveDigits} className="whitespace-nowrap">
              ניקוי ספרות
            </Button>
            <Button variant="outlined" icon="list" onClick={() => setView('list')} className="whitespace-nowrap">
              חיפושים קבועים
            </Button>
          </div>
        </div>
      )}

      {view === 'list' && (
        <div className="space-y-3">
          <Button variant="filled" icon="playlist_play" fullWidth onClick={runAllSavedReplacements}>
            הרצת כל החיפושים לפי הסדר
          </Button>

          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="tonal"
              icon="add"
              onClick={() => {
                setNewLabel('');
                setNewFind('');
                setNewReplace('');
                setNewIsRegex(false);
                setView('add');
              }}
            >
              חדש
            </Button>
            <Button
              variant="outlined"
              icon={<DigitsGlyph />}
              className="whitespace-nowrap"
              onClick={() => {
                if (onAddRemoveDigitsToSaved) {
                  onAddRemoveDigitsToSaved();
                } else {
                  alert('חסרה הפונקציה בקובץ האב');
                }
              }}
            >
              הוסף ניקוי ספרות
            </Button>
          </div>

          <ul className="custom-scrollbar max-h-[200px] space-y-1.5 overflow-y-auto">
            {savedSearches && savedSearches.length > 0 ? (
              savedSearches.map((search, index) => {
                const isRemoveDigitsItem = search.isRemoveDigits;
                const isRegexItem = search.isRegex;
                const name = isRemoveDigitsItem ? (search.label || 'ניקוי ספרות') : (search.label || search.findText)

                return (
                  <li key={search.id} className="flex items-center gap-1 rounded-(--radius-control) border border-outline-variant bg-surface-container-low py-1 ps-3 pe-1">
                    <div className="min-w-0 flex-1">
                      {isRemoveDigitsItem ? (
                        <div className="flex items-center gap-2 text-body-sm text-on-surface">
                          <DigitsGlyph />
                          <span className="truncate">{name}</span>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2">
                            <div className="truncate text-label-lg text-on-surface">{name}</div>
                            {isRegexItem && <span className="rounded-(--radius-xs) bg-surface-container-high px-1 text-label-sm text-on-surface-variant"><bdi dir="ltr">Regex</bdi></span>}
                          </div>
                          <div className="mt-0.5 flex items-center gap-1 truncate text-label-sm text-on-surface-variant">
                            <span className={cx('max-w-[60px] truncate rounded-(--radius-xs) border border-outline-variant bg-surface px-1', isRegexItem && 'font-mono')} dir={isRegexItem ? 'ltr' : 'rtl'}>{search.findText}</span>
                            <AppIcon name="arrow_back" className="text-sm" />
                            <span className="max-w-[60px] truncate rounded-(--radius-xs) border border-outline-variant bg-surface px-1">{search.replaceText || 'ריק'}</span>
                          </div>
                        </>
                      )}
                    </div>
                    <Button
                      variant="text" size="sm" iconOnly icon="play_arrow"
                      aria-label={`הרצת ${name}`} title="הרצה עכשיו (החלפת הכול)"
                      onClick={() => isRemoveDigitsItem ? handleRemoveDigits() : handleReplaceAll(search.findText, search.replaceText, isRegexItem)}
                    />
                    <div className="flex flex-col">
                      <button type="button" aria-label="הזזה למעלה" onClick={() => moveSearch(index, 'up')} disabled={index === 0} className={ARROW_BUTTON}>
                        <AppIcon name="keyboard_arrow_up" className="text-lg" />
                      </button>
                      <button type="button" aria-label="הזזה למטה" onClick={() => moveSearch(index, 'down')} disabled={index === savedSearches.length - 1} className={ARROW_BUTTON}>
                        <AppIcon name="keyboard_arrow_down" className="text-lg" />
                      </button>
                    </div>
                    <Button variant="text" size="sm" iconOnly icon="delete" aria-label={`מחיקת ${name}`} title="מחיקה" onClick={() => removeSavedSearch(search.id)} />
                  </li>
                )
              })
            ) : (
              <li className="py-2 text-center text-body-sm text-on-surface-variant">אין חיפושים שמורים</li>
            )}
          </ul>

          <Button variant="text" icon="arrow_forward" fullWidth onClick={() => setView('main')}>
            חזרה לחיפוש רגיל
          </Button>
        </div>
      )}

      {view === 'add' && (
        <div className="space-y-3">
          <div>
            <label htmlFor="saved-label" className={cx(LABEL, 'mb-1 block')}>שם החיפוש (אופציונלי)</label>
            <input
              id="saved-label"
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              className={FIELD}
              placeholder="לדוגמה: הסרת סוגריים"
            />
          </div>
          <div>
            <div className="mb-1 flex flex-wrap items-center gap-x-3">
              <label htmlFor="saved-find" className={LABEL}>טקסט לחיפוש</label>
              <RegexToggle checked={newIsRegex} onChange={setNewIsRegex} />
              <span className="ms-auto"><NewlineButton onClick={() => setNewFind(prev => prev + '^13')} /></span>
            </div>
            <input
              id="saved-find"
              type="text"
              value={newFind}
              onChange={(e) => setNewFind(e.target.value)}
              className={FIELD}
              dir={newIsRegex ? 'ltr' : 'rtl'}
            />
          </div>
          <div>
            <div className="mb-1 flex items-center gap-x-3">
              <label htmlFor="saved-replace" className={LABEL}>טקסט להחלפה</label>
              <span className="ms-auto"><NewlineButton onClick={() => setNewReplace(prev => prev + '^13')} /></span>
            </div>
            <input
              id="saved-replace"
              type="text"
              value={newReplace}
              onChange={(e) => setNewReplace(e.target.value)}
              className={FIELD}
              dir={newIsRegex ? 'ltr' : 'rtl'}
            />
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <Button variant="outlined" onClick={() => setView('list')}>ביטול</Button>
            <Button
              variant="filled"
              onClick={() => {
                if (!newFind) return alert('חובה להזין טקסט לחיפוש');
                addSavedSearch(newLabel, newFind, newReplace, newIsRegex);
                setView('list');
              }}
            >
              שמור
            </Button>
          </div>

          <div className="flex items-center gap-2 text-label-md text-on-surface-variant" aria-hidden="true">
            <span className="h-px flex-1 bg-outline-variant" />או<span className="h-px flex-1 bg-outline-variant" />
          </div>

          <Button
            variant="outlined"
            icon={<DigitsGlyph />}
            fullWidth
            onClick={() => {
              if (onAddRemoveDigitsToSaved) {
                onAddRemoveDigitsToSaved();
                setView('list');
              } else {
                alert('פונקציה זו טרם הוטמעה בקומפוננטת האב');
              }
            }}
          >
            הוספת &quot;ניקוי ספרות&quot; לרשימה
          </Button>
        </div>
      )}
    </FloatingPanel>
  )
}
