'use client'

import { useState, useEffect } from 'react'

export default function AdminUploadsPage() {
  const [uploads, setUploads] = useState([])
  const [loading, setLoading] = useState(true)

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
        const res = await fetch('/api/admin/uploads/update-status', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uploadId, status })
        })
        if (res.ok) loadUploads()
    } catch (e) {
        alert('שגיאה בעדכון')
    }
  }

  const handleDownload = (fileName, originalName) => {
      // יצירת אלמנט קישור להורדה
      const link = document.createElement('a')
      link.href = `/api/download/${fileName}`
      link.download = originalName || fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
  }

  if (loading) return <div className="text-center p-10">טוען העלאות...</div>

  return (
    <div className="glass-strong p-6 rounded-xl">
      <h2 className="text-2xl font-bold mb-6 text-on-surface">העלאות משתמשים</h2>
      
      {uploads.length === 0 ? (
          <div className="text-center py-10">אין העלאות</div>
      ) : (
          <div className="space-y-4">
              {uploads.map(upload => (
                  <div key={upload.id} className="glass p-6 rounded-lg flex items-start gap-4">
                      <span className="material-symbols-outlined text-4xl text-primary">description</span>
                      <div className="flex-1">
                          <div className="flex justify-between items-start mb-2">
                              <div>
                                  <h3 className="text-xl font-bold">{upload.bookName}</h3>
                                  <p className="text-sm text-gray-600">הועלה ע"י: {upload.uploadedBy}</p>
                              </div>
                              <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                                  upload.status === 'approved' ? 'bg-green-100 text-green-800' :
                                  upload.status === 'rejected' ? 'bg-red-100 text-red-800' :
                                  'bg-yellow-100 text-yellow-800'
                              }`}>
                                  {upload.status === 'pending' ? 'ממתין' : upload.status === 'approved' ? 'אושר' : 'נדחה'}
                              </span>
                          </div>
                          
                          <div className="flex gap-3 mt-4">
                              {upload.fileName && (
                                  <button 
                                    onClick={() => handleDownload(upload.fileName, upload.originalFileName)}
                                    className="flex items-center gap-2 px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                                  >
                                      <span className="material-symbols-outlined text-sm">download</span>
                                      הורד
                                  </button>
                              )}
                              
                              {upload.status === 'pending' && (
                                  <>
                                      <button 
                                        onClick={() => handleUpdateStatus(upload.id, 'approved')}
                                        className="flex items-center gap-2 px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700"
                                      >
                                          <span className="material-symbols-outlined text-sm">check</span>
                                          אשר
                                      </button>
                                      <button 
                                        onClick={() => handleUpdateStatus(upload.id, 'rejected')}
                                        className="flex items-center gap-2 px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700"
                                      >
                                          <span className="material-symbols-outlined text-sm">close</span>
                                          דחה
                                      </button>
                                  </>
                              )}
                          </div>
                      </div>
                  </div>
              ))}
          </div>
      )}
    </div>
  )
}