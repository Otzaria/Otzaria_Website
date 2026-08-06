'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import OtzariaSoftwareHeader from '@/components/layout/OtzariaSoftwareHeader'
import OtzariaSoftwareFooter from '@/components/layout/OtzariaSoftwareFooter'

// מבנה נתוני ההורדות המוחזר מ-/api/github-releases
type PlatformLinks = Record<string, string | undefined>
type Downloads = {
  version?: string
  versions?: Record<string, string>
  windows?: PlatformLinks
  linux?: PlatformLinks
  android?: PlatformLinks
  ios?: PlatformLinks
  macos?: PlatformLinks
}

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


export default function Home() {
  const [windowsModalOpen, setWindowsModalOpen] = useState(false)
  const [linuxModalOpen, setLinuxModalOpen] = useState(false)
  const [androidModalOpen, setAndroidModalOpen] = useState(false)
  const [macModalOpen, setMacModalOpen] = useState(false)
  const [iosModalOpen, setIosModalOpen] = useState(false)
  
  const [stableDownloads, setStableDownloads] = useState<Downloads | null>(null)
  const [detectedPlatform, setDetectedPlatform] = useState<string | null>(null)
  const [showAllPlatforms, setShowAllPlatforms] = useState(false)

  // זיהוי פלטפורמה אוטומטי
  useEffect(() => {
    const detectPlatform = () => {
      const userAgent = navigator.userAgent.toLowerCase()
      const platform = navigator.platform?.toLowerCase() || ''
      
      if (/android/.test(userAgent)) {
        return 'android'
      } else if (/iphone|ipad|ipod/.test(userAgent)) {
        return 'ios'
      } else if (/mac/.test(platform) || /macintosh/.test(userAgent)) {
        return 'macos'
      } else if (/win/.test(platform) || /windows/.test(userAgent)) {
        return 'windows'
      } else if (/linux/.test(platform) || /linux/.test(userAgent)) {
        return 'linux'
      }
      return null
    }
    
    // זיהוי פלטפורמה רץ רק בצד הלקוח (navigator לא קיים בשרת)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDetectedPlatform(detectPlatform())
  }, [])

  // טעינת קישורי הורדה מ-GitHub
  useEffect(() => {
    const fetchReleases = async () => {
        try {
            const stableRes = await fetch('/api/github-releases?type=stable');
            if (stableRes.ok) setStableDownloads(await stableRes.json());
        } catch (error) {
            console.error('Failed to load releases:', error);
        }
    };
    fetchReleases();
  }, [])

  const features = [
    {
      icon: 'auto_stories',
      title: 'מאגר עצום',
      description: 'אלפי ספרי קודש זמינים לקריאה ולימוד'
    },
    {
      icon: 'verified',
      title: 'דיוק מקסימלי',
      description: 'מערכת בקרת איכות מתקדמת לטקסטים מדויקים'
    },
    {
      icon: 'search',
      title: 'חיפוש מתקדם',
      description: 'מצאו כל פסוק, מאמר או מושג בקלות'
    },
    {
      icon: 'edit_note',
      title: 'עריכה משותפת',
      description: 'ספרים רבים נוספו על ידי הקהילה'
    },
    {
      icon: 'devices',
      title: 'פלטפורמות מרובות',
      description: 'עובד על Windows, Linux, Android, iOS ו-macOS'
    },
    {
      icon: 'palette',
      title: 'ממשק מודרני',
      description: 'עיצוב נקי ופשוט עם תמיכה במצב כהה ובהתאמה אישית'
    },
    {
      icon: 'description',
      title: 'פורמטים מגוונים',
      description: 'תמיכה בקבצי TXT, DOCX ו-PDF'
    },
    {
      icon: 'volunteer_activism',
      title: 'חינם לחלוטין',
      description: 'התוכנה חינמית לחלוטין ותישאר כזו לעד'
    }
  ]

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
        onClick: () => setWindowsModalOpen(true)
      },
      linux: {
        icon: 'computer',
        title: 'Linux',
        subtitle: 'כל ההפצות',
        onClick: () => setLinuxModalOpen(true)
      },
      android: {
        icon: 'phone_android',
        title: 'Android',
        subtitle: 'Google Play / APK',
        onClick: () => setAndroidModalOpen(true)
      },
      ios: {
        icon: 'phone_iphone',
        title: 'iOS',
        subtitle: 'App Store',
        onClick: () => setIosModalOpen(true)
      },
      macos: {
        icon: 'laptop_mac',
        title: 'macOS',
        subtitle: 'Intel / Apple Silicon',
        onClick: () => setMacModalOpen(true)
      }
    }

    const config = platformConfig[platform]
    if (!config) return null

    if (large) {
      return (
        <button 
          onClick={config.onClick}
          className="flex items-center gap-6 p-8 bg-white border-2 border-primary rounded-2xl hover:shadow-2xl transition-all group w-full max-w-md"
        >
          <div className="w-20 h-20 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0">
            <span className="material-symbols-outlined text-5xl text-primary group-hover:scale-110 transition-transform">
              {config.icon}
            </span>
          </div>
          <div className="flex-1 text-right">
            <h3 className="text-2xl font-bold mb-1">{config.title}</h3>
            <p className="text-neutral-500">{config.subtitle}</p>
          </div>
          <span className="material-symbols-outlined text-3xl text-primary">download</span>
        </button>
      )
    }

    return (
      <button 
        onClick={config.onClick}
        className="flex flex-col items-center p-6 bg-white border border-neutral-200 rounded-xl hover:border-primary hover:shadow-lg transition-all group h-full"
      >
        <span className="material-symbols-outlined text-6xl text-primary mb-4 group-hover:scale-110 transition-transform">
          {config.icon}
        </span>
        <h3 className="text-xl font-bold mb-1">{config.title}</h3>
        <p className="text-sm text-neutral-500">{config.subtitle}</p>
      </button>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <OtzariaSoftwareHeader />
      
      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative py-20 px-4 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-bl from-primary/10 via-background to-secondary/10 opacity-50"></div>
            
            <div className="container mx-auto relative z-10 text-center max-w-4xl">
                {/* אנימציית CSS ולא framer-motion: כך הלוגו אינו מגיע מהשרת עם
                    transform:scale(0) ונשאר בלתי נראה עד שה-JavaScript עולה. */}
                <div className="mb-8 flex justify-center animate-enter-pop">
                    <img src="/logo.webp" alt="לוגו אוצריא" width={128} height={128} className="w-32 h-32 drop-shadow-2xl" />
                </div>
                
                <h1 className="text-5xl md:text-6xl font-bold mb-6 font-frank">
                    אוצריא
                </h1>
                
                <p className="text-xl md:text-2xl mb-8 text-foreground/80 leading-relaxed">
                    מאגר תורני רחב עם ממשק מודרני ומהיר
                </p>
                
                <div className="flex flex-col gap-4 justify-center items-center mt-8">
                    <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                        <Link href="#download" className="px-8 py-4 bg-primary text-white rounded-lg text-lg font-medium hover:bg-primary/90 transition-all shadow-lg hover:shadow-xl">
                            הורד עכשיו
                        </Link>
                        <Link href="/about" className="flex items-center gap-2 px-8 py-4 bg-white border-2 border-primary text-primary rounded-lg text-lg font-medium hover:bg-primary/5 transition-all shadow-lg hover:shadow-xl">
                            <span className="material-symbols-outlined">info</span>
                            <span>אודות הספרייה</span>
                        </Link>
                    </div>
                    <Link href="/library" className="px-4 py-4 bg-white border-2 border-primary text-primary rounded-lg text-sm font-medium hover:bg-primary/5 transition-all">
                        לפרוייקט ספריית אוצריא
                    </Link>
                </div>
            </div>
        </section>

        {/* Features Section */}
        <section id="features" className="py-20 px-4 bg-surface relative overflow-hidden">
          <div className="container mx-auto relative z-10">
            <div className="animate-enter-down">
              <h2 className="text-4xl font-bold text-center mb-4 text-on-surface">
                למה לבחור באוצריא?
              </h2>
              <p className="text-center text-on-surface/70 mb-12 max-w-2xl mx-auto">
                פלטפורמה מתקדמת המשלבת טכנולוגיה חדישה עם כבוד למסורת
              </p>
            </div>

            {/* כרטיסי היכולות היו כולם opacity:0 ב-HTML של השרת — כלומר כל תוכן
                החלק הזה נראה רק אחרי hydration. ההשהיה המדורגת עברה ל-CSS. */}
            <div className="flex flex-wrap justify-center gap-6">
              {features.map((feature, index) => (
                <motion.div
                  key={index}
                  style={{ animationDelay: `${index * 0.1}s` }}
                  whileHover={{
                    scale: 1.05,
                    y: -8,
                    transition: { type: "spring", stiffness: 300 }
                  }}
                  className="glass p-6 rounded-xl shadow-lg hover:shadow-2xl transition-shadow cursor-pointer group w-full md:w-[calc(50%-12px)] lg:w-[calc(33.33%-16px)] animate-enter-up"
                >
                  <motion.span 
                    className="material-symbols-outlined text-6xl text-primary mb-4 block"
                    whileHover={{ rotate: [0, -10, 10, -10, 0], scale: 1.1 }}
                    transition={{ duration: 0.5 }}
                  >
                    {feature.icon}
                  </motion.span>
                  <h3 className="text-xl font-bold mb-2 text-on-surface group-hover:text-primary transition-colors">
                    {feature.title}
                  </h3>
                  <p className="text-on-surface/70">
                    {feature.description}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Download Section (Software) */}
        <section id="download" className="py-20 px-4">
            <div className="container mx-auto max-w-6xl">
                <h2 className="text-4xl font-bold text-center mb-4 font-frank">הורדת התוכנה</h2>
                
                {/* הצגת כפתור הורדה לפלטפורמה שזוהתה */}
                {detectedPlatform && !showAllPlatforms ? (
                  <div className="max-w-2xl mx-auto">
                    <p className="text-center text-xl text-neutral-600 mb-8">זיהינו שאתה משתמש ב-{getPlatformName(detectedPlatform)}</p>
                    
                    <div className="flex flex-col items-center gap-4 mb-8">
                      {renderPlatformButton(detectedPlatform, true)}
                      
                      <button 
                        onClick={() => setShowAllPlatforms(true)}
                        className="text-primary hover:underline text-sm font-medium flex items-center gap-1"
                      >
                        <span>הורד למערכת אחרת</span>
                        <span className="material-symbols-outlined text-sm">expand_more</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-center text-xl text-neutral-600 mb-12">
                      {detectedPlatform ? 'בחר פלטפורמה' : 'לא הצלחנו לזהות את המערכת שלך - בחר פלטפורמה'}
                    </p>
                    
                    <div className="grid md:grid-cols-3 lg:grid-cols-5 gap-6">
                        {renderPlatformButton('windows')}
                        {renderPlatformButton('linux')}
                        {renderPlatformButton('android')}
                        {renderPlatformButton('ios')}
                        {renderPlatformButton('macos')}
                    </div>
                    
                    {detectedPlatform && (
                      <div className="text-center mt-6">
                        <button 
                          onClick={() => setShowAllPlatforms(false)}
                          className="text-primary hover:underline text-sm font-medium flex items-center gap-1 mx-auto"
                        >
                          <span className="material-symbols-outlined text-sm">expand_less</span>
                          <span>חזור להורדה ל-{getPlatformName(detectedPlatform)}</span>
                        </button>
                      </div>
                    )}
                  </>
                )}
            </div>
        </section>

        {/* Contribute Link */}
        <section className="py-20 px-4 bg-primary/5 text-center">
            <div className="container mx-auto">
                 <h2 className="text-3xl font-bold mb-6">רוצים לתרום לפיתוח?</h2>
                 <Link href="/library/books" className="inline-flex items-center gap-2 px-6 py-3 bg-white text-primary border border-primary rounded-lg font-medium hover:bg-primary hover:text-white transition-colors">
                    <span className="material-symbols-outlined">upload_file</span>
                    הצטרפו לקהילת העורכים
                 </Link>
            </div>
        </section>
      </main>
      
      <OtzariaSoftwareFooter />

      {/* Modals */}
      <DownloadModal
        isOpen={windowsModalOpen}
        onClose={() => setWindowsModalOpen(false)}
        platform="Windows"
        links={stableDownloads?.windows || {}}
        version={stableDownloads?.versions?.windows ?? stableDownloads?.version}
      />
      <DownloadModal
        isOpen={linuxModalOpen}
        onClose={() => setLinuxModalOpen(false)}
        platform="Linux"
        links={stableDownloads?.linux || {}}
        version={stableDownloads?.versions?.linux ?? stableDownloads?.version}
      />
      <DownloadModal
        isOpen={androidModalOpen}
        onClose={() => setAndroidModalOpen(false)}
        platform="Android"
        links={{
          playStore: 'https://play.google.com/store/apps/details?id=org.otzaria.otzaria',
          apk: stableDownloads?.android?.apk,
          zipFull: stableDownloads?.android?.zipFull
        }}
        version={stableDownloads?.versions?.android ?? stableDownloads?.version}
      />
      <DownloadModal
        isOpen={iosModalOpen}
        onClose={() => setIosModalOpen(false)}
        platform="iOS"
        links={{
          appStore: 'https://apps.apple.com/us/app/otzaria/id6738098031'
        }}
        version={stableDownloads?.version}
      />
      <DownloadModal
        isOpen={macModalOpen}
        onClose={() => setMacModalOpen(false)}
        platform="macOS"
        links={stableDownloads?.macos || {}}
        version={stableDownloads?.versions?.macos ?? stableDownloads?.version}
      />
    </div>
  );
}

// Download Modal Component
function DownloadModal({ isOpen, onClose, platform, links, version }: {
  isOpen: boolean
  onClose: () => void
  platform: string
  links: PlatformLinks
  version?: string
}) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        onClick={(e) => e.stopPropagation()}
        className="flex flex-col bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh]"
      >
        {/* Fixed Header */}
        <div className="flex items-center justify-between p-6 border-b border-neutral-200 flex-shrink-0">
          <h2 className="text-2xl font-bold text-neutral-800">
            הורדת אוצריא ל-{platform}
            {version && <span className="text-sm font-normal text-neutral-500 mr-2"> ({version})</span>}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-neutral-100 rounded-full transition-colors text-neutral-500">
            <span className="material-symbols-outlined text-2xl block">close</span>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
          <div className="grid gap-3">
            {renderDownloadOptions(platform, links)}
          </div>
        </div>
      </motion.div>
    </div>
  )
}

