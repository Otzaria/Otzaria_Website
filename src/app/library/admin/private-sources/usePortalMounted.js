'use client'

import { useEffect, useState } from 'react'

/**
 * שומר-מיקום (mount guard) לרינדור פורטל בצד הלקוח בלבד — מונע ניסיון
 * להשתמש ב-document.body בזמן SSR/hydration. חולץ כי היה משוכפל זהה
 * ב-SourceEditModal וב-OutreachEditModal.
 */
export default function usePortalMounted() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- guard על mount, כמו ב-Modal.jsx
    setMounted(true)
    return () => setMounted(false)
  }, [])

  return mounted
}
