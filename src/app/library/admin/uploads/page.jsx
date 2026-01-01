'use client'

import { useState, useEffect } from 'react'

export default function AdminUploadsPage() {
  const [uploads, setUploads] = useState([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)

  const loadUploads = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/admin/uploads/list')
      const data = await response.json()
      if (data.success) {
        setUploads(data.uploads)
      }
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUploads()
  }, [])

  const handleUpdateStatus = async (uploadId, status) => {
    try {
      // עדכון אופטימי ב-UI
      setUploads(prev => prev.map(u => u.id === uploadId ? { ...u, status } : u))
      
      const res = await fetch('/api/admin/uploads/update-status', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId, status })
      })
      
      if (!res.ok) {
          // שחזור במקרה כישלון
          loadUploads()
          alert('שגיאה בעדכון הסטטוס')
      }
    } catch (e) {
      loadUploads()
      alert('שגיאה בעדכון')
    }
  }

  const handleDownload = (fileName, originalName) => {
      const link = document.createElement('a')
      link.href = `/api/download/${fileName}`
      link.download = originalName || fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
  }

  const handleApproveAllPending = async () => {
    const pending = uploads.filter(u => u.status === 'pending')
    if (pending.length === 0) return alert('אין קבצים ממתינים לאישור')
    
    if (!confirm(`האם לאשר ${pending.length} קבצים?`)) return

    setProcessing(true)
    try {
        let successCount = 0
        for (const upload of pending) {
            const res = await fetch('/api/admin/uploads/update-status', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uploadId: upload.id, status: 'approved' })
            })
            if (res.ok) successCount++
        }
        alert(`${successCount} קבצים אושרו בהצלחה`)
        loadUploads()
    } catch (e) {
        alert('אירעה שגיאה בתהליך האישור')
    } finally {
        setProcessing(false)
    }
  }

  const handleDownloadAllPending = async () => {
    const pending = uploads.filter(u => u.status === 'pending' && u.fileName)
    if (pending.length === 0) return alert('אין קבצים להורדה')

    if (!confirm(`להוריד ${pending.length} קבצים?`)) return

    for (const upload of pending) {
        handleDownload(upload.fileName, upload.originalFileName)
        // השהייה קטנה למניעת חסימת הדפדפן
        await new Promise(r => setTimeout(r, 500)) 
    }
  }

  if (loading) return (
    <div className="flex justify-center items-center h-64">
        <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
    </div>
  )

  const pendingCount = uploads.filter(u => u.status === 'pending').length

  return (
    <div className="glass-strong p-6 rounded-xl animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">upload_file</span>
            העלאות משתמשים
        </h2>
        
        {pendingCount > 0 && (
            <div className="flex gap-2">
                <button 
                    onClick={handleDownloadAllPending}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50"
                    disabled={processing}
                >
                    <span className="material-symbols-outlined text-sm">download</span>
                    הורד הכל ({pendingCount})
                </button>
                <button 
                    onClick={handleApproveAllPending}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors shadow-sm disabled:opacity-50"
                    disabled={processing}
                >
                    {processing ? (
                        <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                    ) : (
                        <span className="material-symbols-outlined text-sm">done_all</span>
                    )}
                    אשר הכל ({pendingCount})
                </button>
            </div>
        )}
      </div>
      
      {uploads.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <span className="material-symbols-outlined text-6xl mb-2">folder_off</span>
            <p>אין העלאות במערכת</p>
          </div>
      ) : (
          <div className="space-y-4">
              {uploads.map(upload => (
                  <div key={upload.id} className="glass p-5 rounded-xl border border-white/40 hover:border-primary/30 transition-all">
                      <div className="flex items-start gap-4">
                          <div className={`p-3 rounded-lg ${
                              upload.status === 'approved' ? 'bg-green-100 text-green-700' :
                              upload.status === 'rejected' ? 'bg-red-100 text-red-700' :
                              'bg-yellow-100 text-yellow-700'
                          }`}>
                              <span className="material-symbols-outlined text-3xl">description</span>
                          </div>
                          
                          <div className="flex-1">
                              <div className="flex justify-between items-start mb-2">
                                  <div>
                                      <h3 className="text-lg font-bold text-gray-800">{upload.bookName}</h3>
                                      <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                                          <span className="flex items-center gap-1">
                                            <span className="material-symbols-outlined text-sm">person</span>
                                            {upload.uploadedBy || 'אורח'}
                                          </span>
                                          <span className="flex items-center gap-1">
                                            <span className="material-symbols-outlined text-sm">calendar_today</span>
                                            {new Date(upload.uploadedAt).toLocaleDateString('he-IL')}
                                          </span>
                                          <span className="flex items-center gap-1" title={upload.originalFileName}>
                                            <span className="material-symbols-outlined text-sm">attachment</span>
                                            <span className="truncate max-w-[150px]">{upload.originalFileName}</span>
                                          </span>
                                      </div>
                                  </div>
                                  
                                  <div className="flex flex-col items-end gap-2">
                                      <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
                                          upload.status === 'approved' ? 'bg-green-50 text-green-700 border-green-200' :
                                          upload.status === 'rejected' ? 'bg-red-50 text-red-700 border-red-200' :
                                          'bg-yellow-50 text-yellow-700 border-yellow-200'
                                      }`}>
                                          {upload.status === 'pending' ? 'ממתין לאישור' : upload.status === 'approved' ? 'אושר' : 'נדחה'}
                                      </span>
                                  </div>
                              </div>
                              
                              <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-gray-100">
                                  {upload.fileName && (
                                      <button 
                                        onClick={() => handleDownload(upload.fileName, upload.originalFileName)}
                                        className="flex items-center gap-1 px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded-lg text-sm transition-colors"
                                      >
                                          <span className="material-symbols-outlined text-lg">download</span>
                                          הורד קובץ
                                      </button>
                                  )}
                                  
                                  {upload.status === 'pending' && (
                                      <>
                                          <div className="w-px h-6 bg-gray-300 mx-1"></div>
                                          <button 
                                            onClick={() => handleUpdateStatus(upload.id, 'rejected')}
                                            className="flex items-center gap-1 px-3 py-1.5 text-red-600 hover:bg-red-50 rounded-lg text-sm transition-colors"
                                          >
                                              <span className="material-symbols-outlined text-lg">close</span>
                                              דחה
                                          </button>
                                          <button 
                                            onClick={() => handleUpdateStatus(upload.id, 'approved')}
                                            className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white hover:bg-green-700 rounded-lg text-sm transition-colors shadow-sm"
                                          >
                                              <span className="material-symbols-outlined text-lg">check</span>
                                              אשר
                                          </button>
                                      </>
                                  )}
                              </div>
                          </div>
                      </div>
                  </div>
              ))}
          </div>
      )}
    </div>
  )
}