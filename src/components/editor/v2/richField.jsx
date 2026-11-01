import RichTextArea from './RichTextArea'

/**
 * ה-textarea ש-TextEditor בנה (אותם props בדיוק: value, onChange, onFocus, style, className,
 * data-column, ref...) → אותו שדה בתצוגה המעוצבת. כך TextEditor לא משתנה כמעט — רק מחליף את
 * האלמנט. mirror (מעקב השורה/המילה) הופך לסימון בתוך השדה: השורה והמילה רק בטור הפעיל;
 * מספרי השורות בכל הטורים.
 *
 * @param {import('react').ReactElement<any>} textarea
 * @param {{ mirror?: { column?: string, line?: number, word?: number, estimated?: boolean,
 *   lineNumbers?: boolean, showSuspects?: boolean, strength?: 'strong'|'normal' } | null,
 *   column: string, wrapperClass?: string, paraWindow?: boolean, paraFunnel?: boolean }} opts
 *   paraWindow / paraFunnel — עימוד ספר (חלון בתחילת פסקה, סיום משולש), RichTextArea
 */
export function richFieldFor(textarea, { mirror, column, wrapperClass, paraWindow = false, paraFunnel = false }) {
  const active = !!mirror && (mirror.column || 'content') === column
  const tracking = mirror
    ? {
        line: active && Number.isInteger(mirror.line) ? mirror.line : -1,
        word: active && Number.isInteger(mirror.word) ? mirror.word : -1,
        estimated: !!mirror.estimated,
        lineNumbers: !!mirror.lineNumbers,
        showSuspects: !!mirror.showSuspects,
        strength: mirror.strength
      }
    : null
  return <RichTextArea {...textarea.props} wrapperClassName={wrapperClass} tracking={tracking} paraWindow={paraWindow} paraFunnel={paraFunnel} />
}
