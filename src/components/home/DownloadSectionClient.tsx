'use client'

import { useState, useEffect } from 'react'
import DownloadAssistantOptions, { AndroidAssistantNotice, hasDownloadAssistant } from './DownloadAssistantOptions'
import AppIcon from '@/components/ui/AppIcon'
import Card from '@/components/ui/Card'
import Dialog from '@/components/ui/Dialog'
import IconTile from '@/components/ui/IconTile'
import Section from '@/components/ui/Section'
import SectionHeading from '@/components/ui/SectionHeading'
import { detectPlatform } from '@/lib/detectOs'
import DownloadOptionCard from './DownloadOptionCard'
// ייבוא טיפוס בלבד (נמחק בקומפילציה) — הקוד של stableDownloads.ts נשאר בשרת
import type { Downloads } from './stableDownloads'

type PlatformLinks = Record<string, string | undefined>

type PlatformButtonConfig = {
  icon: string
  title: string
  subtitle: string
  onClick: () => void
}

type DownloadOption = {
  key: string
  icon: string
  title: string
  desc: string
  isLink?: boolean
}

// כפתור המעבר בין "המערכת שזוהתה" ל"כל המערכות" (שני הכיוונים)
const TOGGLE_BUTTON = 'flex min-h-12 items-center gap-1 rounded-lg px-3 text-sm font-medium text-primary hover:bg-card-selected'

