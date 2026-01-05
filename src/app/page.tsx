'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import OtzariaSoftwareHeader from '@/components/OtzariaSoftwareHeader'
import OtzariaSoftwareFooter from '@/components/OtzariaSoftwareFooter'

export default function Home() {
  const [windowsModalOpen, setWindowsModalOpen] = useState(false)
  const [linuxModalOpen, setLinuxModalOpen] = useState(false)
  const [androidModalOpen, setAndroidModalOpen] = useState(false)
  const [macModalOpen, setMacModalOpen] = useState(false)
  const [iosModalOpen, setIosModalOpen] = useState(false) // הוספת State ל-iOS
  
  const [stableDownloads, setStableDownloads] = useState<any>(null)
  const [devDownloads, setDevDownloads] = useState<any>(null)

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
      icon: 'library_books',
      title: 'ספרייה עשירה',
      description: 'מאגר ספרים תורניים רחב ומקיף, מסונן בקפידה לציבור התורני'
    },
    {
      icon: 'search',
      title: 'חיפוש מהיר',
      description: 'מנוע חיפוש חכם ומהיר המאפשר מציאת כל מידע בקלות'
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
                
                <div className="flex flex-col sm:flex-row gap-4 justify-center mt-8">
                    <Link href="#download" className="px-8 py-4 bg-primary text-white rounded-lg text-lg font-medium hover:bg-primary/90 transition-all shadow-lg hover:shadow-xl">
                        הורד עכשיו
                    </Link>
                    <Link href="/library" className="px-8 py-4 bg-white border-2 border-primary text-primary rounded-lg text-lg font-medium hover:bg-primary/5 transition-all">
                        לספרייה המקוונת
                    </Link>
                </div>
            </div>
        </section>

        {/* Features Section */}
        <section className="py-20 px-4 bg-gray-50">
            <div className="container mx-auto max-w-6xl">
                <h2 className="text-4xl font-bold text-center mb-12 font-frank">מה מייחד את אוצריא?</h2>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {features.map((feature, index) => (
                        <div key={index} className="bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition-shadow">
                            <span className="material-symbols-outlined text-5xl text-primary mb-4 block">{feature.icon}</span>
                            <h3 className="text-xl font-bold mb-2">{feature.title}</h3>
                            <p className="text-gray-600">{feature.description}</p>
                        </div>
                    ))}
                </div>
            </div>
        </section>

        {/* Download Section */}
        <section id="download" className="py-20 px-4">
            <div className="container mx-auto max-w-6xl">
                <h2 className="text-4xl font-bold text-center mb-4 font-frank">הורדת התוכנה</h2>
                <p className="text-center text-xl text-gray-600 mb-12">בחר את הפלטפורמה המתאימה לך</p>
                
                <div className="grid md:grid-cols-3 lg:grid-cols-5 gap-6">
                    {/* Windows */}
                    <button onClick={() => setWindowsModalOpen(true)} className="flex flex-col items-center p-6 bg-white border border-gray-200 rounded-xl hover:border-primary hover:shadow-lg transition-all group h-full">
                        <span className="material-symbols-outlined text-6xl text-primary mb-4 group-hover:scale-110 transition-transform">desktop_windows</span>
                        <h3 className="text-xl font-bold mb-1">Windows</h3>
                        <p className="text-sm text-gray-500">10 / 11</p>
                    </button>

                    {/* Linux */}
                    <button onClick={() => setLinuxModalOpen(true)} className="flex flex-col items-center p-6 bg-white border border-gray-200 rounded-xl hover:border-primary hover:shadow-lg transition-all group h-full">
                        <span className="material-symbols-outlined text-6xl text-primary mb-4 group-hover:scale-110 transition-transform">computer</span>
                        <h3 className="text-xl font-bold mb-1">Linux</h3>
                        <p className="text-sm text-gray-500">כל ההפצות</p>
                    </button>

                    {/* Android */}
                    <button onClick={() => setAndroidModalOpen(true)} className="flex flex-col items-center p-6 bg-white border border-gray-200 rounded-xl hover:border-primary hover:shadow-lg transition-all group h-full">
                        <span className="material-symbols-outlined text-6xl text-primary mb-4 group-hover:scale-110 transition-transform">phone_android</span>
                        <h3 className="text-xl font-bold mb-1">Android</h3>
                        <p className="text-sm text-gray-500">Google Play / APK</p>
                    </button>

                    {/* iOS - כפתור חדש */}
                    <button onClick={() => setIosModalOpen(true)} className="flex flex-col items-center p-6 bg-white border border-gray-200 rounded-xl hover:border-primary hover:shadow-lg transition-all group h-full">
                        <span className="material-symbols-outlined text-6xl text-primary mb-4 group-hover:scale-110 transition-transform">phone_iphone</span>
                        <h3 className="text-xl font-bold mb-1">iOS</h3>
                        <p className="text-sm text-gray-500">App Store</p>
                    </button>

                    {/* Mac */}
                    <button onClick={() => setMacModalOpen(true)} className="flex flex-col items-center p-6 bg-white border border-gray-200 rounded-xl hover:border-primary hover:shadow-lg transition-all group h-full">
                        <span className="material-symbols-outlined text-6xl text-primary mb-4 group-hover:scale-110 transition-transform">laptop_mac</span>
                        <h3 className="text-xl font-bold mb-1">macOS</h3>
                        <p className="text-sm text-gray-500">Intel / Apple Silicon</p>
                    </button>
                </div>
            </div>
        </section>

        {/* Contribute Link */}
        <section className="py-20 px-4 bg-primary/5 text-center">
            <div className="container mx-auto">
                 <h2 className="text-3xl font-bold mb-6">רוצים לתרום לפיתוח?</h2>
                 <Link href="/library/upload" className="inline-flex items-center gap-2 px-6 py-3 bg-white text-primary border border-primary rounded-lg font-medium hover:bg-primary hover:text-white transition-colors">
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
          playStore: 'https://play.google.com/store/apps/details?id=com.mendelg.otzaria',
          apk: stableDownloads?.android?.apk
        }}
        devLinks={{
          playStore: 'https://play.google.com/store/apps/details?id=com.mendelg.otzaria',
          apk: devDownloads?.android?.apk
        }}
        stableVersion={stableDownloads?.version}
        devVersion={devDownloads?.version}
      />
      {/* iOS Modal */}
      <DownloadModal
        isOpen={iosModalOpen}
        onClose={() => setIosModalOpen(false)}
        platform="iOS"
        stableLinks={{
          appStore: 'https://apps.apple.com/us/app/otzaria/id6738098031'
        }}
        devLinks={{
          // בדרך כלל iOS dev זה דרך TestFlight, אבל נשים קישור לחנות אם אין אחר
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
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
      >
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-800">
            הורדת אוצריא ל-{platform}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-6 space-y-8">
          {/* Stable Version */}
          <div>
            <div className="flex items-center gap-3 mb-4">
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
            <div className="flex items-center gap-3 mb-4">
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
      </motion.div>
    </div>
  )
}

