'use client'

import { useState } from 'react'

export default function StatusEditor({ currentStatus, statuses, onSave, onCancel }) {
  const [selectedStatus, setSelectedStatus] = useState(currentStatus || 'not_checked')
  
  return (
    <div className="flex items-center gap-2 bg-white p-2 rounded-lg border border-neutral-300 shadow-lg">
      <select
        value={selectedStatus}
        onChange={(e) => setSelectedStatus(e.target.value)}
        className="px-3 py-1 border border-neutral-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-info-500"
      >
        {Object.entries(statuses).map(([key, config]) => (
          <option key={key} value={key}>
            {config.label}
          </option>
        ))}
      </select>
      
      <button
        onClick={() => onSave(selectedStatus)}
        className="px-3 py-1 bg-success-600 text-white rounded text-sm hover:bg-success-700 transition-colors"
      >
        שמור
      </button>
      
      <button
        onClick={onCancel}
        className="px-3 py-1 bg-neutral-300 text-neutral-700 rounded text-sm hover:bg-neutral-400 transition-colors"
      >
        ביטול
      </button>
    </div>
  )
}
