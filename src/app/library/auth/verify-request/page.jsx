'use client';
import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function VerifyRequestPage() {
    const { data: session, update } = useSession();
    const router = useRouter();

    const [verificationStatus, setVerificationStatus] = useState({ loading: false, sent: false, message: '', error: '' });

    const [isEditingEmail, setIsEditingEmail] = useState(false);
    const [newEmail, setNewEmail] = useState('');
    const [updateStatus, setUpdateStatus] = useState({ loading: false, success: false, message: '', error: '' });

    const theme = {
        pageBg: 'bg-[#fcfbf9]',
        cardBorder: 'border-[#eaddcf]',
        iconBg: 'bg-[#f5efe6]',
        iconColor: 'text-[#a68b6c]',
        primaryBtn: 'bg-[#a68b6c]',
        primaryBtnHover: 'hover:bg-[#8f7659]',
        textHighlight: 'text-[#8f7659]',
        infoBoxBg: 'bg-[#fdfaf5]',
        infoBoxBorder: 'border-[#efe5d5]',
        infoBoxText: 'text-[#6b5d52]'
    };

    useEffect(() => {
        if (session?.user?.isVerified) {
            router.push('/library/dashboard');
        }
    }, [session, router]);

    useEffect(() => {
        if (session && !session.user.isVerified) {
            const interval = setInterval(async () => {
                const newSession = await update();
                if (newSession?.user?.isVerified) {
                    router.push('/library/dashboard');
                }
            }, 5000);
            return () => clearInterval(interval);
        }
    }, [session, update, router]);

    const handleSendVerification = async () => {
        setVerificationStatus({ loading: true, sent: false, message: '', error: '' });
        try {
            const res = await fetch('/api/auth/verify/send', { method: 'POST' });
            const data = await res.json();
            if (res.ok) {
                setVerificationStatus({
                    loading: false,
                    sent: true,
                    message: 'מייל לאימות נשלח בהצלחה! ממתין שתלחץ עליו...\nבאם לא ראית את המייל יש לבדוק את תיבת הספאם.',
                    error: ''
                });
            } else {
                setVerificationStatus({ loading: false, sent: false, message: '', error: data.error || 'שגיאה בשליחה' });
            }
        } catch (error) {
            setVerificationStatus({ loading: false, sent: false, message: '', error: 'שגיאת תקשורת' });
        }
    };

    const handleUpdateEmail = async () => {
        if (!newEmail || !newEmail.includes('@')) {
            setUpdateStatus({ ...updateStatus, error: 'נא להזין כתובת מייל תקינה' });
            return;
        }
        
        setUpdateStatus({ loading: true, success: false, message: '', error: '' });

        try {
            const res = await fetch('/api/auth/update-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: newEmail })
            });
            const data = await res.json();

            if (res.ok) {
                await update(); 

                setUpdateStatus({ loading: false, success: true, message: 'הכתובת עודכנה בהצלחה!', error: '' });
                
                setTimeout(() => {
                    setIsEditingEmail(false);
                    setUpdateStatus({ loading: false, success: false, message: '', error: '' });
                }, 1000);
            } else {
                setUpdateStatus({ loading: false, success: false, message: '', error: data.error || 'שגיאה בעדכון' });
            }
        } catch (error) {
            setUpdateStatus({ loading: false, success: false, message: '', error: 'שגיאת תקשורת' });
        }
    };

    return (
        <div className={`min-h-screen flex items-center justify-center ${theme.pageBg} px-4`} dir="rtl">
            <div className={`max-w-md w-full bg-white rounded-2xl shadow-sm border ${theme.cardBorder} p-8 text-center animate-in fade-in zoom-in-95 duration-300`}>

                <div className={`w-20 h-20 ${theme.iconBg} rounded-full flex items-center justify-center mx-auto mb-6`}>
                    <span className={`material-symbols-outlined text-4xl ${theme.iconColor}`}>mark_email_unread</span>
                </div>

                <h1 className="text-2xl font-bold text-neutral-800 mb-2">נדרש אימות כתובת מייל</h1>

                <div className="mb-6">
                    {!isEditingEmail ? (
                        <>
                            <p className="text-neutral-600">
                                החשבון שלך (<strong dir="ltr" className="font-semibold">{session?.user?.email}</strong>) טרם אומת.
                                <br />
                                כדי להגן על המערכת, עליך לבצע אימות.
                            </p>
                            <button
                                onClick={() => {
                                    setIsEditingEmail(true);
                                    setNewEmail(session?.user?.email || '');
                                    setUpdateStatus({ loading: false, success: false, message: '', error: '' });
                                }}
                                className={`${theme.textHighlight} hover:underline text-sm mt-3 font-medium transition-colors`}
                            >
                                טעות בכתובת? לחץ כאן לשינוי
                            </button>
                        </>
                    ) : (
                        <div className={`mt-4 p-4 ${theme.infoBoxBg} rounded-xl border ${theme.infoBoxBorder} animate-in slide-in-from-top-2`}>
                            <label className="block text-right text-sm font-bold text-neutral-600 mb-2">מייל מעודכן:</label>
                            <input
                                type="email"
                                value={newEmail}
                                onChange={(e) => setNewEmail(e.target.value)}
                                className={`w-full p-2 border border-[#d1c4b8] rounded-lg text-center focus:outline-none focus:ring-1 focus:ring-[#a68b6c] bg-white mb-3`}
                                dir="ltr"
                                disabled={updateStatus.loading}
                            />
                            
                            <div className="flex gap-2">
                                <button
                                    onClick={handleUpdateEmail}
                                    disabled={updateStatus.loading}
                                    className={`flex-1 ${theme.primaryBtn} hover:bg-[#8f7659] text-white text-sm font-bold py-2 rounded-lg transition-colors shadow-sm disabled:opacity-70`}
                                >
                                    {updateStatus.loading ? 'שומר...' : 'שמור שינויים'}
                                </button>
                                <button
                                    onClick={() => setIsEditingEmail(false)}
                                    disabled={updateStatus.loading}
                                    className="flex-1 bg-white border border-[#d1c4b8] text-neutral-600 hover:bg-neutral-50 text-sm py-2 rounded-lg transition-colors"
                                >
                                    ביטול
                                </button>
                            </div>

                            {updateStatus.error && <p className="text-danger-600 text-xs mt-2 font-bold">{updateStatus.error}</p>}
                            {updateStatus.message && <p className="text-success-600 text-xs mt-2 font-bold">{updateStatus.message}</p>}
                        </div>
                    )}
                </div>

                <div className={`${theme.infoBoxBg} border ${theme.infoBoxBorder} rounded-lg p-4 mb-8 text-sm ${theme.infoBoxText} text-right`}>
                    <strong>שים לב:</strong>
                    <ul className="list-disc list-inside mt-1 space-y-1 opacity-90">
                        <li>לחיצה על הכפתור למטה תשלח אליך קישור חד-פעמי למייל.</li>
                        <li>בעת השליחה, אתה מצהיר כי כתובת המייל הזו בבעלותך.</li>
                        <li>לאחר הלחיצה על הקישור במייל, חשבונך יאושר בשרת באופן מיידי.</li>
                    </ul>
                </div>

                <button
                    onClick={handleSendVerification}
                    disabled={verificationStatus.loading || verificationStatus.sent || isEditingEmail}
                    className={`w-full py-4 px-6 rounded-xl font-bold text-lg transition-all shadow-sm flex items-center justify-center gap-2 text-white
                        ${verificationStatus.sent
                            ? 'bg-success-600 cursor-default'
                            : isEditingEmail
                                ? 'bg-neutral-300 cursor-not-allowed shadow-none'
                                : `${theme.primaryBtn} ${theme.primaryBtnHover} hover:shadow-md`}`}
                >
                    {verificationStatus.loading ? (
                        <>
                            <span className="material-symbols-outlined animate-spin">progress_activity</span>
                            שולח...
                        </>
                    ) : verificationStatus.sent ? (
                        <>
                            <span className="material-symbols-outlined">check_circle</span>
                            נשלח!
                        </>
                    ) : (
                        <>
                            <span className="material-symbols-outlined">send</span>
                            שלח לי מייל לאימות
                        </>
                    )}
                </button>

                {verificationStatus.message && (
                    <div className="mt-4 p-4 bg-success-50 text-success-800 rounded-xl text-base border border-success-200 animate-in slide-in-from-top-2">
                        {verificationStatus.message}
                    </div>
                )}

                {verificationStatus.error && (
                    <div className="mt-4 p-4 bg-danger-50 text-danger-800 rounded-xl text-sm border border-danger-200">
                        {verificationStatus.error}
                    </div>
                )}

                <div className="mt-8 border-t border-neutral-100 pt-4">
                    <button
                        onClick={() => signOut({ callbackUrl: '/auth/login' })}
                        className="text-neutral-400 hover:text-neutral-600 text-sm flex items-center justify-center gap-1 mx-auto transition-colors font-medium"
                    >
                        <span className="material-symbols-outlined text-sm">logout</span>
                        התנתק בינתיים
                    </button>
                </div>
            </div>
        </div>
    );
}