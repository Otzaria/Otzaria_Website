'use client'

import { useId, useMemo, useState } from 'react'
import AppIcon from '@/components/ui/AppIcon'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import SelectMenu from '@/components/ui/SelectMenu'
import { cx } from '@/components/ui/cx'
import { CHECKBOX, FIELD_ERROR, FIELD_LABEL, fieldClasses } from '@/components/ui/fieldStyles'
import { DEFAULT_CATEGORY, bookProgress, formatNumber, isPersonal, mergedPagesText, pagesText, startedBookText, startedBooks } from '@/lib/adminBooks/bookTerms'
import BookThumb from './BookThumb'
import { mergeBooks, updateBook } from './booksApi'

/**
 * "מזג ספרים" — פעולה מסוכנת: נוצר ספר חדש מהעמודים של הספרים לפי הסדר, הספרים המקוריים נמחקים
 * לצמיתות, וכל העמודים בספר החדש מתחילים מחדש כ"פנוי" — בלי הטקסט שכבר נערך (כך עובד השרת).
 * לכן: האזהרה בראש החלון, ולא בהערה קטנה; ספר שכבר התחילו לעבוד עליו — מסומן ברשימה, ואי אפשר
 * למזג עד שמאשרים במפורש שהטקסט שלו יימחק; וכפתור הביצוע בצבע הסכנה, עם שם שאומר מה יקרה.
 *
 * initial — הספרים שנבחרו (מהסרגל: שניים ומעלה; מתפריט של שורה: אחד). אפשר להוסיף, להוריד ולשנות סדר.
 *
 * "איזה ספר נשאר": אחד הספרים מסומן כעיקרי — הספר המאוחד מקבל את השם והקטגוריה שלו (את השם אפשר לשנות).
 * אותו API בלי שינוי: השרת בודק שהשם פנוי לפני שהוא מוחק את המקוריים, ולכן כשהשם הוא של אחד מהספרים
 * שבמיזוג — ממזגים בשם זמני, ואחרי שהמקוריים נמחקו משנים לשם הנבחר (וגם את הקטגוריה) בעדכון רגיל.
 * @param {{ initial: any[], books: any[], onMerged: (name: string, warning?: string) => void, onClose: () => void }} props
 */
