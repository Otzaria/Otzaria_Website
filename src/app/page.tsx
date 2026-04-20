'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import OtzariaSoftwareHeader from '@/components/layout/OtzariaSoftwareHeader'
import OtzariaSoftwareFooter from '@/components/layout/OtzariaSoftwareFooter'

export default function Home() {
  const [windowsModalOpen, setWindowsModalOpen] = useState(false)
  const [linuxModalOpen, setLinuxModalOpen] = useState(false)
  const [androidModalOpen, setAndroidModalOpen] = useState(false)
  const [macModalOpen, setMacModalOpen] = useState(false)
  const [iosModalOpen, setIosModalOpen] = useState(false)
  
  const [stableDownloads, setStableDownloads] = useState<any>(null)
  const [devDownloads, setDevDownloads] = useState<any>(null)
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
    
    setDetectedPlatform(detectPlatform())
  }, [])

  // טעינת קישורי הורדה מ-GitHub
  useEffect(() => {
    const fetchReleases = async () => {
        try {
            const [stableRes, devRes] = await Promise.all([
                fetch('/api/github-releases?type=stable'),
                fetch('/api/github-releases?type=dev')
            ]);
            
            if (stableRes.ok) setStableDownloads(await stableRes.json());
            if (devRes.ok) setDevDownloads(await devRes.json());
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
    const platformConfig: Record<string, any> = {
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
            <p className="text-gray-500">{config.subtitle}</p>
          </div>
          <span className="material-symbols-outlined text-3xl text-primary">download</span>
        </button>
      )
    }

    return (
      <button 
        onClick={config.onClick}
        className="flex flex-col items-center p-6 bg-white border border-gray-200 rounded-xl hover:border-primary hover:shadow-lg transition-all group h-full"
      >
        <span className="material-symbols-outlined text-6xl text-primary mb-4 group-hover:scale-110 transition-transform">
          {config.icon}
        </span>
        <h3 className="text-xl font-bold mb-1">{config.title}</h3>
        <p className="text-sm text-gray-500">{config.subtitle}</p>
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
                <motion.div 
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 260, damping: 20 }}
                    className="mb-8 flex justify-center"
                >
                    <img src="/logo.svg" alt="לוגו אוצריא" className="w-32 h-32 drop-shadow-2xl" />
                </motion.div>
                
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
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <h2 className="text-4xl font-bold text-center mb-4 text-on-surface">
                למה לבחור באוצריא?
              </h2>
              <p className="text-center text-on-surface/70 mb-12 max-w-2xl mx-auto">
                פלטפורמה מתקדמת המשלבת טכנולוגיה חדישה עם כבוד למסורת
              </p>
            </motion.div>
            
            <motion.div 
              className="flex flex-wrap justify-center gap-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ staggerChildren: 0.1 }}
            >
              {features.map((feature, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  whileHover={{ 
                    scale: 1.05, 
                    y: -8,
                    transition: { type: "spring", stiffness: 300 }
                  }}
                  className="glass p-6 rounded-xl shadow-lg hover:shadow-2xl transition-shadow cursor-pointer group w-full md:w-[calc(50%-12px)] lg:w-[calc(33.33%-16px)]"
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
            </motion.div>
          </div>
        </section>

        {/* Download Section (Software) */}
        <section id="download" className="py-20 px-4">
            <div className="container mx-auto max-w-6xl">
                <h2 className="text-4xl font-bold text-center mb-4 font-frank">הורדת התוכנה</h2>
                
                {/* הצגת כפתור הורדה לפלטפורמה שזוהתה */}
                {detectedPlatform && !showAllPlatforms ? (
                  <div className="max-w-2xl mx-auto">
                    <p className="text-center text-xl text-gray-600 mb-8">זיהינו שאתה משתמש ב-{getPlatformName(detectedPlatform)}</p>
                    
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
                    <p className="text-center text-xl text-gray-600 mb-12">
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

        {/* Library Content Download Section - NEW ADDITION */}
        <section className="py-16 px-4 bg-gray-50 border-t border-gray-100">
             <div className="container mx-auto max-w-6xl text-center">
                <h2 className="text-3xl font-bold mb-8 font-frank">הורדת הספרייה (תוכן)</h2>
                <div className="flex justify-center">
                    <a 
                        href="https://github.com/Otzaria/SeforimLibrary/releases/latest/download/seforim.db.zst"
                        className="flex flex-col items-center p-8 bg-white border border-gray-200 rounded-xl hover:border-primary hover:shadow-lg transition-all group max-w-md w-full"
                    >
                        <span className="material-symbols-outlined text-6xl text-primary mb-4 group-hover:scale-110 transition-transform">
                            library_add
                        </span>
                        <h3 className="text-2xl font-bold mb-2 text-gray-800">הורדת המאגר המלא</h3>
                        <p className="text-gray-500 mb-6">קובץ דחוס המכיל את ספריית הספרים המעודכנת</p>
                        <span className="inline-flex items-center gap-2 px-6 py-2 bg-primary/10 text-primary rounded-full font-medium group-hover:bg-primary group-hover:text-white transition-colors">
                            <span className="material-symbols-outlined text-sm">download</span>
                            לחץ להורדה ישירה
                        </span>
                    </a>
                </div>
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
        stableLinks={stableDownloads?.windows || {}}
        devLinks={devDownloads?.windows || {}}
        stableVersion={stableDownloads?.version}
        devVersion={devDownloads?.version}
      />
      <DownloadModal
        isOpen={linuxModalOpen}
        onClose={() => setLinuxModalOpen(false)}
        platform="Linux"
        stableLinks={stableDownloads?.linux || {}}
        devLinks={devDownloads?.linux || {}}
        stableVersion={stableDownloads?.version}
        devVersion={devDownloads?.version}
      />
      <DownloadModal
        isOpen={androidModalOpen}
        onClose={() => setAndroidModalOpen(false)}
        platform="Android"
        stableLinks={{
          playStore: 'https://play.google.com/store/apps/details?id=org.otzaria.otzaria',
          apk: stableDownloads?.android?.apk,
          zipFull: stableDownloads?.android?.zipFull
        }}
        devLinks={{
          playStore: 'https://play.google.com/store/apps/details?id=org.otzaria.otzaria',
          apk: devDownloads?.android?.apk,
          zipFull: devDownloads?.android?.zipFull
        }}
        stableVersion={stableDownloads?.version}
        devVersion={devDownloads?.version}
      />
      <DownloadModal
        isOpen={iosModalOpen}
        onClose={() => setIosModalOpen(false)}
        platform="iOS"
        stableLinks={{
          appStore: 'https://apps.apple.com/us/app/otzaria/id6738098031'
        }}
        devLinks={{
          appStore: 'https://apps.apple.com/us/app/otzaria/id6738098031'
        }}
        stableVersion={stableDownloads?.version}
        devVersion={devDownloads?.version}
      />
      <DownloadModal
        isOpen={macModalOpen}
        onClose={() => setMacModalOpen(false)}
        platform="macOS"
        stableLinks={stableDownloads?.macos || {}}
        devLinks={devDownloads?.macos || {}}
        stableVersion={stableDownloads?.version}
        devVersion={devDownloads?.version}
      />
    </div>
  );
}

// Download Modal Component
function DownloadModal({ isOpen, onClose, platform, stableLinks, devLinks, stableVersion, devVersion }: any) {
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
        <div className="flex items-center justify-between p-6 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-2xl font-bold text-gray-800">
            הורדת אוצריא ל-{platform}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500">
            <span className="material-symbols-outlined text-2xl block">close</span>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
          <div className="space-y-8">
            {/* Stable Version */}
            <div>
              <div className="flex items-center gap-3 mb-4 sticky top-0 bg-white z-10 py-2">
                <span className="material-symbols-outlined text-green-600">verified</span>
                <h3 className="text-xl font-bold text-gray-800">
                  גירסה יציבה
                  {stableVersion && <span className="text-sm font-normal text-gray-500 mr-2"> ({stableVersion})</span>}
                </h3>
                <span className="px-3 py-1 bg-green-100 text-green-800 text-xs font-bold rounded-full">מומלץ</span>
              </div>
              <div className="grid gap-3">
                {renderDownloadOptions(platform, stableLinks)}
              </div>
            </div>

            {/* Dev Version */}
            <div>
              <div className="flex items-center gap-3 mb-4 sticky top-0 bg-white z-10 py-2">
                <span className="material-symbols-outlined text-orange-600">code</span>
                <h3 className="text-xl font-bold text-gray-800">
                  גירסת פיתוח
                  {devVersion && <span className="text-sm font-normal text-gray-500 mr-2"> ({devVersion})</span>}
                </h3>
                <span className="px-3 py-1 bg-orange-100 text-orange-800 text-xs font-bold rounded-full">ניסיוני</span>
              </div>
              <div className="grid gap-3">
                {renderDownloadOptions(platform, devLinks)}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

function renderDownloadOptions(platform: string, links: any) {
  const options: any = {
    Windows: [
      { key: 'exe', icon: 'install_desktop', title: 'EXE Installer', desc: 'קובץ התקנה (מומלץ)' },
      { key: 'exeFull', icon: 'install_desktop', title: 'EXE Installer (Full)', desc: 'קובץ התקנה עם ספרייה מלאה' },
      { key: 'msix', icon: 'package_2', title: 'MSIX Package', desc: 'התקנה דרך החנות' },
      { key: 'zip', icon: 'folder_zip', title: 'Portable ZIP', desc: 'גרסה ניידת ללא התקנה' }
    ],
    Linux: [
      { key: 'deb', icon: 'package_2', title: 'DEB Package', desc: 'עבור Ubuntu/Debian' },
      { key: 'rpm', icon: 'package_2', title: 'RPM Package', desc: 'עבור Fedora/RedHat' },
      { key: 'appimage', icon: 'apps', title: 'AppImage', desc: 'קובץ הרצה אוניברסלי' },
      { key: 'tarFull', icon: 'folder_zip', title: 'Full Package', desc: 'חבילה מלאה עם ספרייה' }
    ],
    Android: [
      { key: 'playStore', icon: 'shop', title: 'Google Play', desc: 'התקנה מהחנות', isLink: true },
      { key: 'apk', icon: 'android', title: 'APK File', desc: 'התקנה ידנית' },
      { key: 'zipFull', icon: 'folder_zip', title: 'Full Package', desc: 'APK + ספרייה מלאה' }
    ],
    iOS: [
      { key: 'appStore', icon: 'shop', title: 'App Store', desc: 'הורדה מחנות האפליקציות', isLink: true }
    ],
    macOS: [
      { key: 'dmg', icon: 'album', title: 'DMG Image', desc: 'קובץ התקנה למק (מומלץ)' },
      { key: 'zip', icon: 'folder_zip', title: 'macOS Package', desc: 'גרסה דחוסה' },
      { key: 'zipFull', icon: 'folder_zip', title: 'Full Package', desc: 'חבילה מלאה עם ספרייה' }
    ]
  }

  const platformOptions = options[platform] || []
  const validOptions = platformOptions.filter((opt: any) => links && links[opt.key])

  if (validOptions.length === 0) {
    return <p className="text-gray-500 italic p-4 bg-gray-50 rounded-lg text-center border border-dashed border-gray-300">אין הורדות זמינות כרגע לגרסה זו.</p>
  }

  return validOptions.map((option: any) => (
    <a
      key={option.key}
      href={links[option.key]}
      target={option.isLink ? "_blank" : undefined}
      rel={option.isLink ? "noopener noreferrer" : undefined}
      className="flex items-center gap-4 p-4 rounded-xl border border-gray-200 hover:border-primary hover:shadow-md transition-all group bg-gray-50 hover:bg-white"
    >
      <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center shadow-sm text-primary group-hover:scale-110 transition-transform">
        <span className="material-symbols-outlined text-2xl">{option.icon}</span>
      </div>
      <div className="flex-1">
        <h4 className="font-bold text-gray-800">{option.title}</h4>
        <p className="text-sm text-gray-500">{option.desc}</p>
      </div>
      <span className="material-symbols-outlined text-gray-400 group-hover:text-primary">
        {option.isLink ? 'open_in_new' : 'download'}
      </span>
    </a>
  ))
}

