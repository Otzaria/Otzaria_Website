'use client'

import { createContext, useContext } from 'react'

/**
 * לאן חלונות צפים (ui/Dialog, CommandPalette, MenuButton, FloatingPanel) מצוירים ב-portal.
 *
 * בלי ספק (ברירת המחדל באתר) — document.body. עורך העמוד (EditorShell) מספק את השורש שלו
 * (ה-<main data-editor-shell>), כדי שהחלונות יקבלו את ערכת העורך (ערב/נייר) ואת המשתנים שלו —
 * הערכה חלה על השורש בלבד (editor-themes.css) ו-portal ל-body יצא ממנה.
 *
 * undefined = אין ספק → body. null = יש ספק אבל השורש עוד לא עלה → לא מציירים (הרינדור הבא יצייר).
 */
export const PortalContainerContext = createContext<HTMLElement | null | undefined>(undefined)

export function usePortalContainer(): HTMLElement | null {
  const container = useContext(PortalContainerContext)
  if (container !== undefined) return container
  return typeof document === 'undefined' ? null : document.body
}
