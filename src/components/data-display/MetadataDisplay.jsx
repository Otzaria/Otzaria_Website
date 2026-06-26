export default function MetadataDisplay({ upload, className = '', textSize = 'text-sm' }) {
  // הצג מטא-דטה רק להעלאות מסוג full_book
  if (upload.uploadType !== 'full_book') {
    return null
  }

  if (!upload.authorName && !upload.bookCategory && !upload.authorCategory && !upload.authorYear && !upload.publicationYear && !upload.copyrightHolder && !upload.sourceUrl && !upload.isOcr) {
    return null
  }

  return (
    <div className={`mt-3 pt-3 border-t border-neutral-200 space-y-1 ${textSize} text-neutral-600 ${className}`}>
      {upload.authorName && (
        <div><span className="font-semibold">מחבר:</span> {upload.authorName}</div>
      )}
      {upload.bookCategory && (
        <div><span className="font-semibold">קטגוריית ספר:</span> {upload.bookCategory}</div>
      )}
      {upload.authorCategory && (
        <div><span className="font-semibold">קטגוריית מחבר:</span> {upload.authorCategory}</div>
      )}
      {upload.authorYear && (
        <div><span className="font-semibold">שנת מחבר:</span> {upload.authorYear}</div>
      )}
      {upload.publicationYear && (
        <div><span className="font-semibold">שנת הדפסה:</span> {upload.publicationYear}</div>
      )}
      {upload.copyrightHolder && (
        <div><span className="font-semibold">בעל זכויות:</span> {upload.copyrightHolder}</div>
      )}
      {upload.sourceUrl && (
        <div><span className="font-semibold">מקור:</span> <a href={upload.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-info-600 hover:underline">{upload.sourceUrl}</a></div>
      )}
      {upload.isOcr && (
        <div><span className="font-semibold">OCR:</span> {upload.ocrDescription}</div>
      )}
    </div>
  )
}
