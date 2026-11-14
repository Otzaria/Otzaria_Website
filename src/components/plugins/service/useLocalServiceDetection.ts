'use client'

import { useEffect, useState } from 'react'
import { classifyDetection, DETECTION_MAX_BYTES, mergeDetections, type DetectionResult, type DetectionStatus } from './serviceDownloadLogic'
import type { ServiceRange } from './serviceVersion'

export const DETECTION_PATH = '/.well-known/otzaria-service'
const DEFAULT_TIMEOUT_MS = 2500

export type DetectionState = { status: DetectionStatus | 'checking' | 'idle'; version: string | null }

const UNKNOWN: DetectionResult = { status: 'unknown', version: null }

async function probePort(port: number, expected: { serviceId: string; range: ServiceRange | null }, signal: AbortSignal): Promise<DetectionResult> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}${DETECTION_PATH}`, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      signal
    })
    if (!response.ok) return UNKNOWN
    const text = await response.text()
    if (text.length > DETECTION_MAX_BYTES) return UNKNOWN
    return classifyDetection(JSON.parse(text), expected)
  } catch {
    // חסימת דפדפן (הרשאת רשת מקומית, CORS), אין שירות, פסק זמן — כולם "לא הצלחנו לזהות"
    return UNKNOWN
  }
}

/**
 * זיהוי השירות המקומי — רק כשהחלון פתוח (enabled) ורק בפורטים שהועברו (של המערכת המוצגת).
 * כל בקשה מוגבלת בזמן; ביטול בסגירה או בהחלפת פורטים.
 */
export function useLocalServiceDetection({ enabled, ports, serviceId, range, timeoutMs = DEFAULT_TIMEOUT_MS }: {
  enabled: boolean
  ports: number[]
  serviceId: string
  range: ServiceRange | null
  timeoutMs?: number
}): DetectionState {
  const portsKey = ports.join(',')
  const rangeKey = range ? `${range.min}-${range.max ?? ''}` : ''
  const requestKey = enabled && portsKey && serviceId ? `${portsKey}|${serviceId}|${rangeKey}` : null
  const [result, setResult] = useState<{ key: string; value: DetectionResult } | null>(null)

  useEffect(() => {
    if (!requestKey) return undefined
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let cancelled = false
    const expected = { serviceId, range }
    Promise.all(portsKey.split(',').map((port) => probePort(Number(port), expected, controller.signal)))
      .then((results) => {
        if (!cancelled) setResult({ key: requestKey, value: mergeDetections(results) })
      })
      .finally(() => clearTimeout(timer))
    return () => {
      cancelled = true
      clearTimeout(timer)
      controller.abort()
    }
    // requestKey מכסה את הפורטים, serviceId והטווח
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, timeoutMs])

  if (!enabled) return { status: 'idle', version: null }
  if (!requestKey) return UNKNOWN
  if (result?.key !== requestKey) return { status: 'checking', version: null }
  return result.value
}