// stableDownloads מגיע כבר טעון מהשרת (ראו DownloadSection.tsx, ה-Server Component
// שעוטף את הרכיב הזה) — כאן נשארת רק האינטראקטיביות (זיהוי פלטפורמה, מודלים).
export default function DownloadSectionClient({ stableDownloads }: { stableDownloads: Downloads | null }) {
  // חלון ההורדה הפתוח (מפתח פלטפורמה: windows / linux / ...), או null
  const [openPlatform, setOpenPlatform] = useState<string | null>(null)

  // undefined — עוד לא נבדק (ה-HTML מהשרת ועד ה-effect); null — נבדק ולא זוהה; אחרת — המפתח
  const [detectedPlatform, setDetectedPlatform] = useState<string | null | undefined>(undefined)
  const [showAllPlatforms, setShowAllPlatforms] = useState(false)

  // זיהוי פלטפורמה אוטומטי
  useEffect(() => {
    // זיהוי פלטפורמה רץ רק בצד הלקוח (navigator לא קיים בשרת)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDetectedPlatform(detectPlatform({ userAgent: navigator.userAgent, platform: navigator.platform || '' }))
  }, [])

  // פונקציה להחזרת שם הפלטפורמה בעברית
  const getPlatformName = (platform: string) => {
    const names: Record<string, string> = {
      windows: 'Windows',
      linux: 'Linux',
      android: 'Android',
      ios: 'iOS',
      macos: 'macOS'
    }
    return names[platform] || platform
  }

  // פונקציה להצגת כפתור פלטפורמה
  const renderPlatformButton = (platform: string, large: boolean = false) => {
    const platformConfig: Record<string, PlatformButtonConfig> = {
      windows: {
        icon: 'desktop_windows',
        title: 'Windows',
        subtitle: '10 / 11',
        onClick: () => setOpenPlatform('windows')
      },
      linux: {
        icon: 'computer',
        title: 'Linux',
        subtitle: 'כל ההפצות',
        onClick: () => setOpenPlatform('linux')
      },
      android: {
        icon: 'phone_android',
        title: 'Android',
        subtitle: 'Google Play / APK',
        onClick: () => setOpenPlatform('android')
      },
      ios: {
        icon: 'phone_iphone',
        title: 'iOS',
        subtitle: 'App Store',
        onClick: () => setOpenPlatform('ios')
      },
      macos: {
        icon: 'laptop_mac',
        title: 'macOS',
        subtitle: 'Intel / Apple Silicon',
        onClick: () => setOpenPlatform('macos')
      }
    }

    const config = platformConfig[platform]
    if (!config) return null
    const assistantLinks = stableDownloads?.[platform as keyof Downloads]
    const subtitle = hasDownloadAssistant(config.title, (assistantLinks as PlatformLinks | undefined) || {})
      ? `${config.subtitle} · באמצעות מסייע ההורדה`
      : config.subtitle

    // שורת כרטיס בסגנון המתקין: אריח אייקון, כותרת ושורת משנה, ו"כפתור" ראשי מלא
    if (large) {
      return (
        <Card onClick={config.onClick} className="flex w-full items-center gap-4 p-4 sm:gap-5 sm:p-6">
          <IconTile icon={config.icon} size="lg" />
          <div className="min-w-0 flex-1">
            {/* span ולא כותרת: צאצאי <button> הם presentational, וכותרת בתוכו אינה תקינה */}
            <span className="block text-xl font-bold text-on-surface sm:text-2xl">{config.title}</span>
            <p className="mt-0.5 text-sm text-on-surface-variant sm:text-base">{subtitle}</p>
          </div>
          <span className="inline-flex h-12 shrink-0 items-center gap-2 rounded-lg bg-primary px-3 font-semibold text-on-primary transition-colors group-hover:bg-primary-hover sm:px-5">
            <AppIcon name="download" />
            <span className="hidden sm:inline">הורדה</span>
          </span>
        </Card>
      )
    }

    return (
      // שם המערכת בשורת האריח (כמו בכרטיסי היכולות), ושורת המשנה מתחתיהם לכל רוחב הכרטיס
      <Card onClick={config.onClick} className="flex h-full w-full flex-col gap-2 p-4 lg:p-5">
        <div className="flex w-full items-center gap-3">
          <IconTile icon={config.icon} size="md" />
          <span className="min-w-0 flex-1 text-lg font-bold text-on-surface">{config.title}</span>
          <AppIcon name="chevron_left" className="text-primary lg:hidden" />
        </div>
        <p className="text-sm text-on-surface-variant">{subtitle}</p>
      </Card>
    )
  }

  return (
    <>
      {/* Download Section (Software) */}
      <Section id="download" labelledBy="download-heading" anchor>
        <SectionHeading id="download-heading" title="הורדת התוכנה" spacing="none" className="mb-5 md:mb-6" />

        {/* הצגת כפתור הורדה לפלטפורמה שזוהתה. עד שהזיהוי רץ (undefined — ה-HTML מהשרת) מוצג
            אותו מבנה בדיוק, עם טקסט ניטרלי וכרטיס שקוף במקום כרטיס המערכת: כמעט כל מבקר מזוהה,
            ולכן הגובה לא משתנה כשהזיהוי מסתיים (בלי CLS ובלי "לא הצלחנו לזהות" שגוי) */}
        {detectedPlatform !== null && !showAllPlatforms ? (
          <div className="mx-auto max-w-2xl">
            <p className="mb-6 text-center text-lg text-on-surface-variant">
              {detectedPlatform ? `זיהינו שאתה משתמש ב-${getPlatformName(detectedPlatform)}` : 'הורדה למחשב ולנייד'}
            </p>

            <div className="flex flex-col items-center gap-3">
              {detectedPlatform ? renderPlatformButton(detectedPlatform, true) : (
                // שומר מקום בגובה כרטיס המערכת — invisible: לא נראה, לא נגיש ולא בר-מיקוד
                <div aria-hidden="true" className="invisible w-full" data-testid="detected-platform-placeholder">
                  {renderPlatformButton('windows', true)}
                </div>
              )}

              <button
                type="button"
                onClick={() => setShowAllPlatforms(true)}
                className={TOGGLE_BUTTON}
              >
                <span>{detectedPlatform ? 'הורדה למערכת אחרת' : 'כל המערכות'}</span>
                <AppIcon name="expand_more" className="text-lg" />
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="mb-8 text-center text-lg text-on-surface-variant">
              {detectedPlatform === null ? 'לא הצלחנו לזהות את המערכת שלך — בחר מערכת' : 'בחר מערכת'}
            </p>

            {/* נייד: רשימה; טבלט: שתי עמודות; דסקטופ: חמישה כרטיסים אנכיים בשורה */}
            <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-5">
                {renderPlatformButton('windows')}
                {renderPlatformButton('linux')}
                {renderPlatformButton('android')}
                {renderPlatformButton('ios')}
                {renderPlatformButton('macos')}
            </div>

            {detectedPlatform && (
              <div className="mt-6 text-center">
                <button
                  type="button"
                  onClick={() => setShowAllPlatforms(false)}
                  className={`mx-auto ${TOGGLE_BUTTON}`}
                >
                  <AppIcon name="expand_less" className="text-lg" />
                  <span>חזור להורדה ל-{getPlatformName(detectedPlatform)}</span>
                </button>
              </div>
            )}
          </>
        )}
      </Section>

      {openPlatform && (
        <Dialog
          title={`הורדת אוצריא ל-${getPlatformName(openPlatform)}`}
          onClose={() => setOpenPlatform(null)}
        >
          <div className="grid gap-3">
            {renderDownloadOptions(getPlatformName(openPlatform), getDialogLinks(openPlatform, stableDownloads))}
          </div>
        </Dialog>
      )}
    </>
  )
}

