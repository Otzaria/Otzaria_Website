// נתוני ה-release העדכני של האפליקציה (קישורי הורדה + גרסה), למסך הפתיחה ולאזור ההורדה.
//
// cache של React: בתוך רינדור אחד של הדף (HeroStatsLoader ו-DownloadSection) השליפה רצה פעם
// אחת בלבד, גם בלי לסמוך על ה-memoization של fetch. מעבר לרינדור — ה-Data Cache של
// fetch (600 שניות, ראו src/lib/githubReleases.js) — כך ש-GitHub לא נקרא בכל ביקור.
import { cache } from 'react'
import { getAppDownloads } from '@/lib/githubReleases'

type PlatformLinks = Record<string, string | undefined>
export type Downloads = {
  version?: string
  versions?: Record<string, string>
  windows?: PlatformLinks
  linux?: PlatformLinks
  android?: PlatformLinks
  ios?: PlatformLinks
  macos?: PlatformLinks
}

export const getLatestDownloads = cache(async (): Promise<Downloads | null> => {
  try {
    return await getAppDownloads()
  } catch (error) {
    console.error('Failed to load latest downloads:', error)
    return null
  }
})
