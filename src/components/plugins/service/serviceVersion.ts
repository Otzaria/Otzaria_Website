// גרסאות X.Y.Z וטווח תאימות של תוסף שירות — אותם כללים כמו src/lib/servicePlugins/policy.js בשרת.
// עותק בצד הלקוח כי policy.js מייבא מודולי node (crypto) ואינו בר-ייבוא מרכיב לקוח.

export type ServiceRange = { min: string; max: string | null }

const VERSION_PART = /^(0|[1-9]\d{0,5})$/

/** 'X.Y.Z' → [x, y, z]; ספרות בלבד, בלי אפסים מובילים, כל רכיב עד 999999. אחרת null */
export function parseVersion(value: unknown): [number, number, number] | null {
  if (typeof value !== 'string') return null
  const parts = value.split('.')
  if (parts.length !== 3 || !parts.every((part) => VERSION_PART.test(part))) return null
  return [Number(parts[0]), Number(parts[1]), Number(parts[2])]
}

export function isValidVersion(value: unknown): value is string {
  return parseVersion(value) !== null
}

/** -1 / 0 / 1; גרסה לא תקינה — null */
export function compareVersions(a: string, b: string): -1 | 0 | 1 | null {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  if (!pa || !pb) return null
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1
  }
  return 0
}

export function isValidRange(range: ServiceRange | null | undefined): boolean {
  if (!range || !isValidVersion(range.min)) return false
  if (range.max === null) return true
  return isValidVersion(range.max) && (compareVersions(range.min, range.max) ?? 1) <= 0
}

/** max null — ללא תקרה */
export function versionInRange(version: string, range: ServiceRange | null | undefined): boolean {
  if (!isValidVersion(version) || !range || !isValidRange(range)) return false
  if ((compareVersions(version, range.min) ?? -1) < 0) return false
  return range.max === null || (compareVersions(version, range.max) ?? 1) <= 0
}

export function formatRange(range: ServiceRange | null | undefined): string {
  if (!range) return ''
  return range.max ? `${range.min}–${range.max}` : `${range.min} ומעלה`
}
