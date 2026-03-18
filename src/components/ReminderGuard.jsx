'use client';
import { useSession } from 'next-auth/react';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';

export default function ReminderGuard({ children }) {
    const { data: session, status } = useSession();
    const router = useRouter();
    const pathname = usePathname();

    const exemptPaths = [
        '/library/auth/login',
        '/library/auth/register',
        '/library/auth/approve-terms',
        '/library/auth/verify-request',
        '/library/auth/verify-success'
    ];

    const isExemptPath = exemptPaths.includes(pathname) || pathname?.startsWith('/api');

    useEffect(() => {
        if (status === 'loading') return;

        if (isExemptPath || status !== 'authenticated') {
            return;
        }

        if (!session?.user?.isVerified) {
            router.replace('/library/auth/verify-request');
            return;
        }

        if (!session?.user?.acceptReminders) {
            router.replace('/library/auth/approve-terms');
        }

    }, [status, session, router, pathname, isExemptPath]);

    if (status === 'authenticated') {
        if (isExemptPath) {
            return children;
        }

        const isVerified = session?.user?.isVerified;
        const acceptReminders = session?.user?.acceptReminders;

        if (!isVerified) {
            return <LoadingScreen />;
        }

        if (!acceptReminders) {
            return <LoadingScreen />;
        }
    }

    return children;
}

function LoadingScreen() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
        </div>
    );
}