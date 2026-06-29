'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import AddBookDialog from '@/components/admin/AddBookDialog'
import EditBookInfoDialog from '@/components/admin/EditBookInfoDialog'
import EditGlobalInstructionsDialog from '@/components/admin/EditGlobalInstructionsDialog'
import EditCategoriesDialog from '@/components/admin/EditCategoriesDialog'
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
  const [newName, setNewName] = useState('')
  const [newCategory, setNewCategory] = useState('')

  const [showMergeDialog, setShowMergeDialog] = useState(false)
  const [selectedBooksToMerge, setSelectedBooksToMerge] = useState([]) 
  const [mergedBookName, setMergedBookName] = useState('')
  const [isMergedHidden, setIsMergedHidden] = useState(false)
  const [isMerging, setIsMerging] = useState(false)

  const [downloadingPdfId, setDownloadingPdfId] = useState(null)

  const [showNotifyDialog, setShowNotifyDialog] = useState(false)
  const [bookToToggle, setBookToToggle] = useState(null)
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)

  const [showSubscribersModal, setShowSubscribersModal] = useState(false)
  const [subscribersList, setSubscribersList] = useState([])
  const [isLoadingSubscribers, setIsLoadingSubscribers] = useState(false)

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

  const handleShowSubscribers = async () => {
    setShowSubscribersModal(true);
    setIsLoadingSubscribers(true);
    try {
        const response = await fetch('/api/admin/mailing-list');
        const data = await response.json();
        
        if (data.success && Array.isArray(data.subscribers)) {
            setSubscribersList(data.subscribers);
        } else {
            setSubscribersList([]);
        }
    } catch (error) {
        showAlert('שגיאה', 'שגיאה בטעינת הרשימה');
    } finally {
        setIsLoadingSubscribers(false);
    }
  };

  const handleDeleteSubscriber = (email) => {
    showConfirm('הסרת מנוי', 'האם אתה בטוח שברצונך להסיר מנוי זה מהרשימה?', async () => {
        try {
            const response = await fetch('/api/admin/mailing-list/delete', { 
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });
            
            const result = await response.json();
            
            if (result.success) {
                setSubscribersList(prev => prev.filter(s => s.email !== email));
                showAlert('הצלחה', 'המנוי הוסר בהצלחה');
            } else {
                showAlert('שגיאה', result.error || 'שגיאה במחיקת המנוי');
            }
        } catch (error) {
            showAlert('שגיאה', 'שגיאה בתקשורת');
        }
    });
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

  const handleRenameSubmit = async () => {
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
            setNewName('');
            setNewCategory('');
        } else {
            showAlert('שגיאה', 'שגיאה בשינוי הפרטים');
        }
    } catch (e) {
        showAlert('שגיאה', 'תקלה בתקשורת');
    }
  };

  const openRenameDialog = (book) => {
      setRenamingBook(book);
      setNewName(book.name);
      setNewCategory(book.category || 'כללי');
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

  const addBookToMergeList = (book) => {
      if (!selectedBooksToMerge.find(b => b.id === book.id)) {
          setSelectedBooksToMerge(prev => [...prev, book]);
      }
  };

  const removeBookFromMergeList = (bookId) => {
      setSelectedBooksToMerge(prev => prev.filter(b => b.id !== bookId));
  };

  const moveBookOrder = (index, direction) => {
      const newDocs = [...selectedBooksToMerge];
      if (direction === 'up' && index > 0) {
          [newDocs[index], newDocs[index - 1]] = [newDocs[index - 1], newDocs[index]];
      } else if (direction === 'down' && index < newDocs.length - 1) {
          [newDocs[index], newDocs[index + 1]] = [newDocs[index + 1], newDocs[index]];
      }
      setSelectedBooksToMerge(newDocs);
  };

  const handleMergeSubmit = async () => {
      if (selectedBooksToMerge.length < 2) {
          showAlert('שים לב', 'יש לבחור לפחות 2 ספרים למיזוג');
          return;
      }
      if (!mergedBookName.trim()) {
          showAlert('שים לב', 'יש לבחור שם לספר המאוחד');
          return;
      }

      setIsMerging(true);
      try {
          const orderedBookIds = selectedBooksToMerge.map(b => b.id);
          
          const response = await fetch('/api/admin/books/merge', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                  bookIds: orderedBookIds,
                  newName: mergedBookName,
                  isHidden: isMergedHidden
              })
          });

          const result = await response.json();

          if (result.success) {
              showAlert('הצלחה', 'הספרים מוזגו בהצלחה!');
              setShowMergeDialog(false);
              setSelectedBooksToMerge([]);
              setMergedBookName('');
              setIsMergedHidden(false);
              loadBooks(); 
          } else {
              showAlert('שגיאה', result.error || 'שגיאה במיזוג הספרים');
          }
      } catch (e) {
          console.error(e);
          showAlert('שגיאה', 'שגיאה בתקשורת עם השרת');
      } finally {
          setIsMerging(false);
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

        {renamingBook && (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200 h-screen w-screen">
                <div 
                    className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden relative" 
                    onClick={e => e.stopPropagation()}
                >
                    <div className="p-4 border-b bg-neutral-50 flex justify-between items-center">
                        <h3 className="font-bold text-lg text-neutral-800">שינוי שם ספר</h3>
                        <button onClick={() => setRenamingBook(null)} className="text-neutral-400 hover:text-neutral-600 rounded-full hover:bg-neutral-200 p-1">
                            <span className="material-symbols-outlined text-xl">close</span>
                        </button>
                    </div>
                    
                    <div className="p-6">
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-neutral-700 mb-2">שם הספר החדש</label>
                            <input 
                                type="text" 
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                className="w-full border border-neutral-300 rounded-lg p-3 focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all text-base"
                                autoFocus
                            />
                        </div>

                        <div className="mb-6">
                            <div className="flex justify-between mb-2">
                                <label className="block text-sm font-medium text-neutral-700">קטגוריה</label>
                                {(renamingBook.isPrivate || renamingBook.ownerId) && (
                                    <span className="text-xs text-danger-500 bg-danger-50 px-2 py-0.5 rounded-full border border-danger-100 flex items-center gap-1">
                                        <span className="material-symbols-outlined text-[10px]">lock</span>
                                        ספר אישי - לא ניתן לשינוי
                                    </span>
                                )}
                            </div>
                            
                            <select
                                value={newCategory}
                                onChange={(e) => setNewCategory(e.target.value)}
                                disabled={renamingBook.isPrivate || renamingBook.ownerId}
                                className="w-full border border-neutral-300 rounded-lg p-3 focus:ring-2 focus:ring-primary outline-none bg-white disabled:bg-neutral-100 disabled:text-neutral-500 disabled:cursor-not-allowed"
                            >
                                {categoriesList && categoriesList.length > 0 ? (
                                    categoriesList.map((cat, idx) => (
                                        <option key={idx} value={cat.name}>{cat.name}</option>
                                    ))
                                ) : (
                                    <option value="כללי">כללי</option>
                                )}
                            </select>
                        </div>
                        
                        <div className="flex justify-end gap-3 mt-8">
                            <button 
                                onClick={() => setRenamingBook(null)}
                                className="px-5 py-2 text-neutral-600 hover:bg-neutral-100 rounded-lg font-medium transition-colors"
                            >
                                ביטול
                            </button>
                            <button 
                                onClick={handleRenameSubmit}
                                className="px-5 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 font-medium shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                disabled={
                                    !newName.trim() || 
                                    (newName === renamingBook.name && newCategory === (renamingBook.category || 'כללי'))
                                }
                            >
                                שמור שינויים
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {showNotifyDialog && bookToToggle && (
             <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200 h-screen w-screen">
                <div 
                    className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden relative" 
                    onClick={e => e.stopPropagation()}
                >
                    <div className="p-4 border-b bg-neutral-50 flex justify-between items-center">
                        <h3 className="font-bold text-lg text-neutral-800 flex items-center gap-2">
                             <span className="material-symbols-outlined text-primary">campaign</span>
                             חשיפת ספר לקהל
                        </h3>
                        <button onClick={() => setShowNotifyDialog(false)} className="text-neutral-400 hover:text-neutral-600 rounded-full hover:bg-neutral-200 p-1">
                            <span className="material-symbols-outlined text-xl">close</span>
                        </button>
                    </div>
                    
                    <div className="p-6 space-y-4">
                        <p className="text-neutral-700 text-base">
                            הספר <strong>"{bookToToggle.name}"</strong> יהפוך כעת לגלוי לכל המשתמשים.
                        </p>
                        <p className="font-bold text-neutral-900 text-base">
                            האם ברצונך לשלוח עדכון במייל למנויים על ספר זה?
                        </p>

                        <div className="flex flex-col gap-3 mt-6">
                            <button
                                onClick={() => updateBookStatus(bookToToggle.id, false, true)}
                                disabled={isUpdatingStatus}
                                className="w-full bg-success-600 text-white py-3 rounded-xl hover:bg-success-700 flex items-center justify-center gap-2 font-bold shadow-md transition-all hover:scale-[1.02]"
                            >
                                {isUpdatingStatus ? 'מעדכן ושולח...' : (
                                    <>
                                        <span className="material-symbols-outlined">send</span>
                                        כן, חשוף ושלח מייל
                                    </>
                                )}
                            </button>
                            
                            <button
                                onClick={() => updateBookStatus(bookToToggle.id, false, false)}
                                disabled={isUpdatingStatus}
                                className="w-full bg-neutral-100 text-neutral-700 py-3 rounded-xl hover:bg-neutral-200 border border-neutral-300 font-medium transition-all"
                            >
                                לא, רק חשוף (ללא מייל)
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {showMergeDialog && (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200 h-screen w-screen">
                <div 
                    className="bg-white rounded-xl shadow-2xl w-full max-w-5xl overflow-hidden relative flex flex-col h-[85vh]" 
                    onClick={e => e.stopPropagation()}
                >
                    <div className="p-4 border-b bg-neutral-50 flex justify-between items-center shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="bg-feature-100 p-2 rounded-full">
                                <span className="material-symbols-outlined text-feature-600">call_merge</span>
                            </div>
                            <div>
                                <h3 className="font-bold text-xl text-neutral-800">מיזוג ספרים</h3>
                                <p className="text-xs text-neutral-500">בחר ספרים וסדר אותם לפי הסדר הרצוי</p>
                            </div>
                        </div>
                        <button onClick={() => setShowMergeDialog(false)} className="text-neutral-400 hover:text-neutral-600 rounded-full hover:bg-neutral-200 p-1">
                            <span className="material-symbols-outlined text-xl">close</span>
                        </button>
                    </div>
                    
                    <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
                        <div className="w-full md:w-1/2 border-l p-4 flex flex-col bg-neutral-50/50">
                            <h4 className="font-bold text-neutral-700 mb-3 flex items-center gap-2">
                                <span className="material-symbols-outlined text-sm">library_books</span>
                                בחר ספרים להוספה
                            </h4>
                            <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                                {books.map(book => {
                                    const isSelected = selectedBooksToMerge.some(b => b.id === book.id);
                                    if (isSelected) return null;

                                    return (
                                        <div 
                                            key={book.id}
                                            onClick={() => addBookToMergeList(book)}
                                            className="bg-white p-3 rounded-lg border hover:border-feature-300 hover:shadow-sm cursor-pointer transition-all flex items-center gap-3 group"
                                        >
                                            {book.thumbnail ? (
                                                <Image src={book.thumbnail} alt="" width={30} height={40} className="rounded object-cover shadow-sm" />
                                            ) : (
                                                <div className="w-[30px] h-[40px] bg-neutral-100 rounded flex items-center justify-center">
                                                    <span className="material-symbols-outlined text-neutral-300 text-sm">book</span>
                                                </div>
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <div className="font-medium text-sm text-neutral-800 truncate">{book.name}</div>
                                                <div className="text-xs text-neutral-500">{book.category}</div>
                                            </div>
                                            <div className="w-6 h-6 rounded-full bg-neutral-100 flex items-center justify-center group-hover:bg-feature-100 group-hover:text-feature-600 transition-colors">
                                                <span className="material-symbols-outlined text-sm">add</span>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>

                        <div className="w-full md:w-1/2 p-4 flex flex-col bg-white">
                            <h4 className="font-bold text-neutral-700 mb-4 flex items-center gap-2">
                                <span className="material-symbols-outlined text-sm">format_list_numbered</span>
                                סדר הספרים במיזוג ({selectedBooksToMerge.length})
                            </h4>

                            <div className="mb-4 space-y-3">
                                <div>
                                    <label className="block text-sm font-medium text-neutral-700 mb-1">שם הספר המאוחד החדש</label>
                                    <input 
                                        type="text" 
                                        value={mergedBookName}
                                        onChange={(e) => setMergedBookName(e.target.value)}
                                        className="w-full border border-neutral-300 rounded-lg p-2.5 focus:ring-2 focus:ring-feature-500 outline-none text-base bg-feature-50/30"
                                        placeholder="לדוגמה: אוסף כתבים מלא"
                                    />
                                </div>
                                <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer select-none">
                                    <input 
                                        type="checkbox" 
                                        checked={isMergedHidden}
                                        onChange={(e) => setIsMergedHidden(e.target.checked)}
                                        className="w-4 h-4 text-feature-600 rounded focus:ring-feature-500 border-neutral-300"
                                    />
                                    <span>הגדר את הספר המאוחד כ"מוסתר" (לא יוצג לציבור)</span>
                                </label>
                            </div>

                            {selectedBooksToMerge.length === 0 ? (
                                <div className="flex-1 flex flex-col items-center justify-center text-neutral-400 border-2 border-dashed border-neutral-200 rounded-xl bg-neutral-50/50 m-2">
                                    <span className="material-symbols-outlined text-4xl mb-2 opacity-50">playlist_add</span>
                                    <p className="text-sm">בחר ספרים מהרשימה מימין</p>
                                </div>
                            ) : (
                                <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar pb-4">
                                    {selectedBooksToMerge.map((book, index) => (
                                        <div key={book.id} className="bg-feature-50 border border-feature-100 p-3 rounded-lg flex items-center gap-3 animate-in slide-in-from-right-4 duration-300">
                                            <div className="font-bold text-feature-300 text-lg w-6 text-center">{index + 1}</div>
                                            <div className="flex-1 min-w-0 font-medium text-sm text-neutral-900 truncate">{book.name}</div>
                                            <div className="flex items-center gap-1 bg-white rounded-lg border shadow-sm p-1">
                                                <button onClick={() => moveBookOrder(index, 'up')} disabled={index === 0} className="p-1 hover:bg-neutral-100 rounded disabled:opacity-30">
                                                    <span className="material-symbols-outlined text-sm">arrow_upward</span>
                                                </button>
                                                <button onClick={() => moveBookOrder(index, 'down')} disabled={index === selectedBooksToMerge.length - 1} className="p-1 hover:bg-neutral-100 rounded disabled:opacity-30">
                                                    <span className="material-symbols-outlined text-sm">arrow_downward</span>
                                                </button>
                                                <button onClick={() => removeBookFromMergeList(book.id)} className="p-1 text-danger-500 hover:bg-danger-50 rounded">
                                                    <span className="material-symbols-outlined text-sm">close</span>
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="p-4 border-t bg-neutral-50 flex justify-end gap-3 shrink-0">
                        <button onClick={() => setShowMergeDialog(false)} className="px-5 py-2.5 text-neutral-600 hover:bg-neutral-100 rounded-lg font-medium transition-colors">ביטול</button>
                        <button 
                            onClick={handleMergeSubmit} 
                            disabled={selectedBooksToMerge.length < 2 || !mergedBookName.trim() || isMerging}
                            className="px-6 py-2.5 bg-feature-600 text-white rounded-lg hover:bg-feature-700 font-bold shadow-md disabled:opacity-50 flex items-center gap-2"
                        >
                            {isMerging ? 'מבצע מיזוג...' : 'בצע מיזוג עכשיו'}
                        </button>
                    </div>
                </div>
            </div>
        )}

        {showSubscribersModal && (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200 h-screen w-screen">
                <div 
                    className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden relative flex flex-col max-h-[80vh]" 
                    onClick={e => e.stopPropagation()}
                >
                    <div className="p-4 border-b bg-aqua-50 flex justify-between items-center shrink-0">
                        <div className="flex items-center gap-2">
                             <div className="bg-aqua-100 p-2 rounded-full text-aqua-700">
                                <span className="material-symbols-outlined">group</span>
                             </div>
                             <div>
                                <h3 className="font-bold text-lg text-neutral-800">רשומים להתראות</h3>
                                <p className="text-xs text-aqua-700 font-medium">עדכונים על ספרים חדשים</p>
                             </div>
                        </div>
                        <button onClick={() => setShowSubscribersModal(false)} className="text-neutral-400 hover:text-neutral-600 rounded-full hover:bg-neutral-200 p-1">
                            <span className="material-symbols-outlined text-xl">close</span>
                        </button>
                    </div>
                    
                    <div className="p-4 bg-neutral-50 border-b flex justify-between items-center">
                        <span className="text-neutral-600 text-sm">סך הכל רשומים:</span>
                        <span className="bg-aqua-600 text-white px-3 py-1 rounded-full font-bold text-sm">
                            {isLoadingSubscribers ? '...' : subscribersList.length}
                        </span>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                        {isLoadingSubscribers ? (
                            <div className="flex justify-center py-8 text-aqua-600">
                                <span className="material-symbols-outlined animate-spin text-3xl">progress_activity</span>
                            </div>
                        ) : subscribersList.length === 0 ? (
                            <div className="text-center py-8 text-neutral-400">
                                <span className="material-symbols-outlined text-4xl mb-2 opacity-30">unsubscribe</span>
                                <p>אין רשומים ברשימה זו עדיין.</p>
                            </div>
                        ) : (
                            <ul className="space-y-2">
                                {subscribersList.map((subscriber, index) => (
                                    <li key={subscriber.email} className="flex items-center justify-between gap-3 p-3 bg-white border border-neutral-100 rounded-lg hover:border-aqua-200 hover:shadow-sm transition-all group">
                                        <div className="flex items-center gap-3 overflow-hidden flex-1">
                                            <span className="text-neutral-400 text-xs w-6">{index + 1}.</span>
                                            <span className="material-symbols-outlined text-neutral-400 text-sm">mail</span>
                                            <span className="text-neutral-700 font-mono text-sm truncate select-all" title={subscriber.email}>{subscriber.email}</span>
                                        </div>
            
                                        <div className="flex items-center gap-3">
                                            <span className="text-neutral-600 text-sm truncate">{subscriber.name}</span>
                                            <button 
                                                onClick={() => handleDeleteSubscriber(subscriber.email)}
                                                className="text-neutral-300 hover:text-danger-500 hover:bg-danger-50 p-1.5 rounded-full transition-all opacity-0 group-hover:opacity-100"
                                                title="מחק מנוי"
                >
                                                <span className="material-symbols-outlined text-lg">delete</span>
                                            </button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                    
                    <div className="p-4 border-t bg-neutral-50 text-center">
                        <button 
                            onClick={() => setShowSubscribersModal(false)}
                            className="w-full py-2 bg-white border border-neutral-300 text-neutral-700 rounded-lg hover:bg-neutral-100 font-medium text-sm"
                        >
                            סגור
                        </button>
                    </div>
                </div>
            </div>
        )}

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
