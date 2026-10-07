// Shared GitHub loader preserves the 600s cache without calling the live website.
import OfflineUpdateDownloadClient from './OfflineUpdateDownloadClient'
import { getOfflineUpdateRelease } from '@/lib/githubReleases'

export default async function OfflineUpdateDownload({ repoUrl }) {
  let releases = null
  try {
    releases = await getOfflineUpdateRelease()
  } catch (error) {
    console.error('Failed to load offline-update releases:', error)
  }
  return <OfflineUpdateDownloadClient repoUrl={repoUrl} releases={releases} />
}
