'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import OtzariaSoftwareHeader from '@/components/layout/OtzariaSoftwareHeader'
import OtzariaSoftwareFooter from '@/components/layout/OtzariaSoftwareFooter'

export default function PluginsPage() {
  const [iframeHeight, setIframeHeight] = useState(800)
  const [isReady, setIsReady] = useState(false)
  const iframeContainerRef = useRef(null) // רפרנס לצורך גלילה

  const handleMessage = useCallback((event) => {
    // בדיקת מקורות מאושרים
    const allowedOrigins = [
      //'http://127.0.0.1:5500',
      //'http://localhost:5500',
      'https://y-ploni.github.io'
    ];

    const isAllowed = allowedOrigins.some(origin => event.origin.startsWith(origin)) || event.origin === 'null';
    if (!isAllowed) return;

    // 1. עדכון גובה
    if (event.data && event.data.type === 'setHeight') {
      setIframeHeight(event.data.height);
      setIsReady(true);
    }

    // 2. פקודת גלילה למעלה (כשעוברים עמוד בתוך ה-iframe)
    if (event.data && event.data.type === 'scrollToTop') {
      if (iframeContainerRef.current) {
        // גלילה חלקה לראש הקונטיינר של החנות
        const offset = 80; // מרחק ביטחון מה-Header הדביק
        const elementPosition = iframeContainerRef.current.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - offset;

        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth'
        });
      }
    }
  }, []);

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <OtzariaSoftwareHeader />
      
      <main className="flex-1 flex flex-col">
        <div className="bg-surface py-10 border-b border-surface-variant">
          <div className="container mx-auto px-4 text-center">
            <h1 className="text-4xl font-bold text-primary font-frank">חנות התוספים</h1>
            <p className="text-on-surface/70 mt-2">הרחיבו את אוצריא עם תוספות מותאמות אישית</p>
          </div>
        </div>

        {/* הקונטיינר אליו נגלול */}
        <div 
          ref={iframeContainerRef}
          className="w-full bg-white overflow-hidden relative min-h-[600px]"
        >
          {!isReady && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white z-20">
              <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
              <p className="mt-4 text-on-surface/50 font-medium">טוען את חנות התוספים...</p>
            </div>
          )}

          <iframe
            src="https://y-ploni.github.io/otzaria_store/" 
            style={{ 
              width: '100%', 
              height: `${iframeHeight}px`,
              border: 'none',
              display: 'block',
              overflow: 'hidden',
              transition: 'height 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.6s ease-out, transform 0.6s ease-out',
              opacity: isReady ? 1 : 0,
              transform: isReady ? 'translateY(0)' : 'translateY(20px)',
            }}
            scrolling="no"
            title="Otzaria Plugins Store"
          ></iframe>
        </div>
      </main>

      <OtzariaSoftwareFooter />
    </div>
  )
}