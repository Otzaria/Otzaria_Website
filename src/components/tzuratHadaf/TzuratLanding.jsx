'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import Button from '@/components/ui/Button'
import BookProgressList from './BookProgressList'
import { AccessNotice } from './TzuratShell'
import { api } from './api'
import { ADMIN_PATH, BASE_PATH, FAST_PATH, GUIDE_PATH, MINE_PATH, PRACTICE_PATH, num } from './labels'

// דף הכניסה של צורת הדף: מה זה, שני המסלולים, ההתקדמות לכל מסכת והתרומות שלי.
// הנתונים: GET /api/tzurat-hadaf/overview.

function TrackCard({ href, icon, title, text }) {
  return (
    <Link
      href={href}
      prefetch={false}
      className="glass-strong group flex flex-col gap-2 rounded-2xl p-6 transition-all hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-primary"
    >
      <span aria-hidden="true" className="material-symbols-outlined text-5xl text-primary">{icon}</span>
      <span className="text-xl font-bold text-on-surface group-hover:text-primary">{title}</span>
      <span className="text-on-surface/70">{text}</span>
    </Link>
  )
}

function MySummary({ me }) {
  const cells = [
    { label: 'נקודות', value: me.points },
    { label: 'החלטות נוסח', value: me.decisions },
    { label: 'מהן הוסכמו', value: me.agreed },
    { label: 'עמודים שהוגשו', value: me.pages },
    { label: 'עמודים שאושרו', value: me.pagesApproved },
    { label: 'דיווחים', value: me.reports },
  ]
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {cells.map((c) => (
        <div key={c.label} className="rounded-xl bg-surface-variant/50 p-3 text-center">
          <dt className="text-xs text-on-surface/60">{c.label}</dt>
          <dd className="text-2xl font-bold text-on-surface tabular-nums">{num(c.value)}</dd>
        </div>
      ))}
    </dl>
  )
}

export default function TzuratLanding() {
  const [data, setData] = useState(null)
  const [fail, setFail] = useState(null)

  const load = useCallback(async () => {
    const r = await api.overview()
    if (r.ok) {
      setData(r.data)
      setFail(null)
    } else setFail({ status: r.status, error: r.error })
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  const me = data?.me

  return (
    <div className="flex flex-col gap-6">
      <section className="glass-strong rounded-2xl p-6 leading-relaxed text-on-surface/85">
        <p>
          פרויקט &quot;צורת הדף&quot; בונה מחדש את דפי הגמרא בצורת דף וילנא, מהטקסט של אוצריא. המחשב כבר השווה את העמודים לסריקה
          של הדפוס, אבל במקומות רבים הוא לא בטוח. כאן אתם עוזרים: מכריעים מה כתוב בדפוס, בודקים שהשורות נשברות כמו בדפוס,
          ומדווחים על מה שלא נראה נכון.
        </p>
        <p className="mt-2">
          <Link href={GUIDE_PATH} prefetch={false} className="inline-flex items-center gap-1 font-bold text-primary hover:underline">
            <span aria-hidden="true" className="material-symbols-outlined text-base">menu_book</span>
            ההנחיות למתנדבים
          </Link>
        </p>
      </section>

      {fail && <AccessNotice status={fail.status} error={fail.error} onRetry={load} />}

      {me && !me.practiceDone && (
        <div className="flex flex-wrap items-center gap-4 rounded-2xl border-2 border-primary bg-primary-container/60 p-5" data-testid="practice-cta">
          <span aria-hidden="true" className="material-symbols-outlined text-5xl text-primary">school</span>
          <div className="min-w-[14rem] flex-1">
            <p className="text-lg font-bold text-on-surface">תרגול קצר לפני שמתחילים</p>
            <p className="text-on-surface/70">עשר שאלות לדוגמה, עם התשובה וההסבר. כמה דקות, ואז אפשר להתחיל.</p>
          </div>
          <Button href={PRACTICE_PATH} prefetch={false} size="lg" icon="school">
            לתרגול
          </Button>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <TrackCard href={FAST_PATH} icon="quiz" title="החלטות מהירות" text="כרטיס אחד בכל פעם: קטע מהסריקה, ושאלה אחת — מה כתוב בדפוס. מתאים לכמה דקות פנויות." />
        <TrackCard
          href={`${BASE_PATH}/pages`}
          icon="find_in_page"
          title="בדיקת עמוד"
          text="לוקחים עמוד שלם ובודקים אותו מול הסריקה: הגושים, שבירת השורות, הנוסח. העמוד שמור לכם 48 שעות."
        />
      </div>

      {me && (
        <section className="glass-strong flex flex-col gap-4 rounded-2xl p-5" aria-labelledby="th-mine">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="th-mine" className="text-xl font-bold text-on-surface">
              התרומות שלי
            </h2>
            <Link href={MINE_PATH} prefetch={false} className="text-sm font-bold text-primary hover:underline">
              לכל הפרטים
            </Link>
          </div>
          <MySummary me={me} />
        </section>
      )}

      {data && (
        <section className="glass-strong flex flex-col gap-3 rounded-2xl p-5" aria-labelledby="th-books">
          <h2 id="th-books" className="text-xl font-bold text-on-surface">
            ההתקדמות לפי מסכת
          </h2>
          <BookProgressList books={data.books} />
        </section>
      )}

      {data?.canAdmin && (
        <Link href={ADMIN_PATH} prefetch={false} className="inline-flex items-center gap-2 self-start rounded-lg bg-accent/20 px-4 py-2 font-bold text-on-surface hover:bg-accent/30">
          <span aria-hidden="true" className="material-symbols-outlined">admin_panel_settings</span>
          ניהול צורת הדף
        </Link>
      )}
    </div>
  )
}
