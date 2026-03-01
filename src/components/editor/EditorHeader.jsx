import Link from 'next/link'
import { getAvatarColor, getInitial } from '@/lib/avatar-colors'

export default function EditorHeader({ bookName, pageNumber, bookPath, session, saveStatus, onToggleFullScreen }) {
  return (
    <header className="glass-strong border-b border-surface-variant sticky top-0 z-40">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/library" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <img src="/logo.png" alt="לוגו אוצריא" className="w-10 h-10" />
              <span className="text-lg font-bold text-black" style={{ fontFamily: 'FrankRuehl, serif' }}>ספריית אוצריא</span>
            </Link>

            <div className="w-px h-8 bg-surface-variant"></div>

            <Link
              href={`/library/books/${encodeURIComponent(bookPath)}`}
              className="flex items-center gap-2 text-on-surface hover:text-primary transition-colors"
            >
              <span className="material-symbols-outlined">arrow_forward</span>
              <span>חזרה לספר</span>
            </Link>
            <div className="w-px h-8 bg-surface-variant"></div>
            <div>
              <h1 className="text-lg font-bold text-on-surface">
                {bookName} - עמוד {pageNumber}
              </h1>
              <p className="text-xs text-on-surface/60">עריכת טקסט</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* אינדיקטור שמירה דינמי */}
            <div className="min-w-[120px] flex justify-end">
              {saveStatus === 'saved' && (
                <div className="flex items-center gap-2 text-sm text-green-600 animate-in fade-in duration-300">
                  <span className="material-symbols-outlined text-base">check_circle</span>
                  <span>נשמר אוטומטית</span>
                </div>
              )}
              {saveStatus === 'saving' && (
                <div className="flex items-center gap-2 text-sm text-blue-600 animate-in fade-in duration-300">
                  <span className="material-symbols-outlined text-base animate-spin">sync</span>
                  <span>שומר...</span>
                </div>
              )}
              {saveStatus === 'error' && (
                <div className="flex items-center gap-2 text-sm text-red-600 animate-in fade-in duration-300">
                  <span className="material-symbols-outlined text-base">error</span>
                  <span>שגיאה בשמירה</span>
                </div>
              )}
            </div>

            {/* כפתור מסך מלא */}
            <button 
              onClick={onToggleFullScreen}
              className="p-2 hover:bg-surface-variant rounded-full transition-colors text-on-surface/70"
              title="מסך מלא"
            >
              <span className="material-symbols-outlined">fullscreen</span>
            </button>

            <Link
              href="/library/dashboard"
              className="flex items-center justify-center hover:opacity-80 transition-opacity"
              title={session?.user?.name}
            >
              <div
                className="w-10 h-10 rounded-full text-white flex items-center justify-center font-bold text-base shadow-md hover:shadow-lg transition-shadow"
                style={{ backgroundColor: getAvatarColor(session?.user?.name || '') }}
              >
                {getInitial(session?.user?.name || '')}
              </div>
            </Link>
          </div>
        </div>
      </div>
    </header>
  )
}