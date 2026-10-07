// Shared GitHub loader preserves the 600s cache without calling the live website.
import DownloadSectionClient from './DownloadSectionClient'
import { getAppDownloads } from '@/lib/githubReleases'

type PlatformLinks = Record<string, string | undefined>
type Downloads = {
  version?: string
  versions?: Record<string, string>
  windows?: PlatformLinks
  linux?: PlatformLinks
  android?: PlatformLinks
  ios?: PlatformLinks
  macos?: PlatformLinks
}

async function getStableDownloads(): Promise<Downloads | null> {
  try {
    return await getAppDownloads('stable')
  } catch (error) {
    console.error('Failed to load stable downloads:', error)
    return null
  }
}

export default async function DownloadSection() {
  const stableDownloads = await getStableDownloads()
  return <DownloadSectionClient stableDownloads={stableDownloads} />
}
