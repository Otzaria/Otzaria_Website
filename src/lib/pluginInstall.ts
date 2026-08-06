export function buildDirectPluginInstallUrl(downloadUrl: string, origin: string, token?: string) {
  const absoluteDownloadUrl = /^https?:\/\//i.test(downloadUrl)
    ? downloadUrl
    : new URL(downloadUrl, origin).toString()

  let finalDownloadUrl = absoluteDownloadUrl
  if (token) {
    // הטוקן מצורף גם ל-URL ההורדה (it=): כשהאפליקציה מורידה את הקובץ, השרת
    // מסמן על הטוקן שהבקשה הגיעה — כך הדף מזהה מוקדם מצב "אוצריא לא מותקנת".
    const u = new URL(absoluteDownloadUrl)
    u.searchParams.set('it', token)
    finalDownloadUrl = u.toString()
  }

  let url = `otzaria://plugin/install?url=${encodeURIComponent(finalDownloadUrl)}`
  if (token) {
    // פרמטרים אופציונליים לדיווח תוצאת ההתקנה — גרסאות אפליקציה ישנות מתעלמות מהם.
    // האפליקציה שולחת POST { token, status, error?, appVersion? } לכתובת ה-callback.
    const callback = new URL('/api/plugins/install-result', origin).toString()
    url += `&token=${encodeURIComponent(token)}&callback=${encodeURIComponent(callback)}`
  }
  return url
}