const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=org.otzaria.otzaria'
const APP_STORE_URL = 'https://apps.apple.com/us/app/otzaria/id6738098031'

// הקישורים שמוצגים בחלון של כל מערכת. Android ו-iOS מקבלים גם קישורי חנות קבועים,
// ו-Android גם את מסייע ה-Windows (להכנת התקנה למכשיר בלי אינטרנט).
function getDialogLinks(platform: string, downloads: Downloads | null): PlatformLinks {
  if (platform === 'android') {
    return {
      playStore: PLAY_STORE_URL,
      apk: downloads?.android?.apk,
      zipFull: downloads?.android?.zipFull,
      windowsAssistant: downloads?.windows?.assistant
    }
  }
  if (platform === 'ios') return { appStore: APP_STORE_URL }
  return (downloads?.[platform as 'windows' | 'linux' | 'macos'] as PlatformLinks | undefined) || {}
}

function renderDownloadOptions(platform: string, links: PlatformLinks) {
  // כשיש מסייע הורדה לפלטפורמה מוצג רק הוא; release ישן בלעדיו מציג את הקבצים הישירים.
  if (hasDownloadAssistant(platform, links)) {
    return <DownloadAssistantOptions platform={platform} links={links} />
  }

  const options: Record<string, DownloadOption[]> = {
    Windows: [
      { key: 'exe', icon: 'install_desktop', title: 'EXE Installer', desc: 'קובץ התקנה רגיל — הורדת הספרייה תתבצע דרך התוכנה' },
      { key: 'exeArm64', icon: 'memory', title: 'EXE Installer (ARM64)', desc: 'למחשבי ARM עם מעבד Snapdragon — רק בגרסה זו התוספים עובדים' },
      { key: 'exeFull', icon: 'install_desktop', title: 'EXE Installer (Full)', desc: 'מתקין מלא להתקנה במחשב ללא אינטרנט' },
      { key: 'msix', icon: 'package_2', title: 'MSIX Package', desc: 'התקנה דרך החנות' }
    ],
    Linux: [
      { key: 'deb', icon: 'package_2', title: 'DEB Package', desc: 'עבור Ubuntu/Debian' },
      { key: 'rpm', icon: 'package_2', title: 'RPM Package', desc: 'עבור Fedora/RedHat' },
      { key: 'appimage', icon: 'apps', title: 'AppImage', desc: 'קובץ הרצה אוניברסלי' },
      { key: 'tarFull', icon: 'folder_zip', title: 'Full Package', desc: 'מתקין מלא להתקנה במחשב ללא אינטרנט' }
    ],
    Android: [
      { key: 'playStore', icon: 'shop', title: 'Google Play', desc: 'התקנה מהחנות', isLink: true },
      { key: 'apk', icon: 'android', title: 'APK File', desc: 'התקנה ידנית — הורדת הספרייה תתבצע דרך התוכנה' },
      { key: 'zipFull', icon: 'folder_zip', title: 'Full Package', desc: 'מתקין מלא להתקנה ללא אינטרנט' }
    ],
    iOS: [
      { key: 'appStore', icon: 'shop', title: 'App Store', desc: 'הורדה מחנות האפליקציות', isLink: true }
    ],
    macOS: [
      { key: 'dmg', icon: 'album', title: 'DMG Image', desc: 'קובץ התקנה רגיל — הורדת הספרייה תתבצע דרך התוכנה' },
      { key: 'zip', icon: 'folder_zip', title: 'macOS Package', desc: 'גרסה דחוסה' },
      { key: 'zipFull', icon: 'folder_zip', title: 'Full Package', desc: 'מתקין מלא להתקנה במחשב ללא אינטרנט' }
    ]
  }

  const platformOptions = options[platform] || []
  const validOptions = platformOptions.filter((opt) => links && links[opt.key])

  if (validOptions.length === 0) {
    return <p className="rounded-lg bg-card p-4 text-center text-on-surface-variant">אין הורדות זמינות כרגע לגרסה זו.</p>
  }

  // האפשרות הראשונה היא הפעולה הראשית בחלון; השאר חלופות משניות
  const optionLinks = validOptions.map((option, index) => (
    <DownloadOptionCard
      key={option.key}
      href={links[option.key] as string}
      icon={option.icon}
      title={option.title}
      desc={option.desc}
      emphasis={index === 0 ? 'primary' : 'tonal'}
      external={option.isLink}
    />
  ))

  if (platform === 'Android' && links.windowsAssistant) {
    return [...optionLinks, <AndroidAssistantNotice key="windowsAssistant" href={links.windowsAssistant} />]
  }
  return optionLinks
}
