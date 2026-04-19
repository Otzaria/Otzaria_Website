/**
 * LoadingSpinner - קומפוננטת מחוון טעינה אחידה
 * 
 * @param {string} message - הטקסט שיוצג מתחת למחוון (אופציונלי)
 * @param {string} size - גודל המחוון: 'sm', 'md', 'lg' (ברירת מחדל: 'md')
 * @param {string} className - מחלקות CSS נוספות (אופציונלי)
 */
export default function LoadingSpinner({ 
  message = 'טוען...', 
  size = 'md',
  className = '' 
}) {
  const sizeClasses = {
    sm: 'h-8 w-8 border-2',
    md: 'h-12 w-12 border-b-2',
    lg: 'h-16 w-16 border-b-2'
  };

  const textSizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg'
  };

  return (
    <div className={`text-center py-20 ${className}`}>
      <div className={`inline-block animate-spin rounded-full border-primary ${sizeClasses[size]}`}></div>
      {message && (
        <p className={`mt-4 text-gray-600 ${textSizeClasses[size]}`}>{message}</p>
      )}
    </div>
  );
}
