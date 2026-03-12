'use client'

import React, { createContext, useContext, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

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

      <AnimatePresence>
        {loadingState.isLoading && (
          <motion.div 
            className="fixed inset-0 z-[10000] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <motion.div 
              className="glass-strong px-12 py-10 rounded-3xl flex flex-col items-center shadow-2xl border border-surface-variant/50 min-w-[300px]"
              initial={{ scale: 0.8, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: -20 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
            >
              <div className="relative w-20 h-20 mb-6">
                <div className="absolute inset-0 border-4 border-t-primary border-r-transparent border-b-primary border-l-transparent rounded-full animate-spin"></div>
                <div className="absolute inset-2 border-4 border-t-secondary border-r-transparent border-b-secondary border-l-transparent rounded-full animate-spin reverse-spin opacity-70" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }}></div>
              </div>

              <h3 className="text-xl font-frank font-bold text-on-surface tracking-wide animate-pulse text-center">
                {loadingState.message}
              </h3>

              {loadingState.onCancel && (
                <motion.button
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-6 px-6 py-2 rounded-full border border-red-500/50 text-red-500 hover:bg-red-500/10 transition-colors duration-200 text-sm font-medium"
                  onClick={handleCancel}
                >
                 ביטול
                </motion.button>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
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