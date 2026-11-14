'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { computeRegularRecipients, generateEmailHtml } from '@/lib/adminMessagesScreen/reminderUtils'
import {
  DEFAULT_REMINDER_MESSAGE, booksWithWork, duplicateConfirm, isPartialSend, isUncertainFailure, sendEmailBody, sentResultText, uncertainConfirm,
} from '@/lib/adminMessagesScreen/reminderWizard'
import { errorToast } from '@/components/admin/list/adminRequest'
import * as api from '../messagesApi'

const idle = (list = []) => ({ status: 'loading', list, error: null })

/** טעינה אחת (ספרים / משתמשים / היסטוריה): { status, list, error }, ו-reload */
function useLoad(loader) {
  const [state, setState] = useState(() => idle())
  const reload = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setState((s) => ({ ...s, status: 'loading', error: null }))
    try {
      const list = await loader()
      setState({ status: 'ready', list, error: null })
      return true
    } catch (error) {
      setState((s) => (quiet ? { ...s, error } : { status: 'error', list: [], error }))
      return false
    }
  }, [loader])
  useEffect(() => {
    // טעינה ראשונה; ה-setState אחרי await
    reload()
  }, [reload])
  return { ...state, reload }
}

const loadBooksWithWork = async () => booksWithWork(await api.loadBooks())

/**
 * "תזכורות": הנתונים (ספרים בעבודה, משתמשים, היסטוריה — שלוש בקשות במקביל, כל אחת לבד, כמו קודם) ומצב האשף
 * (ספר → נמענים → תוכן ושליחה). הנמענים מחושבים כמו קודם (reminderUtils.computeRegularRecipients) מהעמודים של
 * הספר שנבחר, וכולם מסומנים. השליחה — אותה בקשה כמו קודם; אם התזכורת האחרונה הייתה על אותו ספר — "לשלוח שוב?".
 * אחרי שליחה — ההיסטוריה נטענת מחדש מהשרת (כך כל רשומה עם המזהה האמיתי שלה, ואפשר להסיר אותה).
 * שליחה בלי תשובה מהשרת (תקרת הזמן, או ניתוק) — ייתכן שהדואר בכל זאת יצא: ההיסטוריה נטענת מחדש, ההודעה אומרת
 * לבדוק בה, ושליחה חוזרת על אותו ספר עוברת קודם חלון "ייתכן שהתזכורת כבר יצאה" — כדי שלא יישלח פעמיים בטעות.
 *
 * @param {{ confirm: Function, toast: any }} options
 */
export function useReminders({ confirm, toast }) {
  const books = useLoad(loadBooksWithWork)
  const users = useLoad(api.loadAllUsers)
  const history = useLoad(api.loadHistory)

  const [step, setStep] = useState('book')
  const [bookPath, setBookPath] = useState('')
  const [found, setFound] = useState([])
  const [recipients, setRecipients] = useState([])
  const [checking, setChecking] = useState(false)
  const [checkError, setCheckError] = useState(null)
  const [message, setMessage] = useState(DEFAULT_REMINDER_MESSAGE)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState(null)
  const [sent, setSent] = useState(null) // { text, bookName }
  const [uncertain, setUncertain] = useState(null) // שם הספר של שליחה שלא קיבלה תשובה

  // ----- הנמענים של הספר שנבחר (בקשה אחרונה מנצחת) -----
  const lastCheck = useRef(0)
  const usersReady = users.status === 'ready'
  const allUsers = users.list
  const check = useCallback(async (path) => {
    const id = ++lastCheck.current
    setFound([])
    setRecipients([])
    setCheckError(null)
    if (!path) {
      setChecking(false)
      return
    }
    setChecking(true)
    try {
      const pages = await api.loadBookPages(path)
      if (id !== lastCheck.current) return
      const list = computeRegularRecipients(pages, allUsers)
      setFound(list)
      setRecipients(list.map((u) => u.email))
    } catch (error) {
      if (id === lastCheck.current) setCheckError(error)
    } finally {
      if (id === lastCheck.current) setChecking(false)
    }
  }, [allUsers])
  useEffect(() => {
    // כמו קודם: בלי רשימת המשתמשים אין איך לדעת מי מאשר תזכורות — מחכים לה
    // eslint-disable-next-line react-hooks/set-state-in-effect -- הבקשה לשרת; ה-setState אחריה
    if (usersReady) check(bookPath)
  }, [bookPath, usersReady, check])

  const chooseBook = useCallback((path) => {
    setBookPath(path || '')
    setSent(null)
    setSendError(null)
  }, [])

  const toggleRecipient = useCallback((email) => {
    setRecipients((prev) => (prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email]))
  }, [])
  const selectAll = useCallback(() => setRecipients(found.map((u) => u.email)), [found])
  const selectNone = useCallback(() => setRecipients([]), [])

  const book = books.list.find((b) => b.path === bookPath) || null

  // ----- שליחה -----
  const send = useCallback(async () => {
    if (!book || recipients.length === 0 || sending) return
    const duplicate = uncertain === book.name ? uncertainConfirm(book.name) : duplicateConfirm(history.list, book.name)
    if (duplicate && !(await confirm(duplicate))) return
    setSending(true)
    setSendError(null)
    try {
      const body = sendEmailBody({
        recipients,
        bookName: book.name,
        bookPath: book.path,
        message,
        html: generateEmailHtml(book.name, message),
        isPartial: isPartialSend(recipients, found),
      })
      const result = await api.sendReminderEmail(body)
      const text = sentResultText(recipients.length, result.details)
      setSent({ text, bookName: book.name })
      setUncertain(null)
      toast.show({ message: text })
      history.reload({ quiet: true })
    } catch (error) {
      setSendError(error)
      if (isUncertainFailure(error)) {
        setUncertain(book.name)
        history.reload({ quiet: true })
      }
    } finally {
      setSending(false)
    }
  }, [book, recipients, sending, history, confirm, message, found, toast, uncertain])

  const startOver = useCallback(() => {
    setStep('book')
    setBookPath('')
    setMessage(DEFAULT_REMINDER_MESSAGE)
    setSent(null)
    setSendError(null)
  }, [])

  // ----- הסרה מההיסטוריה -----
  const removeHistory = useCallback(async (item) => {
    const ok = await confirm({
      title: 'להסיר את הרשומה מההיסטוריה?',
      body: `"${item.bookName}"`,
      details: ['התזכורת עצמה כבר נשלחה — רק הרשומה כאן תימחק.'],
      confirmLabel: 'הסר',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await api.deleteHistoryItem(item.id)
      toast.show({ message: 'הרשומה הוסרה מההיסטוריה' })
      history.reload({ quiet: true })
    } catch (error) {
      toast.show(errorToast(error, 'לא הצלחנו להסיר מההיסטוריה.'))
    }
  }, [confirm, toast, history])

  return {
    books, users, history,
    step, setStep,
    bookPath, book, chooseBook,
    found, recipients, checking, checkError, recheck: () => check(bookPath), toggleRecipient, selectAll, selectNone,
    message, setMessage,
    sending, sendError, sendUncertain: Boolean(sendError) && uncertain === book?.name, sent, send, startOver,
    reloadAll: () => {
      books.reload({ quiet: true })
      history.reload({ quiet: true })
    },
    removeHistory,
  }
}
