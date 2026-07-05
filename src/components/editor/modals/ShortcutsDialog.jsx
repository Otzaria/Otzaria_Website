import { useState, useEffect, useMemo } from 'react';
import { useDialog } from '@/components/providers/DialogContext';
import { formatShortcut as formatKey } from '@/lib/shortcuts';

export default function ShortcutsDialog({ isOpen, onClose, availableActions, shortcuts, saveShortcuts, resetToDefaults }) {
  const { showConfirm } = useDialog();
  
  const [localShortcuts, setLocalShortcuts] = useState(shortcuts);
  const [selectedActionId, setSelectedActionId] = useState('');
  const [recordedKeys, setRecordedKeys] = useState(null);
  const [isRecording, setIsRecording] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // איפוס מצב הדיאלוג ועותק העריכה המקומי בעת פתיחה
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLocalShortcuts(shortcuts);
      setRecordedKeys(null);
      setIsRecording(false);
      setSelectedActionId('');
    }
  }, [isOpen, shortcuts]);

  // האזנה להקלטת מקשים
  useEffect(() => {
    if (!isRecording) return;

    const handleRecord = (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;

      const modifiers = [];
      if (e.ctrlKey) modifiers.push('Ctrl');
      if (e.altKey) modifiers.push('Alt');
      if (e.shiftKey) modifiers.push('Shift');
      if (e.metaKey) modifiers.push('Meta');

      const code = e.code;
      
      const combo = [...modifiers, code].join('+');
      setRecordedKeys(combo);
      setIsRecording(false);
    };

    window.addEventListener('keydown', handleRecord, { capture: true });
    return () => window.removeEventListener('keydown', handleRecord, { capture: true });
  }, [isRecording]);

  const handleAddShortcut = () => {
    if (!selectedActionId || !recordedKeys) return;
    
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
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        
        {/* כותרת */}
        <div className="p-5 border-b border-neutral-200 flex justify-between items-center bg-neutral-50 rounded-t-xl">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <span className="material-symbols-outlined">keyboard</span>
            ניהול קיצורי מקלדת
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-neutral-200 rounded-full">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* אזור הוספת קיצור חדש */}
          <div className="bg-info-50 p-4 rounded-lg border border-info-100">
            <h3 className="text-sm font-bold text-info-800 mb-3">הוסף קיצור חדש</h3>
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="block text-xs font-medium text-neutral-500 mb-1">בחר פעולה</label>
                <select 
                  value={selectedActionId}
                  onChange={(e) => setSelectedActionId(e.target.value)}
                  className="w-full h-10 px-3 rounded border border-neutral-300 text-sm focus:border-info-500 focus:outline-none"
                >
                  <option value="">-- בחר פעולה מהרשימה --</option>
                  {sortedActions.map(action => (
                    <option key={action.id} value={action.id} disabled={!!localShortcuts[action.id]}>
                      {action.label} {localShortcuts[action.id] ? '(מוגדר כבר)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex-1">
                <label className="block text-xs font-medium text-neutral-500 mb-1">מקש לקיצור</label>
                <button
                  onClick={() => setIsRecording(true)}
                  className={`w-full h-10 px-3 rounded border text-sm font-mono transition-all flex items-center justify-center ${
                    isRecording 
                      ? 'bg-danger-100 border-danger-500 text-danger-700 animate-pulse' 
                      : 'bg-white border-neutral-300 text-neutral-700 hover:border-neutral-400'
                  }`}
                >
                  {isRecording ? 'לחץ על מקש כעת...' : (recordedKeys ? formatKey(recordedKeys) : 'לחץ להקלטה')}
                </button>
              </div>

              <button 
                onClick={handleAddShortcut}
                disabled={!selectedActionId || !recordedKeys}
                className="h-10 px-4 bg-info-600 text-white rounded font-bold hover:bg-info-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                הוסף
              </button>
            </div>
          </div>

          {/* רשימת הקיצורים הקיימים */}
          <div>
            <h3 className="text-sm font-bold text-neutral-700 mb-3">קיצורים פעילים</h3>
            {activeShortcutsList.length === 0 ? (
              <p className="text-neutral-400 text-center py-4">אין קיצורים מוגדרים</p>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm text-right">
                  <thead className="bg-neutral-50 text-neutral-500">
                    <tr>
                      <th className="px-4 py-2 font-medium">פעולה</th>
                      <th className="px-4 py-2 font-medium">מקשים</th>
                      <th className="px-4 py-2 font-medium w-16"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {activeShortcutsList.map((item) => (
                      <tr key={item.id} className="hover:bg-neutral-50">
                        <td className="px-4 py-3 font-medium text-neutral-800">{item.label}</td>
                        <td className="px-4 py-3 font-mono text-info-600" dir="ltr">{formatKey(item.keys)}</td>
                        <td className="px-4 py-3 text-center">
                          <button 
                            onClick={() => handleDelete(item.id)}
                            className="text-neutral-400 hover:text-danger-600 transition-colors p-1"
                            title="מחק קיצור"
                          >
                            <span className="material-symbols-outlined text-[18px]">delete</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>

        {/* כפתורים תחתונים */}
        <div className="p-5 border-t border-neutral-200 bg-neutral-50 rounded-b-xl flex justify-between items-center">
          
          <button 
            onClick={() => { 
              showConfirm(
                'אפס לברירת מחדל', 
                'פעולה זו תמחק את כל הקיצורים ותחזיר את ברירת המחדל. להמשיך?', 
                () => resetToDefaults() // הקולבק שרץ רק אחרי אישור
              ); 
            }} 
            className="text-danger-600 text-sm hover:underline font-medium"
          >
            אפס לברירת מחדל
          </button>
          
          <div className="flex gap-3">
            <button onClick={onClose} className="px-5 py-2.5 rounded-lg text-neutral-700 hover:bg-neutral-200 font-medium">ביטול</button>
            <button onClick={handleSave} className="px-5 py-2.5 bg-info-600 text-white rounded-lg hover:bg-info-700 shadow-md font-bold">
              שמור שינויים
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
