// גוף דף ההנחיות של צורת הדף: HTML שכבר נוקה (guideContent.renderGuide של המודול) — מהנוסח המקורי או מהנוסח שנשמר
// בדף הניהול. העיצוב לפי התגיות, כמו GuideBody של הגהת העמודים (פרק = כרטיס, כותרת עם אייקון, רשימות, kbd), בלי איורים.
// רכיב שרת (בלי hooks) — מרונדר בדף הציבורי /docs/tzurat-hadaf.

const BODY = [
  'space-y-8 text-lg leading-relaxed text-on-surface/85',
  '[&_section]:scroll-mt-24 [&_section]:space-y-4 [&_section]:rounded-xl [&_section]:border [&_section]:border-surface-variant',
  '[&_section]:bg-background/95 [&_section]:p-6 md:[&_section]:p-8',
  '[&_h2]:mb-4 [&_h2]:flex [&_h2]:items-center [&_h2]:gap-3 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-primary-dark',
  '[&_h2_.material-symbols-outlined]:text-3xl [&_h3]:text-xl [&_h3]:font-bold [&_h3]:text-on-surface',
  '[&_ol]:list-decimal [&_ol]:space-y-4 [&_ol]:pr-6 [&_ul]:list-disc [&_ul]:space-y-3 [&_ul]:pr-6',
  '[&_li>p]:mt-2 [&_p.note]:rounded-lg [&_p.note]:bg-warning-alt-50 [&_p.note]:px-3 [&_p.note]:py-2 [&_p.note]:text-base',
  '[&_p.muted]:text-base [&_p.muted]:text-on-surface/70 [&_p.lead]:text-center [&_p.lead]:text-xl [&_p.lead]:text-on-surface/75',
  '[&_kbd]:whitespace-nowrap [&_kbd]:rounded [&_kbd]:border [&_kbd]:border-surface-variant [&_kbd]:bg-surface [&_kbd]:px-1.5',
  '[&_kbd]:py-0.5 [&_kbd]:font-sans [&_kbd]:text-sm [&_kbd]:font-bold',
  '[&_a]:font-bold [&_a]:text-primary hover:[&_a]:underline',
].join(' ')

export default function TzuratGuideBody({ html, className = '' }) {
  return <div className={`${BODY} ${className}`} dangerouslySetInnerHTML={{ __html: html }} />
}
