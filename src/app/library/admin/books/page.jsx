'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import AddBookDialog from '@/components/admin/AddBookDialog'
import BookOcrDialog from '@/components/admin/BookOcrDialog'
import EditBookInfoDialog from '@/components/admin/EditBookInfoDialog'
import EditGlobalInstructionsDialog from '@/components/admin/EditGlobalInstructionsDialog'
import EditCategoriesDialog from '@/components/admin/EditCategoriesDialog'
import RenameBookDialog from '@/components/admin/RenameBookDialog'
import NotifyVisibilityDialog from '@/components/admin/NotifyVisibilityDialog'
import BookSubscribersModal from '@/components/admin/BookSubscribersModal'
import MergeBooksDialog from '@/components/admin/MergeBooksDialog'
import { useDialog } from '@/components/providers/DialogContext'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

export default function AdminBooksPage() {
  const { showAlert, showConfirm } = useDialog()
  const [books, setBooks] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddBook, setShowAddBook] = useState(false)
  const [editingBookInfo, setEditingBookInfo] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [activeTab, setActiveTab] = useState('all')

  const [renamingBook, setRenamingBook] = useState(null)

  const [showMergeDialog, setShowMergeDialog] = useState(false)

  const [downloadingPdfId, setDownloadingPdfId] = useState(null)
  const [ocrBook, setOcrBook] = useState(null)

  const [showNotifyDialog, setShowNotifyDialog] = useState(false)
  const [bookToToggle, setBookToToggle] = useState(null)
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)

  const [showSubscribersModal, setShowSubscribersModal] = useState(false)

  const [showGlobalInstructionsDialog, setShowGlobalInstructionsDialog] = useState(false)
  const [globalInstructionsData, setGlobalInstructionsData] = useState({ sections: [] })
  const [, setIsLoadingInstructions] = useState(false)
  const [isSavingInstructions, setIsSavingInstructions] = useState(false)

  const [personalFilter, setPersonalFilter] = useState('all') // 'all' | 'public' | 'personal'
  const [ownerSearchTerm, setOwnerSearchTerm] = useState('')

  const [showCategoriesDialog, setShowCategoriesDialog] = useState(false)
  const [categoriesList, setCategoriesList] = useState([
      { name: 'כללי', color: '#64748b' }
  ])

    useEffect(() => {
    try {
      const saved = localStorage.getItem('admin_personal_filter');
      if (saved !== null) {
          const parsed = JSON.parse(saved);
          if (typeof parsed === 'string' && ['all', 'public', 'personal'].includes(parsed)) {
              setPersonalFilter(parsed);
          } else if (parsed === true) {
              setPersonalFilter('public');
          }
      }
    } catch (error) {
      localStorage.removeItem('admin_personal_filter');
      localStorage.removeItem('admin_hide_personal_books');
    }
  }, [])

  const loadBooks = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/library/list')
      const data = await response.json()
      if (data.success) {
        setBooks(data.books)
      }
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const loadCategories = async () => {
      try {
          const res = await fetch('/api/admin/categories');
          const data = await res.json();
          if (data.success && data.categories.length > 0) {
              setCategoriesList(data.categories);
          }
      } catch (error) {
          console.error(error);
      }
  }

  useEffect(() => {
    loadBooks()
    loadCategories()
  }, [])

  const handleSaveCategories = async (newCategories) => {
    try {
        const response = await fetch('/api/admin/categories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ categories: newCategories })
        });
        
        if (response.ok) {
            setCategoriesList(newCategories);
            showAlert('הצלחה', 'הקטגוריות עודכנו בהצלחה');
        } else {
            showAlert('שגיאה', 'שגיאה בשמירת הקטגוריות');
        }
    } catch (error) {
        showAlert('שגיאה', 'תקלה בתקשורת');
    }
  };

  const getCategoryColor = (catName) => {
      const cat = categoriesList.find(c => c.name === catName);
      return cat ? cat.color : '#64748b';
  };

  const handleShowSubscribers = () => {
    setShowSubscribersModal(true);
  };

  const handleDeleteBook = (bookId) => {
    showConfirm('מחיקת ספר', 'האם אתה בטוח שברצונך למחוק את הספר? כל העמודים והמידע יימחקו לצמיתות!', async () => {
        try {
            const response = await fetch('/api/admin/books/delete', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bookId })
            })
            const result = await response.json()
            if (result.success) {
                setBooks(prev => prev.filter(b => b.id !== bookId)) 
                showAlert('הצלחה', 'הספר נמחק בהצלחה!')
            } else {
                showAlert('שגיאה', result.error || 'שגיאה במחיקה')
            }
        } catch (e) {
            showAlert('שגיאה', 'שגיאה במחיקת הספר')
        }
    });
  }

  const handleVisibilityClick = (book) => {
    if (book.isHidden) {
      setBookToToggle(book)
      setShowNotifyDialog(true)
    } else {
      updateBookStatus(book.id, true, false) 
    }
  }

  const updateBookStatus = async (bookId, newIsHiddenStatus, sendNotification) => {
    setIsUpdatingStatus(true)
    try {
        const response = await fetch('/api/admin/books/update', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                id: bookId,
                bookId: bookId,
                isHidden: newIsHiddenStatus,
                sendNotification: sendNotification
            })
        });
        
        if (response.ok) {
            setBooks(prev => prev.map(b => 
                b.id === bookId ? { ...b, isHidden: newIsHiddenStatus } : b
            ));
        } else {
            const data = await response.json();
            showAlert('שגיאה', data.error || 'שגיאה בעדכון הסטטוס');
        }
    } catch (e) {
        showAlert('שגיאה', 'תקלה בתקשורת');
    } finally {
        setIsUpdatingStatus(false)
        setShowNotifyDialog(false)
        setBookToToggle(null)
    }
  };

  const handleRenameSubmit = async (newName, newCategory) => {
    if (!newName.trim() || !renamingBook) return;

    try {
        const response = await fetch('/api/admin/books/update', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                bookId: renamingBook.id,
                name: newName,
                category: newCategory
            })
        });

        if (response.ok) {
            setBooks(prev => prev.map(b =>
                b.id === renamingBook.id ? { ...b, name: newName, category: newCategory } : b
            ));
            setRenamingBook(null);
        } else {
            showAlert('שגיאה', 'שגיאה בשינוי הפרטים');
        }
    } catch (e) {
        showAlert('שגיאה', 'תקלה בתקשורת');
    }
  };

  const openRenameDialog = (book) => {
      setRenamingBook(book);
  };

  const handleDownloadFullText = async (book) => {
    try {
        const response = await fetch(`/api/admin/books/export-text?bookId=${book.id}`);
        const result = await response.json();

        if (result.success) {
            const blob = new Blob([result.combinedText], { type: 'text/plain;charset=utf-8' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            
            link.href = url;
            link.download = `${book.name}_מלא.txt`;
            document.body.appendChild(link);
            link.click();
            
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        } else {
            showAlert('שגיאה', 'שגיאה בהפקת הקובץ: ' + (result.error || 'נסה שוב מאוחר יותר'));
        }
    } catch (e) {
        showAlert('שגיאה', 'תקלה בתקשורת עם השרת');
    }
  };

  const handleDownloadPdf = async (book) => {
    if (downloadingPdfId) return;
    setDownloadingPdfId(book.id);
    try {
        const response = await fetch(`/api/admin/books/export-pdf?bookId=${book.id}`);

        if (!response.ok) {
            let message = 'נסה שוב מאוחר יותר';
            try {
                const result = await response.json();
                message = result.error || message;
            } catch (_) {}
            showAlert('שגיאה', 'שגיאה בהפקת ה-PDF: ' + message);
            return;
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');

        link.href = url;
        link.download = `${book.name}.pdf`;
        document.body.appendChild(link);
        link.click();

        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
    } catch (e) {
        showAlert('שגיאה', 'תקלה בתקשורת עם השרת');
    } finally {
        setDownloadingPdfId(null);
    }
  };

  const handleOpenGlobalInstructions = async () => {
    setShowGlobalInstructionsDialog(true);
    setIsLoadingInstructions(true);
    try {
        const res = await fetch('/api/admin/books/global-instructions');
        const data = await res.json();
        if (data.success && data.instructions) {
            setGlobalInstructionsData(data.instructions);
        } else {
            setGlobalInstructionsData({ sections: [{ title: 'הנחיות כלליות', items: [] }] });
        }
    } catch (error) {
        showAlert('שגיאה', 'לא ניתן לטעון הנחיות');
    } finally {
        setIsLoadingInstructions(false);
    }
  };

  const handleSaveGlobalInstructions = async (newData) => {
    setIsSavingInstructions(true);
    try {
        const response = await fetch('/api/admin/books/global-instructions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ instructions: newData })
        });

        if (response.ok) {
            showAlert('הצלחה', 'ההנחיות עודכנו בהצלחה');
            setGlobalInstructionsData(newData);
            setShowGlobalInstructionsDialog(false);
        } else {
            showAlert('שגיאה', 'שגיאה בשמירת הנתונים');
        }
    } catch (error) {
        showAlert('שגיאה', 'תקלה בתקשורת');
    } finally {
        setIsSavingInstructions(false);
    }
};

  const changePersonalFilter = (value) => {
    setPersonalFilter(value);
    localStorage.setItem('admin_personal_filter', JSON.stringify(value));
    if (value !== 'personal') {
        setOwnerSearchTerm('');
    }
  };

  const filteredBooks = books.filter(book => {
    const isCurrentlyPersonal = book.isPrivate || !!book.ownerId;
    const hasPersonalHistory = isCurrentlyPersonal || !!book.originalOwnerId;

    if (personalFilter === 'public' && isCurrentlyPersonal) return false;
    if (personalFilter === 'personal' && !hasPersonalHistory) return false;

    if (personalFilter === 'personal' && ownerSearchTerm.trim()) {
        const ownerName = (book.ownerName || book.originalOwnerName || '').toLowerCase();
        if (!ownerName.includes(ownerSearchTerm.trim().toLowerCase())) return false;
    }

    const matchesSearch = book.name.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;

    const total = book.totalPages || 0;
    const completed = book.completedPages || 0;

    switch (activeTab) {
      case 'in_progress':
        return completed > 0 && completed < total;
      case 'hidden':
        return book.isHidden;
      case 'completed':
        return total > 0 && completed >= total;
      default:
        return true;
    }
  });

  return (
    <>
        <div className="glass-strong p-6 rounded-xl animate-in fade-in slide-in-from-bottom-4 duration-500 relative">
        <div className="flex flex-col md:flex-row items-center justify-between mb-8 gap-4">
            <div className="flex flex-col items-start gap-3 w-full md:w-auto">
                <h2 className="text-2xl font-bold text-on-surface flex items-center gap-2 whitespace-nowrap">
                    <span className="material-symbols-outlined text-primary">menu_book</span>
                    ניהול ספרים
                </h2>
                <div className="relative w-full md:w-64">
                    <input 
                        type="text"
                        placeholder="חיפוש ספר..."
                        className="w-full border rounded-lg pr-8 pl-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                    <span className="material-symbols-outlined absolute right-2 top-2 text-neutral-400 text-lg">search</span>
                </div>
            </div>
            
            <div className="flex gap-3 w-full md:w-auto">
                <button
                    onClick={handleShowSubscribers}
                    className="flex items-center gap-2 px-4 py-2 bg-aqua-600 text-white rounded-xl hover:bg-aqua-700 transition-all shadow-md w-full md:w-auto justify-center text-sm"
                >
                    <span className="material-symbols-outlined">notifications_active</span>
                    <div className="flex flex-col items-start leading-tight">
                        <span className="font-bold">רשומים להתראות</span>
                        <span className="text-[10px] opacity-90">ספרים חדשים</span>
                    </div>
                </button>

                <button
                    onClick={handleOpenGlobalInstructions}
                    className="flex items-center gap-2 px-4 py-2 bg-neutral-cool-600 text-white rounded-xl hover:bg-neutral-cool-700 transition-all shadow-md w-full md:w-auto justify-center"
                >
                    <span className="material-symbols-outlined shrink-0">gavel</span>
                    <div className="flex flex-col items-start leading-tight">
                        <span className="font-bold">הנחיות גלובליות</span>
                        <span className="text-[10px] opacity-80">מופיע בכל הספרים</span>
                    </div>
                </button>

                <button
                    onClick={() => setShowCategoriesDialog(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-info-alt-700 text-white rounded-xl hover:bg-info-alt-800 transition-all shadow-md w-full md:w-auto justify-center"
                >
                    <span className="material-symbols-outlined shrink-0">palette</span>
                    <div className="flex flex-col items-start leading-tight">
                        <span className="font-bold">ניהול קטגוריות</span>
                        <span className="text-[10px] opacity-80">צבעים ושמות</span>
                    </div>
                </button>

                <button
                    onClick={() => setShowMergeDialog(true)}
                    className="flex items-center gap-2 px-5 py-2.5 bg-feature-600 text-white rounded-xl hover:bg-feature-700 transition-all shadow-md w-full md:w-auto justify-center"
                >
                    <span className="material-symbols-outlined shrink-0">call_merge</span>
                    <div className="flex flex-col items-start leading-tight">
                        <span className="font-bold">מיזוג ספרים</span>
                        <span className="text-[10px] opacity-80 whitespace-normal text-right">
                            (להשתמש רק על ספרים שלא התחילו טיפול)
                        </span>
                    </div>
                </button>

                <button
                    onClick={() => setShowAddBook(true)}
                    className="flex items-center gap-2 px-5 py-2.5 bg-primary text-on-primary rounded-xl hover:bg-accent transition-all shadow-md w-full md:w-auto justify-center"
                >
                    <span className="material-symbols-outlined">add_circle</span>
                    <span className="font-bold">הוסף ספר חדש</span>
                </button>
            </div>
        </div>

      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 gap-4">
        <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0 w-full md:w-auto">
            {[
                { id: 'all', label: 'כל הספרים' },
                { id: 'in_progress', label: 'בטיפול' },
                { id: 'hidden', label: 'מוסתרים' },
                { id: 'completed', label: 'הושלמו' },
            ].map(tab => (
                <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                        activeTab === tab.id 
                        ? 'bg-primary text-on-primary' 
                        : 'bg-white/50 text-neutral-600 hover:bg-white/80'
                    }`}
                >
                    {tab.label}
                </button>
            ))}
        </div>

        <div className="flex flex-col md:flex-row items-start md:items-center gap-2">
            <div className="flex gap-1 bg-white/40 p-1 rounded-lg border border-transparent">
                {[
                    { id: 'all', label: 'כל הספרים', icon: 'menu_book' },
                    { id: 'public', label: 'ציבוריים בלבד', icon: 'public' },
                    { id: 'personal', label: 'אישיים בלבד', icon: 'person' },
                ].map(opt => (
                    <button
                        key={opt.id}
                        onClick={() => changePersonalFilter(opt.id)}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                            personalFilter === opt.id
                            ? 'bg-primary text-on-primary shadow-sm'
                            : 'text-neutral-600 hover:bg-white/80'
                        }`}
                    >
                        <span className="material-symbols-outlined text-sm">{opt.icon}</span>
                        {opt.label}
                    </button>
                ))}
            </div>

            {personalFilter === 'personal' && (
                <div className="relative w-full md:w-56 animate-in fade-in slide-in-from-right-2 duration-200">
                    <input
                        type="text"
                        placeholder="סינון לפי שם בעלים..."
                        className="w-full border rounded-lg pr-8 pl-3 py-1.5 text-sm focus:ring-2 focus:ring-primary outline-none bg-white/70"
                        value={ownerSearchTerm}
                        onChange={e => setOwnerSearchTerm(e.target.value)}
                    />
                    <span className="material-symbols-outlined absolute right-2 top-1.5 text-neutral-400 text-base">person_search</span>
                </div>
            )}
        </div>
      </div>

        {loading ? (
            <LoadingSpinner message="טוען ספרים..." />
        ) : books.length === 0 ? (
            <div className="text-center py-20 text-neutral-500">
            <span className="material-symbols-outlined text-6xl mb-2">library_books</span>
            <p>אין ספרים במערכת עדיין</p>
            </div>
        ) : filteredBooks.length === 0 ? (
            <div className="text-center py-20 text-neutral-500">
                <p>לא נמצאו ספרים התואמים לחיפוש</p>
            </div>
        ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filteredBooks.map(book => {
                const isHidden = book.isHidden === true;
                const progress = book.totalPages > 0 ? Math.round((book.completedPages / book.totalPages) * 100) : 0;
                
                const isPersonal = book.isPrivate || !!book.ownerId;
                const wasPersonal = !isPersonal && !!book.originalOwnerId;
                const ownerName = book.ownerName || book.originalOwnerName || 'משתמש פרטי';

                return (
                    <div key={book.id || book.path} className={`group glass p-0 rounded-xl border transition-all hover:shadow-lg overflow-hidden flex flex-col ${isHidden ? 'border-warning-200 bg-warning-50/30' : 'border-white/50'}`}>
                    <div className="bg-gradient-to-b from-primary/5 to-transparent p-4 flex items-start justify-between relative">
                        <div className="flex gap-3">
                            {book.thumbnail ? (
                            <Image
                                src={book.thumbnail}
                                alt={book.name}
                                width={50}
                                height={70}
                                className="rounded shadow-sm object-cover"
                            />
                            ) : (
                                <div className="w-[50px] h-[70px] bg-neutral-200 rounded flex items-center justify-center text-neutral-400">
                                    <span className="material-symbols-outlined text-2xl">book</span>
                                </div>
                            )}
                            <div>
                                <h3 className="font-bold text-on-surface line-clamp-1 text-lg" title={book.name}>{book.name}</h3>
                                <div className="flex flex-wrap gap-2 items-center">
                                    <span 
                                        className="text-xs text-black px-2 py-0.5 rounded-full font-medium shadow-sm"
                                        style={{ backgroundColor: getCategoryColor(book.category || 'כללי') }}
                                    >
                                        {book.category || 'כללי'}
                                    </span>
                                    
                                    {isPersonal ? (
                                         <span className="bg-info-600 text-white text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                                            <span className="material-symbols-outlined text-[12px]">person</span>
                                            {ownerName}
                                        </span>
                                    ) : wasPersonal ? (
                                        <span className="bg-info-400 text-white text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1" title="ספר שהיה אישי והושלם">
                                            <span className="material-symbols-outlined text-[12px]">history</span>
                                            {ownerName}
                                        </span>
                                    ) : isHidden && (
                                        <span className="bg-warning-600 text-white text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                                            <span className="material-symbols-outlined text-[12px]">visibility_off</span>
                                            מוסתר
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        <button 
                            onClick={() => openRenameDialog(book)}
                            className="text-neutral-400 hover:text-primary hover:bg-white/80 p-1.5 rounded-full transition-all"
                            title="שנה שם ספר"
                        >
                            <span className="material-symbols-outlined text-lg">edit</span>
                        </button>
                    </div>

                    <div className="p-4 pt-2 flex-1 flex flex-col">
                        <div className="mt-2 mb-4">
                            <div className="flex justify-between text-xs text-neutral-600 mb-1">
                                <span>התקדמות</span>
                                <span className="font-bold">{progress}%</span>
                            </div>
                            <div className="w-full bg-neutral-200 rounded-full h-2">
                                <div 
                                    className="bg-success-500 h-2 rounded-full transition-all duration-500" 
                                    style={{ width: `${progress}%` }}
                                ></div>
                            </div>
                            <p className="text-xs text-center mt-1 text-neutral-500">
                                {book.completedPages || 0} מתוך {book.totalPages || 0} עמודים הושלמו
                            </p>
                        </div>

                        <div className="mt-auto space-y-2">
                            {progress === 100 ? (
                                <button
                                    onClick={() => handleDownloadFullText(book)}
                                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-success-600 text-white hover:bg-success-700 rounded-lg text-sm font-bold transition-all mb-1 shadow-sm"
                                    title="הורד את כל דפי הספר כקובץ טקסט אחד"
                                >
                                    <span className="material-symbols-outlined text-sm">download</span>
                                    הורד טקסט מאוחד
                                </button>
                            ) : (
                                <button
                                    onClick={() => handleDownloadFullText(book)}
                                    className="w-full flex items-center justify-center gap-1 px-2 py-1.5 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100/50 rounded text-xs transition-all mb-1"
                                    title="הורד את הטקסט הקיים (חלקי)"
                                >
                                    <span className="material-symbols-outlined text-[16px]">download</span>
                                    <span>הורד טקסט חלקי</span>
                                </button>
                            )}

                            <button
                                onClick={() => handleDownloadPdf(book)}
                                disabled={downloadingPdfId === book.id}
                                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-danger-50 text-danger-700 hover:bg-danger-100 rounded-lg text-sm font-medium transition-colors mb-1 disabled:opacity-60 disabled:cursor-not-allowed"
                                title="הורד את הספר המלא כקובץ PDF (מתמונות העמודים)"
                            >
                                <span className={`material-symbols-outlined text-sm ${downloadingPdfId === book.id ? 'animate-spin' : ''}`}>
                                    {downloadingPdfId === book.id ? 'progress_activity' : 'picture_as_pdf'}
                                </span>
                                {downloadingPdfId === book.id ? 'מכין PDF…' : 'הורד PDF מלא'}
                            </button>

                            <button
                                onClick={() => setOcrBook(book)}
                                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-feature-50 text-feature-700 hover:bg-feature-100 rounded-lg text-sm font-medium transition-colors mb-1"
                                title="הרץ OCR על כל עמודי הספר (Gemini או OCRWin) ברקע"
                            >
                                <span className="material-symbols-outlined text-sm">document_scanner</span>
                                OCR לספר שלם
                            </button>

                            {isPersonal ? (
                                <div className="grid grid-cols-2 gap-2">
                                    <Link
                                        href={`/library/books/${encodeURIComponent(book.path)}`}
                                        className="flex items-center justify-center gap-1 px-3 py-2 bg-info-50 text-info-700 hover:bg-info-100 rounded-lg text-sm font-medium transition-colors"
                                    >
                                        <span className="material-symbols-outlined text-sm">visibility</span>
                                        צפה
                                    </Link>
                                    <button
                                        onClick={() => handleDeleteBook(book.id)}
                                        className="flex items-center justify-center gap-1 px-3 py-2 text-danger-600 bg-danger-50 hover:bg-danger-100 rounded-lg text-sm transition-colors font-medium"
                                    >
                                        <span className="material-symbols-outlined text-sm">delete</span>
                                        <span>מחק</span>
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <div className="grid grid-cols-2 gap-2">
                                        <Link
                                            href={`/library/books/${encodeURIComponent(book.path)}`}
                                            className="flex items-center justify-center gap-1 px-3 py-2 bg-info-50 text-info-700 hover:bg-info-100 rounded-lg text-sm font-medium transition-colors"
                                        >
                                            <span className="material-symbols-outlined text-sm">visibility</span>
                                            צפה
                                        </Link>
                                        <button
                                            onClick={() => setEditingBookInfo(book)}
                                            className="flex items-center justify-center gap-1 px-3 py-2 bg-neutral-50 text-neutral-700 hover:bg-neutral-100 rounded-lg text-sm font-medium transition-colors"
                                        >
                                            <span className="material-symbols-outlined text-sm">edit_note</span>
                                            פרטים
                                        </button>
                                    </div>

                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => handleVisibilityClick(book)}
                                            className={`flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                                                isHidden 
                                                ? 'bg-warning-100 text-warning-800 hover:bg-warning-200' 
                                                : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-700'
                                            }`}
                                            title={isHidden ? "הפוך לספר גלוי לכולם" : "הסתר ספר מהציבור"}
                                        >
                                            <span className="material-symbols-outlined text-sm">
                                                {isHidden ? 'visibility_off' : 'visibility'}
                                            </span>
                                            <span>{isHidden ? 'מוסתר' : 'גלוי'}</span>
                                        </button>

                                        <button
                                            onClick={() => handleDeleteBook(book.id)}
                                            className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-danger-600 bg-danger-50 hover:bg-danger-100 rounded-lg text-sm transition-colors font-medium"
                                        >
                                            <span className="material-symbols-outlined text-sm">delete</span>
                                            <span>מחק</span>
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                    </div>
                )
            })}
            </div>
        )}

        <AddBookDialog
            isOpen={showAddBook}
            onClose={() => setShowAddBook(false)}
            onBookAdded={loadBooks}
            categories={categoriesList}
        />

        {editingBookInfo && (
            <EditBookInfoDialog
            book={editingBookInfo}
            onClose={() => setEditingBookInfo(null)}
            onSave={loadBooks}
            />
        )}
        </div>

        {ocrBook && (
            <BookOcrDialog
            book={ocrBook}
            onClose={() => setOcrBook(null)}
            />
        )}

        {renamingBook && (
            <RenameBookDialog
                book={renamingBook}
                categories={categoriesList}
                onClose={() => setRenamingBook(null)}
                onSave={handleRenameSubmit}
            />
        )}

        {showNotifyDialog && bookToToggle && (
            <NotifyVisibilityDialog
                book={bookToToggle}
                isUpdatingStatus={isUpdatingStatus}
                onConfirm={(sendNotification) => updateBookStatus(bookToToggle.id, false, sendNotification)}
                onClose={() => setShowNotifyDialog(false)}
            />
        )}

        <MergeBooksDialog
            isOpen={showMergeDialog}
            books={books}
            onClose={() => setShowMergeDialog(false)}
            onMergeComplete={loadBooks}
        />

        <BookSubscribersModal
            isOpen={showSubscribersModal}
            onClose={() => setShowSubscribersModal(false)}
        />

        <EditGlobalInstructionsDialog
            isOpen={showGlobalInstructionsDialog}
            onClose={() => setShowGlobalInstructionsDialog(false)}
            initialData={globalInstructionsData}
            onSave={handleSaveGlobalInstructions}
            isSaving={isSavingInstructions}
        />

        <EditCategoriesDialog
            isOpen={showCategoriesDialog}
            onClose={() => setShowCategoriesDialog(false)}
            existingCategories={categoriesList}
            onSave={handleSaveCategories}
        />
    </>
  )
}
