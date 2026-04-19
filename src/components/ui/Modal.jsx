'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Reusable Modal/Dialog component with consistent styling and behavior
 * Fixed: Centering in viewport and scrollable content area
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the modal is visible
 * @param {Function} props.onClose - Callback when modal should close
 * @param {string} props.title - Modal title
 * @param {React.ReactNode} props.children - Modal content
 * @param {Array<Object>} props.buttons - Array of button objects {label, onClick, variant}
 * @param {boolean} props.closeable - Whether modal can be closed by clicking backdrop
 * @param {string} props.size - Modal size: 'sm', 'md', 'lg', 'xl' (default: 'md')
 */
export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  buttons = [],
  closeable = true,
  size = 'md'
}) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    // מניעת גלילה של הרקע כשהמודל פתוח
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  if (!isOpen || !mounted) return null

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl'
  }

  const handleBackdropClick = () => {
    if (closeable) onClose()
  }

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={handleBackdropClick}
    >
      {/* Modal Container: Flex column to manage header/content/footer layout */}
      <div
        className={`flex flex-col bg-white rounded-2xl w-full ${sizeClasses[size]} shadow-2xl max-h-[90vh] animate-in zoom-in-95 duration-200`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - Fixed */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-2xl font-bold text-gray-900 line-clamp-1">{title}</h2>
          {closeable && (
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-700 hover:bg-gray-100 p-2 rounded-full transition-colors"
              aria-label="Close modal"
            >
              <span className="material-symbols-outlined text-2xl block">close</span>
            </button>
          )}
        </div>

        {/* Content - Scrollable */}
        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
          {children}
        </div>

        {/* Footer - Fixed */}
        {buttons.length > 0 && (
          <div className="flex gap-3 justify-end p-6 border-t border-gray-100 flex-shrink-0 bg-gray-50/50 rounded-b-2xl">
            {buttons.map((button, index) => (
              <button
                key={index}
                onClick={button.onClick}
                disabled={button.disabled}
                className={`px-6 py-2.5 rounded-lg font-bold transition-colors shadow-sm ${
                  button.variant === 'secondary'
                    ? 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                    : button.variant === 'danger'
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-primary text-on-primary hover:bg-accent'
                } ${button.disabled ? 'opacity-50 cursor-not-allowed' : 'hover:-translate-y-0.5'}`}
              >
                {button.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )

  return createPortal(modalContent, document.body)
}