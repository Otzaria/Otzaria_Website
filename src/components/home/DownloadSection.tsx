// Shared GitHub loader preserves the 600s cache without calling the live website.
// השליפה עצמה משותפת לשורת המספרים שבמסך הפתיחה (HeroStatsLoader) — ראו stableDownloads.ts.
import DownloadSectionClient from './DownloadSectionClient'
import { getStableDownloads } from './stableDownloads'

export default async function DownloadSection() {
  const stableDownloads = await getStableDownloads()
  return <DownloadSectionClient stableDownloads={stableDownloads} />
}
