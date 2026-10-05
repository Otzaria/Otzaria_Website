/**
 * בדיקות בחירת נכסי ההורדה מ-release של GitHub. הרצה: npm run test:node
 * רשימות הנכסים הן של releases אמיתיים, בסדר שה-API של GitHub מחזיר אותן.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractPlatformDownloads, hasPlatformAssets } from './githubReleaseAssets.js'

const asAssets = (names) => names.map(name => ({ name, browser_download_url: `url:${name}` }))

const RELEASE_0_9_98 = asAssets([
  'app-release.apk',
  'assemble_split_asset.ps1',
  'assemble_split_asset.sh',
  'otzaria-0.9.98+99800-99800.aarch64.rpm',
  'otzaria-0.9.98+99800-99800.x86_64.rpm',
  'otzaria-0.9.98+99800-linux-arm64.deb',
  'otzaria-0.9.98+99800-linux.deb',
  'otzaria-0.9.98-library-full-indexed.tar.zst.manifest.json',
  'otzaria-0.9.98-library-full-indexed.tar.zst.part-000',
  'otzaria-0.9.98-library-full-indexed.tar.zst.part-001',
  'otzaria-0.9.98-library-full-indexed.tar.zst.part-002',
  'otzaria-0.9.98-windows-full-indexed.exe',
  'otzaria-0.9.98-windows-full.exe.manifest.json',
  'otzaria-0.9.98-windows-full.exe.part-000',
  'otzaria-0.9.98-windows-full.exe.part-001',
  'otzaria-0.9.98-windows.exe',
  'otzaria-0.9.98-windows_arm64-full.exe.manifest.json',
  'otzaria-0.9.98-windows_arm64-full.exe.part-000',
  'otzaria-0.9.98-windows_arm64-full.exe.part-001',
  'otzaria-0.9.98-windows_arm64.exe',
  'otzaria-android-full-part1.zip',
  'otzaria-android-full-part2.zip',
  'otzaria-app-files-linux-arm64.json',
  'otzaria-app-files-linux-x64.json',
  'otzaria-app-files-macos-universal.json',
  'otzaria-app-files-windows-arm64.json',
  'otzaria-app-files-windows-x64.json',
  'Otzaria-Download-Assistant-linux-arm64.tar.gz',
  'Otzaria-Download-Assistant-linux-x64.tar.gz',
  'Otzaria-Download-Assistant-macos.zip',
  'Otzaria-Download-Assistant-windows.exe',
  'otzaria-linux-full-arm64.tar.zst.manifest.json',
  'otzaria-linux-full-arm64.tar.zst.part-000',
  'otzaria-linux-full-arm64.tar.zst.part-001',
  'otzaria-linux-full.tar.zst.manifest.json',
  'otzaria-linux-full.tar.zst.part-000',
  'otzaria-linux-full.tar.zst.part-001',
  'otzaria-macos-full.tar.zst.manifest.json',
  'otzaria-macos-full.tar.zst.part-000',
  'otzaria-macos-full.tar.zst.part-001',
  'otzaria-macos.dmg',
  'otzaria-macos.zip',
  'otzaria-release-manifest.json',
  'otzaria-windows.zip',
  'otzaria-windows_arm64.zip'
])

const RELEASE_0_9_97 = asAssets([
  'app-release.apk',
  'assemble_split_asset.ps1',
  'assemble_split_asset.sh',
  'otzaria-0.9.97+99702-99702.aarch64.rpm',
  'otzaria-0.9.97+99702-99702.x86_64.rpm',
  'otzaria-0.9.97+99702-linux-arm64.deb',
  'otzaria-0.9.97+99702-linux.deb',
  'otzaria-0.9.97-library-full-indexed.tar.zst.manifest.json',
  'otzaria-0.9.97-library-full-indexed.tar.zst.part-000',
  'otzaria-0.9.97-library-full-indexed.tar.zst.part-001',
  'otzaria-0.9.97-library-full-indexed.tar.zst.part-002',
  'otzaria-0.9.97-windows-full-indexed.exe',
  'otzaria-0.9.97-windows-full.exe',
  'otzaria-0.9.97-windows.exe',
  'otzaria-0.9.97-windows_arm64.exe',
  'otzaria-android-full.zip',
  'otzaria-linux-full-arm64.tar.zst',
  'otzaria-linux-full.tar.zst',
  'otzaria-macos-full.tar.zst',
  'otzaria-macos.dmg',
  'otzaria-macos.zip',
  'otzaria-windows.zip',
  'otzaria-windows_arm64.zip'
])

const pick = (platform, assets) =>
  Object.fromEntries(Object.entries(extractPlatformDownloads(platform, assets)).filter(([, v]) => v))

test('0.9.98 Windows: המסייע בשדה assistant, והמתקין המאונדקס והמפוצל אינם נבחרים', () => {
  assert.deepEqual(pick('windows', RELEASE_0_9_98), {
    assistant: 'url:Otzaria-Download-Assistant-windows.exe',
    exe: 'url:otzaria-0.9.98-windows.exe',
    exeArm64: 'url:otzaria-0.9.98-windows_arm64.exe',
    zip: 'url:otzaria-windows.zip',
    zipArm64: 'url:otzaria-windows_arm64.zip'
  })
})

test('0.9.98 macOS: zip הוא של התוכנה ולא של המסייע', () => {
  assert.deepEqual(pick('macos', RELEASE_0_9_98), {
    assistant: 'url:Otzaria-Download-Assistant-macos.zip',
    dmg: 'url:otzaria-macos.dmg',
    zip: 'url:otzaria-macos.zip'
  })
})

test('0.9.98 Linux: מסייע לכל ארכיטקטורה, ו-DEB/RPM של x64 ולא של ARM', () => {
  assert.deepEqual(pick('linux', RELEASE_0_9_98), {
    assistantX64: 'url:Otzaria-Download-Assistant-linux-x64.tar.gz',
    assistantArm64: 'url:Otzaria-Download-Assistant-linux-arm64.tar.gz',
    deb: 'url:otzaria-0.9.98+99800-linux.deb',
    rpm: 'url:otzaria-0.9.98+99800-99800.x86_64.rpm'
  })
})

test('0.9.98 Android: חבילה מלאה מפוצלת אינה מוצעת', () => {
  assert.deepEqual(pick('android', RELEASE_0_9_98), { apk: 'url:app-release.apk' })
})

test('0.9.97 (ללא מסייע): אין שדות מסייע, וה-Full הלא-מפוצל נשמר', () => {
  assert.deepEqual(pick('windows', RELEASE_0_9_97), {
    exe: 'url:otzaria-0.9.97-windows.exe',
    exeArm64: 'url:otzaria-0.9.97-windows_arm64.exe',
    zip: 'url:otzaria-windows.zip',
    zipArm64: 'url:otzaria-windows_arm64.zip',
    exeFull: 'url:otzaria-0.9.97-windows-full.exe'
  })
  assert.deepEqual(pick('macos', RELEASE_0_9_97), {
    dmg: 'url:otzaria-macos.dmg',
    zip: 'url:otzaria-macos.zip'
  })
  assert.deepEqual(pick('linux', RELEASE_0_9_97), {
    deb: 'url:otzaria-0.9.97+99702-linux.deb',
    rpm: 'url:otzaria-0.9.97+99702-99702.x86_64.rpm'
  })
  assert.deepEqual(pick('android', RELEASE_0_9_97), {
    apk: 'url:app-release.apk',
    zipFull: 'url:otzaria-android-full.zip'
  })
})

test('Linux: AppImage וחבילה מלאה של ARM64 אינם נבחרים ל-x64, גם כשהם קודמים ברשימה', () => {
  const assets = asAssets([
    'otzaria-linux-arm64.AppImage',
    'otzaria-linux-full-arm64.tar.gz',
    'otzaria-linux-full.tar.gz',
    'otzaria-linux.AppImage'
  ])
  assert.deepEqual(pick('linux', assets), {
    appimage: 'url:otzaria-linux.AppImage',
    tarFull: 'url:otzaria-linux-full.tar.gz'
  })
})

test('נכס מסוג otzaria-update- או indexed אינו נבחר באף בורר', () => {
  const assets = asAssets([
    'otzaria-update-0.9.97-to-0.9.98-windows.exe',
    'otzaria-update-0.9.97-to-0.9.98-macos.zip',
    'otzaria-0.9.98-windows-full-indexed.exe'
  ])
  for (const platform of ['windows', 'linux', 'macos', 'android']) {
    assert.equal(hasPlatformAssets(extractPlatformDownloads(platform, assets)), false, platform)
  }
})
