'use client'

// חלק הלקוח של דף "כל התוספים" — מקבל את הרשימה המלאה כ-prop מה-Server
// Component (page.tsx) במקום לשלוף אותה בעצמו ב-fetch, אבל שומר על כל
// האינטראקטיביות: סינון ומיון מקומיים (חיפוש/סטטוס/תגית/מיון, עם שימור מצב ב-URL),
// התקנה ישירה (useDirectInstall) + דיאלוגים.
//
// לוגיקת הסינון עצמה חולצה ל-src/lib/pluginFilter.js כדי שתהיה ניתנת
// לבדיקה בנפרד מהקומפוננטה (ראו src/lib/pluginFilter.test.mjs).
//
// ביצועים: הדף סטטי (ISR), ולכן המסננים מה-URL נקראים מ-window.location אחרי
// hydration ולא דרך useSearchParams — useSearchParams בזמן prerender מבטל את
// רינדור הגבול בשרת, וה-HTML הסטטי הכיל רק ספינר במקום רשימת התוספים. עכשיו
// ה-HTML מכיל את הרשימה המלאה (מצב ברירת המחדל), וקישור עם ?q=/tag=/status=
// מסונן מיד אחרי ה-hydration.
//
// כדי שקישור מסונן לא יציג קודם את כל הרשימה ואז "יקפוץ" לרשימה המסוננת (CLS):
// - בטעינה ישירה, סקריפט inline קטן (FILTER_PENDING_SCRIPT) רץ לפני שהתוכן נצבע,
//   ואם יש ב-URL פרמטר סינון הוא מסתיר את התוכן ומציג במקומו ספינר (כמו ה-Suspense
//   שהיה כאן קודם) עד שהמסננים הוחלו.
// - בניווט בתוך האתר (סקריפט שנוצר ב-React אינו רץ) — אתחול המסננים ב-
//   useLayoutEffect, שרץ לפני הצביעה.
//
// מבנה העמוד (מפרט החנות, סעיף 6 / סוכן 2), לסריקה מהירה:
//   StorePageHeader (פירורי לחם, h1, "העלה תוסף חדש") ובתוכו לוח מסננים אחד — חיפוש, סטטוס ומיון בשורה,
//   ומתחת שורת תגיות: "כל התגיות" (חלונית עם חיפוש) + התגיות הנפוצות, עם מונה (TagFilterChips).
//   → אזור התוצאות: h2 ובקצה השורה מונה התוצאות + "נקה סינון" כשיש סינון פעיל.
//   → רשת הכרטיסים (h3). → אזור הסבר "תוספים לאוצריא".

