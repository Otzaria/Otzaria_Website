'use client'

import { useState } from 'react'
import { validateRequired, validateFile } from '@/lib/validation-utils'
import Modal from '@/components/ui/Modal'

export default function AddBookDialog({ isOpen, onClose, onBookAdded, categories }) {
    const [bookName, setBookName] = useState('')
    const [file, setFile] = useState(null)
    const [isUploading, setIsUploading] = useState(false)
    const [error, setError] = useState(null)
    const [category, setCategory] = useState('כללי')
    const [isHidden, setIsHidden] = useState(false);
    const [sendNotification, setSendNotification] = useState(false);

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
        // ולידציות
        const bookNameCheck = validateRequired(bookName, 'שם הספר')
        if (!bookNameCheck.isValid) { setError(bookNameCheck.error); return }
        const fileCheck = validateFile(file)
        if (!fileCheck.isValid) { setError(fileCheck.error); return }

        setIsUploading(true)
        setError(null)

        const formData = new FormData()
        formData.append('pdf', file)
        formData.append('bookName', bookName)
        formData.append('category', category)
        formData.append('isHidden', isHidden);
        formData.append('sendNotification', sendNotification);

        try {
            const response = await fetch('/api/admin/books/upload', {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.error || 'שגיאה בהעלאה')
            }

            if (onBookAdded) onBookAdded()
            handleClose()
        } catch (err) {
            console.error(err)
            setError('שגיאה בתהליך ההעלאה וההמרה: ' + err.message)
        } finally {
            setIsUploading(false)
        }
    }

    const handleClose = () => {
        if (!isUploading) {
            setError(null)
            setFile(null)
            setBookName('')
            setCategory('כללי')
            setIsHidden(false)
            setSendNotification(false)
            onClose()
        }
    }

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title="הוספת ספר חדש"
            size="md"
            closeable={!isUploading}
            buttons={[
                {
                    label: isUploading ? 'מעבד...' : 'העלה והמר',
                    onClick: handleSubmit,
                    disabled: isUploading,
                    variant: 'primary'
                },
                {
                    label: 'ביטול',
                    onClick: handleClose,
                    disabled: isUploading,
                    variant: 'secondary'
                }
            ]}
        >
            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium mb-1">שם הספר</label>
                    <input
                        type="text"
                        value={bookName}
                        onChange={(e) => setBookName(e.target.value)}
                        disabled={isUploading}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-info-500 outline-none disabled:bg-neutral-100"
                        placeholder="הכנס שם ספר..."
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium mb-1">קטגוריה</label>
                    <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        disabled={isUploading}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-info-500 outline-none disabled:bg-neutral-100 bg-white"
                    >
                        {categories && categories.length > 0 ? (
                            categories.map((cat, idx) => (
                                <option key={idx} value={cat.name}>{cat.name}</option>
                            ))
                        ) : (
                            <option value="כללי">כללי</option>
                        )}
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-medium mb-1">קובץ PDF</label>
                    <input
                        type="file"
                        accept=".pdf"
                        onChange={handleFileSelect}
                        disabled={isUploading}
                        className="w-full block text-sm text-neutral-cool-500
                          file:mr-4 file:py-2 file:px-4
                          file:rounded-full file:border-0
                          file:text-sm file:font-semibold
                          file:bg-info-50 file:text-info-700
                          hover:file:bg-info-100
                          disabled:opacity-50"
                    />
                </div>

                {/* אפשרויות נוספות */}
                <div className="bg-neutral-50 p-3 rounded-lg border border-neutral-200 space-y-3">
                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            id="isHidden"
                            checked={isHidden}
                            onChange={(e) => setIsHidden(e.target.checked)}
                            disabled={isUploading}
                            className="w-4 h-4 text-primary focus:ring-primary border-neutral-300 rounded cursor-pointer"
                        />
                        <label htmlFor="isHidden" className="text-sm font-bold text-neutral-700 flex items-center gap-1 cursor-pointer select-none">
                            <span className="material-symbols-outlined text-sm">visibility_off</span>
                            ספר מוסתר (יוצג למנהלים בלבד)
                        </label>
                    </div>

                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            id="sendNotification"
                            checked={sendNotification}
                            onChange={(e) => setSendNotification(e.target.checked)}
                            disabled={isUploading || isHidden} 
                            className="w-4 h-4 text-primary focus:ring-primary border-neutral-300 rounded cursor-pointer"
                        />
                        <label htmlFor="sendNotification" className={`text-sm font-bold flex items-center gap-1 cursor-pointer select-none ${isHidden ? 'text-neutral-400' : 'text-neutral-700'}`}>
                            <span className="material-symbols-outlined text-sm">campaign</span>
                            שלח עדכון במייל למנויים
                        </label>
                    </div>
                </div>

                {error && (
                    <div className="text-danger-600 text-sm bg-danger-50 p-3 rounded-lg border border-danger-200 flex items-start gap-2">
                        <span className="material-symbols-outlined text-lg flex-shrink-0 mt-0.5">error</span>
                        <span>{error}</span>
                    </div>
                )}
            </div>
        </Modal>
    )
}
