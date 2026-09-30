'use client'

import { useState } from 'react'
import { thumbUrl } from '@/lib/pageProof/gridState'

// התמונה הממוזערת בכרטיס-עמוד — ברשת-העמודים של המתנדב (ProofPageCard) ושל
// המנהל (admin/AdminPageCard): בגובה 3:4, מספר העמוד בפינה, לחיצה ← הגדלה
// (onPreview). children — כפתורים שמעל התמונה (למשל שחרור).
// page: {id, page, revision}

export default function ProofPageThumb({ page, onPreview, children = null }) {
  const [failed, setFailed] = useState(false)
  return (
    <div className="relative aspect-[3/4] overflow-hidden bg-surface">
      <button
        type="button"
        onClick={() => onPreview?.(page)}
        className="absolute inset-0 flex cursor-zoom-in items-center justify-center"
        title="לחץ להגדלה"
        aria-label={`הגדלת עמוד ${page.page}`}
      >
        {failed ? (
          <span aria-hidden="true" className="material-symbols-outlined text-6xl text-on-surface/20">description</span>
        ) : (
          <img
            src={thumbUrl(page)}
            alt={`עמוד ${page.page}`}
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
      </button>
      <div className="pointer-events-none absolute left-2 top-2 z-10 rounded bg-black/70 px-2 py-1 text-xs font-bold text-white">
        {page.page}
      </div>
      {children}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
    </div>
  )
}
