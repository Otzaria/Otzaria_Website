// נתונים קטנים לבדיקות מסך הניהול של צורת הדף (לא בשימוש בקוד האתר).

// מודל קטן: גוש גמרא עם 3 שורות של 3 מילים (ref R, wi 0–8)
export function fixtureModel() {
  const w = (i) => ({ t: `מ${i}`, ref: 'R', wi: i })
  return {
    blocks: [
      {
        id: 'g',
        kind: 'g',
        label: 'גמרא',
        lines: [
          { i: 0, words: [w(0), w(1), w(2)], print: ['מ0', 'מ1'], ours: [0.1, 0.1, 0.5, 0.02], scan: [0.1, 0.1, 0.5, 0.02] },
          { i: 1, words: [w(3), w(4), w(5)], print: ['מ2', 'מ3', 'מ4', 'מ5'], ours: [0.1, 0.12, 0.5, 0.02], scan: [0.1, 0.12, 0.5, 0.02] },
          { i: 2, words: [w(6), w(7), w(8)], print: [], ours: [0.1, 0.14, 0.5, 0.02], scan: null },
        ],
      },
    ],
  }
}

// שרת העלאות מדומה (fetch): POST uploads, PUT chunks, POST complete/retry, GET uploads/[id].
// failures: {n: מספר כישלונות לפני הצלחה | 'net'}; existing: העלאות קיימות לפי מזהה;
// after: רצף מצבים שה-GET מחזיר אחרי "סיום" (למעקב העיבוד).
export function makeUploadServer({ chunkSize = 10, failures = {}, existing = {}, after = [] } = {}) {
  const API = '/api/admin/tzurat-hadaf'
  const uploads = JSON.parse(JSON.stringify(existing))
  const puts = []
  const tries = {}
  const calls = []
  let seq = 0
  const reply = (status, json) => ({ ok: status < 400, status, json: async () => json })
  const handler = async (url, init = {}) => {
    const method = init.method || 'GET'
    calls.push(`${method} ${url}`)
    if (url === `${API}/uploads` && method === 'POST') {
      const b = JSON.parse(init.body)
      const id = `u${++seq}`
      uploads[id] = { id, name: b.name, size: b.size, chunkSize, chunks: Math.ceil(b.size / chunkSize), received: [], status: 'uploading', progress: {} }
      return reply(200, { id, chunkSize, chunks: uploads[id].chunks })
    }
    if (url === `${API}/uploads` && method === 'GET') return reply(200, { uploads: Object.values(uploads) })
    let m = url.match(/\/uploads\/(\w+)\/chunks\/(\d+)$/)
    if (m && method === 'PUT') {
      const n = Number(m[2])
      tries[n] = (tries[n] || 0) + 1
      const f = failures[n]
      if (f === 'net') throw new TypeError('Failed to fetch')
      if (typeof f === 'number' && tries[n] <= f) return reply(503, { error: 'עומס' })
      puts.push({ n, size: init.body.size })
      const u = uploads[m[1]]
      if (!u.received.includes(n)) u.received.push(n)
      return reply(200, { received: u.received })
    }
    m = url.match(/\/uploads\/(\w+)\/(complete|retry)$/)
    if (m && method === 'POST') {
      uploads[m[1]].status = 'queued'
      return reply(202, { upload: { ...uploads[m[1]] } })
    }
    m = url.match(/\/uploads\/(\w+)$/)
    if (m && method === 'GET') {
      const u = uploads[m[1]]
      if (!u) return reply(404, { error: 'לא נמצא' })
      if (after.length && u.status !== 'uploading') Object.assign(u, after.shift())
      return reply(200, { upload: { ...u } })
    }
    if (url === `${API}/batches`) return reply(200, { batches: [] })
    return reply(404, { error: `לא צפוי: ${method} ${url}` })
  }
  return { handler, puts, tries, uploads, calls }
}
