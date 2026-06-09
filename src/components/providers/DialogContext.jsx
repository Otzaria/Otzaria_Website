'use client'

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'

const DialogContext = createContext(null)

export function DialogProvider({ children }) {
  const [isVisible, setIsVisible] = useState(false)
  const timerRef = useRef(null)
  const closeTimerRef = useRef(null)
  
  const [dialogConfig, setDialogConfig] = useState({
    isOpen: false,
    type: 'alert', 
    title: '',
    message: '',
    onConfirm: null,
    confirmText: 'אישור',
    cancelText: 'ביטול',
    timestamp: 0 
  })

  const clearAutoCloseTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [])

  const showAlert = useCallback((title, message) => {
    clearAutoCloseTimer()
    clearCloseTimer()
    setIsVisible(true)
    setDialogConfig({
      isOpen: true,
      type: 'alert',
      title,
      message,
      onConfirm: null,
      confirmText: '',
      timestamp: Date.now()
    })
  }, [clearAutoCloseTimer, clearCloseTimer])

  // showMessage: דיאלוג מודאלי חוסם בלי auto-close, עם כפתור אישור יחיד.
  // מיועד להודעות שגיאה ארוכות שצריך לקרוא במלואן (לעומת showAlert שהוא toast קצר).
  const showMessage = useCallback((title, message, confirmText = 'אישור') => {
    clearAutoCloseTimer()
    clearCloseTimer()
    return new Promise((resolve) => {
      setIsVisible(true)
      setDialogConfig({
        isOpen: true,
        type: 'message',
        title,
        message,
        onConfirm: () => resolve(),
        onCancel: () => resolve(),
        confirmText,
        cancelText: '',
        timestamp: Date.now()
      })
    })
  }, [clearAutoCloseTimer, clearCloseTimer])

  const showConfirm = useCallback((title, message, onConfirmAction, confirmText = 'אישור', cancelText = 'ביטול') => {
    clearAutoCloseTimer()
    clearCloseTimer()
    
    // תמיכה ב-Promise - אם לא נשלח callback, מחזירים Promise
    if (typeof onConfirmAction !== 'function') {
      return new Promise((resolve) => {
        setIsVisible(true)
        setDialogConfig({
          isOpen: true,
          type: 'confirm',
          title,
          message,
          onConfirm: () => resolve(true),
          onCancel: () => resolve(false),
          confirmText: onConfirmAction || 'אישור', // אם onConfirmAction הוא string, זה confirmText
          cancelText: typeof message === 'string' && typeof onConfirmAction === 'string' ? onConfirmAction : 'ביטול',
          timestamp: Date.now()
        })
      })
    }
    
    // תמיכה ב-callback המקורי
    setIsVisible(true)
    setDialogConfig({
      isOpen: true,
      type: 'confirm',
      title,
      message,
      onConfirm: onConfirmAction,
      onCancel: null,
      confirmText,
      cancelText,
      timestamp: Date.now()
    })
  }, [clearAutoCloseTimer, clearCloseTimer])

  const closeDialog = useCallback(() => {
    clearAutoCloseTimer()
    clearCloseTimer()
    
    // אם יש onCancel (במקרה של Promise), קורא לו
    if (dialogConfig.onCancel) {
      dialogConfig.onCancel()
    }
    
    setIsVisible(false)
    
    closeTimerRef.current = setTimeout(() => {
      setDialogConfig(prev => ({ ...prev, isOpen: false }))
    }, 300)
  }, [clearAutoCloseTimer, clearCloseTimer, dialogConfig])

  const handleConfirm = useCallback(() => {
    if (dialogConfig.onConfirm) {
      dialogConfig.onConfirm()
    }
    closeDialog()
  }, [dialogConfig, closeDialog])

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (!dialogConfig.isOpen) return
      if (event.key === 'Enter') {
        event.preventDefault()
        if (dialogConfig.type === 'confirm' || dialogConfig.type === 'message') {
          handleConfirm()
        } else {
          closeDialog()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [dialogConfig.isOpen, dialogConfig.type, handleConfirm, closeDialog])

  useEffect(() => {
    if (dialogConfig.isOpen) {
      const animationTimer = setTimeout(() => setIsVisible(true), 10)
      
      if (dialogConfig.type === 'alert') {
        clearAutoCloseTimer()
        timerRef.current = setTimeout(() => {
          closeDialog()
        }, 3000) 
      }

      return () => {
        clearTimeout(animationTimer)
        clearAutoCloseTimer()
      }
    }
  }, [dialogConfig.isOpen, dialogConfig.type, dialogConfig.timestamp, closeDialog, clearAutoCloseTimer])

  const isAlert = dialogConfig.type === 'alert';

  const wrapperClass = isAlert 
    ? `fixed bottom-8 left-0 right-0 z-[9999] flex items-end justify-center transition-opacity duration-300 pointer-events-none ${isVisible ? 'opacity-100' : 'opacity-0'}`
    : `fixed inset-0 z-[9999] bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-4 transition-opacity duration-300 ease-in-out ${isVisible ? 'opacity-100' : 'opacity-0'}`;

  const boxClass = `glass-strong rounded-2xl shadow-2xl border border-surface-variant/50 relative overflow-hidden pointer-events-auto transition-all duration-300 ease-out 
    ${isAlert 
      ? `w-80 p-5 ${isVisible ? 'translate-y-0 scale-100' : 'translate-y-8 scale-95'}` 
      : `max-w-sm w-full p-8 ${isVisible ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'}`
    }`;
  return (
    <DialogContext.Provider value={{ showAlert, showConfirm, showMessage, closeDialog }}>
      <style>{`
        @keyframes shrinkWidth {
          from { width: 100%; }
          to { width: 0%; }
        }
        .animate-progress-bar {
          animation: shrinkWidth 3s linear forwards;
        }
      `}</style>

      {children}

      {dialogConfig.isOpen && (
        <div 
          className={wrapperClass}
          onClick={!isAlert ? closeDialog : undefined}
        >
          <div 
            className={boxClass}
            onClick={e => {
              e.stopPropagation();
              if (isAlert) closeDialog();
            }}
          >
            {/* מבנה פנימי - Flex Row עבור Alert */}
            <div className={`flex ${isAlert ? 'flex-row text-right items-start gap-4' : 'flex-col items-center text-center'} mb-${isAlert ? '2' : '6'}`}>
              
              <div className={`shrink-0 rounded-full flex items-center justify-center shadow-inner transition-transform duration-500
                ${isAlert ? 'w-10 h-10' : 'w-14 h-14 mb-4'}
                ${isVisible ? 'scale-100 rotate-0' : 'scale-0 -rotate-180'}
                ${dialogConfig.type === 'confirm'
                  ? 'bg-primary/10 text-primary'
                  : 'bg-secondary/10 text-secondary'
              }`}>
                <span className={`material-symbols-outlined ${isAlert ? 'text-[24px]' : 'text-[32px]'}`}>
                  {dialogConfig.type === 'confirm' ? 'help' : dialogConfig.type === 'message' ? 'error' : 'info'}
                </span>
              </div>
              
              <div className="flex-1">
                <h3 className={`${isAlert ? 'text-lg' : 'text-xl'} font-frank font-bold text-on-surface mb-1 tracking-wide`}>
                  {dialogConfig.title}
                </h3>
                
                <p className="text-on-surface/80 text-base leading-relaxed whitespace-pre-line">
                  {dialogConfig.message}
                </p>
              </div>
            </div>

            {!isAlert && (
              <div className="flex gap-3 justify-center mt-2 z-10 relative">
                  {dialogConfig.type === 'confirm' && (
                    <button
                      onClick={closeDialog}
                      className="px-5 py-2.5 rounded-xl border border-surface-variant text-on-surface/70 hover:bg-surface-variant/30 hover:text-on-surface font-medium transition-all duration-200"
                    >
                      {dialogConfig.cancelText}
                    </button>
                  )}
                  <button
                    onClick={handleConfirm}
                    className="px-6 py-2.5 rounded-xl text-on-primary font-medium shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 bg-primary hover:bg-primary/90"
                  >
                    {dialogConfig.confirmText}
                  </button>
              </div>
            )}
            
            {isAlert && (
               <div className="absolute bottom-0 left-0 h-1 bg-secondary/30 w-full">
                  <div 
                    key={dialogConfig.timestamp} 
                    className="h-full bg-secondary animate-progress-bar"
                  />
               </div>
            )}
          </div>
        </div>
      )}
    </DialogContext.Provider>
  )
}

const noopDialog = {
  showAlert: () => {},
  showConfirm: () => Promise.resolve(false),
  showMessage: () => Promise.resolve(),
  showPrompt: () => Promise.resolve(null),
}

export function useDialog() {
  const context = useContext(DialogContext)
  return context ?? noopDialog
}