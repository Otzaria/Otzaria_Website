'use client'

import React, { createContext, useContext, useState, useCallback } from 'react'
import Loader from '@/components/ui/Loader'

const LoadingContext = createContext(null)

export function LoadingProvider({ children }) {
  const [loadingState, setLoadingState] = useState({
    isLoading: false,
    message: '',
    onCancel: null 
  })

  const startLoading = useCallback((message = 'מעבד נתונים...', onCancel = null) => {
    setLoadingState({ isLoading: true, message, onCancel })
  }, [])

  const stopLoading = useCallback(() => {
    setLoadingState(prev => ({ ...prev, isLoading: false, onCancel: null }))
  }, [])

  const handleCancel = () => {
    if (loadingState.onCancel) {
      loadingState.onCancel()
      stopLoading()
    }
  }

  return (
    <LoadingContext.Provider value={{ startLoading, stopLoading, isLoading: loadingState.isLoading }}>
      {children}

      {/* אנימציות CSS ולא framer-motion: הפרוביידר עוטף כל מסלול באתר, ולכן
          הייבוא כאן הכניס את framer-motion (כ-114KB raw) לכל דף — גם לדפים
          סטטיים לגמרי שאין בהם שום אנימציה. אנימציית היציאה בוטלה: היא דרשה
          AnimatePresence, וכאן היא ממילא לא הורגשה. */}
      {loadingState.isLoading && (
          <div
            className="fixed inset-0 z-[10000] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-enter-fade"
          >
            <div
              role="status"
              className="glass-strong px-12 py-10 rounded-3xl flex flex-col items-center shadow-2xl border border-surface-variant/50 min-w-[300px] animate-enter-dialog"
            >
              <Loader size="lg" decorative className="mb-6" />

              <h3 className="text-xl font-frank font-bold text-on-surface tracking-wide animate-pulse text-center">
                {loadingState.message}
              </h3>

              {loadingState.onCancel && (
                <button
                  className="mt-6 px-6 py-2 rounded-full border border-danger-500/50 text-danger-500 hover:bg-danger-500/10 transition-colors duration-200 text-sm font-medium animate-enter-up"
                  onClick={handleCancel}
                >
                 ביטול
                </button>
              )}
            </div>
          </div>
        )}
    </LoadingContext.Provider>
  )
}

export function useLoading() {
  const context = useContext(LoadingContext)
  if (!context) {
    throw new Error('useLoading must be used within a LoadingProvider')
  }
  return context
}