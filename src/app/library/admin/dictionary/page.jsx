'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useDialog } from '@/components/providers/DialogContext'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

export default function AdminDictionaryPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { showAlert, showConfirm } = useDialog()

  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [skipped, setSkipped] = useState(() => new Set())

  useEffect(() => {
    if (status === 'loading') return

    if (status === 'unauthenticated') {
      router.push(`/library/auth/login?callbackUrl=${encodeURIComponent(window.location.pathname)}`)
      return
    }

    if (session?.user?.role !== 'admin') {
      router.push('/library/dashboard')
      return
    }

    loadEntries()
  }, [status, session, router])

  const loadEntries = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/admin/dictionary')
      if (!res.ok) throw new Error('Failed to load dictionary')
      const data = await res.json()
      setEntries(Array.isArray(data.entries) ? data.entries : [])
      if (Array.isArray(data.skipped)) {
        const next = new Set(data.skipped.map(item => `${item.userId}::${item.word}`))
        setSkipped(next)
      } else {
        setSkipped(new Set())
      }
    } catch (err) {
      console.error(err)
      showAlert('שגיאה', 'שגיאה בטעינת המילים')
    } finally {
      setLoading(false)
    }
  }

  const handleAddGlobal = async (userId, word) => {
    try {
      const res = await fetch('/api/admin/dictionary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add-global', userId, word })
      })
      if (!res.ok) throw new Error('Failed')

      setEntries(prev => prev.filter(e => !(e.userId === userId && e.word === word)))
      setSkipped(prev => {
        const next = new Set(prev)
        next.delete(`${userId}::${word}`)
        return next
      })
      showAlert('הצלחה', 'נוסף למילון הכללי והוסר מהמילון האישי')
    } catch (err) {
      showAlert('שגיאה', 'שגיאה בהוספה למילון הכללי')
    }
  }

  const handleRemovePersonal = async (userId, word) => {
    showConfirm(
      'הסרה מהמילון האישי',
      `האם להסיר את "${word}" מהמילון האישי?`,
      async () => {
        try {
          const res = await fetch('/api/admin/dictionary', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'remove-personal', userId, word })
          })
          if (!res.ok) throw new Error('Failed')
          setEntries(prev => prev.filter(e => !(e.userId === userId && e.word === word)))
          setSkipped(prev => {
            const next = new Set(prev)
            next.delete(`${userId}::${word}`)
            return next
          })
          showAlert('הצלחה', 'הוסר מהמילון האישי')
        } catch (err) {
          showAlert('שגיאה', 'שגיאה בהסרה מהמילון האישי')
        }
      }
    )
  }

  const handleSkip = async (userId, word) => {
    try {
      const res = await fetch('/api/admin/dictionary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'skip', userId, word })
      })
      if (!res.ok) throw new Error('Failed')
      setSkipped(prev => {
        const next = new Set(prev)
        next.add(`${userId}::${word}`)
        return next
      })
    } catch (err) {
      showAlert('שגיאה', 'שגיאה בדילוג')
    }
  }

  const filteredEntries = useMemo(() => {
    const term = search.trim().toLowerCase()
    return entries.filter(item => {
      if (skipped.has(`${item.userId}::${item.word}`)) return false
      if (!term) return true
      return (
        item.word.toLowerCase().includes(term) ||
        item.name.toLowerCase().includes(term) ||
        item.email.toLowerCase().includes(term)
      )
    })
  }, [entries, search, skipped])

  const skippedEntries = useMemo(() => {
    const term = search.trim().toLowerCase()
    return entries.filter(item => {
      if (!skipped.has(`${item.userId}::${item.word}`)) return false
      if (!term) return true
      return (
        item.word.toLowerCase().includes(term) ||
        item.name.toLowerCase().includes(term) ||
        item.email.toLowerCase().includes(term)
      )
    })
  }, [entries, search, skipped])

  if (status === 'loading') return (
    <div className="flex justify-center items-center h-64">
      <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
    </div>
  )

  if (session?.user?.role !== 'admin') return null

  return (
    <div className="glass-strong p-6 rounded-xl animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <h2 className="text-2xl font-bold text-on-surface flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">spellcheck</span>
          מילים שמשתמשים הוסיפו למילון האישי
        </h2>
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חפש מילה/משתמש"
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-64"
          />
          <button
            onClick={loadEntries}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm"
          >
            רענן
          </button>
        </div>
      </div>

      {loading ? (
        <LoadingSpinner message="טוען מילים..." />
      ) : filteredEntries.length === 0 ? (
        <div className="text-center py-12 text-gray-500">אין מילים להצגה</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full bg-white">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-700 text-sm">
                <th className="text-right p-4 font-bold">מילה</th>
                <th className="text-right p-4 font-bold">משתמש</th>
                <th className="text-right p-4 font-bold">אימייל</th>
                <th className="text-center p-4 font-bold">פעולות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredEntries.map(entry => (
                <tr key={`${entry.userId}-${entry.word}`} className="hover:bg-gray-50 transition-colors">
                  <td className="p-4 font-medium text-gray-900">{entry.word}</td>
                  <td className="p-4 text-sm">{entry.name || '-'}</td>
                  <td className="p-4 text-sm text-gray-500">{entry.email || '-'}</td>
                  <td className="p-4">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => handleAddGlobal(entry.userId, entry.word)}
                        className="px-3 py-1.5 bg-green-600 text-white rounded-md text-xs hover:bg-green-700"
                      >
                        הוסף למילון
                      </button>
                      <button
                        onClick={() => handleSkip(entry.userId, entry.word)}
                        className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-md text-xs hover:bg-gray-200"
                      >
                        דלג
                      </button>
                      <button
                        onClick={() => handleRemovePersonal(entry.userId, entry.word)}
                        className="px-3 py-1.5 bg-red-50 text-red-700 rounded-md text-xs hover:bg-red-100"
                      >
                        הסר מהמילון האישי
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && skippedEntries.length > 0 && (
        <div className="mt-8">
          <h3 className="text-lg font-bold text-gray-800 mb-3">מילים מדולגות</h3>
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full bg-white">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-gray-700 text-sm">
                  <th className="text-right p-4 font-bold">מילה</th>
                  <th className="text-right p-4 font-bold">משתמש</th>
                  <th className="text-right p-4 font-bold">אימייל</th>
                  <th className="text-center p-4 font-bold">פעולות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {skippedEntries.map(entry => (
                  <tr key={`skipped-${entry.userId}-${entry.word}`} className="hover:bg-gray-50 transition-colors">
                    <td className="p-4 font-medium text-gray-900">{entry.word}</td>
                    <td className="p-4 text-sm">{entry.name || '-'}</td>
                    <td className="p-4 text-sm text-gray-500">{entry.email || '-'}</td>
                    <td className="p-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleAddGlobal(entry.userId, entry.word)}
                          className="px-3 py-1.5 bg-green-600 text-white rounded-md text-xs hover:bg-green-700"
                        >
                          הוסף למילון
                        </button>
                        <button
                          onClick={() => handleRemovePersonal(entry.userId, entry.word)}
                          className="px-3 py-1.5 bg-red-50 text-red-700 rounded-md text-xs hover:bg-red-100"
                        >
                          הסר מהמילון האישי
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

