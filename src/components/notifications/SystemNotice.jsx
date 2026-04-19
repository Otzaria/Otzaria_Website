'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export default function SystemNotice() {
  const [isVisible, setIsVisible] = useState(true)

  if (!isVisible) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -50 }}
        className="bg-orange-500 text-white py-3 px-4 relative z-50"
      >
        <div className="container mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-2xl">warning</span>
            <div>
              <p className="font-bold text-lg">הודעת מערכת חשובה</p>
              <p className="text-sm opacity-90">
                האתר נמצא כרגע בתהליך עדכון. אנא אל תכניסו נתונים חדשים עד להודעה חדשה.
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsVisible(false)}
            className="p-2 hover:bg-orange-600 rounded-lg transition-colors"
            aria-label="סגור הודעה"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}