'use client'

import { useState } from 'react'
import EventFilters from './EventFilters'
import { EMPTY_FILTERS, criteriaToSearchParams, filtersToCriteria } from './labels'

const EXPORT_URL = '/api/search-feedback/admin/export'

/** קישור הורדה ל-NDJSON לפי מסננים. models: [{modelFamilyId, modelQuantization}] */
export default function ExportPanel({ models }) {
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const query = criteriaToSearchParams(filtersToCriteria(filters, models)).toString()
  const href = query ? `${EXPORT_URL}?${query}` : EXPORT_URL

  return (
    <div className="glass rounded-2xl p-4 space-y-3">
      <h3 className="text-lg font-bold text-on-surface">ייצוא נתוני אימון (NDJSON)</h3>
      <EventFilters filters={filters} onChange={setFilters} models={models} />
      <a href={href} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-on-primary">
        <span className="material-symbols-outlined">download</span>
        <span>הורדה</span>
      </a>
      <p className="text-xs text-on-surface/60">אירועים של התקנות חסומות אינם נכללים בייצוא.</p>
    </div>
  )
}
