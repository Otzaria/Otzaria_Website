import Notice from './Notice'

/**
 * שגיאת פעולה או טעינה בתוך אזור (לא כל המסך): Notice אדום שמוכרז מיד. אין טקסט — כלום.
 * @param {{ text?: string | null, className?: string }} props
 */
export default function ErrorNotice({ text, className }) {
  if (!text) return null
  return <Notice tone="error" role="alert" className={className}>{text}</Notice>
}
