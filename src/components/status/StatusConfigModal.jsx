'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useDialog } from '@/components/providers/DialogContext'

export default function StatusConfigModal({ statuses, uploads = [], onSave, onClose }) {
  const [mounted, setMounted] = useState(false)
  const { showConfirm, showAlert } = useDialog()
  
  useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])
  const [editedStatuses, setEditedStatuses] = useState({})
  const [newStatusKey, setNewStatusKey] = useState('')
  const [newStatusLabel, setNewStatusLabel] = useState('')
  const [newStatusColor, setNewStatusColor] = useState('#94a3b8')
  
  useEffect(() => {
    setEditedStatuses(JSON.parse(JSON.stringify(statuses)))
  }, [statuses])
  
  const handleUpdateStatus = (key, field, value) => {
    setEditedStatuses(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        [field]: value
      }
    }))
  }
  
  const handleAddStatus = () => {
    if (!newStatusKey || !newStatusLabel) {
      showAlert('שדות חסרים', 'נא למלא שם מפתח ותווית')
      return
    }
    
    if (editedStatuses[newStatusKey]) {
      showAlert('שגיאה', 'סטטוס עם מפתח זה כבר קיים')
      return
    }
    
    setEditedStatuses(prev => ({
      ...prev,
      [newStatusKey]: {
        label: newStatusLabel,
        color: newStatusColor
      }
    }))
    
    setNewStatusKey('')
    setNewStatusLabel('')
    setNewStatusColor('#94a3b8')
  }
  
  const handleDeleteStatus = (key) => {
    // בדיקה כמה ספרים משתמשים בסטטוס הזה
    const booksWithStatus = uploads.filter(upload => 
      (upload.bookStatus || 'not_checked') === key
    )
    
    const statusLabel = editedStatuses[key].label
    
    if (booksWithStatus.length > 0) {
      const confirmMessage = `סטטוס "${statusLabel}" משויך ל-${booksWithStatus.length} העלאות.\n\nאם תמחק את הסטטוס, ההעלאות האלה יישארו עם סטטוס לא תקין.\n\nמומלץ לשנות את הסטטוס של ההעלאות האלה לפני המחיקה.\n\nהאם אתה בטוח שברצונך למחוק את הסטטוס?`
      
      showConfirm(
        'מחיקת סטטוס',
        confirmMessage,
        () => {
          const { [key]: _, ...rest } = editedStatuses
          setEditedStatuses(rest)
        },
        'מחק בכל זאת',
        'ביטול'
      )
    } else {
      showConfirm(
        'מחיקת סטטוס',
        `האם למחוק את הסטטוס "${statusLabel}"?`,
        () => {
          const { [key]: _, ...rest } = editedStatuses
          setEditedStatuses(rest)
        },
        'מחק',
        'ביטול'
      )
    }
  }
  
  if (!mounted) return null
  
  const modalContent = (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* כותרת */}
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <span className="material-symbols-outlined text-purple-600">settings</span>
            הגדרות סטטוסים
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        
        {/* תוכן */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* רשימת סטטוסים קיימים */}
          <div>
            <h3 className="text-lg font-bold mb-4 text-gray-700">סטטוסים קיימים</h3>
            <div className="space-y-3">
              {Object.entries(editedStatuses).map(([key, config]) => {
                const booksWithStatus = uploads.filter(upload => 
                  (upload.bookStatus || 'not_checked') === key
                ).length
                
                return (
                <div key={key} className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex-1 grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-gray-600 mb-1 flex items-center gap-2">
                        מפתח
                        {booksWithStatus > 0 && (
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
                            {booksWithStatus} העלאות
                          </span>
                        )}
                      </label>
                      <input
                        type="text"
                        value={key}
                        disabled
                        className="w-full px-3 py-2 bg-gray-200 border border-gray-300 rounded text-sm"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">תווית</label>
                      <input
                        type="text"
                        value={config.label}
                        onChange={(e) => handleUpdateStatus(key, 'label', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">צבע רקע</label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={config.color}
                          onChange={(e) => handleUpdateStatus(key, 'color', e.target.value)}
                          className="w-12 h-10 border border-gray-300 rounded cursor-pointer"
                        />
                        <input
                          type="text"
                          value={config.color}
                          onChange={(e) => handleUpdateStatus(key, 'color', e.target.value)}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                      </div>
                    </div>
                  </div>
                  
                  <button
                    onClick={() => handleDeleteStatus(key)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                    title="מחיקת סטטוס"
                  >
                    <span className="material-symbols-outlined">delete</span>
                  </button>
                </div>
              )})}
            </div>
          </div>
          
          {/* הוספת סטטוס חדש */}
          <div className="border-t pt-6">
            <h3 className="text-lg font-bold mb-4 text-gray-700">הוספת סטטוס חדש</h3>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="block text-xs text-gray-600 mb-1">מפתח (באנגלית, ללא רווחים)</label>
                <input
                  type="text"
                  value={newStatusKey}
                  onChange={(e) => setNewStatusKey(e.target.value.replace(/\s/g, '_'))}
                  placeholder="new_status"
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              
              <div className="flex-1">
                <label className="block text-xs text-gray-600 mb-1">תווית</label>
                <input
                  type="text"
                  value={newStatusLabel}
                  onChange={(e) => setNewStatusLabel(e.target.value)}
                  placeholder="סטטוס חדש"
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              
              <div className="w-32">
                <label className="block text-xs text-gray-600 mb-1">צבע</label>
                <input
                  type="color"
                  value={newStatusColor}
                  onChange={(e) => setNewStatusColor(e.target.value)}
                  className="w-full h-10 border border-gray-300 rounded cursor-pointer"
                />
              </div>
              
              <button
                onClick={handleAddStatus}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-sm">add</span>
                הוסף
              </button>
            </div>
          </div>
        </div>
        
        {/* כפתורי פעולה */}
        <div className="flex justify-end gap-3 p-6 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors"
          >
            ביטול
          </button>
          <button
            onClick={() => onSave(editedStatuses)}
            className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-sm">save</span>
            שמור שינויים
          </button>
        </div>
      </div>
    </div>
  )
  
  return createPortal(modalContent, document.body)
}

