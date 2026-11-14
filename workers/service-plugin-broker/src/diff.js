import { neutralizeContentLine } from './util.js'

/**
 * diff מאוחד בין שני טקסטים (Myers, עם תקרת עריכות). מחזיר null כשהשינוי גדול מהתקרה.
 * @returns {string|null}
 */
export function unifiedDiff(oldText, newText, { context = 3, maxEdits = 2000, oldLabel = 'a', newLabel = 'b' } = {}) {
  const a = splitLines(oldText)
  const b = splitLines(newText)
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--
    endB--
  }
  const ops = myers(a.slice(start, endA), b.slice(start, endB), maxEdits)
  if (!ops) return null
  const full = []
  for (let i = 0; i < start; i++) full.push({ t: ' ', line: a[i], ai: i, bi: i })
  let ai = start
  let bi = start
  for (const op of ops) {
    if (op === ' ') full.push({ t: ' ', line: a[ai], ai: ai++, bi: bi++ })
    else if (op === '-') full.push({ t: '-', line: a[ai], ai: ai++, bi })
    else full.push({ t: '+', line: b[bi], ai, bi: bi++ })
  }
  for (let i = 0; i < a.length - endA; i++) full.push({ t: ' ', line: a[ai], ai: ai++, bi: bi++ })
  return formatHunks(full, context, oldLabel, newLabel)
}

function splitLines(text) {
  if (!text) return []
  const lines = text.split('\n')
  if (lines[lines.length - 1] === '') lines.pop()
  return lines
}

function myers(a, b, maxEdits) {
  const n = a.length
  const m = b.length
  const max = n + m
  if (max === 0) return []
  const limit = Math.min(max, maxEdits)
  const offset = limit + 1
  const v = new Int32Array(2 * limit + 3)
  const trace = []
  for (let d = 0; d <= limit; d++) {
    trace.push(v.slice())
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]) ? v[offset + k + 1] : v[offset + k - 1] + 1
      let y = x - k
      while (x < n && y < m && a[x] === b[y]) {
        x++
        y++
      }
      v[offset + k] = x
      if (x >= n && y >= m) return backtrack(trace, d, n, m, offset)
    }
  }
  return null
}

function backtrack(trace, dFinal, n, m, offset) {
  const ops = []
  let x = n
  let y = m
  for (let d = dFinal; d > 0; d--) {
    const v = trace[d]
    const k = x - y
    const prevK = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]) ? k + 1 : k - 1
    const prevX = v[offset + prevK]
    const prevY = prevX - prevK
    while (x > prevX && y > prevY) {
      ops.push(' ')
      x--
      y--
    }
    ops.push(x === prevX ? '+' : '-')
    x = prevX
    y = prevY
  }
  while (x > 0 && y > 0) {
    ops.push(' ')
    x--
    y--
  }
  return ops.reverse()
}

function formatHunks(full, context, oldLabel, newLabel) {
  const changed = []
  full.forEach((e, i) => {
    if (e.t !== ' ') changed.push(i)
  })
  if (!changed.length) return ''
  const out = [`--- ${oldLabel}`, `+++ ${newLabel}`]
  let i = 0
  while (i < changed.length) {
    let from = Math.max(0, changed[i] - context)
    let to = Math.min(full.length - 1, changed[i] + context)
    let j = i + 1
    while (j < changed.length && changed[j] - context <= to + 1) {
      to = Math.min(full.length - 1, changed[j] + context)
      j++
    }
    const slice = full.slice(from, to + 1)
    const aStart = slice[0].ai + 1
    const bStart = slice[0].bi + 1
    const aLen = slice.filter((e) => e.t !== '+').length
    const bLen = slice.filter((e) => e.t !== '-').length
    out.push(`@@ -${aLen ? aStart : aStart - 1},${aLen} +${bLen ? bStart : bStart - 1},${bLen} @@`)
    // רווח אחרי הסימן: שורת תוכן אינה יכולה להתחזות לכותרת ---/+++/@@; שורות CRLF מוצגות בלי \r.
    for (const e of slice) out.push(`${e.t} ${neutralizeContentLine(e.line.replace(/\r$/, ''))}`)
    from = to + 1
    i = j
  }
  return out.join('\n') + '\n'
}
