import { buildDashboardView } from '@/lib/adminDashboard'
import { loadDashboardQueues } from '@/lib/adminDashboardData'
import DashboardQueuesView from './DashboardQueuesView'

/** טוען בשרת את המקומות שממתינים לתפקיד (בתוך Suspense בעמוד) ומצייר אותם */
export default async function DashboardQueuesSection({ role, features }) {
  const now = new Date()
  let results = {}
  try {
    results = await loadDashboardQueues(role, { features, now })
  } catch (error) {
    // כשל כללי (למשל אין חיבור ל-DB בתוך התקציב): הודעה אחת עם "נסה שוב", והעמוד עצמו נשאר
    console.error('admin dashboard: loading queues failed', error)
  }
  return <DashboardQueuesView view={buildDashboardView(role, results, now.getTime(), features)} stamp={now.getTime()} />
}
