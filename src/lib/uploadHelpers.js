import Book from '@/models/Book';
import Page from '@/models/Page';

/**
 * בודק אם העלאה של עמוד בודד היא העמוד האחרון בספר
 * @param {string} bookName - שם הספר כפי שהועלה (לדוגמה: "שם_ספר - עמוד 5")
 * @returns {Promise<boolean>} - true אם זה העמוד האחרון, false אחרת
 */
export async function isLastPageUpload(bookName) {
    try {
        // ניסיון לחלץ את שם הספר ומספר העמוד מה-bookName
        // פורמט אפשרי: "שם_ספר - עמוד X" או "שם_ספר/עמוד X"
        const pageMatch = bookName.match(/(.+?)[\s\-\/]+(?:עמוד|page)\s*(\d+)/i);
        
        if (!pageMatch) {
            return false;
        }
        
        const extractedBookName = pageMatch[1].trim();
        
        // חיפוש הספר לפי שם (slug או name)
        const book = await Book.findOne({
            $or: [
                { slug: extractedBookName },
                { name: { $regex: new RegExp(extractedBookName, 'i') } }
            ]
        });
        
        if (!book || !book.totalPages || book.totalPages <= 0) {
            return false;
        }
        
        // ספירת עמודים שהושלמו (כולל זה שהועלה עכשיו)
        const completedCount = await Page.countDocuments({
            book: book._id,
            status: 'completed'
        });
        
        // בדיקה אם זה העמוד האחרון
        return (completedCount + 1) >= book.totalPages;
        
    } catch (error) {
        console.error('Error checking if last page:', error);
        return false;
    }
}
