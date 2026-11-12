import { buildGeneralStats } from '@/lib/adminDashboard'
import { loadGeneralStats } from '@/lib/adminDashboardData'
import GeneralStatsView from './GeneralStatsView'

/** טוען בשרת את המספרים הכלליים (Suspense נפרד מהמקומות שממתינים — לא מעכב אותם) */
export default async function GeneralStatsSection({ role, showBooksLink }) {
  let data = {}
  let failed = false
  try {
    data = await loadGeneralStats(role)
  } catch (error) {
    console.error('admin dashboard: loading general stats failed', error)
    failed = true
  }
  return <GeneralStatsView stats={buildGeneralStats(role, data)} failed={failed} showBooksLink={showBooksLink} />
}
