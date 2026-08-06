import Image from 'next/image'
import Link from 'next/link'

/**
 * החלק העליון של דף הספרייה.
 *
 * כל האנימציות כאן היו ב-framer-motion, ולכן ה-HTML מהשרת הגיע עם
 * transform:scale(0) על הלוגו ו-opacity:0 על הכותרת, התיאור והכפתורים — עשרה
 * אלמנטים מוסתרים בדף המרכזי של הספרייה, שנראים רק אחרי hydration. עכשיו הכל
 * ב-CSS: התוכן מצויר מיד, והאנימציה רצה מעצמה. הקומפוננטה גם אינה 'use client'
 * יותר.
 */
export default function Hero() {
  return (
    <section className="relative py-20 px-4 overflow-hidden">
      {/* רקע מונפש */}
      <div className="absolute inset-0 bg-gradient-to-bl from-primary-container via-background to-secondary-container opacity-50"></div>

      {/* עיגולים מונפשים ברקע */}
      <div className="absolute top-20 right-10 w-72 h-72 bg-primary/10 rounded-full blur-3xl animate-ambient-pulse" />
      <div
        className="absolute bottom-20 left-10 w-96 h-96 bg-secondary/10 rounded-full blur-3xl animate-ambient-pulse-lg"
        style={{ animationDelay: '1s' }}
      />

      <div className="container mx-auto relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          {/* לוגו עם אנימציה */}
          <div className="mb-8 flex justify-center animate-enter-pop">
            <div className="transition-transform duration-300 hover:scale-110 hover:rotate-[5deg]">
              <Image
                src="/logo.png"
                alt="לוגו אוצריא"
                width={120}
                height={120}
                priority
                className="drop-shadow-2xl"
              />
            </div>
          </div>

          {/* כותרת עם אנימציה */}
          <h1
            className="text-5xl md:text-6xl font-bold mb-6 text-on-background font-frank animate-enter-up"
            style={{ animationDelay: '0.2s' }}
          >
            פרוייקט ספריית אוצריא
          </h1>

          {/* תת-כותרת */}
          <p
            className="text-xl md:text-2xl mb-8 text-on-surface/80 leading-relaxed animate-enter-up"
            style={{ animationDelay: '0.4s' }}
          >
            פלטפורמה משותפת לעריכה של ספרי קודש
          </p>

          {/* תיאור */}
          <p
            className="text-lg mb-12 text-on-surface/70 max-w-2xl mx-auto animate-enter-up"
            style={{ animationDelay: '0.6s' }}
          >
            הצטרפו למהפכה הדיגיטלית של ספרות התורה. ערכו והוסיפו ספרים חדשים
            למאגר החינמי הגדול ביותר של טקסטים תורניים מדויקים ונגישים לכולם.
          </p>

          {/* כפתורים */}
          <div
            className="flex flex-col sm:flex-row gap-4 justify-center flex-wrap animate-enter-up"
            style={{ animationDelay: '0.8s' }}
          >
            <Link
              href="/library/books"
              className="flex items-center justify-center gap-2 px-8 py-4 glass border-2 border-primary text-primary rounded-lg text-lg font-medium hover:bg-primary-container transition-all duration-200 hover:scale-105 hover:-translate-y-0.5 active:scale-95"
            >
              <span className="material-symbols-outlined">library_books</span>
              <span>התחל לערוך</span>
            </Link>
            <Link
              href="/library/dicta-books"
              className="flex items-center justify-center gap-2 px-8 py-4 glass border-2 border-primary text-primary rounded-lg text-lg font-medium hover:bg-primary-container transition-all duration-200 hover:scale-105 hover:-translate-y-0.5 active:scale-95"
            >
              <span className="material-symbols-outlined">edit_note</span>
              <span>ערוך ספרי דיקטה</span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
