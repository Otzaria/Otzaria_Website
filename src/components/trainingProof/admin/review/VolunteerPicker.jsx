'use client'

import { useState } from 'react'
import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import { fmt } from '../api'
import { Tag } from '../bits'

// "הכול ממתנדב מסוים…": בחירת מתנדב, עם הממתינות שלו ושיעור-ההתאמה (כמה מההגשות שלו
// אושרו עד היום בלי שינוי). האישור עצמו — אחרי חלון-אישור נוסף (bulk ב-useReview).
export const matchTone = (m) => (m == null ? 'muted' : m >= 97 ? 'ok' : m >= 93 ? 'info' : 'warn')

export default function VolunteerPicker({ vols, onPick, onClose, unit = 'שורות' }) {
  const [pick, setPick] = useState(null)
  return (
    <Dialog
      title="לאשר הכול ממתנדב"
      subtitle="כל ההגשות הממתינות של המתנדב בחלק הזה, בכל הכתבים"
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="text" size="sm" onClick={onClose}>
            ביטול
          </Button>
          <Button variant="filled" size="sm" softDisabled={!pick} onClick={() => pick && onPick(pick)}>
            המשך
          </Button>
        </div>
      }
    >
      {vols.length ? (
        <div role="radiogroup" aria-label="מתנדב" className="flex flex-col gap-1">
          {vols.map((v) => (
            <label key={v.id} className="flex min-h-11 cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 rounded-(--radius-control) px-2 py-1.5 hover:bg-surface-selected">
              <input type="radio" name="tp-vol" value={v.id} checked={pick?.id === v.id} onChange={() => setPick(v)} className="size-5 shrink-0 cursor-pointer accent-primary" />
              <span className="text-label-lg text-on-surface">{v.name}</span>
              <span className="text-body-sm text-on-surface-variant">
                {fmt(v.pending)} {unit} ממתינות
              </span>
              <Tag tone={matchTone(v.match)} title={v.judged ? `מתוך ${fmt(v.judged)} שנסקרו` : 'עוד לא נסקרה אף הגשה שלו'}>
                {v.match == null ? 'אין עדיין התאמה' : `${v.match}% התאמה`}
              </Tag>
            </label>
          ))}
        </div>
      ) : (
        <p className="text-body-md text-on-surface-variant">אין הגשות ממתינות</p>
      )}
    </Dialog>
  )
}
