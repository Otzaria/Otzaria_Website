'use client'

import { useState } from 'react'
import { uploadBookAction } from '@/app/library/admin/upload-action' // וודא שנתיב זה קיים בפרויקט ה-Rewrite

export default function AddBookDialog({ isOpen, onClose, onBookAdded }) {
    const [bookName, setBookName] = useState('')
    const [file, setFile] = useState(null)
    const [isUploading, setIsUploading] = useState(false)
    const [error, setError] = useState(null)
    const [category, setCategory] = useState('כללי')

    const handleFileSelect = (e) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0])
            if (!bookName) {
                // הסרת סיומת
                setBookName(e.target.files[0].name.replace(/\.[^/.]+$/, ""))
            }
        }
    }

    const handleSubmit = async () => {
        if (!file || !bookName) {
            setError('נא למלא את כל השדות ולבחור קובץ')
            return
        }

        setIsUploading(true)
        setError(null)

        const formData = new FormData()
        formData.append('pdf', file)
        formData.append('bookName', bookName)
        formData.append('category', category)

        try {
            // קריאה ל-Server Action
            const result = await uploadBookAction(formData)

            if (!result.success) {
                throw new Error(result.error || 'שגיאה בהעלאה')
            }

            if (onBookAdded) onBookAdded()
            onClose()
            setFile(null)
            setBookName('')
            setCategory('כללי')

        } catch (err) {
            console.error(err)
            setError('שגיאה בתהליך ההעלאה וההמרה: ' + err.message)
        } finally {
            setIsUploading(false)
        }
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
            <div className="bg-white rounded-2xl max-w-md w-full p-8 shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-gray-800">הוספת ספר חדש</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <div className="space-y-5">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1.5">שם הספר</label>
                        <input
                            type="text"
                            value={bookName}
                            onChange={(e) => setBookName(e.target.value)}
                            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                            placeholder="הכנס שם ספר..."
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1.5">קטגוריה</label>
                        <select
                            value={category}
                            onChange={(e) => setCategory(e.target.value)}
                            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all bg-white"
                        >
                            <option>כללי</option>
                            <option>תנ"ך</option>
                            <option>משנה</option>
                            <option>תלמוד</option>
                            <option>הלכה</option>
                            <option>מוסר</option>
                            <option>חסידות</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1.5">קובץ PDF</label>
                        <label className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-xl cursor-pointer hover:bg-gray-50 transition-colors ${file ? 'border-green-500 bg-green-50' : 'border-gray-300'}`}>
                            <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                {file ? (
                                    <>
                                        <span className="material-symbols-outlined text-green-600 text-3xl mb-2">check_circle</span>
                                        <p className="text-sm text-green-600 font-medium">{file.name}</p>
                                    </>
                                ) : (
                                    <>
                                        <span className="material-symbols-outlined text-gray-400 text-3xl mb-2">cloud_upload</span>
                                        <p className="text-sm text-gray-500">לחץ לבחירת קובץ</p>
                                        <p className="text-xs text-gray-400 mt-1">PDF עד 50MB</p>
                                    </>
                                )}
                            </div>
                            <input type="file" accept=".pdf" className="hidden" onChange={handleFileSelect} />
                        </label>
                    </div>

                    {error && (
                        <div className="flex items-center gap-2 text-red-700 bg-red-50 p-3 rounded-lg text-sm border border-red-200">
                            <span className="material-symbols-outlined text-lg">error</span>
                            {error}
                        </div>
                    )}

                    <div className="flex gap-3 mt-8 pt-4 border-t border-gray-100">
                        <button
                            onClick={onClose}
                            disabled={isUploading}
                            className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                        >
                            ביטול
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={isUploading}
                            className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-70 disabled:cursor-not-allowed font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-200 transition-all"
                        >
                            {isUploading ? (
                                <>
                                    <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                                    מעבד... (זה עלול לקחת זמן)
                                </>
                            ) : (
                                <>
                                    <span className="material-symbols-outlined">upload</span>
                                    העלה וצור ספר
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}