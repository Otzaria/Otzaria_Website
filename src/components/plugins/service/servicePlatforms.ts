// מערכות, מעבדים וסיומות מתקינים של תוסף שירות — המזהים זהים ל-OS_IDS / ARCH_IDS / INSTALLER_EXTENSIONS
// ב-src/lib/servicePlugins/policy.js (השרת הוא הבודק המחייב; כאן — לתצוגה ולבדיקה מקדימה).

export const SERVICE_OS_IDS = ['windows', 'macos', 'linux', 'android'] as const
export const SERVICE_ARCH_IDS = ['x64', 'arm64', 'x86', 'universal'] as const

export type ServiceOs = (typeof SERVICE_OS_IDS)[number]
export type ServiceArch = (typeof SERVICE_ARCH_IDS)[number]

export const OS_LABELS: Record<ServiceOs, string> = {
  windows: 'Windows',
  macos: 'macOS',
  linux: 'Linux',
  android: 'Android'
}

/** גליף לכל מערכת (קיים בגופן האייקונים) */
export const OS_ICONS: Record<ServiceOs, string> = {
  windows: 'desktop_windows',
  macos: 'laptop_mac',
  linux: 'terminal',
  android: 'android'
}

export const ARCH_LABELS: Record<ServiceArch, string> = {
  x64: 'x64 (Intel / AMD)',
  arm64: 'ARM64',
  x86: 'x86 (32 ביט)',
  universal: 'אוניברסלי'
}

export const INSTALLER_EXTENSIONS: Record<ServiceOs, string[]> = {
  windows: ['.exe', '.msi', '.zip'],
  macos: ['.dmg', '.pkg', '.zip'],
  linux: ['.appimage', '.deb', '.rpm', '.zip'],
  android: ['.apk']
}

export const INSTALLER_ACCEPT = '.exe,.msi,.zip,.dmg,.pkg,.appimage,.AppImage,.deb,.rpm,.apk'

export function isServiceOs(value: unknown): value is ServiceOs {
  return typeof value === 'string' && (SERVICE_OS_IDS as readonly string[]).includes(value)
}

export function isServiceArch(value: unknown): value is ServiceArch {
  return typeof value === 'string' && (SERVICE_ARCH_IDS as readonly string[]).includes(value)
}

export function osLabel(os: string): string {
  return isServiceOs(os) ? OS_LABELS[os] : os
}

export function archLabel(arch: string): string {
  return isServiceArch(arch) ? ARCH_LABELS[arch] : arch
}

/** האם שם הקובץ בסיומת שמותרת למערכת (בלי תלות ברישיות — AppImage) */
export function hasAllowedExtension(fileName: string, os: ServiceOs): boolean {
  const lower = fileName.toLowerCase()
  return INSTALLER_EXTENSIONS[os].some((ext) => lower.endsWith(ext))
}
