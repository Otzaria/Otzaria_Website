import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-surface via-background to-surface-variant">
      <main className="flex-1 flex items-center justify-center px-4 py-20">
        <div className="max-w-3xl mx-auto text-center">
          <div className="animate-enter-scale">
            {/* 404 Number with glow effect */}
            <div className="mb-8 relative animate-enter-down" style={{ animationDelay: '0.2s' }}>
              <span className="text-9xl md:text-[12rem] font-bold text-primary font-frank relative inline-block">
                404
                <span className="absolute inset-0 text-9xl md:text-[12rem] font-bold text-primary blur-2xl opacity-30 animate-pulse">
                  404
                </span>
              </span>
            </div>

            {/* Animated Icon */}
            <div className="mb-8 animate-enter-pop" style={{ animationDelay: '0.3s' }}>
              <span
                className="material-symbols-outlined text-8xl text-primary/70 animate-float"
              >
                search_off
              </span>
            </div>

            {/* Title */}
            <h1 className="text-4xl md:text-5xl font-bold text-on-surface mb-4 font-frank animate-enter-up" style={{ animationDelay: '0.4s' }}>
              הדף לא נמצא
            </h1>

            {/* Description */}
            <p className="text-xl md:text-2xl text-on-surface/70 mb-10 leading-relaxed animate-enter-up" style={{ animationDelay: '0.5s' }}>
              מצטערים, הדף שחיפשת אינו קיים או הועבר למקום אחר
            </p>

            {/* Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12 animate-enter-up" style={{ animationDelay: '0.6s' }}>
              <Link
                href="/"
                className="group px-8 py-4 bg-primary text-on-primary rounded-xl text-lg font-medium hover:bg-accent transition-all shadow-lg hover:shadow-2xl hover:scale-105 flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined group-hover:rotate-[-10deg] transition-transform">
                  home
                </span>
                חזרה לדף הבית
              </Link>
              <Link
                href="/library"
                className="group px-8 py-4 glass border-2 border-primary text-primary rounded-xl text-lg font-medium hover:bg-primary hover:text-on-primary transition-all hover:scale-105 flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined group-hover:scale-110 transition-transform">
                  library_books
                </span>
                לספרייה
              </Link>
            </div>

            {/* Suggestions with improved design */}
            <div className="mt-12 p-8 glass-strong rounded-2xl shadow-xl border border-primary/10 animate-enter-fade" style={{ animationDelay: '0.8s' }}>
              <h3 className="text-xl font-bold text-on-surface mb-6 flex items-center justify-center gap-2">
                <span className="material-symbols-outlined text-primary">explore</span>
                אולי תרצה לבקר ב:
              </h3>
              <div className="grid sm:grid-cols-2 gap-4 text-right">
                <Link
                  href="/"
                  className="group p-4 bg-surface-variant hover:bg-primary hover:text-on-primary rounded-xl transition-all hover:scale-105 hover:shadow-lg flex items-center gap-3"
                >
                  <span className="material-symbols-outlined text-2xl group-hover:scale-110 transition-transform">
                    home
                  </span>
                  <div className="flex-1">
                    <div className="font-bold">דף הבית</div>
                    <div className="text-sm opacity-70">אוצריא - תוכנה</div>
                  </div>
                </Link>
                <Link
                  href="/library"
                  className="group p-4 bg-surface-variant hover:bg-primary hover:text-on-primary rounded-xl transition-all hover:scale-105 hover:shadow-lg flex items-center gap-3"
                >
                  <span className="material-symbols-outlined text-2xl group-hover:scale-110 transition-transform">
                    library_books
                  </span>
                  <div className="flex-1">
                    <div className="font-bold">הספרייה</div>
                    <div className="text-sm opacity-70">ספריית אוצריא</div>
                  </div>
                </Link>
                <Link
                  href="/library/books"
                  className="group p-4 bg-surface-variant hover:bg-primary hover:text-on-primary rounded-xl transition-all hover:scale-105 hover:shadow-lg flex items-center gap-3"
                >
                  <span className="material-symbols-outlined text-2xl group-hover:scale-110 transition-transform">
                    menu_book
                  </span>
                  <div className="flex-1">
                    <div className="font-bold">רשימת הספרים</div>
                    <div className="text-sm opacity-70">עיין בכל הספרים</div>
                  </div>
                </Link>
                <Link
                  href="/docs"
                  className="group p-4 bg-surface-variant hover:bg-primary hover:text-on-primary rounded-xl transition-all hover:scale-105 hover:shadow-lg flex items-center gap-3"
                >
                  <span className="material-symbols-outlined text-2xl group-hover:scale-110 transition-transform">
                    description
                  </span>
                  <div className="flex-1">
                    <div className="font-bold">תיעוד</div>
                    <div className="text-sm opacity-70">מדריכים ועזרה</div>
                  </div>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
