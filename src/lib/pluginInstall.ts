export function buildDirectPluginInstallUrl(downloadUrl: string, origin: string) {
  const absoluteDownloadUrl = /^https?:\/\//i.test(downloadUrl)
    ? downloadUrl
    : new URL(downloadUrl, origin).toString()

  return `otzaria://plugin/install?url=${encodeURIComponent(absoluteDownloadUrl)}`
}