function renderDownloadOptions(platform: string, links: PlatformLinks) {
  const options: Record<string, DownloadOption[]> = {
    Windows: [
      { key: 'exe', icon: 'install_desktop', title: 'EXE Installer', desc: 'קובץ התקנה רגיל — הורדת הספרייה תתבצע דרך התוכנה' },
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
    return <p className="text-neutral-500 italic p-4 bg-neutral-50 rounded-lg text-center border border-dashed border-neutral-300">אין הורדות זמינות כרגע לגרסה זו.</p>
  }

  return validOptions.map((option) => (
    <a
      key={option.key}
      href={links[option.key]}
      target={option.isLink ? "_blank" : undefined}
      rel={option.isLink ? "noopener noreferrer" : undefined}
      className="flex items-center gap-4 p-4 rounded-xl border border-neutral-200 hover:border-primary hover:shadow-md transition-all group bg-neutral-50 hover:bg-white"
    >
      <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center shadow-sm text-primary group-hover:scale-110 transition-transform">
        <span className="material-symbols-outlined text-2xl">{option.icon}</span>
      </div>
      <div className="flex-1">
        <h4 className="font-bold text-neutral-800">{option.title}</h4>
        <p className="text-sm text-neutral-500">{option.desc}</p>
      </div>
      <span className="material-symbols-outlined text-neutral-400 group-hover:text-primary">
        {option.isLink ? 'open_in_new' : 'download'}
      </span>
    </a>
  ))
}

