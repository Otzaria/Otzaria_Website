'use client'

/**
 * Pagination Component
 * 
 * A reusable pagination component with smart page number display.
 * Shows first page, last page, current page, and adjacent pages with ellipsis for gaps.
 * 
 * @param {number} currentPage - The current active page (1-indexed)
 * @param {number} totalPages - Total number of pages
 * @param {function} onPageChange - Callback function when page changes
 */
export default function Pagination({ currentPage, totalPages, onPageChange }) {
  if (totalPages <= 1) return null;

  const getPageNumbers = () => {
    const result = [];
    
    // Include: first page, last page, current page, and adjacent pages
    const pages = new Set([
      1, 
      totalPages, 
      currentPage, 
      currentPage - 1, 
      currentPage + 1
    ]);

    const sortedPages = Array.from(pages)
      .filter(p => p >= 1 && p <= totalPages)
      .sort((a, b) => a - b);

    // Add ellipsis between non-consecutive pages
    for (let i = 0; i < sortedPages.length; i++) {
      const page = sortedPages[i];
      const prevPage = sortedPages[i - 1];

      if (i > 0 && page - prevPage > 1) {
        result.push('...');
      }
      result.push(page);
    }

    return result;
  };

  return (
    <div className="flex justify-center items-center gap-2 mt-8 select-none">
      {/* Previous Button */}
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface hover:bg-surface-variant disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
        aria-label="עמוד קודם"
      >
        <span className="material-symbols-outlined text-sm">chevron_right</span>
      </button>

      {/* Page Numbers */}
      {getPageNumbers().map((page, index) => (
        page === '...' ? (
          <span 
            key={`dots-${index}`} 
            className="w-8 text-center text-on-surface/50"
            aria-hidden="true"
          >
            ...
          </span>
        ) : (
          <button
            key={page}
            onClick={() => onPageChange(page)}
            className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-medium transition-all ${
              currentPage === page
                ? 'bg-primary text-white shadow-md'
                : 'bg-surface-variant text-on-surface hover:bg-primary/20'
            }`}
            aria-label={`עמוד ${page}`}
            aria-current={currentPage === page ? 'page' : undefined}
          >
            {page}
          </button>
        )
      ))}

      {/* Next Button */}
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface hover:bg-surface-variant disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
        aria-label="עמוד הבא"
      >
        <span className="material-symbols-outlined text-sm">chevron_left</span>
      </button>
    </div>
  );
}
