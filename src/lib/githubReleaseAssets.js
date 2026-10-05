// בחירת קישורי ההורדה לכל פלטפורמה מתוך נכסי release של otzaria ב-GitHub.
// מודול טהור (בלי רשת) — נקרא מ-src/app/api/github-releases/route.js.

const platformAliases = {
  windows: ['windows', 'win'],
  linux: ['linux'],
  macos: ['macos', 'mac', 'darwin', 'osx'],
  android: ['android']
}

// נכסי ARM64 חייבים הדרה מפורשת מהבחירה ל-x64. GitHub מחזיר את הנכסים בסדר
// אלפביתי, ומקף קודם לנקודה, ולכן נכס ה-ARM מקדים לרוב את זה של x64 ברשימה.
const ARM64_KEYWORDS = ['arm64', 'aarch64']

const otherPlatformKeywords = {
  windows: [...platformAliases.linux, ...platformAliases.macos, ...platformAliases.android],
  linux: [...platformAliases.windows, ...platformAliases.macos, ...platformAliases.android],
  macos: [...platformAliases.windows, ...platformAliases.linux, ...platformAliases.android],
  android: [...platformAliases.windows, ...platformAliases.linux, ...platformAliases.macos]
}

const ASSISTANT_KEYWORD = 'download-assistant'

// חלק של נכס מפוצל (…exe.part-000, …-full-part1.zip) אינו הורדה שמישה בפני עצמו.
const SPLIT_PART_PATTERN = /\.part-\d+$|-part\d+\./

export function isDownloadAssistantAsset(name) {
  return name.toLowerCase().includes(ASSISTANT_KEYWORD)
}

// נכס שמותר להציע כהורדה רגילה: לא המסייע, לא חלק מפוצל, לא המתקין המאונדקס
// (משתמשים מתבלבלים בינו לבין המסייע) ולא חבילות עדכון/מניפסטים פנימיים.
function isRegularDownloadAsset(name) {
  const lower = name.toLowerCase()
  return !isDownloadAssistantAsset(lower) &&
         !SPLIT_PART_PATTERN.test(lower) &&
         !lower.includes('indexed') &&
         !lower.startsWith('otzaria-update-') &&
         !lower.endsWith('.manifest.json')
}

function findAssetWithKeywords(assets, extension, includeKeywords = [], excludeKeywords = []) {
  const lowerExtension = extension.toLowerCase()
  const lowerIncludeKeywords = includeKeywords.map(k => k.toLowerCase())
  const lowerExcludeKeywords = excludeKeywords.map(k => k.toLowerCase())

  return assets.find(a => {
    const name = a.name.toLowerCase()
    return name.endsWith(lowerExtension) &&
           lowerIncludeKeywords.every(k => name.includes(k)) &&
           lowerExcludeKeywords.every(k => !name.includes(k))
  })?.browser_download_url
}

function findPlatformAsset(assets, platform, extension, { full = false, preferPlatformKeyword = true, exclude = [] } = {}) {
  const includeKeywords = full ? ['full'] : []
  const excludeKeywords = full ? [...exclude] : ['full', ...exclude]
  const aliases = platformAliases[platform] || []
  const excludedPlatforms = otherPlatformKeywords[platform] || []

  if (preferPlatformKeyword) {
    for (const alias of aliases) {
      const asset = findAssetWithKeywords(assets, extension, [...includeKeywords, alias], excludeKeywords)
      if (asset) return asset
    }
  }

  return findAssetWithKeywords(assets, extension, includeKeywords, [...excludeKeywords, ...excludedPlatforms])
}

function findArm64Asset(assets, extension, includeKeywords) {
  return ARM64_KEYWORDS
    .map(arch => findAssetWithKeywords(assets, extension, [...includeKeywords, arch]))
    .find(Boolean)
}

/**
 * מחזיר את קישורי ההורדה של פלטפורמה אחת מתוך רשימת נכסי release.
 * @param {string} platform windows | linux | macos | android
 * @param {Array<{name: string, browser_download_url: string}>} allAssets
 */
export function extractPlatformDownloads(platform, allAssets) {
  const assets = allAssets.filter(a => isRegularDownloadAsset(a.name))
  const assistants = allAssets.filter(a => isDownloadAssistantAsset(a.name))

  switch (platform) {
    case 'windows':
      return {
        assistant: findAssetWithKeywords(assistants, '.exe', ['windows']),
        exe: findAssetWithKeywords(assets, '.exe', ['windows'], ['silent', 'full', ...ARM64_KEYWORDS]) || findAssetWithKeywords(assets, '.exe', ['win'], ['silent', 'full', ...ARM64_KEYWORDS]),
        exeArm64: findAssetWithKeywords(assets, '.exe', ['windows', 'arm64'], ['silent', 'full']) || findAssetWithKeywords(assets, '.exe', ['win', 'aarch64'], ['silent', 'full']),
        msix: findPlatformAsset(assets, 'windows', '.msix', { exclude: ARM64_KEYWORDS }),
        zip: findPlatformAsset(assets, 'windows', '.zip', { exclude: ARM64_KEYWORDS }),
        zipArm64: findAssetWithKeywords(assets, '.zip', ['windows', 'arm64'], ['full']),
        exeSilent: findAssetWithKeywords(assets, '.exe', ['windows', 'silent'], ['full', ...ARM64_KEYWORDS]) || findAssetWithKeywords(assets, '.exe', ['win', 'silent'], ['full', ...ARM64_KEYWORDS]),
        exeFull: findAssetWithKeywords(assets, '.exe', ['windows', 'full'], ['silent', ...ARM64_KEYWORDS]) || findAssetWithKeywords(assets, '.exe', ['win', 'full'], ['silent', ...ARM64_KEYWORDS])
      }
    case 'linux':
      return {
        assistantX64: findAssetWithKeywords(assistants, '.tar.gz', ['linux', 'x64']),
        assistantArm64: findArm64Asset(assistants, '.tar.gz', ['linux']),
        deb: findPlatformAsset(assets, 'linux', '.deb', { exclude: ARM64_KEYWORDS }),
        rpm: findPlatformAsset(assets, 'linux', '.rpm', { exclude: ARM64_KEYWORDS }),
        appimage: findPlatformAsset(assets, 'linux', '.AppImage', { preferPlatformKeyword: false, exclude: ARM64_KEYWORDS }),
        tarFull: findAssetWithKeywords(assets, '.tar.gz', ['full'], ['silent', ...ARM64_KEYWORDS])
      }
    case 'macos':
      return {
        assistant: findAssetWithKeywords(assistants, '.zip', ['macos']),
        dmg: findPlatformAsset(assets, 'macos', '.dmg'),
        zip: findPlatformAsset(assets, 'macos', '.zip'),
        zipFull: findAssetWithKeywords(assets, '.zip', ['macos', 'full'], ['silent']) || findAssetWithKeywords(assets, '.zip', ['mac', 'full'], ['silent'])
      }
    case 'android':
      return {
        apk: findPlatformAsset(assets, 'android', '.apk', { preferPlatformKeyword: false }),
        zipFull: findAssetWithKeywords(assets, '.zip', ['android', 'full'], ['silent'])
      }
    default:
      return {}
  }
}

export function hasPlatformAssets(data) {
  return Object.values(data).some(v => v)
}
