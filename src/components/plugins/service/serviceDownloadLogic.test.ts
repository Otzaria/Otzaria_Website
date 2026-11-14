import { describe, it, expect } from 'vitest'
import {
  classifyDetection,
  detectionPorts,
  initialOsChoice,
  mergeDetections,
  offeredDownloads,
  platformsForOs,
  supportedOsList
} from './serviceDownloadLogic'

const expected = { serviceId: 'org.example.svc', range: { min: '1.0.0', max: '1.9.99' } }

describe('classifyDetection', () => {
  it('שירות מזוהה בגרסה בטווח — תואם', () => {
    expect(classifyDetection({ protocolVersion: 1, serviceId: 'org.example.svc', serviceVersion: '1.2.0' }, expected))
      .toEqual({ status: 'compatible', version: '1.2.0' })
  })

  it('שירות מזוהה מחוץ לטווח — לא תואם', () => {
    expect(classifyDetection({ protocolVersion: 1, serviceId: 'org.example.svc', serviceVersion: '2.0.0' }, expected))
      .toEqual({ status: 'incompatible', version: '2.0.0' })
    expect(classifyDetection({ protocolVersion: 1, serviceId: 'org.example.svc', serviceVersion: '0.9.0' }, expected).status)
      .toBe('incompatible')
  })

  it('ללא תקרה — כל גרסה מהמינימום', () => {
    expect(classifyDetection(
      { protocolVersion: 1, serviceId: 'org.example.svc', serviceVersion: '9.0.0' },
      { serviceId: 'org.example.svc', range: { min: '1.0.0', max: null } }
    ).status).toBe('compatible')
  })

  it('כל תשובה חריגה — לא ידוע (לעולם לא "לא מותקן")', () => {
    const cases: unknown[] = [
      null,
      'text',
      [],
      { protocolVersion: 2, serviceId: 'org.example.svc', serviceVersion: '1.2.0' },
      { protocolVersion: '1', serviceId: 'org.example.svc', serviceVersion: '1.2.0' },
      { protocolVersion: 1, serviceId: 'org.other', serviceVersion: '1.2.0' },
      { protocolVersion: 1, serviceId: 'org.example.svc', serviceVersion: '1.2' },
      { protocolVersion: 1, serviceId: 'org.example.svc' }
    ]
    for (const response of cases) {
      expect(classifyDetection(response, expected)).toEqual({ status: 'unknown', version: null })
    }
  })
})

describe('בחירת מערכת ופורטים', () => {
  const platforms = [
    { os: 'windows', arch: 'x64', port: 18090 },
    { os: 'windows', arch: 'arm64', port: 18090 },
    { os: 'linux', arch: 'x64', port: 18091 },
    { os: 'macos', arch: 'universal', port: 80 }
  ]

  it('detectionPorts — רק של המערכת המוצגת, בלי כפילויות ובלי פורט לא תקין', () => {
    expect(detectionPorts(platforms, 'windows')).toEqual([18090])
    expect(detectionPorts(platforms, 'macos')).toEqual([])
    expect(detectionPorts(platforms, null)).toEqual([18090, 18091])
  })

  it('supportedOsList בסדר קבוע; platformsForOs', () => {
    expect(supportedOsList(platforms)).toEqual(['windows', 'macos', 'linux'])
    expect(platformsForOs(platforms, 'windows')).toHaveLength(2)
    expect(platformsForOs(platforms, null)).toEqual([])
  })

  it('initialOsChoice — מערכת המבקר רק כברירת מחדל, ורק אם נתמכת', () => {
    expect(initialOsChoice('windows', ['windows', 'linux'])).toEqual({ selected: 'windows', visitorOs: 'windows', visitorSupported: true })
    expect(initialOsChoice('android', ['windows'])).toEqual({ selected: null, visitorOs: 'android', visitorSupported: false })
    expect(initialOsChoice('ios', ['windows'])).toEqual({ selected: null, visitorOs: 'ios', visitorSupported: false })
    expect(initialOsChoice(null, ['windows'])).toEqual({ selected: null, visitorOs: null, visitorSupported: false })
  })

  it('mergeDetections — תואם גובר, אחר כך לא תואם', () => {
    const unknown = { status: 'unknown' as const, version: null }
    expect(mergeDetections([unknown, { status: 'incompatible', version: '2.0.0' }]).status).toBe('incompatible')
    expect(mergeDetections([{ status: 'incompatible', version: '2.0.0' }, { status: 'compatible', version: '1.0.0' }]).status).toBe('compatible')
    expect(mergeDetections([])).toEqual(unknown)
  })

  it('offeredDownloads — תואם: רק תוסף; לא תואם: מתקין; לא ידוע ובדיקה: שניהם', () => {
    expect(offeredDownloads('compatible')).toEqual({ installer: false, plugin: true })
    expect(offeredDownloads('incompatible')).toEqual({ installer: true, plugin: false })
    expect(offeredDownloads('unknown')).toEqual({ installer: true, plugin: true })
    expect(offeredDownloads('checking')).toEqual({ installer: true, plugin: true })
  })
})
