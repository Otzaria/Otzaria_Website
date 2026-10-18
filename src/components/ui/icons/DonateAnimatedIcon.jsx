'use client';

import { useId } from 'react';

/**
 * אייקון התרומה המונפש: מטבעות נופלים לקופה, היא מתמלאת ונפתחת לספר פתוח.
 * currentColor בלבד; בלולאה עדינה עם הפסקת מנוחה על הספר. ב-reduced-motion: ספר סטטי.
 * גודל ברירת המחדל 1em — כמו גליף, כך שמחלקת הגודל של ההורה (font-size) קובעת אותו.
 * strokeWidth — 1.5 במקור; בכותרת עבה יותר, כדי שישתווה למשקל שאר האייקונים והטקסט.
 *
 * האנימציה ב-CSS טהור (.donate-anim-* ב-styles/effects.css), בלי framer-motion: האייקון
 * מוצג בכותרת המשותפת של כל העמודים, ותקציב הביצועים (scripts/check-perf-budget.mjs)
 * אוסר את framer-motion בעמודים הציבוריים. כל התנועה ב-transform/opacity בלבד.
 */
const BOOK_OUTLINE =
  'M12 6.5C10.3 5.2 7.5 4.8 3.5 5v12.5c4-.2 6.8.2 8.5 1.5 1.7-1.3 4.5-1.7 8.5-1.5V5c-4-.2-6.8.2-8.5 1.5zM12 6.5V19';
const BOOK_THICKNESS = 'M4.5 20.5c3-.2 5.5.2 7.5 1.3 2-1.1 4.5-1.5 7.5-1.3';
const COINS = [12, 10.5, 13.5];

export default function DonateAnimatedIcon({ size = '1em', strokeWidth = 1.5, className = '' }) {
  const uid = useId().replace(/:/g, '');

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={`donate-anim ${className}`}
      style={{ display: 'inline-block', verticalAlign: 'middle' }}
    >
      <defs>
        {/* הקופה נראית מעל קו החשיפה, הספר מתחתיו; הקו עולה מ-24 ל-4 ("הקופה נפתחת לספר") */}
        <clipPath id={`${uid}-box`}>
          <rect className="donate-anim-reveal-box" x="0" y="0" width="24" height="24" />
        </clipPath>
        <clipPath id={`${uid}-book`}>
          <rect className="donate-anim-reveal-book" x="0" y="0" width="24" height="24" />
        </clipPath>
        <clipPath id={`${uid}-in`}>
          <rect x="5" y="9" width="14" height="11" rx="2" />
        </clipPath>
        <clipPath id={`${uid}-slot`}>
          <rect x="0" y="0" width="24" height="9.5" />
        </clipPath>
      </defs>

      <g className="donate-anim-box" clipPath={`url(#${uid}-box)`}>
        <rect x="5" y="9" width="14" height="11" rx="2" />
        <path d="M9 12.5h6" />
        <g clipPath={`url(#${uid}-in)`}>
          <rect className="donate-anim-fill" x="5" y="11" width="14" height="9" fill="currentColor" stroke="none" />
        </g>
      </g>

      <g className="donate-anim-book" clipPath={`url(#${uid}-book)`}>
        <path d={BOOK_OUTLINE} />
        <path d={BOOK_THICKNESS} />
      </g>

      <g className="donate-anim-coins" clipPath={`url(#${uid}-slot)`}>
        {COINS.map((x, i) => (
          <circle key={x} className={`donate-anim-coin donate-anim-coin-${i + 1}`} cx={x} cy="0.5" r="1.5" />
        ))}
      </g>
    </svg>
  );
}
