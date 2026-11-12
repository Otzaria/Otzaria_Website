'use client'

import { useCallback, useState } from 'react'
import MessageUploaderDialog from '@/components/admin/MessageUploaderDialog'
import { displayName } from '@/lib/adminUsersScreen/userTerms'
import DeleteUserDialog from './DeleteUserDialog'

/**
 * החלונות של משתמש אחד — "שלח הודעה" (admin/MessageUploaderDialog, כמו במסך ההעלאות) ו"מחק לצמיתות"
 * (DeleteUserDialog). משותף לשורה (⋮) ולמגירה, כך שאותו חלון נפתח משני המקומות.
 * element — לרנדר פעם אחת. onDeleted — אחרי מחיקה מוצלחת (החלון כבר נסגר). remove — המחיקה (בתור של המסך).
 *
 * @param {{ onDeleted: (user: any) => void, remove: (user: any) => Promise<unknown> }} options
 */
export function useUserDialogs({ onDeleted, remove }) {
  const [open, setOpen] = useState(null) // { kind: 'message' | 'delete', user }
  const close = useCallback(() => setOpen(null), [])
  const openMessage = useCallback((user) => setOpen({ kind: 'message', user }), [])
  const openDelete = useCallback((user) => setOpen({ kind: 'delete', user }), [])

  let element = null
  if (open?.kind === 'message') {
    element = (
      <MessageUploaderDialog
        recipient={{ id: open.user._id, email: open.user.email, name: displayName(open.user) }}
        initialSubject=""
        onClose={close}
      />
    )
  } else if (open?.kind === 'delete') {
    element = (
      <DeleteUserDialog
        user={open.user}
        remove={remove}
        onClose={close}
        onDeleted={(user) => {
          setOpen(null)
          onDeleted(user)
        }}
      />
    )
  }

  return { openMessage, openDelete, element }
}