import { useState, useEffect, useLayoutEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import EmptyState from '@/components/ui/EmptyState'
import IconTile from '@/components/ui/IconTile'
import Section from '@/components/ui/Section'
import SectionHeading from '@/components/ui/SectionHeading'
import { useDirectInstall } from '@/components/plugins/useDirectInstall'
import { useDialog } from '@/components/providers/DialogContext'
import PluginCard from '@/components/plugins/PluginCard'
import PluginGrid from '@/components/plugins/PluginGrid'
import PluginSearchBox from '@/components/plugins/PluginSearchBox'
import StorePageHeader from '@/components/plugins/StorePageHeader'
import ResultsHeading from '@/components/plugins/listing/ResultsHeading'
import SortSelect from '@/components/plugins/listing/SortSelect'
import StatusSelect from '@/components/plugins/listing/StatusSelect'
import TagFilterChips from '@/components/plugins/listing/TagFilterChips'
import { FIELD_LABEL_COMPACT } from '@/components/ui/fieldStyles'
import { filterPlugins, sortPlugins, countTags, rankTags, SORT_MODES } from '@/lib/pluginFilter'
import type { PluginCardData } from '@/components/plugins/types'
import Loader from '@/components/ui/Loader'

// מזהה אלמנט ה-style שהסקריפט מוסיף ל-head; מוסר אחרי אתחול המסננים מה-URL.
// style ב-head ולא attribute על <html>: ל-<html> יש props מ-React (layout.tsx),
// ו-attribute זר עליו היה מתריע על אי-התאמה ב-hydration.
const FILTER_PENDING_STYLE_ID = 'plugins-filter-pending'

const FILTER_PENDING_SCRIPT =
  `if(/[?&](q|tag|status|sort)=/.test(location.search)){` +
  `var s=document.createElement('style');s.id='${FILTER_PENDING_STYLE_ID}';` +
  `s.textContent='#all-plugins-content{display:none}#all-plugins-pending{display:flex}';` +
  `document.head.appendChild(s)}`

const TITLE_ID = 'all-plugins-title'
const RESULTS_TITLE_ID = 'all-plugins-results-title'
const INFO_TITLE_ID = 'all-plugins-info-title'
const SEARCH_INPUT_ID = 'all-plugins-search'

// היתרונות באזור "תוספים לאוצריא" — הנוסח הקיים, עם אייקון לכל שורה
const INFO_POINTS = [
  { icon: 'download', text: 'הורדה רגילה לצד התקנה ישירה' },
  { icon: 'label', text: 'תגיות שעוזרות למצוא את התוסף המתאים' },
  { icon: 'info', text: 'פרטי גרסה ותאימות במקום אחד' }
] as const

interface AllPluginsClientProps {
  plugins: PluginCardData[]
}

export default function AllPluginsClient({ plugins }: AllPluginsClientProps) {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [activeTag, setActiveTag] = useState('all')
  const [sortMode, setSortMode] = useState('recommended')
  // האם מצב הסינון כבר אותחל מה-URL (רק בצד הלקוח, אחרי hydration)
  const [urlStateReady, setUrlStateReady] = useState(false)
  // מונה איפוסים — חלק מה-key של תיבת החיפוש, כדי ש"נקה סינון" ירוקן גם אותה (השדה לא נשלט)
  const [resetCount, setResetCount] = useState(0)
  const { showAlert } = useDialog() as { showAlert: (title: string, message: string) => void }
  const { installState, install } = useDirectInstall(showAlert)

  // התגיות לפי שכיחות ברשימה המלאה (סדר יציב), והמונה של כל אחת — בסינון הנוכחי של חיפוש וסטטוס
  // (בלי התגית עצמה), כלומר: כמה תוספים יוצגו אם יבחרו בה
  const rankedTags = useMemo(() => rankTags(plugins) as { tag: string; count: number }[], [plugins])
  const tagCounts = useMemo(
    () => countTags(filterPlugins(plugins, { searchQuery, statusFilter })) as Map<string, number>,
    [plugins, searchQuery, statusFilter]
  )
  const tagOptions = useMemo(
    () => rankedTags.map(({ tag }) => ({ tag, count: tagCounts.get(tag) || 0 })),
    [rankedTags, tagCounts]
  )
  const filteredPlugins: PluginCardData[] = useMemo(
    () => sortPlugins(filterPlugins(plugins, { searchQuery, statusFilter, activeTag }), sortMode),
    [plugins, searchQuery, statusFilter, activeTag, sortMode]
  )
  const isFiltered = Boolean(searchQuery) || statusFilter !== 'all' || activeTag !== 'all'

  // אתחול מצב הסינון מה-URL — קישורים שיתופיים (?q=&tag=&status=&sort=).
  // useLayoutEffect: העדכון והרינדור המסונן קורים לפני הצביעה, כך שבניווט בתוך
  // האתר לא נצבעת קודם הרשימה המלאה.
  useLayoutEffect(() => {
    const params = new URLSearchParams(window.location.search)
    // קריאה חד-פעמית של ה-URL אחרי hydration (הדף סטטי). setState כאן מכוון: זה סנכרון ממערכת
    // חיצונית (ה-URL), שאינה זמינה ברינדור השרת, והתזמון (layout effect — לפני הצביעה) הוא מה שמונע
    // את הבהוב הרשימה המלאה. initializer של useState היה רץ גם בשרת ושובר את ה-hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearchQuery(params.get('q') || '')
    setStatusFilter(params.get('status') || 'all')
    setActiveTag(params.get('tag') || 'all')
    const sort = params.get('sort') || ''
    setSortMode((SORT_MODES as readonly string[]).includes(sort) ? sort : 'recommended')
    setUrlStateReady(true)
    document.getElementById(FILTER_PENDING_STYLE_ID)?.remove()
  }, [])

  // שימור מצב הסינון ב-URL — קישורים שיתופיים (?q=&tag=&status=&sort=)
  useEffect(() => {
    if (!urlStateReady) return
    const params = new URLSearchParams()
    if (searchQuery) params.set('q', searchQuery)
    if (activeTag !== 'all') params.set('tag', activeTag)
    if (statusFilter !== 'all') params.set('status', statusFilter)
    if (sortMode !== 'recommended') params.set('sort', sortMode)
    const next = params.toString()
    const current = new URLSearchParams(window.location.search).toString()
    if (next !== current) {
      router.replace(next ? `/plugins/all?${next}` : '/plugins/all', { scroll: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlStateReady, searchQuery, activeTag, statusFilter, sortMode])

  const clearFilters = () => {
    setSearchQuery('')
    setStatusFilter('all')
    setActiveTag('all')
    setResetCount((n) => n + 1)
  }

  // אפס תוצאות — המונה נשאר מספרי ("מוצגים 0 מתוך 65"); המשפט המלא בכרטיס הריק שמתחת
  const resultsCount =
    plugins.length === 0
      ? ''
      : filteredPlugins.length === plugins.length
      ? `כל התוספים מוצגים (${plugins.length.toLocaleString('he-IL')})`
      : `מוצגים ${filteredPlugins.length.toLocaleString('he-IL')} מתוך ${plugins.length.toLocaleString('he-IL')} תוספים`

  const clearButton = (variant: 'text' | 'tonal') => (
    <Button variant={variant} size={variant === 'text' ? 'sm' : 'md'} icon="filter_alt_off" onClick={clearFilters}>
      נקה סינון
    </Button>
  )

  return (
    <div className="flex flex-1 flex-col">

      {/* CSP: כרגע script-src כולל 'unsafe-inline'. אם יוסר בעתיד — להוסיף ל-script-src hash
          מסוג 'sha256-…' של FILTER_PENDING_SCRIPT (תוכן סטטי, ולכן hash יציב) */}
      <script dangerouslySetInnerHTML={{ __html: FILTER_PENDING_SCRIPT }} />
      {/* ה-<main> עוטף גם את אזור ההמתנה: כך הוא מוצג תמיד, ו"דלג לתוכן" (#main-content) עובד
          גם בזמן שהסינון מה-URL עוד לא הוחל — כולל לפני ה-hydration, כקישור עוגן רגיל */}
      <main id="main-content" className="flex-1">
      {/* מוצג (במקום all-plugins-content) רק בזמן שהסקריפט למעלה מזהה פרמטר סינון ב-URL */}
      <div id="all-plugins-pending" className="hidden min-h-[60vh] flex-1 items-center justify-center">
        <div className="text-center">
          <Loader size="lg" label="טוען את כל התוספים…" />
        </div>
      </div>

      <div id="all-plugins-content">
        <StorePageHeader
          titleId={TITLE_ID}
          breadcrumbs={[{ label: 'חנות התוספים', href: '/plugins' }, { label: 'כל התוספים' }]}
          title="כל התוספים"
          actions={
            <Button href="/plugins/upload" variant="filled" icon="add" className="whitespace-nowrap">
              העלה תוסף חדש
            </Button>
          }
        >
          {/* לוח המסננים — כל הכלים במשטח אחד, בסדר קבוע: חיפוש · סטטוס · מיון, ומתחת תגיות */}
          <Card padding="md" className="flex flex-col gap-5">
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_12rem_12rem]">
              <div>
                <label htmlFor={SEARCH_INPUT_ID} className={FIELD_LABEL_COMPACT}>חיפוש</label>
                {/* key: הרכבה מחדש אחרי קריאת ה-URL (כדי שתיבת החיפוש תציג את ?q=), ואחרי "נקה סינון" */}
                <PluginSearchBox
                  key={`${urlStateReady ? 'url' : 'initial'}-${resetCount}`}
                  inputId={SEARCH_INPUT_ID}
                  placeholder="שם, תיאור או תגית..."
                  defaultValue={searchQuery}
                  onSubmit={(q) => setSearchQuery(q)}
                />
              </div>
              <StatusSelect value={statusFilter} onChange={setStatusFilter} />
              <SortSelect value={sortMode} onChange={setSortMode} />
            </div>

            <TagFilterChips tags={tagOptions} activeTag={activeTag} onSelect={setActiveTag} />
          </Card>
        </StorePageHeader>

        {/* התוצאות */}
        <Section spacing="none" labelledBy={RESULTS_TITLE_ID}>
          <ResultsHeading
            id={RESULTS_TITLE_ID}
            title="בחר את התוסף שמתאים לך"
            count={resultsCount}
            action={isFiltered && filteredPlugins.length > 0 ? clearButton('text') : undefined}
          />

          {filteredPlugins.length === 0 ? (
            plugins.length === 0 ? (
              <EmptyState
                as="h3"
                icon="extension"
                title="בקרוב יופיעו כאן תוספים נוספים"
                description="אם יש לך תוסף מוכן לאוצריא, אפשר לשלוח אותו לחנות ולהציג אותו כאן עם עמוד מסודר, תגיות, הוראות וקישורי התקנה."
                actions={
                  <Button href="/plugins/upload" variant="tonal" icon="add">
                    העלה תוסף חדש
                  </Button>
                }
              />
            ) : (
              <EmptyState
                as="h3"
                role="status"
                icon="search_off"
                title="לא נמצאו תוספים לפי הסינון שבחרת"
                description="נסה לחפש בשם אחר, להסיר תגית, או לבחור סטטוס שונה כדי לראות תוצאות נוספות."
                actions={clearButton('tonal')}
              />
            )
          ) : (
            <PluginGrid columns="full" labelledBy={RESULTS_TITLE_ID}>
              {filteredPlugins.map((plugin, pluginIndex) => (
                <PluginCard
                  priority={pluginIndex === 0}
                  key={plugin.id}
                  plugin={plugin}
                  installState={installState}
                  onInstall={install}
                  headingLevel="h3"
                />
              ))}
            </PluginGrid>
          )}
        </Section>

        {/* תוספים לאוצריא — הסבר קצר; על רקע הדף, מופרד ברווח ובכותרת (בלי פס/קו) */}
        <Section spacing="none" labelledBy={INFO_TITLE_ID} className="pt-12 pb-14 md:pt-16 md:pb-20">
          <div className="grid items-center gap-8 md:grid-cols-2 md:gap-10">
            <div>
              <SectionHeading
                as="h2"
                id={INFO_TITLE_ID}
                title="להוסיף יכולות חדשות לאוצריא בלחיצה אחת"
                align="start"
                spacing="none"
              />
              <p className="mt-5 max-w-measure text-body-md text-on-surface-variant md:text-body-lg">
                כאן תמצא תוספים שנבנו במיוחד לחוויית הלימוד באוצריא, עם עמודי הסבר ברורים, קישורי הורדה, ובמקרים מתאימים גם התקנה ישירה מתוך התוכנה.
              </p>
            </div>

            <div className="flex flex-col gap-4">
              <Card tone="tonal" padding="md">
                <p className="text-label-md text-on-surface-variant">זמין עכשיו</p>
                <p className="mt-1 font-display text-headline-lg text-on-surface tabular-nums">
                  {plugins.length.toLocaleString('he-IL')} תוספים
                </p>
              </Card>
              <Card tone="tonal" padding="md">
                <ul className="flex flex-col gap-3">
                  {INFO_POINTS.map((point) => (
                    <li key={point.icon} className="flex items-center gap-3">
                      <IconTile icon={point.icon} size="sm" />
                      <span className="text-body-md text-on-surface">{point.text}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          </div>
        </Section>
      </div>
      </main>
    </div>
  )
}
