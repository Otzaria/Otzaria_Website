'use client'

import Drawer from '@/components/ui/Drawer'
import BookOcrPanel from '@/components/admin/ocr/BookOcrPanel'

/**
 * זיהוי טקסט (OCR) לספר אישי — מ"הספרים שלי", לבעלי התפקיד private_ocr בלבד. אותו לוח כמו בניהול
 * הספרים (BookOcrPanel), מול /api/user/books/ocr/* (רק ספרים שהמשתמש העלה), ובלי בדיקת
 * ההתנגשויות — שהיא של מנהל. הטקסט נכתב לעמודי הספר, וממשיכים לעבוד עליו בעורך כרגיל.
 *
 * @param {{ book: { id: string, name: string, totalPages?: number }, onClose: () => void }} props
 */
export default function PersonalBookOcrDrawer({ book, onClose }) {
  return (
    <Drawer title="זיהוי טקסט אוטומטי (OCR)" subtitle={book.name} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-body-sm text-on-surface-variant">
          הטקסט שיזוהה ייכתב לעמודי הספר, ואפשר להמשיך לערוך אותו בעורך כרגיל. אפשר לסגור את החלון — הזיהוי ימשיך ברקע.
        </p>
        <BookOcrPanel book={book} apiBase="/api/user/books/ocr" reviewResults={false} />
      </div>
    </Drawer>
  )
}
