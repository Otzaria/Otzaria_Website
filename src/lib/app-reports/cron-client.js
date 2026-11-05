/** קריאת ה-cron המקומי מהשרת עצמו; סודות נלקחים מסביבת השרת ואינם מגיעים ל-GitHub Actions. */
export async function runScheduledAppReportsSync({ env = process.env, fetchImpl = fetch } = {}) {
  if (!env.CRON_SECRET) throw new Error('CRON_SECRET לא הוגדר בשרת');
  const port = env.PORT || '3000';
  if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error('PORT לא תקין');
  const response = await fetchImpl(`http://127.0.0.1:${port}/api/cron/app-reports-sync`, {
    method: 'POST', headers: { authorization: `Bearer ${env.CRON_SECRET}` },
    signal: AbortSignal.timeout(12 * 60 * 1000), redirect: 'error',
  });
  if (!response.ok) throw new Error(`סנכרון הדיווחים החזיר HTTP ${response.status}`);
  const result = await response.json();
  if (!result.success || !result.githubConfigured || !result.cleanup || result.cleanup.errors > 0) {
    throw new Error(`סנכרון הדיווחים לא הושלם; שגיאות ניקוי: ${result.cleanup?.errors ?? 'חסרה תוצאה'}`);
  }
  return result;
}
