'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useDialog } from '@/components/providers/DialogContext';
import { formatTimeAgo, computeRegularRecipients, generateEmailHtml } from './reminderUtils';
import ReminderHistoryList from './ReminderHistoryList';
import ReminderUserSelectionModal from './ReminderUserSelectionModal';
import Loader from '@/components/ui/Loader'

export default function BookReminderPage() {
    const { data: session } = useSession();
    const { showConfirm } = useDialog();
    
    const [books, setBooks] = useState([]);
    const [allUsers, setAllUsers] = useState([]); 
    const [history, setHistory] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(true);
    
    const [selectedBookPath, setSelectedBookPath] = useState('');
    const [customMessage, setCustomMessage] = useState('שמנו לב כי ישנם עמודים שתפסת לעריכה וטרם הושלמו.\nנודה לך מאוד אם תוכל להיכנס למערכת ולהשלים את העבודה עליהם בהקדם, כדי שנוכל לקדם את הספר לפרסום לטובת הכלל.\nלחילופין, אם לא תוכל לסיים כרגע, נא לשחרר את העמודים ע"מ שאחרים יוכלו לסיים אותם.');
    
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
        // שלוש הבקשות בלתי-תלויות זו בזו, ולכן יוצאות במקביל.
        // כל טעינה מטפלת בשגיאה שלה, כך שכשל באחת לא מונע את האחרות.
        const loadBooks = async () => {
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
            } catch (error) {
                console.error('Error loading initial data:', error);
            }
        };

        const loadUsers = async () => {
            try {
                const usersRes = await fetch('/api/admin/users');
                const usersData = await usersRes.json();
                if (usersData.success && Array.isArray(usersData.users)) {
                    setAllUsers(usersData.users);
                }
            } catch (error) {
                console.error('Error loading initial data:', error);
            }
        };

        const loadHistory = async () => {
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
        };

        Promise.all([loadBooks(), loadUsers(), loadHistory()]);
    }, []);

    useEffect(() => {
        if (!selectedBookPath) {
            setRecipients([]);
            setFoundUsersDetails([]);
            return;
        }

        const fetchRecipients = async () => {
            setIsCheckingRecipients(true);
            setRecipients([]);
            setFoundUsersDetails([]);

            try {
                const response = await fetch(`/api/book/${encodeURIComponent(selectedBookPath)}`);
                const data = await response.json();

                if (data.success && data.pages) {
                    const usersList = computeRegularRecipients(data.pages, allUsers);
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
    }, [selectedBookPath, allUsers]);

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
        if (!selectedBookPath) return;

        const selectedBook = books.find(b => b.path === selectedBookPath);
        if (!selectedBook) return;
        const bookName = selectedBook.name;
        const bookPath = selectedBook.path;

        const executeSend = async () => {
            setStatus({ loading: true, error: '', success: '' });

            try {
                const messageToSend = customMessage;
                const emailHtml = generateEmailHtml(bookName, messageToSend);
                const emailSubject = `הודעה מערכת בנוגע לספר "${bookName}"`;
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
                        isPartial: isPartial
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
                    bookName: bookName,
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

        if (history.length > 0 && history[0].bookName === bookName) {
            const timeAgo = formatTimeAgo(history[0].timestamp);
            
            showConfirm(
                'כפילות שליחה',
                `שים לב! התזכורת האחרונה שיצאה מהמערכת (${timeAgo}) הייתה גם היא עבור הספר "${bookName}".\nהאם אתה בטוח שברצונך לשלוח תזכורת נוספת?`,
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
                        1. בחר ספר (מוצגים רק ספרים בטיפול)
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
                                        <Loader size="inline" decorative className="text-sm" />
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
                </div>

                <div>
                    <label className="block text-sm font-bold text-neutral-700 mb-2">
                        2. תוכן ההודעה (משתלב בתוך התבנית הקבועה)
                    </label>
                    <textarea
                        value={customMessage}
                        onChange={(e) => setCustomMessage(e.target.value)}
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
                            <Loader size="inline" decorative />
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
                    onToggle={toggleRecipient}
                    onSelectAll={() => setRecipients(foundUsersDetails.map(u => u.email))}
                    onSelectNone={() => setRecipients([])}
                    onClose={() => setShowUserSelection(false)}
                />
            )}
        </div>
    );
}
