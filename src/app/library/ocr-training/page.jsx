'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/layout/Header'
import { useDialog } from '@/components/providers/DialogContext'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

export default function OcrTrainingListPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { showAlert } = useDialog()
  const [pages, setPages] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('available') // available | mine

  const load = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/ocr-training')
      const data = await res.json()
      if (data.success) setPages(data.pages)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/login?callbackUrl=/library/ocr-training')
    } else if (status === 'authenticated') {
      load()
    }
  }, [status, router])

  const handleClaim = async (page) => {
    try {
      const res = await fetch(`/api/ocr-training/${page.id}/claim`, { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        router.push(`/library/ocr-training/${page.id}`)
      } else {
        showAlert('שגיאה', data.error || 'שגיאה בתפיסת העמוד')
      }
    } catch {
      showAlert('שגיאה', 'תקלה בתקשורת')
    }
  }

  const isVerified = session?.user?.isVerified

  const available = pages.filter((p) => p.status === 'available' && !p.mine)
  const mine = pages.filter((p) => p.mine)
  const shown = tab === 'available' ? available : mine

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex-1 w-full px-6 py-10">
        <div className="max-w-5xl mx-auto">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-on-surface flex items-center gap-3">
              <span className="material-symbols-outlined text-4xl text-accent">model_training</span>
              סימון שורות לאימון OCR
            </h1>
            <p className="text-on-surface/60 mt-2">
              תפסו עמוד, סמנו שורות על גבי התמונה וכתבו את הטקסט המדויק של כל שורה. יש לסמן לפחות 10 שורות לכל עמוד.
            </p>
          </div>

          {!isVerified && (
            <div className="mb-6 bg-warning-alt-50 border border-warning-alt-200 text-warning-alt-800 rounded-xl p-4 flex items-center gap-2">
              <span className="material-symbols-outlined">info</span>
              רק משתמשים עם כתובת אימייל מאומתת יכולים לתפוס עמודים ולסמן שורות.
            </div>
          )}

          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setTab('available')}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                tab === 'available' ? 'bg-primary text-on-primary' : 'glass text-on-surface hover:bg-surface-variant'
              }`}
            >
              עמודים זמינים ({available.length})
            </button>
            <button
              onClick={() => setTab('mine')}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                tab === 'mine' ? 'bg-primary text-on-primary' : 'glass text-on-surface hover:bg-surface-variant'
              }`}
            >
              העמודים שלי ({mine.length})
            </button>
          </div>

          {loading ? (
            <LoadingSpinner message="טוען עמודים..." />
          ) : shown.length === 0 ? (
            <div className="glass-strong rounded-xl p-10 text-center text-on-surface/60">
              {tab === 'available' ? 'אין כרגע עמודים זמינים לסימון.' : 'לא תפסת עדיין אף עמוד.'}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {shown.map((p) => (
                <div key={p.id} className="glass-strong rounded-xl overflow-hidden flex flex-col">
                  <div className="h-40 bg-neutral-100 overflow-hidden flex items-center justify-center">
                    <img src={p.imagePath} alt={`${p.bookName} עמוד ${p.pageNumber}`} className="w-full h-full object-cover object-top" />
                  </div>
                  <div className="p-4 flex-1 flex flex-col gap-2">
                    <div className="font-bold text-on-surface truncate" title={p.bookName}>{p.bookName}</div>
                    <div className="text-sm text-on-surface/60 flex items-center gap-2">
                      <span>עמוד {p.pageNumber}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${p.scriptType === 'rashi' ? 'bg-warning-alt-100 text-warning-alt-800' : 'bg-info-100 text-info-800'}`}>
                        {p.scriptType === 'rashi' ? 'רש״י' : 'מרובע'}
                      </span>
                    </div>
                    <div className="text-sm">
                      <span className={p.filledLines >= p.targetLines ? 'text-success-600 font-bold' : 'text-info-600'}>
                        {p.filledLines}/{p.targetLines} שורות
                      </span>
                    </div>
                    <div className="mt-auto pt-2">
                      {p.mine ? (
                        <Link
                          href={`/library/ocr-training/${p.id}`}
                          className="block text-center bg-info-600 hover:bg-info-700 text-white font-medium px-4 py-2 rounded-lg transition-colors"
                        >
                          המשך סימון
                        </Link>
                      ) : (
                        <button
                          onClick={() => handleClaim(p)}
                          disabled={!isVerified}
                          className="w-full bg-primary hover:opacity-90 text-on-primary font-bold px-4 py-2 rounded-lg transition-all disabled:opacity-40"
                        >
                          תפוס עמוד
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
