'use client';
import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

export default function ResetPasswordPage() {
  const router = useRouter();
  const params = useParams();
  const token = params.token;
  
  // שדות לטופס
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // ניהול סטטוס הטוקן והטעינה
  const [isCheckingToken, setIsCheckingToken] = useState(true);
  const [isValidToken, setIsValidToken] = useState(false);
  const [tokenError, setTokenError] = useState('');

  // סטטוס שליחת הטופס
  const [status, setStatus] = useState({ loading: false, error: '', success: '' });

  // בדיקת תקינות הטוקן בטעינת הדף
  useEffect(() => {
      if (!token) {
          setIsCheckingToken(false);
          setIsValidToken(false);
          setTokenError('לא נמצא קישור לאיפוס סיסמה');
          return;
      }

      const verifyToken = async () => {
          try {
              // שולחים את הטוקן בבקשה לשרת
              const res = await fetch(`/api/auth/reset-password?token=${token}`);
              const data = await res.json();

              if (res.ok && data.valid) {
                  setIsValidToken(true);
              } else {
                  setIsValidToken(false);
                  setTokenError(data.message || 'הקישור אינו תקין');
              }
          } catch (error) {
              setIsValidToken(false);
              setTokenError('שגיאת תקשורת בבדיקת הקישור');
          } finally {
              setIsCheckingToken(false);
          }
      };

      verifyToken();
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // השוואת שני שדות סיסמה של המשתמש עצמו (ולידציית UI) — אין כאן סוד, לא רלוונטי timing attack
    // eslint-disable-next-line security/detect-possible-timing-attacks
    if (password !== confirmPassword) {
        setStatus({ loading: false, error: 'הסיסמאות אינן תואמות', success: '' });
        return;
    }

    setStatus({ loading: true, error: '', success: '' });

    try {
        const res = await fetch('/api/auth/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, password }),
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || 'שגיאה בשרת');
        }

        setStatus({ loading: false, error: '', success: 'הסיסמה שונתה בהצלחה! מעביר להתחברות...' });
        
        setTimeout(() => {
            router.push('/auth/login');
        }, 2000);

    } catch (error) {
        setStatus({ loading: false, error: error.message, success: '' });
    }
  };

  if (isCheckingToken) {
      return (
          <div className="min-h-screen flex items-center justify-center bg-neutral-50">
              <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
          </div>
      );
  }

  if (!isValidToken) {
      return (
          <div className="min-h-screen flex items-center justify-center bg-neutral-50 px-4">
              <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-lg text-center">
                  <div className="w-16 h-16 bg-danger-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <span className="material-symbols-outlined text-3xl text-danger-600">link_off</span>
                  </div>
                  <h2 className="text-xl font-bold text-neutral-900 mb-2">קישור לא תקין</h2>
                  <p className="text-neutral-600 mb-6">
                      {tokenError || 'הקישור לאיפוס הסיסמה פג תוקף או שאינו תקין.'}
                      <br/>
                      אנא נסה לבקש איפוס סיסמה מחדש.
                  </p>
                  <button
                      onClick={() => router.push('/auth/login')}
                      className="text-primary font-bold hover:underline"
                  >
                      חזור לדף הכניסה
                  </button>
              </div>
          </div>
      );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 px-4">
        <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-lg">
            <h2 className="text-2xl font-bold mb-6 text-center text-neutral-800">איפוס סיסמה</h2>
            
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">סיסמה חדשה</label>
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={8}
                        className="w-full p-3 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-primary outline-none"
                        placeholder="לפחות 8 תווים"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">אימות סיסמה חדשה</label>
                    <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        className="w-full p-3 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-primary outline-none"
                        placeholder="הקלד שוב את הסיסמה"
                    />
                </div>

                {status.error && (
                    <div className="p-3 bg-danger-50 text-danger-700 rounded-lg text-sm">
                        {status.error}
                    </div>
                )}
                
                {status.success && (
                    <div className="p-3 bg-success-50 text-success-700 rounded-lg text-sm">
                        {status.success}
                    </div>
                )}

                <button
                    type="submit"
                    disabled={status.loading}
                    className={`w-full py-3 rounded-xl text-white font-bold transition-all
                        ${status.loading ? 'bg-neutral-400' : 'bg-primary hover:bg-info-700'}`}
                >
                    {status.loading ? 'מעדכן...' : 'שמור סיסמה חדשה'}
                </button>
            </form>
        </div>
    </div>
  );
}