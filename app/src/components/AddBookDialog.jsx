'use client'

import { useState } from 'react'

export default function AddBookDialog({ isOpen, onClose, onBookAdded }) {
    const [bookName, setBookName] = useState('')
    const [file, setFile] = useState(null)
    const [isUploading, setIsUploading] = useState(false)
    const [error, setError] = useState(null)

    const handleFileSelect = (e) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0])
            // אוטומטית מציע שם מהקובץ אם טרם הוזן
            if (!bookName) {
                setBookName(e.target.files[0].name.replace('.pdf', ''))
            }
        }
    }

    const handleSubmit = async () => {
        if (!file || !bookName) {
            setError('נא למלא את כל השדות')
            return
        }

        setIsUploading(true)
        setError(null)

        const formData = new FormData()
        formData.append('pdf', file)
        formData.append('bookName', bookName)

        try {
            const res = await fetch('/api/admin/books/upload', {
                method: 'POST',
                body: formData
            })

            const data = await res.json()

            if (!data.success) {
                throw new Error(data.error || 'שגיאה בהעלאה')
            }

            // הצלחה
            if (onBookAdded) onBookAdded()
            onClose()
            // איפוס
            setFile(null)
            setBookName('')

        } catch (err) {
            console.error(err)
            setError('שגיאה בתהליך: ' + err.message)
        } finally {
            setIsUploading(false)
        }
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl">
                <h2 className="text-2xl font-bold mb-6 text-gray-800">הוספת ספר חדש</h2>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">שם הספר</label>
                        <input
                            type="text"
                            value={bookName}
                            onChange={(e) => setBookName(e.target.value)}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="הכנס שם ספר..."
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1">קובץ PDF</label>
                        <input
                            type="file"
                            accept=".pdf"
                            onChange={handleFileSelect}
                            className="w-full block text-sm text-slate-500
                              file:mr-4 file:py-2 file:px-4
                              file:rounded-full file:border-0
                              file:text-sm file:font-semibold
                              file:bg-blue-50 file:text-blue-700
                              hover:file:bg-blue-100"
                        />
                    </div>

                    {error && (
                        <div className="text-red-600 text-sm bg-red-50 p-2 rounded">
                            {error}
                        </div>
                    )}

                    <div className="flex gap-3 mt-6">
                        <button
                            onClick={handleSubmit}
                            disabled={isUploading}
                            className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
                        >
                            {isUploading ? 'מעבד...' : 'העלה והמר'}
                        </button>
                        <button
                            onClick={onClose}
                            disabled={isUploading}
                            className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                        >
                            ביטול
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}