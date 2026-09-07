// גודל קובץ בתצוגה ידידותית (B/KB/MB)
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString('he-IL', { maximumFractionDigits: 0 })} KB`
  return `${(bytes / (1024 * 1024)).toLocaleString('he-IL', { maximumFractionDigits: 1 })} MB`
}