function renderDownloadOptions(platform: string, links: any) {
  const options: any = {
    Windows: [
      { key: 'exe', icon: 'install_desktop', title: 'EXE Installer', desc: 'קובץ התקנה (מומלץ)' },
      { key: 'msix', icon: 'package_2', title: 'MSIX Package', desc: 'התקנה דרך החנות' },
      { key: 'zip', icon: 'folder_zip', title: 'Portable ZIP', desc: 'גרסה ניידת ללא התקנה' }
    ],
    Linux: [
      { key: 'deb', icon: 'package_2', title: 'DEB Package', desc: 'עבור Ubuntu/Debian' },
      { key: 'rpm', icon: 'package_2', title: 'RPM Package', desc: 'עבור Fedora/RedHat' },
      { key: 'appimage', icon: 'apps', title: 'AppImage', desc: 'קובץ הרצה אוניברסלי' }
    ],
    Android: [
      { key: 'playStore', icon: 'shop', title: 'Google Play', desc: 'התקנה מהחנות', isLink: true },
      { key: 'apk', icon: 'android', title: 'APK File', desc: 'התקנה ידנית' }
    ],
    iOS: [
      { key: 'appStore', icon: 'shop', title: 'App Store', desc: 'הורדה מחנות האפליקציות', isLink: true }
    ],
    macOS: [
      { key: 'dmg', icon: 'album', title: 'DMG Image', desc: 'קובץ התקנה למק (מומלץ)' },
      { key: 'zip', icon: 'folder_zip', title: 'macOS Package', desc: 'גרסה דחוסה' }
    ]
  }

  const platformOptions = options[platform] || []
  const validOptions = platformOptions.filter((opt: any) => links && links[opt.key])

  if (validOptions.length === 0) {
    return <p className="text-gray-500 italic p-4 bg-gray-50 rounded-lg text-center">אין הורדות זמינות כרגע לגרסה זו.</p>
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