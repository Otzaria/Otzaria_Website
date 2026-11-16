// איתור הסימון של דיווח "טעות בספר" בטקסט העמוד — לפתיחת העורך מתוך מסך הדיווחים (?report=<id>).
// טהור: בלי DB/DOM, imports יחסיים — נבדק ב-node:test (locateMarker.test.mjs).
//
// הסימון בטקסט: "(מקור) [תיקון]" (עם רווח), ובסימונים ישנים "(מקור)[תיקון]" — שתי הצורות נמצאות.
// הנוסח: של המדווח, ואם המנהל קבע נוסח אחר (finalOriginal / finalProposed) — גם הוא (אם הסימון כבר עודכן).
// כמה מופעים — המופע שההקשר השמור סביבו (contextBefore / contextAfter) תואם הכי הרבה, ובשוויון — הקרוב
// ביותר ל-offset השמור.

const str = (v) => (typeof v === 'string' ? v : '')

/** שתי הצורות של הסימון: עם רווח (החדשה) ובלי (הישנה) */
export function markerForms(original, proposed) {
  const o = str(original)
  const p = str(proposed)
  return [`(${o}) [${p}]`, `(${o})[${p}]`]
}

/**
 * צמדי הנוסח שאפשר למצוא בטקסט: של המדווח, ואחריו הנוסח שהמנהל קבע (אם שונה).
 * @param {{ original?: string, proposed?: string, finalOriginal?: string|null, finalProposed?: string|null }} report
 * @returns {Array<{ original: string, proposed: string }>}
 */
export function markerTextPairs(report) {
  const pairs = [{ original: str(report?.original), proposed: str(report?.proposed) }]
  if (report?.finalOriginal != null || report?.finalProposed != null) {
    const f = { original: str(report.finalOriginal ?? report.original), proposed: str(report.finalProposed ?? report.proposed) }
    if (f.original !== pairs[0].original || f.proposed !== pairs[0].proposed) pairs.push(f)
  }
  return pairs.filter((p) => p.original || p.proposed)
}

/**
 * כל המופעים של הסימון בטקסט (בשתי הצורות ובכל צמד נוסח), לפי הסדר, בלי חפיפות.
 * @returns {Array<{ start: number, end: number, original: string, proposed: string }>}
 */
export function findMarkerOccurrences(text, report) {
  const t = str(text)
  const hits = []
  for (const pair of markerTextPairs(report)) {
    for (const marker of markerForms(pair.original, pair.proposed)) {
      let from = 0
      while (from <= t.length) {
        const i = t.indexOf(marker, from)
        if (i === -1) break
        hits.push({ start: i, end: i + marker.length, original: pair.original, proposed: pair.proposed })
        from = i + 1
      }
    }
  }
  hits.sort((a, b) => a.start - b.start || b.end - a.end)
  const out = []
  for (const h of hits) {
    if (out.length && h.start < out[out.length - 1].end) continue
    out.push(h)
  }
  return out
}

function commonSuffix(a, b) {
  let n = 0
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++
  return n
}

function commonPrefix(a, b) {
  let n = 0
  while (n < a.length && n < b.length && a[n] === b[n]) n++
  return n
}

/** כמה מההקשר השמור תואם סביב המופע (תווים צמודים לפני + אחרי) */
export function contextScore(text, hit, report) {
  const t = str(text)
  const before = str(report?.contextBefore)
  const after = str(report?.contextAfter)
  return commonSuffix(t.slice(Math.max(0, hit.start - before.length), hit.start), before)
    + commonPrefix(t.slice(hit.end, hit.end + after.length), after)
}

/**
 * המופע הטוב ביותר של הסימון בטקסט אחד.
 * @param {string} text
 * @param {object} report
 * @returns {null | { start: number, end: number, original: string, proposed: string, count: number }}
 */
export function locateReportMarker(text, report) {
  const hits = findMarkerOccurrences(text, report)
  if (hits.length === 0) return null
  const offset = Number.isFinite(report?.offset) ? report.offset : null
  let best = null
  let bestScore = -1
  let bestDistance = Infinity
  for (const h of hits) {
    const score = contextScore(text, h, report)
    const distance = offset == null ? 0 : Math.abs(h.start - offset)
    if (score > bestScore || (score === bestScore && distance < bestDistance)) {
      best = h
      bestScore = score
      bestDistance = distance
    }
  }
  return { ...best, count: hits.length }
}

/**
 * איתור בשדות העורך: קודם הטור שבו דווח, ואם לא נמצא שם (העמוד פוצל/אוחד מאז) — בשאר הטורים.
 * @param {Array<{ column: 'content'|'right'|'left', value: string }>} fields
 * @param {object} report
 * @returns {null | { column: string, start: number, end: number, original: string, proposed: string, count: number }}
 */
export function locateReportInFields(fields, report) {
  const list = Array.isArray(fields) ? fields : []
  const wanted = report?.column || 'content'
  const ordered = [...list.filter((f) => f.column === wanted), ...list.filter((f) => f.column !== wanted)]
  for (const f of ordered) {
    const hit = locateReportMarker(f.value, report)
    if (hit) return { column: f.column, ...hit }
  }
  return null
}
