'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import Header from '@/components/layout/Header'

export default function LibraryNotFound() {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-surface via-background to-surface-variant">
      <Header />
      
      <main className="flex-1 flex items-center justify-center px-4 py-20">
        <div className="max-w-3xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
          >
            {/* 404 Number with glow effect */}
            <motion.div
              initial={{ y: -20 }}
              animate={{ y: 0 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
              className="mb-8 relative"
            >
              <span className="text-9xl md:text-[12rem] font-bold text-primary font-frank relative inline-block">
                404
                <span className="absolute inset-0 text-9xl md:text-[12rem] font-bold text-primary blur-2xl opacity-30 animate-pulse">
                  404
                </span>
              </span>
            </motion.div>

            {/* Animated Icon */}
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.3, type: "spring", stiffness: 150 }}
              className="mb-8"
            >
              <motion.span 
                className="material-symbols-outlined text-8xl text-primary/70"
                animate={{ 
                  y: [0, -10, 0],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
              >
                search_off
              </motion.span>
            </motion.div>

            {/* Title */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="text-4xl md:text-5xl font-bold text-on-surface mb-4 font-frank"
            >
              הדף לא נמצא
            </motion.h1>

            {/* Description */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="text-xl md:text-2xl text-on-surface/70 mb-10 leading-relaxed"
            >
              מצטערים, הדף שחיפשת בספריית אוצריא אינו קיים או הועבר למקום אחר
            </motion.p>

            {/* Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="flex flex-col sm:flex-row gap-4 justify-center mb-12"
            >
              <Link
                href="/library"
                className="group px-8 py-4 bg-primary text-on-primary rounded-xl text-lg font-medium hover:bg-accent transition-all shadow-lg hover:shadow-2xl hover:scale-105 flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined group-hover:rotate-[-10deg] transition-transform">
                  home
                </span>
                חזרה לספרייה
              </Link>
              <Link
                href="/library/books"
                className="group px-8 py-4 glass border-2 border-primary text-primary rounded-xl text-lg font-medium hover:bg-primary hover:text-on-primary transition-all hover:scale-105 flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined group-hover:scale-110 transition-transform">
                  library_books
                </span>
                לרשימת הספרים
              </Link>
            </motion.div>

            {/* Suggestions with improved design */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              className="mt-12 p-8 glass-strong rounded-2xl shadow-xl border border-primary/10"
            >
              <h3 className="text-xl font-bold text-on-surface mb-6 flex items-center justify-center gap-2">
                <span className="material-symbols-outlined text-primary">explore</span>
                אולי תרצה לבקר ב:
              </h3>
              <div className="grid sm:grid-cols-2 gap-4 text-right">
                <Link 
                  href="/library/books" 
                  className="group p-4 bg-surface-variant hover:bg-primary hover:text-on-primary rounded-xl transition-all hover:scale-105 hover:shadow-lg flex items-center gap-3"
                >
                  <span className="material-symbols-outlined text-2xl group-hover:scale-110 transition-transform">
                    library_books
                  </span>
                  <div className="flex-1">
                    <div className="font-bold">רשימת הספרים</div>
                    <div className="text-sm opacity-70">עיין בכל הספרים</div>
                  </div>
                </Link>
                <Link 
                  href="/library/users" 
                  className="group p-4 bg-surface-variant hover:bg-primary hover:text-on-primary rounded-xl transition-all hover:scale-105 hover:shadow-lg flex items-center gap-3"
                >
                  <span className="material-symbols-outlined text-2xl group-hover:scale-110 transition-transform">
                    group
                  </span>
                  <div className="flex-1">
                    <div className="font-bold">משתמשים</div>
                    <div className="text-sm opacity-70">קהילת התורמים</div>
                  </div>
                </Link>
                <Link 
                  href="/library/upload" 
                  className="group p-4 bg-surface-variant hover:bg-primary hover:text-on-primary rounded-xl transition-all hover:scale-105 hover:shadow-lg flex items-center gap-3"
                >
                  <span className="material-symbols-outlined text-2xl group-hover:scale-110 transition-transform">
                    upload
                  </span>
                  <div className="flex-1">
                    <div className="font-bold">שליחת ספרים</div>
                    <div className="text-sm opacity-70">תרום לספרייה</div>
                  </div>
                </Link>
                <Link 
                  href="/" 
                  className="group p-4 bg-surface-variant hover:bg-primary hover:text-on-primary rounded-xl transition-all hover:scale-105 hover:shadow-lg flex items-center gap-3"
                >
                  <span className="material-symbols-outlined text-2xl group-hover:scale-110 transition-transform">
                    home
                  </span>
                  <div className="flex-1">
                    <div className="font-bold">אוצריא - תוכנה</div>
                    <div className="text-sm opacity-70">חזרה לדף הבית</div>
                  </div>
                </Link>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </main>
    </div>
  )
}

