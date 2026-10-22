import Badge from '@/components/ui/Badge'
import { statusIcon, statusLabel, statusTone } from './ocrJobView'

/** תג מצב של עבודת OCR — התווית העברית היא המשמעות, הגוון והאייקון מחזקים בלבד */
export default function OcrStatusBadge({ status, size = 'md' }) {
  return (
    <Badge tone={statusTone(status)} icon={statusIcon(status)} size={size}>
      {statusLabel(status)}
    </Badge>
  )
}
