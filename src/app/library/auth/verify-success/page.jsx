'use client';
import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function VerifySuccessPage() {
    const { update, status } = useSession();
    const router = useRouter();

    useEffect(() => {
        if (status === 'authenticated') {
            update();
        }
    }, [status, update]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-lg text-center animate-in fade-in zoom-in-95 duration-500">
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                    <span className="material-symbols-outlined text-5xl text-green-600">verified</span>
                </div>
                <h1 className="text-2xl font-bold text-gray-900 mb-2">המייל אומת בהצלחה!</h1>
                <p className="text-gray-600 mb-8">
                    תודה שאימתת את חשבונך. כעת יש לך גישה מלאה למערכת.
                </p>
                <button 
                    onClick={() => {
                        update().then(() => router.push('/library/dashboard'));
                    }}
                    className="block w-full py-3 bg-primary text-white rounded-xl font-bold hover:bg-blue-700 transition-colors shadow-md"
                >
                    כניסה למערכת
                </button>
            </div>
        </div>
    );
}