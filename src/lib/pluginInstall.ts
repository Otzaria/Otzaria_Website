export function buildDirectPluginInstallUrl(downloadUrl: string, origin: string, token?: string) {
  const absoluteDownloadUrl = /^https?:\/\//i.test(downloadUrl)
    ? downloadUrl
    : new URL(downloadUrl, origin).toString()

  let url = `otzaria://plugin/install?url=${encodeURIComponent(absoluteDownloadUrl)}`
  if (token) {
    // פרמטרים אופציונליים לדיווח תוצאת ההתקנה — גרסאות אפליקציה ישנות מתעלמות מהם.
    // האפליקציה שולחת POST { token, status, error?, appVersion? } לכתובת ה-callback.
    const callback = new URL('/api/plugins/install-result', origin).toString()
    url += `&token=${encodeURIComponent(token)}&callback=${encodeURIComponent(callback)}`
  }
  return url
}