export default function MergeBooksDialog({ initial, books, onMerged, onClose }) {
  const [list, setList] = useState(initial)
  const [keptId, setKeptId] = useState(initial[0]?.id ?? null)
  const [name, setName] = useState(initial[0]?.name ?? '')
  const [nameEdited, setNameEdited] = useState(false)
  const [hidden, setHidden] = useState(true)
  const [ack, setAck] = useState(false)
  const [merging, setMerging] = useState(false)
  const [error, setError] = useState('')
  const ids = { name: useId(), ack: useId(), warning: useId(), kept: useId() }

  const chosen = useMemo(() => new Set(list.map((b) => b.id)), [list])
  const kept = list.find((b) => b.id === keptId) || list[0] || null
  const addOptions = useMemo(() => books.filter((b) => !chosen.has(b.id)).map((b) => ({ value: b.id, label: b.name, hint: pagesText(bookProgress(b).total) })), [books, chosen])
  const started = startedBooks(list)
  const startedIds = new Set(started.map((s) => s.book.id))
  // שם של ספר שבמיזוג — פנוי (הוא נמחק במיזוג); שם של ספר אחר — תפוס
  const nameTaken = books.some((b) => b.name === name.trim() && !chosen.has(b.id))
  const ready = list.length >= 2 && name.trim() !== '' && !nameTaken && (started.length === 0 || ack)

  const move = (index, delta) => setList((l) => {
    const next = [...l]
    const target = index + delta
    if (target < 0 || target >= next.length) return l
    ;[next[index], next[target]] = [next[target], next[index]]
    return next
  })
  const keep = (book) => {
    setKeptId(book.id)
    if (!nameEdited) setName(book.name)
  }
  const remove = (id) => {
    const next = list.filter((b) => b.id !== id)
    setList(next)
    if (id === kept?.id && next[0]) keep(next[0])
  }
  const add = (id) => {
    const book = books.find((b) => b.id === id)
    if (!book) return
    setList((l) => [...l, book])
    if (list.length === 0) keep(book)
  }

  const submit = async () => {
    if (!ready || merging) return
    setMerging(true)
    setError('')
    const finalName = name.trim()
    const temporary = list.some((b) => b.name === finalName)
    const mergeName = temporary ? `${finalName} (מיזוג ${Date.now().toString().slice(-6)})` : finalName
    try {
      const result = await mergeBooks({ bookIds: list.map((b) => b.id), newName: mergeName, isHidden: hidden })
      // השם והקטגוריה של הספר שנשאר (השרת לוקח את הקטגוריה מהראשון בסדר)
      const patch = {}
      if (temporary) patch.name = finalName
      const keptCategory = kept && !isPersonal(kept) ? (kept.category || DEFAULT_CATEGORY) : null
      if (keptCategory && keptCategory !== (list[0].category || DEFAULT_CATEGORY)) patch.category = keptCategory
      let warning
      if (Object.keys(patch).length > 0 && result?.bookId) {
        try {
          await updateBook(String(result.bookId), patch)
        } catch {
          warning = temporary
            ? `השם נשאר זמני ("${mergeName}"). שנה אותו ב"שנה שם".`
            : 'הקטגוריה לא עודכנה. שנה אותה ב"שנה קטגוריה".'
        }
      }
      onMerged(warning && temporary ? mergeName : finalName, warning)
      onClose()
    } catch (e) {
      setError(e?.message || 'לא הצלחנו למזג את הספרים.')
      setMerging(false)
    }
  }

  return (
    <Dialog
      title="מזג ספרים"
      subtitle="מומלץ רק לספרים שעוד לא התחילו לעבוד עליהם"
      onClose={onClose}
      dismissible={!merging}
      className="[--dialog-width:42rem]"
      footer={(
        <>
          <Button variant="text" size="sm" onClick={onClose} disabled={merging}>ביטול</Button>
          <Button variant="danger" size="sm" icon="call_merge" onClick={submit} loading={merging} disabled={!ready}>
            {merging ? 'ממזג…' : list.length >= 2 ? `מזג ומחק ${formatNumber(list.length)} ספרים` : 'מזג ספרים'}
          </Button>
        </>
      )}
    >
      <div className="flex flex-col gap-5">
        <div id={ids.warning} className="flex items-start gap-3 rounded-(--radius-control) bg-error-container px-4 py-3 text-body-sm text-on-error-container">
          <AppIcon name="warning" className="mt-0.5 shrink-0 text-icon-lg" />
          <ul className="flex list-disc flex-col gap-1 ps-4">
            <li>נוצר ספר חדש מהעמודים של הספרים, לפי הסדר שלמטה.</li>
            <li>הספרים המקוריים יימחקו לצמיתות. הספר המאוחד מקבל את השם והקטגוריה של הספר שסימנת שיישאר.</li>
            <li>כל העמודים בספר החדש יתחילו מחדש כ&quot;פנוי&quot; — בלי הטקסט שכבר נערך.</li>
          </ul>
        </div>

        <section aria-labelledby={`${ids.name}-order`} className="flex flex-col gap-2">
          <h3 id={`${ids.name}-order`} className="text-label-lg text-on-surface">איזה ספר נשאר, והסדר בספר המאוחד</h3>
          <p className="text-body-sm text-on-surface-variant">סמן את הספר שנשאר. העמודים של כל הספרים יופיעו לפי הסדר שכאן.</p>
          {list.length > 0 ? (
            <ol className="flex flex-col divide-y divide-outline-variant/60 rounded-(--radius-control) bg-surface">
              {list.map((book, index) => {
                const p = bookProgress(book)
                const isStarted = startedIds.has(book.id)
                return (
                  <li key={book.id} className="flex items-center gap-3 px-2 py-2">
                    <span className="w-6 shrink-0 text-center text-label-lg tabular-nums text-on-surface-variant">{index + 1}</span>
                    <label className="flex size-(--touch-target) shrink-0 cursor-pointer items-center justify-center" title="הספר שנשאר">
                      <input
                        type="radio"
                        name={ids.kept}
                        checked={kept?.id === book.id}
                        onChange={() => keep(book)}
                        disabled={merging}
                        aria-label={`${book.name} — הספר שנשאר`}
                        className="size-5 cursor-pointer accent-primary"
                      />
                    </label>
                    <BookThumb src={book.thumbnail} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body-md text-on-surface">
                        {book.name}
                        {kept?.id === book.id && <span className="ms-2 text-body-sm text-primary">נשאר</span>}
                      </span>
                      <span className={cx('block text-body-sm', isStarted ? 'text-error' : 'text-on-surface-variant')}>
                        {isStarted ? startedBookText(started.find((s) => s.book.id === book.id)).replace(`${book.name} — `, '') : `${pagesText(p.total)} · לא התחילו`}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center">
                      <Button variant="text" size="sm" iconOnly icon="arrow_upward" aria-label={`הקדם את ${book.name}`} disabled={merging || index === 0} onClick={() => move(index, -1)} />
                      <Button variant="text" size="sm" iconOnly icon="arrow_downward" aria-label={`אחר את ${book.name}`} disabled={merging || index === list.length - 1} onClick={() => move(index, 1)} />
                      <Button variant="text" size="sm" iconOnly icon="close" aria-label={`הסר את ${book.name} מהמיזוג`} disabled={merging} onClick={() => remove(book.id)} />
                    </span>
                  </li>
                )
              })}
            </ol>
          ) : (
            <p className="text-body-sm text-on-surface-variant">עוד לא נבחרו ספרים.</p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SelectMenu
              variant="action"
              label="הוסף ספר למיזוג"
              triggerText="הוסף ספר"
              icon="add"
              options={addOptions}
              value={null}
              searchable
              searchPlaceholder="חפש ספר"
              emptyText="אין ספר בשם הזה"
              disabled={merging}
              onChange={add}
            />
            {list.length >= 2 && <p className="text-body-sm text-on-surface-variant">בספר המאוחד: {mergedPagesText(list)}</p>}
          </div>
          {list.length < 2 && <p className="text-body-sm text-on-surface-variant">צריך לפחות שני ספרים.</p>}
        </section>

        {started.length > 0 && (
          <label htmlFor={ids.ack} className="flex cursor-pointer items-start gap-3 rounded-(--radius-control) border border-error px-4 py-3 text-body-md text-on-surface">
            <input id={ids.ack} type="checkbox" className={CHECKBOX} checked={ack} disabled={merging} onChange={(e) => setAck(e.target.checked)} />
            <span>
              אני מבין שהטקסט שכבר נערך {startedWhere(started.length)} יימחק, ושמי שעובד עליהם יאבד את העבודה.
            </span>
          </label>
        )}

        <div>
          <label htmlFor={ids.name} className={FIELD_LABEL}>שם הספר המאוחד</label>
          <input
            id={ids.name}
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setNameEdited(true) }}
            disabled={merging}
            aria-invalid={nameTaken || undefined}
            className={fieldClasses({ invalid: nameTaken })}
          />
          {nameTaken && <p role="alert" className={FIELD_ERROR}>כבר יש ספר בשם הזה. בחר שם אחר.</p>}
        </div>

        <label className="flex cursor-pointer items-start gap-3 text-body-md text-on-surface">
          <input type="checkbox" className={CHECKBOX} checked={hidden} disabled={merging} onChange={(e) => setHidden(e.target.checked)} />
          <span>הסתר את הספר החדש <span className="text-on-surface-variant">— כדי לבדוק אותו לפני שכולם יראו</span></span>
        </label>

        {error && <p role="alert" className={FIELD_ERROR}>{error}</p>}
      </div>
    </Dialog>
  )
}

/** "בספר המסומן" / "בשני הספרים המסומנים" / "ב-3 הספרים המסומנים" */
function startedWhere(n) {
  if (n === 1) return 'בספר המסומן'
  if (n === 2) return 'בשני הספרים המסומנים'
  return `ב-${formatNumber(n)} הספרים המסומנים`
}
