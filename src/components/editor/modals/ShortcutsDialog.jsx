import { useState, useEffect, useMemo } from 'react';
import { useDialog } from '@/components/providers/DialogContext';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import Kbd from '@/components/ui/Kbd';
import { cx } from '@/components/ui/cx';
import { FIELD_LABEL_COMPACT, fieldClasses } from '@/components/ui/fieldStyles';
import { FOCUS_RING } from '@/components/ui/focusRing';
import { shortcutKeys } from '@/components/editor/v2/editorShellLogic';
import { formatShortcut, findShortcutConflict, findDuplicateShortcuts, reservedShortcutMessage } from '@/lib/shortcuts';
import UnboundShortcutsNotice from './UnboundShortcutsNotice';

export default function ShortcutsDialog({ isOpen, onClose, availableActions, shortcuts, saveShortcuts, resetToDefaults, unbound = [], onDismissUnbound }) {
  const { showConfirm } = useDialog();
  
  const [localShortcuts, setLocalShortcuts] = useState(shortcuts);
  const [selectedActionId, setSelectedActionId] = useState('');
  const [recordedKeys, setRecordedKeys] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      // איפוס מצב הדיאלוג ועותק העריכה המקומי בעת פתיחה
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLocalShortcuts(shortcuts);
      setRecordedKeys(null);
      setIsRecording(false);
      setSelectedActionId('');
      setError('');
    }
  }, [isOpen, shortcuts]);

  // האזנה להקלטת מקשים
  useEffect(() => {
    if (!isRecording) return;

    const handleRecord = (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;

      // Esc בלי מקש שינוי — ביטול ההקלטה (הצירוף שהוקלט קודם, אם היה, נשאר)
      if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
        setIsRecording(false);
        return;
      }

      const modifiers = [];
      if (e.ctrlKey) modifiers.push('Ctrl');
      if (e.altKey) modifiers.push('Alt');
      if (e.shiftKey) modifiers.push('Shift');
      if (e.metaKey) modifiers.push('Meta');

      const code = e.code;
      
      const combo = [...modifiers, code].join('+');
      setIsRecording(false);
      // צירוף שמור (ביטול, הדבקה, מחיקה, חיצים...) — לא נקלט
      const reserved = reservedShortcutMessage(combo);
      if (reserved) {
        setError(reserved);
        return;
      }
      setError('');
      setRecordedKeys(combo);
    };

    window.addEventListener('keydown', handleRecord, { capture: true });
    return () => window.removeEventListener('keydown', handleRecord, { capture: true });
  }, [isRecording]);

  const labelOf = (actionId) => availableActions.find(a => a.id === actionId)?.label || actionId;

  const handleAddShortcut = () => {
    if (!selectedActionId || !recordedKeys) return;
    // צירוף שכבר משויך לפעולה אחרת — רק אחת מהן הייתה פועלת
    const conflict = findShortcutConflict(localShortcuts, selectedActionId, recordedKeys);
    if (conflict) {
      setError(`הצירוף ${formatShortcut(recordedKeys)} כבר משמש את "${labelOf(conflict)}". מחק אותו שם או בחר צירוף אחר.`);
      return;
    }
    setError('');

    setLocalShortcuts(prev => ({
      ...prev,
      [selectedActionId]: recordedKeys
    }));
    
    setSelectedActionId('');
    setRecordedKeys(null);
  };

  const handleDelete = (actionId) => {
    setLocalShortcuts(prev => {
      const next = { ...prev };
      delete next[actionId];
      return next;
    });
  };

  const handleSave = () => {
    const dup = findDuplicateShortcuts(localShortcuts)[0];
    if (dup) {
      setError(`הצירוף ${formatShortcut(dup.combo)} מוגדר ליותר מפעולה אחת (${dup.actionIds.map(labelOf).join(', ')}). השאר אותו רק לאחת מהן.`);
      return;
    }
    setError('');
    saveShortcuts(localShortcuts);
    onClose();
  };

  // מיון הפעולות לתצוגה נוחה בדרופדאון
  const sortedActions = useMemo(() => {
    return [...availableActions].sort((a, b) => a.label.localeCompare(b.label));
  }, [availableActions]);

  // רשימת הקיצורים הפעילים לתצוגה בטבלה
  const activeShortcutsList = useMemo(() => {
    return Object.entries(localShortcuts).map(([actionId, keys]) => {
      const actionDef = availableActions.find(a => a.id === actionId);
      return {
        id: actionId,
        label: actionDef ? actionDef.label : actionId,
        keys: keys
      };
    });
  }, [localShortcuts, availableActions]);

  if (!isOpen) return null;

  return (
    <Dialog
      title="קיצורי מקלדת"
      onClose={onClose}
      className="sm:max-w-2xl"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <Button
            variant="text"
            icon="restart_alt"
            onClick={() => {
              showConfirm(
                'אפס לברירת מחדל',
                'פעולה זו תמחק את כל הקיצורים ותחזיר את ברירת המחדל. להמשיך?',
                () => resetToDefaults() // הקולבק שרץ רק אחרי אישור
              );
            }}
          >
            איפוס לברירת המחדל
          </Button>
          <div className="flex gap-3">
            <Button variant="outlined" onClick={onClose}>ביטול</Button>
            <Button variant="filled" onClick={handleSave}>שמירת השינויים</Button>
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        {/* פעולות שהקיצור שלהן הוסר בהעברת גרסה (ועדיין בלי קיצור) */}
        <UnboundShortcutsNotice
          items={unbound.filter((u) => !localShortcuts[u.actionId])}
          labelOf={labelOf}
          onDismiss={onDismissUnbound}
        />
        {error && (
          <p role="alert" className="rounded-(--radius-card) bg-error-container px-4 py-3 text-body-sm text-on-error-container">
            {error}
          </p>
        )}
        {/* הוספת קיצור חדש */}
        <section aria-labelledby="shortcut-add-title" className="rounded-(--radius-card) bg-surface-container p-4">
          <h3 id="shortcut-add-title" className="mb-3 text-title-sm text-on-surface">הוספת קיצור</h3>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <label htmlFor="shortcut-action" className={FIELD_LABEL_COMPACT}>פעולה</label>
              <select
                id="shortcut-action"
                value={selectedActionId}
                onChange={(e) => setSelectedActionId(e.target.value)}
                className={fieldClasses({ kind: 'select', className: 'text-body-sm' })}
              >
                <option value="">בחר פעולה</option>
                {sortedActions.map(action => (
                  <option key={action.id} value={action.id} disabled={!!localShortcuts[action.id]}>
                    {action.label} {localShortcuts[action.id] ? '(מוגדר כבר)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="min-w-0 flex-1">
              <span id="shortcut-keys-label" className={FIELD_LABEL_COMPACT}>מקשים</span>
              <button
                type="button"
                aria-labelledby="shortcut-keys-label"
                aria-describedby="shortcut-keys-state"
                aria-pressed={isRecording}
                onClick={() => setIsRecording(true)}
                className={cx(
                  'flex min-h-(--field-height-md) w-full items-center justify-center rounded-(--field-radius) border px-3 text-body-sm transition-colors',
                  FOCUS_RING,
                  isRecording
                    ? 'border-primary bg-surface-selected text-on-surface'
                    : 'border-(--field-border) bg-(--field-bg) text-on-surface hover:border-(--field-border-hover)'
                )}
              >
                <span id="shortcut-keys-state" aria-live="polite">
                  {isRecording
                    ? 'הקש את הצירוף…'
                    : (recordedKeys ? <Kbd keys={shortcutKeys(recordedKeys)} /> : 'לחץ להקלטה')}
                </span>
              </button>
            </div>

            <Button variant="tonal" icon="add" onClick={handleAddShortcut} disabled={!selectedActionId || !recordedKeys}>
              הוספה
            </Button>
          </div>
        </section>

        {/* הקיצורים הפעילים */}
        <section aria-labelledby="shortcut-list-title">
          <h3 id="shortcut-list-title" className="mb-3 text-title-sm text-on-surface">קיצורים פעילים</h3>
          {activeShortcutsList.length === 0 ? (
            <p className="py-4 text-center text-body-md text-on-surface-variant">אין קיצורים מוגדרים</p>
          ) : (
            <div className="overflow-hidden rounded-(--radius-card) border border-outline-variant">
              <table className="w-full text-start text-body-sm">
                <thead className="bg-surface-container text-on-surface-variant">
                  <tr>
                    <th scope="col" className="px-4 py-2 text-start text-label-lg">פעולה</th>
                    <th scope="col" className="px-4 py-2 text-start text-label-lg">מקשים</th>
                    <th scope="col" className="w-14 px-2 py-2"><span className="sr-only">מחיקה</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant">
                  {activeShortcutsList.map((item) => (
                    <tr key={item.id} className="hover:bg-surface-container-low">
                      <td className="px-4 py-1 text-on-surface">{item.label}</td>
                      <td className="px-4 py-1"><Kbd keys={shortcutKeys(item.keys)} /></td>
                      <td className="px-1 py-1 text-center">
                        <Button
                          variant="text"
                          size="sm"
                          iconOnly
                          icon="delete"
                          aria-label={`מחיקת הקיצור של ${item.label}`}
                          title="מחיקת הקיצור"
                          onClick={() => handleDelete(item.id)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </Dialog>
  );
}
