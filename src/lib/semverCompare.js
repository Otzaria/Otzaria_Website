// השוואת גרסאות (semver-ish), משותפת בין הלקוח (בדיקה מקדימה בדף העלאת
// תוסף) לשרת (src/lib/pluginManifest.js, שמייצא ומייצא מחדש מכאן).
// קובץ .js טהור (ללא תלות ב-node כמו fs/zlib) כדי שיהיה בר-ייבוא גם
// מרכיב 'use client', וגם ע"י node --test (ראו npm test) בסיומת מפורשת.

function parseVersion(version) {
  const normalized = (version || '').trim()
  const withoutBuild = normalized.split('+')[0]
  const dashIndex = withoutBuild.indexOf('-')
  const corePart = dashIndex === -1 ? withoutBuild : withoutBuild.slice(0, dashIndex)
  const prereleasePart = dashIndex === -1 ? '' : withoutBuild.slice(dashIndex + 1)

  return {
    core: corePart.split('.').map((segment) => Number(segment)),
    prerelease: prereleasePart ? prereleasePart.split('.') : []
  }
}

function comparePrereleaseIdentifiers(a, b) {
  const aIsNumeric = /^\d+$/.test(a)
  const bIsNumeric = /^\d+$/.test(b)

  if (aIsNumeric && bIsNumeric) {
    const aNum = Number(a)
    const bNum = Number(b)
    if (aNum !== bNum) return aNum > bNum ? 1 : -1
    return 0
  }

  if (aIsNumeric !== bIsNumeric) {
    return aIsNumeric ? -1 : 1
  }

  if (a === b) return 0
  return a > b ? 1 : -1
}

/**
 * Compares two version strings (e.g. "1.0", "1.2.3", "1.0.0-beta").
 * Returns 1 if a > b, -1 if a < b, 0 if equal, including prerelease precedence.
 */
export function compareVersions(a, b) {
  const parsedA = parseVersion(a)
  const parsedB = parseVersion(b)
  const coreLength = Math.max(parsedA.core.length, parsedB.core.length)

  for (let i = 0; i < coreLength; i++) {
    const partA = parsedA.core[i] ?? 0
    const partB = parsedB.core[i] ?? 0
    if (partA !== partB) return partA > partB ? 1 : -1
  }

  const aHasPrerelease = parsedA.prerelease.length > 0
  const bHasPrerelease = parsedB.prerelease.length > 0

  if (!aHasPrerelease && !bHasPrerelease) return 0
  if (!aHasPrerelease) return 1
  if (!bHasPrerelease) return -1

  const prereleaseLength = Math.max(parsedA.prerelease.length, parsedB.prerelease.length)
  for (let i = 0; i < prereleaseLength; i++) {
    const identifierA = parsedA.prerelease[i]
    const identifierB = parsedB.prerelease[i]

    if (identifierA === undefined) return -1
    if (identifierB === undefined) return 1

    const result = comparePrereleaseIdentifiers(identifierA, identifierB)
    if (result !== 0) return result
  }

  return 0
}
