// לוגיקה טהורה של חלון "אפשרויות הורדה" לתוסף שירות: מבנה GET /api/service-plugins/<id>, זיהוי
// השירות המקומי (classifyDetection) ובחירת מערכת. טסט: serviceDownloadLogic.test.ts.
import { isServiceOs, SERVICE_OS_IDS, type ServiceOs } from './servicePlatforms'
import { isValidVersion, versionInRange, type ServiceRange } from './serviceVersion'

export interface ServicePlatformFile {
  os: string
  arch: string
  minOs: string
  port: number
  name: string
  size: number
  sha256: string
  downloadUrl: string
}

export interface ServiceRelease {
  reviewId: string
  serviceVersion: string
  serviceRange: ServiceRange
  pluginVersion: string
  uninstall: string
  pluginDownloadUrl?: string
  platforms: ServicePlatformFile[]
}

export interface PublicServiceInfo {
  pluginId: string
  pluginUid: string
  name: string
  slug: string
  detection: { path: string; protocolVersion: number; serviceId: string }
  current: ServiceRelease | null
  previous: ServiceRelease | null
}

export type DetectionStatus = 'compatible' | 'incompatible' | 'unknown'

export interface DetectionResult {
  status: DetectionStatus
  /** הגרסה שהשירות דיווח (רק כשהזיהוי הצליח) */
  version: string | null
}

/** גודל מרבי של תשובת הזיהוי (מדריך המפתח: עד 4 KiB) */
export const DETECTION_MAX_BYTES = 4096

const UNKNOWN: DetectionResult = { status: 'unknown', version: null }

/**
 * תשובת /.well-known/otzaria-service → תואם / לא תואם / לא ידוע. כל תשובה שאינה בדיוק לפי החוזה
 * (פרוטוקול אחר, serviceId של שירות אחר, גרסה לא תקינה) — "לא ידוע", לעולם לא "לא מותקן".
 */
export function classifyDetection(
  response: unknown,
  { serviceId, range, protocolVersion = 1 }: { serviceId: string; range: ServiceRange | null | undefined; protocolVersion?: number }
): DetectionResult {
  if (!response || typeof response !== 'object' || Array.isArray(response)) return UNKNOWN
  const body = response as Record<string, unknown>
  if (body.protocolVersion !== protocolVersion) return UNKNOWN
  if (typeof body.serviceId !== 'string' || body.serviceId !== serviceId) return UNKNOWN
  if (!isValidVersion(body.serviceVersion)) return UNKNOWN
  const version = body.serviceVersion
  return { status: versionInRange(version, range) ? 'compatible' : 'incompatible', version }
}

/** כמה תשובות (פורט לכל מערכת) → אחת: תואם גובר, אחריו לא-תואם, אחרת לא ידוע */
export function mergeDetections(results: DetectionResult[]): DetectionResult {
  return results.find((r) => r.status === 'compatible')
    ?? results.find((r) => r.status === 'incompatible')
    ?? UNKNOWN
}

function isValidPort(port: unknown): port is number {
  return Number.isInteger(port) && (port as number) >= 1024 && (port as number) <= 65535
}

/** הפורטים לבדיקה — רק של המערכת שמוצגת (os), ובלי מערכת ידועה — של כל המערכות; ללא כפילויות */
export function detectionPorts(platforms: Pick<ServicePlatformFile, 'os' | 'port'>[], os: string | null): number[] {
  const ports = platforms.filter((p) => !os || p.os === os).map((p) => p.port).filter(isValidPort)
  return [...new Set(ports)]
}

/** המערכות שיש להן מתקין, בסדר הקבוע */
export function supportedOsList(platforms: Pick<ServicePlatformFile, 'os'>[]): ServiceOs[] {
  return SERVICE_OS_IDS.filter((os) => platforms.some((p) => p.os === os))
}

export function platformsForOs<T extends Pick<ServicePlatformFile, 'os'>>(platforms: T[], os: string | null): T[] {
  return os ? platforms.filter((p) => p.os === os) : []
}

/**
 * המערכת שנבחרת מראש — רק ברירת מחדל: זו של המבקר (detectPlatform) אם יש לה מתקין.
 * visitorOs — מה שזוהה (גם 'ios' או null), כדי להציג "המערכת שלך אינה נתמכת" בעמעום.
 */
export function initialOsChoice(visitorPlatform: string | null, supported: ServiceOs[]): {
  selected: ServiceOs | null
  visitorOs: string | null
  visitorSupported: boolean
} {
  const visitorSupported = isServiceOs(visitorPlatform) && supported.includes(visitorPlatform)
  return {
    selected: visitorSupported ? (visitorPlatform as ServiceOs) : null,
    visitorOs: visitorPlatform,
    visitorSupported
  }
}

/**
 * מה מציעים לפי מצב הזיהוי: תואם — רק התוסף; לא תואם — המתקין (הוא כולל את התוסף);
 * לא ידוע / עדיין בודקים — שניהם, כדי שכשל זיהוי לעולם לא יחסום הורדה ידנית.
 */
export function offeredDownloads(status: DetectionStatus | 'checking'): { installer: boolean; plugin: boolean } {
  if (status === 'compatible') return { installer: false, plugin: true }
  if (status === 'incompatible') return { installer: true, plugin: false }
  return { installer: true, plugin: true }
}
