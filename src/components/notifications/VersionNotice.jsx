'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export default function VersionNotice() {
  const [hasUpdate, setHasUpdate] = useState(false)
  const [currentVersion, setCurrentVersion] = useState(null)

  useEffect(() => {
    // 1. שמירת הגרסה ההתחלתית כשהאפליקציה עולה
    const fetchInitialVersion = async () => {
      try {
        const res = await fetch('/version.json?t=' + Date.now())
        const data = await res.json()
        setCurrentVersion(data.version)
      } catch (e) {
        console.error('Failed to fetch initial version', e)
      }
    }

    fetchInitialVersion()

    // 2. בדיקה תקופתית (למשל כל דקה)
    const interval = setInterval(async () => {
      try {
        // הוספת timestamp ל-url כדי למנוע caching של הדפדפן לקובץ ה-json
        const res = await fetch('/version.json?t=' + Date.now())
        const data = await res.json()

        // אם יש לנו גרסה התחלתית, והגרסה בשרת שונה ממנה - יש עדכון!
        if (currentVersion && data.version !== currentVersion) {
          setHasUpdate(true)
        }
      } catch (e) {
        // התעלמות משגיאות רשת זמניות
      }
    }, 40 * 1000) // בדיקה כל 60 שניות

    return () => clearInterval(interval)
  }, [currentVersion])

  const handleRefresh = () => {
    window.location.reload()
  }

  return (
    <AnimatePresence>
      {hasUpdate && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className="fixed bottom-6 right-6 z-[100] max-w-md w-full"
        >
          <div className="bg-slate-900/95 text-white p-4 rounded-xl shadow-2xl backdrop-blur-md border border-slate-700 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary/20 p-2 rounded-lg">
                <span className="material-symbols-outlined text-primary animate-pulse">
                  system_update
                </span>
              </div>
              <div>
                <h4 className="font-bold text-sm">האתר עודכן!</h4>
                <p className="text-xs text-slate-400">יש לרענן כדי לטעון את התוכן המעודכן</p>
              </div>
            </div>
            
            <button
              onClick={handleRefresh}
              className="bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors whitespace-nowrap shadow-lg"
            >
              רענן עכשיו
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}