'use client'

import Link from 'next/link'
import { splitHint } from '@/lib/donationTip'
import DonateAnimatedIcon from '@/components/ui/icons/DonateAnimatedIcon'
import Tooltip from '@/components/ui/Tooltip'

/**
 * קישור התרומה שבכותרת — כפתור טונלי בצבע התרומה, מחוץ לרשימת הניווט כדי שיבלוט בכל עמוד
 * (גם בנייד, ליד כפתור התפריט). ראו .donation-button ב-styles/effects.css.
 *
 * hint — כרטיס-רמז מתחת לכפתור בריחוף ובפוקוס מקלדת (ui/Tooltip): מחובר לקישור
 * ב-aria-describedby כך שקורא מסך שומע אותו תמיד, ו-Esc מסתיר אותו (WCAG 1.4.13). במגע אין
 * ריחוף — המשפט מוצג בתפריט הנייד (DonationNote).
 *
 * @param {{ link: { href: string, label: string, icon?: string, customIcon?: string, hint?: string }, className?: string }} props
 */
export default function DonationButton({ link, className = '' }) {
  const button = (
    <Link href={link.href} prefetch={false} className="donation-button donation-nav-link text-sm">
      <DonateAnimatedIcon strokeWidth={1.8} className="donation-button-icon donation-animated-icon" />
      {link.label}
    </Link>
  )

  if (!link.hint) return <span className={`inline-flex ${className}`}>{button}</span>

  const { lead, punch } = splitHint(link.hint)
  return (
    <Tooltip
      className={className}
      content={
        <>
          <DonateAnimatedIcon strokeWidth={1.8} className="donation-tip-icon" />
          <span className="donation-tip-text">
            {lead && <span className="donation-tip-lead">{lead}</span>}
            {lead && ' '}
            <span className="donation-tip-punch">{punch}</span>
          </span>
        </>
      }
    >
      {button}
    </Tooltip>
  )
}

/** המשפט של התרומה בתפריט הנייד — קישור שלם לדף התרומה, כי אין שם ריחוף שיציג את הכרטיס. */
export function DonationNote({ link, onNavigate }) {
  if (!link.hint) return null
  return (
    <Link href={link.href} prefetch={false} onClick={onNavigate} className="donation-note">
      <DonateAnimatedIcon strokeWidth={1.8} className="donation-button-icon donation-animated-icon" />
      <span className="flex-1">{link.hint}</span>
      <span className="material-symbols-outlined text-lg" aria-hidden="true">chevron_left</span>
    </Link>
  )
}
