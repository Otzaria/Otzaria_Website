'use client'

import { useState } from 'react'
import BookInfoChangeSetsList from '@/components/admin/bookInfo/BookInfoChangeSetsList'
import LegacyBookInfoQueue from '@/components/admin/bookInfo/LegacyBookInfoQueue'

const LIBRARY_FILE_URL = 'https://github.com/Otzaria/otzaria-library/blob/main/ForDB/book_info.csv'

export default function AdminBookInfoPage() {
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <div className="glass-strong p-6 rounded-xl">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-on-surface">מידע על ספרים</h2>
          <p className="text-on-surface/60">
            כל עריכה מדף &quot;מידע על ספרים&quot; נפתחת כבקשת מיזוג (PR) לקובץ{' '}
            <a href={LIBRARY_FILE_URL} target="_blank" rel="noreferrer" className="underline" dir="ltr">
              ForDB/book_info.csv
            </a>{' '}
            בריפו הספרייה. האישור הוא מיזוג הבקשה ב-GitHub.
          </p>
        </div>
        <a
          href="/api/admin/book-info/export-csv"
          className="inline-flex items-center gap-2 px-4 py-2 bg-success-alt-600 text-white rounded-lg hover:bg-success-alt-700 shrink-0"
          download
        >
          <span className="material-symbols-outlined">download</span>
          הורדת book_info.csv
        </a>
      </div>

      <BookInfoChangeSetsList refreshKey={refreshKey} />
      <LegacyBookInfoQueue onPublished={() => setRefreshKey((key) => key + 1)} />
    </div>
  )
}
