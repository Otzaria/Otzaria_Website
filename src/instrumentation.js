// רץ פעם אחת בעליית השרת (Next instrumentation hook).
export async function register() {
  // רק בשרת Node (next start). התנאי נקבע בזמן build, כך שב-Edge הענף (וייבוא
  // node:http) נמחק לגמרי — ל-Edge אין http.ServerResponse ואין בו צורך.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // דחיסת gzip לתשובות JSON של ה-API — ראו הסבר מלא ב-src/lib/responseCompression.js.
    const { ServerResponse } = await import('node:http')
    const { installContentTypeNormalizer } = await import('@/lib/responseCompression')
    installContentTypeNormalizer(ServerResponse.prototype)
  }
}
