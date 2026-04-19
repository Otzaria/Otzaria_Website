'use client'

export default function StatusBadge({ status, statuses, onEdit, editable = false }) {
  const statusConfig = statuses[status] || { label: status, color: '#94a3b8' }
  
  return (
    <div className="flex items-center gap-2">
      <span 
        className="px-3 py-1 rounded-full text-xs font-bold text-white shadow-sm"
        style={{ backgroundColor: statusConfig.color }}
      >
        {statusConfig.label}
      </span>
      {editable && (
        <button
          onClick={onEdit}
          className="p-1 hover:bg-gray-100 rounded transition-colors"
          title="עריכת סטטוס"
        >
          <span className="material-symbols-outlined text-sm text-gray-600">edit</span>
        </button>
      )}
    </div>
  )
}
