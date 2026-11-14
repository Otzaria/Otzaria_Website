// Shared GitHub loader preserves the 600s cache without calling the live website.
// השליפה עצמה משותפת לשורת המספרים שבמסך הפתיחה (HeroStatsLoader) — ראו latestDownloads.ts.
import DownloadSectionClient from './DownloadSectionClient'
import { getLatestDownloads } from './latestDownloads'

export default async function DownloadSection() {
  const latestDownloads = await getLatestDownloads()
  return <DownloadSectionClient latestDownloads={latestDownloads} />
}
