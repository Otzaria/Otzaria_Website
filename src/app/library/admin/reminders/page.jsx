'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useDialog } from '@/components/DialogContext';

export default function BookReminderPage() {
    const { data: session } = useSession();
    const { showConfirm } = useDialog();
    
    const [books, setBooks] = useState([]);
    const [dictaBooks, setDictaBooks] = useState([]);
    const [allUsers, setAllUsers] = useState([]); 
    const [history, setHistory] = useState([]);
    
    const [bookType, setBookType] = useState('regular'); // 'regular' or 'dicta'
    const [selectedBookPath, setSelectedBookPath] = useState('');
    const [daysThreshold, setDaysThreshold] = useState(7);
    const [customMessage, setCustomMessage] = useState('שמנו לב כי ישנם עמודים שתפסת לעריכה וטרם הושלמו.\nנודה לך מאוד אם תוכל להיכנס למערכת ולהשלים את העבודה עליהם בהקדם, כדי שנוכל לקדם את הספר לפרסום לטובת הכלל.\nלחילופין, אם לא תוכלו לסיים כרגע, נא לשחרר את העמודים ע"מ שאחרים יוכלו לסיים אותם.');
    const [dictaMessage, setDictaMessage] = useState('שמנו לב כי תפסת ספר דיקטה לעריכה וטרם הושלם.\nנודה לך מאוד אם תוכל להיכנס למערכת ולהשלים את העבודה עליו בהקדם, כדי שנוכל לקדם את הספר לפרסום לטובת הכלל.\nלחילופין, אם לא תוכלו לסיים כרגע, נא לשחרר את הספר ע"מ שאחרים יוכלו לסיים אותו.');
    
    const [recipients, setRecipients] = useState([]);
    const [foundUsersDetails, setFoundUsersDetails] = useState([]);
    const [showUserSelection, setShowUserSelection] = useState(false);
    const [isCheckingRecipients, setIsCheckingRecipients] = useState(false);
    
    const [status, setStatus] = useState({
        loading: false,
        error: '',
        success: ''
    });

    const normalizeId = (id) => {
        if (!id) return null;
        return String(id).toString();
    };

    const formatTimeAgo = (dateString) => {
        const date = new Date(dateString);
        const now = new Date();
        const seconds = Math.floor((now - date) / 1000);

        if (seconds < 60) return 'ממש עכשיו';
        
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `לפני ${minutes} דקות`;
        
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `לפני ${hours === 1 ? 'שעה' : hours + ' שעות'}`;
        
        const days = Math.floor(hours / 24);
        return `לפני ${days === 1 ? 'יום אחד' : days + ' ימים'}`;
    };

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
                        const userMap = new Map();
                        allUsers.forEach(u => {
                            if (u._id) userMap.set(normalizeId(u._id), u);
                            if (u.id) userMap.set(normalizeId(u.id), u);
                        });

                        const uniqueUsers = new Map();
                        
                        data.pages.forEach(page => {
                            if (page.status === 'in-progress') {
                                let rawUserId = page.claimedById || page.holder;
                                if (rawUserId && typeof rawUserId === 'object' && rawUserId._id) {
                                    rawUserId = rawUserId._id;
                                }
                                const userId = normalizeId(rawUserId);

                                if (userId) {
                                    const userDetails = userMap.get(userId);
                                    if (userDetails && userDetails.email && userDetails.acceptReminders && userDetails.isVerified) {
                                        uniqueUsers.set(userDetails.email, {
                                            email: userDetails.email,
                                            name: userDetails.name || 'משתמש ללא שם',
                                            id: userId
                                        });
                                    }
                                }
                            }
                        });

                        const usersList = Array.from(uniqueUsers.values());
                        setFoundUsersDetails(usersList);
                        setRecipients(usersList.map(u => u.email));
                    }
                } else if (bookType === 'dicta') {
                    // טיפול בספרי דיקטה - מאתרים את כל המשתמשים עם ספרים בטיפול
                    const now = new Date();
                    const usersWithBooks = new Map();

                    // יצירת Map של משתמשים לפי ID לשיפור ביצועים (O(1) במקום O(N))
                    const userMap = new Map();
                    allUsers.forEach(u => {
                        if (u._id) userMap.set(normalizeId(u._id), u);
                        if (u.id) userMap.set(normalizeId(u.id), u);
                    });

                    dictaBooks.forEach(book => {
                        if (book.status === 'in-progress' && book.claimedBy && book.claimedAt) {
                            const claimedAt = new Date(book.claimedAt);
                            const daysSinceClaim = Math.floor((now - claimedAt) / (1000 * 60 * 60 * 24));

                            if (daysSinceClaim >= daysThreshold) {
                                const claimedById = book.claimedBy._id || book.claimedBy;
                                const userId = normalizeId(claimedById);
                                const userDetails = userMap.get(userId);

                                if (userDetails && userDetails.email && userDetails.acceptReminders && userDetails.isVerified) {
                                    if (!usersWithBooks.has(userId)) {
                                        usersWithBooks.set(userId, {
                                            email: userDetails.email,
                                            name: userDetails.name || 'משתמש ללא שם',
                                            id: userId,
                                            books: [],
                                            maxDays: daysSinceClaim
                                        });
                                    }
                                    
                                    const userInfo = usersWithBooks.get(userId);
                                    userInfo.books.push({
                                        title: book.title,
                                        daysSinceClaim
                                    });
                                    userInfo.maxDays = Math.max(userInfo.maxDays, daysSinceClaim);
                                }
                            }
                        }
                    });

                    const usersList = Array.from(usersWithBooks.values());
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

    const generateEmailHtml = (bookName, messageBody, isDicta = false) => {
        const siteUrl = typeof window !== 'undefined' ? window.location.origin : '';
        const formattedBody = messageBody.replace(/\n/g, '<br/>');
        const bookLink = isDicta 
            ? `${siteUrl}/library/dicta-books?status=my-books` 
            : `${siteUrl}/library/book/${bookName}`;

        return `
        <div dir="rtl" style="font-family: Arial, sans-serif; background-color: #f9f9f9; padding: 40px; text-align: center;">
            <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); overflow: hidden;">
                <div style="background-color: #ffffff; padding: 20px; border-bottom: 3px solid #d4a373;">
                    <img src="https://www.otzaria.org/logo.png" alt="Otzaria Logo" style="width: 120px; height: auto;">
                    <h2 style="color: #d4a373; margin: 5px 0 0 0; font-size: 20px; font-weight: bold;">ספריית אוצריא</h2>
                </div>
                <div style="padding: 30px; color: #333333;">
                    <h1 style="color: #2c3e50; font-size: 24px; margin-bottom: 10px;">הודעה בנוגע לספר${isDicta ? ' דיקטה' : ''}: ${bookName}</h1>
                    <div style="font-size: 18px; line-height: 1.6; text-align: right; margin-bottom: 30px;">
                        ${formattedBody}
                    </div>
                    <div style="margin: 30px 0; text-align: center;">
                        <a href="${bookLink}" style="background-color: #d4a373; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
                            ${isDicta ? 'כנס לספרי הדיקטה שלי' : 'כנס לספרייה'}
                        </a>
                    </div>
                </div>
            </div>
        </div>
        `;
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
            <h1 className="text-3xl font-bold mb-2 text-gray-800 flex items-center gap-3">
                <span className="material-symbols-outlined text-primary text-4xl">forward_to_inbox</span>
                שליחת תזכורות לעורכים
            </h1>
            <p className="text-gray-500 mb-8">
                המערכת תאתר אוטומטית את המשתמשים שעובדים כרגע על הספר הנבחר ותשלח להם את ההודעה.
            </p>

            <form onSubmit={handleSubmit} className="space-y-8">
                
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                    <label className="block text-sm font-bold text-gray-700 mb-2">
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
                        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                            <label className="block text-sm font-bold text-gray-700 mb-2">
                                סינון לפי ימים מאז תפיסה
                            </label>
                            <div className="flex items-center gap-3 mb-3">
                                <input
                                    type="number"
                                    min="0"
                                    value={daysThreshold}
                                    onChange={(e) => setDaysThreshold(parseInt(e.target.value) || 0)}
                                    className="w-20 p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary outline-none"
                                />
                                <span className="text-sm text-gray-600">
                                    {daysThreshold === 0 ? 'כל הספרים בטיפול (ללא סינון)' : `ימים או יותר מאז שהספר נתפס`}
                                </span>
                            </div>
                            <p className="text-xs text-gray-500">
                                {daysThreshold === 0 
                                    ? 'המערכת תאתר את כל המשתמשים שיש להם ספרי דיקטה בטיפול, ללא קשר למועד התפיסה'
                                    : `המערכת תאתר אוטומטית את כל המשתמשים שיש להם ספרי דיקטה בטיפול שעברו ${daysThreshold} ימים או יותר מאז התפיסה`
                                }
                            </p>
                            
                            {isCheckingRecipients ? (
                                <div className="mt-3">
                                    <span className="text-blue-600 flex items-center gap-2">
                                        <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                                        מאתר נמענים...
                                    </span>
                                </div>
                            ) : foundUsersDetails.length > 0 ? (
                                <div className="mt-3 flex items-center gap-3">
                                    <span className="text-green-600 font-bold flex items-center gap-2 bg-green-50 px-3 py-1 rounded-full border border-green-200">
                                        <span className="material-symbols-outlined text-sm">group</span>
                                        נמצאו {foundUsersDetails.length} משתמשים ({recipients.length} נבחרו)
                                    </span>
                                    
                                    <button 
                                        type="button"
                                        onClick={() => setShowUserSelection(true)}
                                        className="text-primary hover:text-blue-800 underline font-medium text-sm transition-colors"
                                    >
                                        בחירת משתמשים מסויימים
                                    </button>
                                </div>
                            ) : (
                                <div className="mt-3">
                                    <span className="text-orange-500 flex items-center gap-2 bg-orange-50 px-3 py-1 rounded-full border border-orange-200 text-sm">
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
                            <label className="block text-sm font-bold text-gray-700 mb-2">
                                2. בחר ספר (מוצגים רק ספרים בטיפול)
                            </label>
                            <select
                                value={selectedBookPath}
                                onChange={(e) => setSelectedBookPath(e.target.value)}
                                required
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary outline-none bg-white transition-all"
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
                                            <span className="text-blue-600 flex items-center gap-2">
                                                <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                                                מאתר נמענים...
                                            </span>
                                        ) : foundUsersDetails.length > 0 ? (
                                            <div className="flex items-center gap-3">
                                                <span className="text-green-600 font-bold flex items-center gap-2 bg-green-50 px-3 py-1 rounded-full border border-green-200">
                                                    <span className="material-symbols-outlined text-sm">group</span>
                                                    נמצאו {foundUsersDetails.length} משתמשים ({recipients.length} נבחרו)
                                                </span>
                                                
                                                {foundUsersDetails.length > 1 && (
                                                    <button 
                                                        type="button"
                                                        onClick={() => setShowUserSelection(true)}
                                                        className="text-primary hover:text-blue-800 underline font-medium text-sm transition-colors"
                                                    >
                                                        בחירת משתמשים מסויימים
                                                    </button>
                                                )}
                                            </div>
                                        ) : (
                                            <span className="text-red-500 flex items-center gap-2 bg-red-50 px-3 py-1 rounded-full border border-red-200">
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
                    <label className="block text-sm font-bold text-gray-700 mb-2">
                        {bookType === 'regular' ? '3' : '2'}. תוכן ההודעה (משתלב בתוך התבנית הקבועה)
                    </label>
                    <textarea
                        value={bookType === 'dicta' ? dictaMessage : customMessage}
                        onChange={(e) => bookType === 'dicta' ? setDictaMessage(e.target.value) : setCustomMessage(e.target.value)}
                        required
                        rows="5"
                        placeholder="כתוב כאן את המסר שלך למתנדבים..."
                        className="w-full p-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary outline-none resize-y text-base leading-relaxed"
                    ></textarea>
                </div>

                <button
                    type="submit"
                    disabled={status.loading || recipients.length === 0}
                    className={`w-full py-4 px-6 rounded-xl text-white font-bold text-lg transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2 transform active:scale-[0.98]
                        ${status.loading || recipients.length === 0 
                            ? 'bg-gray-400 cursor-not-allowed opacity-70' 
                            : 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800'}`}
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
                    <div className="p-4 bg-green-50 text-green-800 rounded-xl border border-green-200 flex items-center gap-3 animate-in slide-in-from-bottom-2">
                        <span className="material-symbols-outlined text-2xl text-green-600">check_circle</span>
                        <div>
                            <p className="font-bold">השליחה בוצעה!</p>
                            <p className="text-sm">{status.success}</p>
                        </div>
                    </div>
                )}
                
                {status.error && (
                    <div className="p-4 bg-red-50 text-red-800 rounded-xl border border-red-200 flex items-center gap-3 animate-in slide-in-from-bottom-2">
                        <span className="material-symbols-outlined text-2xl text-red-600">error</span>
                        <div>
                            <p className="font-bold">שגיאה בשליחה</p>
                            <p className="text-sm">{status.error}</p>
                        </div>
                    </div>
                )}
            </form>

            {history.length > 0 && (
                <div className="mt-12 border-t pt-8">
                    <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <span className="material-symbols-outlined text-gray-500">history</span>
                        היסטוריית שליחות אחרונות
                    </h2>
                    <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
                        {history.map((item) => (
                            <div key={item.id} className="p-4 border-b border-gray-100 last:border-0 hover:bg-white transition-colors flex items-center justify-between group">
                                <div>
                                    <div className="font-bold text-gray-800 flex items-center gap-2">
                                        {item.bookName}
                                        {item.bookType === 'dicta' && (
                                            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                                                דיקטה
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-sm text-gray-500 flex items-center gap-2 flex-wrap">
                                        <span>נשלח על ידי: {item.adminName}</span>
                                        {item.isPartial && (
                                            <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
                                                נשלח לחלק מהמשתמשים
                                            </span>
                                        )}
                                        {item.bookType === 'dicta' && item.daysThreshold !== undefined && (
                                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                                                {item.daysThreshold === 0 ? 'כל הספרים' : `${item.daysThreshold}+ ימים`}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="text-left">
                                        <div className="text-sm font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-md inline-block">
                                            {formatTimeAgo(item.timestamp)}
                                        </div>
                                        <div className="text-xs text-gray-400 mt-1" dir="ltr">
                                            {new Date(item.timestamp).toLocaleTimeString('he-IL', {hour: '2-digit', minute:'2-digit'})}
                                        </div>
                                    </div>
                                    
                                    <button 
                                        onClick={() => handleDeleteHistory(item.id)}
                                        className="text-gray-300 hover:text-red-500 transition-colors p-2 rounded-full hover:bg-red-50 opacity-0 group-hover:opacity-100"
                                        title="מחק מההיסטוריה"
                                    >
                                        <span className="material-symbols-outlined">delete</span>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {showUserSelection && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col">
                        <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-2xl">
                            <h3 className="font-bold text-lg text-gray-800">בחירת נמענים</h3>
                            <button 
                                type="button"
                                onClick={() => setShowUserSelection(false)} 
                                className="text-gray-500 hover:text-gray-700"
                            >
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        
                        <div className="p-4 overflow-y-auto flex-1">
                            <div className="flex justify-between mb-4 text-sm">
                                <button 
                                    type="button"
                                    onClick={() => setRecipients(foundUsersDetails.map(u => u.email))}
                                    className="text-blue-600 hover:underline"
                                >
                                    בחר הכל
                                </button>
                                <button 
                                    type="button"
                                    onClick={() => setRecipients([])}
                                    className="text-red-600 hover:underline"
                                >
                                    נקה הכל
                                </button>
                            </div>

                            <div className="space-y-2">
                                {foundUsersDetails.map((user) => (
                                    <label 
                                        key={user.email} 
                                        className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all
                                            ${recipients.includes(user.email) ? 'bg-blue-50 border-blue-200' : 'hover:bg-gray-50 border-gray-100'}`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={recipients.includes(user.email)}
                                            onChange={() => toggleRecipient(user.email)}
                                            className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500 mt-0.5"
                                        />
                                        <div className="flex-1">
                                            <div className="font-bold text-gray-800">{user.name}</div>
                                            <div className="text-xs text-gray-500">{user.email}</div>
                                            {bookType === 'dicta' && user.books && user.books.length > 0 && (
                                                <div className="mt-2 space-y-1">
                                                    {user.books.map((book, idx) => (
                                                        <div key={idx} className="text-xs bg-purple-50 text-purple-700 px-2 py-1 rounded">
                                                            {book.title} ({book.daysSinceClaim} ימים)
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div className="p-4 border-t bg-gray-50 rounded-b-2xl flex justify-end">
                            <button
                                type="button"
                                onClick={() => setShowUserSelection(false)}
                                className="bg-primary text-white px-6 py-2 rounded-lg font-bold hover:bg-blue-700 transition-colors"
                            >
                                אישור ({recipients.length})
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}