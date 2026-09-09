'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useDialog } from '@/components/providers/DialogContext';
import { formatTimeAgo, computeRegularRecipients, computeDictaRecipients, generateEmailHtml } from './reminderUtils';
import ReminderHistoryList from './ReminderHistoryList';
import ReminderUserSelectionModal from './ReminderUserSelectionModal';

export default function BookReminderPage() {
    const { data: session } = useSession();
    const { showConfirm } = useDialog();
    
    const [books, setBooks] = useState([]);
    const [dictaBooks, setDictaBooks] = useState([]);
    const [allUsers, setAllUsers] = useState([]); 
    const [history, setHistory] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(true);
    
    const [bookType, setBookType] = useState('regular'); // 'regular' or 'dicta'
    const [selectedBookPath, setSelectedBookPath] = useState('');
    const [daysThreshold, setDaysThreshold] = useState(7);
    const [customMessage, setCustomMessage] = useState('שמנו לב כי ישנם עמודים שתפסת לעריכה וטרם הושלמו.\nנודה לך מאוד אם תוכל להיכנס למערכת ולהשלים את העבודה עליהם בהקדם, כדי שנוכל לקדם את הספר לפרסום לטובת הכלל.\nלחילופין, אם לא תוכל לסיים כרגע, נא לשחרר את העמודים ע"מ שאחרים יוכלו לסיים אותם.');
    const [dictaMessage, setDictaMessage] = useState('שמנו לב כי תפסת ספר דיקטה לעריכה וטרם הושלם.\nנודה לך מאוד אם תוכל להיכנס למערכת ולהשלים את העבודה עליו בהקדם, כדי שנוכל לקדם את הספר לפרסום לטובת הכלל.\nלחילופין, אם לא תוכל לסיים כרגע, נא לשחרר את הספר ע"מ שאחרים יוכלו לסיים אותו.');
    
    const [recipients, setRecipients] = useState([]);
    const [foundUsersDetails, setFoundUsersDetails] = useState([]);
    const [showUserSelection, setShowUserSelection] = useState(false);
    const [isCheckingRecipients, setIsCheckingRecipients] = useState(false);
    
    const [status, setStatus] = useState({
        loading: false,
        error: '',
        success: ''
    });

    const handleDeleteHistory = (id) => {
        showConfirm(
            'מחיקת היסטוריה',
            'האם אתה בטוח שברצונך למחוק רשומה זו מההיסטוריה?',
            async () => {
                try {
                    setHistory(prev => prev.filter(item => item.id !== id));

                    const res = await fetch(`/api/admin/history?id=${id}`, {
                        method: 'DELETE',
                    });
                    
                    const data = await res.json();
                    if (!data.success) {
                        console.error('Failed to delete history item');
                    }
                } catch (error) {
                    console.error('Error deleting history:', error);
                }
            }
        );
    };

    useEffect(() => {
        const loadInitialData = async () => {
            try {
                const booksRes = await fetch('/api/library/list');
                const booksData = await booksRes.json();
                if (booksData.success) {
                    const booksWithWork = booksData.books.filter(book => 
                        !book.isHidden &&
                        (
                            (book.inProgressPages && book.inProgressPages > 0) || 
                            (book.completedPages < book.totalPages)
                        )
                    );
                    setBooks(booksWithWork);
                }

                const dictaBooksRes = await fetch('/api/dicta/books');
                const dictaBooksData = await dictaBooksRes.json();
                if (Array.isArray(dictaBooksData)) {
                    const dictaBooksInProgress = dictaBooksData.filter(book => 
                        book.status === 'in-progress' && book.claimedBy
                    );
                    setDictaBooks(dictaBooksInProgress);
                }

                const usersRes = await fetch('/api/admin/users');
                const usersData = await usersRes.json();
                if (usersData.success && Array.isArray(usersData.users)) {
                    setAllUsers(usersData.users);
                }

                try {
                    const historyRes = await fetch('/api/admin/history');
                    if (historyRes.ok) {
                        const historyText = await historyRes.text();
                        if (historyText) {
                            const historyData = JSON.parse(historyText);
                            if (historyData.success) {
                                setHistory(historyData.history);
                            }
                        }
                    }
                } catch (e) {
                    console.error('History fetch failed:', e);
                } finally {
                    setLoadingHistory(false);
                }

            } catch (error) {
                console.error('Error loading initial data:', error);
            }
        };
        loadInitialData();
    }, []);

    useEffect(() => {
        // עבור ספרים רגילים - צריך לבחור ספר
        if (bookType === 'regular' && !selectedBookPath) {
            setRecipients([]);
            setFoundUsersDetails([]);
            return;
        }

        // עבור ספרי דיקטה - לא צריך לבחור ספר, מאתרים אוטומטית
        if (bookType === 'dicta' && dictaBooks.length === 0) {
            return;
        }

        const fetchRecipients = async () => {
            setIsCheckingRecipients(true);
            setRecipients([]);
            setFoundUsersDetails([]);

            try {
                if (bookType === 'regular') {
                    const response = await fetch(`/api/book/${encodeURIComponent(selectedBookPath)}`);
                    const data = await response.json();

                    if (data.success && data.pages) {
                        const usersList = computeRegularRecipients(data.pages, allUsers);
                        setFoundUsersDetails(usersList);
                        setRecipients(usersList.map(u => u.email));
                    }
                } else if (bookType === 'dicta') {
                    // טיפול בספרי דיקטה - מאתרים את כל המשתמשים עם ספרים בטיפול
                    const usersList = computeDictaRecipients(dictaBooks, allUsers, daysThreshold);
                    setFoundUsersDetails(usersList);
                    setRecipients(usersList.map(u => u.email));
                }
            } catch (error) {
                console.error('Error fetching recipients:', error);
            } finally {
                setIsCheckingRecipients(false);
            }
        };

        if (allUsers.length > 0) {
            fetchRecipients();
        }
    }, [selectedBookPath, allUsers, bookType, daysThreshold, dictaBooks]);

    const toggleRecipient = (email) => {
        setRecipients(prev => {
            if (prev.includes(email)) {
                return prev.filter(e => e !== email);
            } else {
                return [...prev, email];
            }
        });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (recipients.length === 0) return;
        
        // עבור ספרים רגילים - צריך לבחור ספר
        if (bookType === 'regular' && !selectedBookPath) return;

        let bookName, bookPath;
        
        if (bookType === 'regular') {
            const selectedBook = books.find(b => b.path === selectedBookPath);
            if (!selectedBook) return;
            bookName = selectedBook.name;
            bookPath = selectedBook.path;
        } else {
            // עבור דיקטה - שם כללי
            bookName = 'ספרי דיקטה';
            bookPath = 'dicta-books';
        }

        const executeSend = async () => {
            setStatus({ loading: true, error: '', success: '' });

            try {
                const messageToSend = bookType === 'dicta' ? dictaMessage : customMessage;
                const emailHtml = generateEmailHtml(bookName, messageToSend, bookType === 'dicta');
                const emailSubject = `הודעה מערכת בנוגע לספר${bookType === 'dicta' ? ' דיקטה' : ''} "${bookName}"`;
                const isPartial = recipients.length < foundUsersDetails.length;

                const response = await fetch('/api/admin/send-email', { 
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        bcc: recipients,
                        subject: emailSubject,
                        html: emailHtml,
                        text: messageToSend,
                        bookName: bookName,
                        bookPath: bookPath,
                        isPartial: isPartial,
                        bookType: bookType
                    }),
                });

                const textResponse = await response.text();
                let result;
                try {
                    result = textResponse ? JSON.parse(textResponse) : {};
                } catch (e) {
                    throw new Error('התקבלה תשובה לא תקינה מהשרת');
                }

                if (!response.ok || !result.success) {
                    throw new Error(result.error || 'שגיאה בשליחה');
                }

                const newHistoryItem = {
                    id: Date.now().toString(),
                    adminName: session?.user?.name || 'אדמין',
                    bookName: bookType === 'dicta' 
                        ? (daysThreshold === 0 
                            ? 'עורכי דיקטה (כל הספרים בטיפול)'
                            : `עורכי דיקטה מעל ${daysThreshold} ימים`)
                        : bookName,
                    bookType: bookType,
                    daysThreshold: bookType === 'dicta' ? daysThreshold : undefined,
                    timestamp: new Date().toISOString(),
                    isPartial: isPartial
                };
                
                setHistory(prev => [newHistoryItem, ...prev]);

                setStatus({ 
                    loading: false, 
                    error: '', 
                    success: `המיילים נשלחו בהצלחה ל-${recipients.length} משתמשים!` 
                });

            } catch (error) {
                setStatus({ loading: false, error: error.message, success: '' });
            }
        };

        if (history.length > 0 && history[0].bookName === bookName && history[0].bookType === bookType) {
            const timeAgo = formatTimeAgo(history[0].timestamp);
            
            showConfirm(
                'כפילות שליחה',
                `שים לב! התזכורת האחרונה שיצאה מהמערכת (${timeAgo}) הייתה גם היא עבור ${bookType === 'dicta' ? 'ספרי דיקטה' : `הספר "${bookName}"`}.\nהאם אתה בטוח שברצונך לשלוח תזכורת נוספת?`,
                executeSend
            );
        } else {
            executeSend();
        }
    };

    return (
        <div className="max-w-3xl mx-auto p-8 bg-white shadow-xl rounded-2xl mt-10">
            <h1 className="text-3xl font-bold mb-2 text-neutral-800 flex items-center gap-3">
                <span className="material-symbols-outlined text-primary text-4xl">forward_to_inbox</span>
                שליחת תזכורות לעורכים
            </h1>
            <p className="text-neutral-500 mb-8">
                המערכת תאתר אוטומטית את המשתמשים שעובדים כרגע על הספר הנבחר ותשלח להם את ההודעה.
            </p>

            <form onSubmit={handleSubmit} className="space-y-8">
                
                <div className="bg-neutral-50 p-4 rounded-xl border border-neutral-100">
                    <label className="block text-sm font-bold text-neutral-700 mb-2">
                        1. בחר סוג ספר
                    </label>
                    <div className="flex gap-4 mb-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="radio"
                                value="regular"
                                checked={bookType === 'regular'}
                                onChange={(e) => {
                                    setBookType(e.target.value);
                                    setSelectedBookPath('');
                                }}
                                className="w-4 h-4 text-primary focus:ring-primary"
                            />
                            <span className="text-sm font-medium">ספרים רגילים (עמודים)</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="radio"
                                value="dicta"
                                checked={bookType === 'dicta'}
                                onChange={(e) => {
                                    setBookType(e.target.value);
                                    setSelectedBookPath('');
                                }}
                                className="w-4 h-4 text-primary focus:ring-primary"
                            />
                            <span className="text-sm font-medium">ספרי דיקטה</span>
                        </label>
                    </div>

                    {bookType === 'dicta' ? (
                        <div className="bg-info-50 p-4 rounded-lg border border-info-200">
                            <label className="block text-sm font-bold text-neutral-700 mb-2">
                                סינון לפי ימים מאז תפיסה
                            </label>
                            <div className="flex items-center gap-3 mb-3">
                                <input
                                    type="number"
                                    min="0"
                                    value={daysThreshold}
                                    onChange={(e) => setDaysThreshold(parseInt(e.target.value) || 0)}
                                    className="w-20 p-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-primary outline-none"
                                />
                                <span className="text-sm text-neutral-600">
                                    {daysThreshold === 0 ? 'כל הספרים בטיפול (ללא סינון)' : `ימים או יותר מאז שהספר נתפס`}
                                </span>
                            </div>
                            <p className="text-xs text-neutral-500">
                                {daysThreshold === 0 
                                    ? 'המערכת תאתר את כל המשתמשים שיש להם ספרי דיקטה בטיפול, ללא קשר למועד התפיסה'
                                    : `המערכת תאתר אוטומטית את כל המשתמשים שיש להם ספרי דיקטה בטיפול שעברו ${daysThreshold} ימים או יותר מאז התפיסה`
                                }
                            </p>
                            
                            {isCheckingRecipients ? (
                                <div className="mt-3">
                                    <span className="text-info-600 flex items-center gap-2">
                                        <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                                        מאתר נמענים...
                                    </span>
                                </div>
                            ) : foundUsersDetails.length > 0 ? (
                                <div className="mt-3 flex items-center gap-3">
                                    <span className="text-success-600 font-bold flex items-center gap-2 bg-success-50 px-3 py-1 rounded-full border border-success-200">
                                        <span className="material-symbols-outlined text-sm">group</span>
                                        נמצאו {foundUsersDetails.length} משתמשים ({recipients.length} נבחרו)
                                    </span>
                                    
                                    <button 
                                        type="button"
                                        onClick={() => setShowUserSelection(true)}
                                        className="text-primary hover:text-info-800 underline font-medium text-sm transition-colors"
                                    >
                                        בחירת משתמשים מסויימים
                                    </button>
                                </div>
                            ) : (
                                <div className="mt-3">
                                    <span className="text-warning-strong-500 flex items-center gap-2 bg-warning-strong-50 px-3 py-1 rounded-full border border-warning-strong-200 text-sm">
                                        <span className="material-symbols-outlined text-sm">info</span>
                                        {daysThreshold === 0 
                                            ? 'לא נמצאו משתמשים עם ספרי דיקטה בטיפול'
                                            : `לא נמצאו משתמשים עם ספרי דיקטה שעברו ${daysThreshold} ימים`
                                        }
                                    </span>
                                </div>
                            )}
                        </div>
                    ) : (
                        <>
                            <label className="block text-sm font-bold text-neutral-700 mb-2">
                                2. בחר ספר (מוצגים רק ספרים בטיפול)
                            </label>
                            <select
                                value={selectedBookPath}
                                onChange={(e) => setSelectedBookPath(e.target.value)}
                                required
                                className="w-full p-3 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-primary outline-none bg-white transition-all"
                            >
                                <option value="">-- בחר ספר מהרשימה --</option>
                                {books.map(book => (
                                    <option key={book.id} value={book.path}>
                                        {book.name} ({book.category})
                                    </option>
                                ))}
                            </select>

                            {selectedBookPath && (
                                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm animate-in fade-in">
                                    <div>
                                        {isCheckingRecipients ? (
                                            <span className="text-info-600 flex items-center gap-2">
                                                <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                                                מאתר נמענים...
                                            </span>
                                        ) : foundUsersDetails.length > 0 ? (
                                            <div className="flex items-center gap-3">
                                                <span className="text-success-600 font-bold flex items-center gap-2 bg-success-50 px-3 py-1 rounded-full border border-success-200">
                                                    <span className="material-symbols-outlined text-sm">group</span>
                                                    נמצאו {foundUsersDetails.length} משתמשים ({recipients.length} נבחרו)
                                                </span>
                                                
                                                {foundUsersDetails.length > 1 && (
                                                    <button 
                                                        type="button"
                                                        onClick={() => setShowUserSelection(true)}
                                                        className="text-primary hover:text-info-800 underline font-medium text-sm transition-colors"
                                                    >
                                                        בחירת משתמשים מסויימים
                                                    </button>
                                                )}
                                            </div>
                                        ) : (
                                            <span className="text-danger-500 flex items-center gap-2 bg-danger-50 px-3 py-1 rounded-full border border-danger-200">
                                                <span className="material-symbols-outlined text-sm">warning</span>
                                                לא נמצאו נמענים פעילים בספר זה
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div>
                    <label className="block text-sm font-bold text-neutral-700 mb-2">
                        {bookType === 'regular' ? '3' : '2'}. תוכן ההודעה (משתלב בתוך התבנית הקבועה)
                    </label>
                    <textarea
                        value={bookType === 'dicta' ? dictaMessage : customMessage}
                        onChange={(e) => bookType === 'dicta' ? setDictaMessage(e.target.value) : setCustomMessage(e.target.value)}
                        required
                        rows="5"
                        placeholder="כתוב כאן את המסר שלך למתנדבים..."
                        className="w-full p-4 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-primary outline-none resize-y text-base leading-relaxed"
                    ></textarea>
                </div>

                <button
                    type="submit"
                    disabled={status.loading || recipients.length === 0}
                    className={`w-full py-4 px-6 rounded-xl text-white font-bold text-lg transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2 transform active:scale-[0.98]
                        ${status.loading || recipients.length === 0 
                            ? 'bg-neutral-400 cursor-not-allowed opacity-70' 
                            : 'bg-gradient-to-r from-info-600 to-info-700 hover:from-info-700 hover:to-info-800'}`}
                >
                    {status.loading ? (
                        <>
                            <span className="material-symbols-outlined animate-spin">progress_activity</span>
                            שולח הודעות...
                        </>
                    ) : (
                        <>
                            <span className="material-symbols-outlined">send</span>
                            שלח תזכורת ל-{recipients.length} משתמשים
                        </>
                    )}
                </button>

                {status.success && (
                    <div className="p-4 bg-success-50 text-success-800 rounded-xl border border-success-200 flex items-center gap-3 animate-in slide-in-from-bottom-2">
                        <span className="material-symbols-outlined text-2xl text-success-600">check_circle</span>
                        <div>
                            <p className="font-bold">השליחה בוצעה!</p>
                            <p className="text-sm">{status.success}</p>
                        </div>
                    </div>
                )}
                
                {status.error && (
                    <div className="p-4 bg-danger-50 text-danger-800 rounded-xl border border-danger-200 flex items-center gap-3 animate-in slide-in-from-bottom-2">
                        <span className="material-symbols-outlined text-2xl text-danger-600">error</span>
                        <div>
                            <p className="font-bold">שגיאה בשליחה</p>
                            <p className="text-sm">{status.error}</p>
                        </div>
                    </div>
                )}
            </form>

            <ReminderHistoryList
                loading={loadingHistory}
                history={history}
                onDelete={handleDeleteHistory}
            />

            {showUserSelection && (
                <ReminderUserSelectionModal
                    users={foundUsersDetails}
                    selected={recipients}
                    bookType={bookType}
                    onToggle={toggleRecipient}
                    onSelectAll={() => setRecipients(foundUsersDetails.map(u => u.email))}
                    onSelectNone={() => setRecipients([])}
                    onClose={() => setShowUserSelection(false)}
                />
            )}
        </div>
    );
}
