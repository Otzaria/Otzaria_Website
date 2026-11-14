// הבדל ברמת-מילה בין מה שהמודל קרא למה שהמתנדב שמר (LCS על מילים) — טהור.
// מחזיר [{t, op}] כש-op הוא 'same' · 'del' (רק אצל המודל) · 'ins' (רק אצל המתנדב).

const words = (s) => String(s || '').split(/\s+/).filter(Boolean)

// מעל זה — בלי LCS (O(n·m)); מציגים "הכול נמחק / הכול נוסף"
const MAX_WORDS = 400

export function wordDiff(a, b) {
  const A = words(a)
  const B = words(b)
  const n = A.length
  const m = B.length
  if (n > MAX_WORDS || m > MAX_WORDS) return [...A.map((t) => ({ t, op: 'del' })), ...B.map((t) => ({ t, op: 'ins' }))]
  const L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1])
  }
  const out = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      out.push({ t: A[i], op: 'same' })
      i++
      j++
    } else if (L[i + 1][j] >= L[i][j + 1]) out.push({ t: A[i++], op: 'del' })
    else out.push({ t: B[j++], op: 'ins' })
  }
  while (i < n) out.push({ t: A[i++], op: 'del' })
  while (j < m) out.push({ t: B[j++], op: 'ins' })
  return out
}

// כמה מילים שונו (נמחקו + נוספו) — לתווית "N מילים שונו"
export const changedWords = (diff) => diff.filter((d) => d.op !== 'same').length
