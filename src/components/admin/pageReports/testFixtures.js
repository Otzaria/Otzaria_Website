// נתוני דוגמה לטסטים של "דיווחים על עמודים" — בצורת התשובה שבחוזה (GET /api/admin/page-reports).

export const errorReport = (over = {}) => ({
  _id: 'r1',
  kind: 'book_error',
  bookPath: 'bereshit-raba',
  bookName: 'בראשית רבה',
  pageNumber: 12,
  userName: 'משה כהן',
  column: 'content',
  original: 'בראשת',
  proposed: 'בראשית',
  contextBefore: 'ויאמר ',
  contextAfter: ' ברא אלהים',
  message: 'בדקתי בדפוס אחר',
  status: 'pending',
  resolution: null,
  appliedToText: null,
  appliedAt: null,
  createdAt: '2026-11-10T10:00:00.000Z',
  pageStatus: 'completed',
  imageUrl: '/uploads/books/bereshit-raba/page-12.jpg',
  markerPresent: true,
  canApply: true,
  ...over,
})

export const messageReport = (over = {}) => ({
  _id: 'm1',
  kind: 'message',
  bookPath: 'bereshit-raba',
  bookName: 'בראשית רבה',
  pageNumber: 7,
  userName: 'יעקב לוי',
  message: 'חסרה שורה בסוף העמוד',
  status: 'pending',
  resolution: null,
  createdAt: '2026-11-11T10:00:00.000Z',
  pageStatus: 'available',
  imageUrl: null,
  ...over,
})

export const COUNTS = { book_error: { pending: 2, approved: 5, rejected: 1 }, message: { pending: 1, handled: 3 } }

export const json = (data, { status = 200 } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  type: 'basic',
  redirected: false,
  headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => data,
})
