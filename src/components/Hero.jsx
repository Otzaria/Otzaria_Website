'use client'
import Image from 'next/image'
import Link from 'next/link'
import { motion } from 'framer-motion'

export default function Hero() {
  return (
    <section className="relative py-20 px-4 overflow-hidden">
      {/* רקע מונפש */}
      <div className="absolute inset-0 bg-gradient-to-bl from-primary-container via-background to-secondary-container opacity-50"></div>
      
      {/* עיגולים מונפשים ברקע */}
      <motion.div
        className="absolute top-20 right-10 w-72 h-72 bg-primary/10 rounded-full blur-3xl"
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.3, 0.5, 0.3],
        }}
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: "easeInOut"
        }}
      />
      <motion.div
        className="absolute bottom-20 left-10 w-96 h-96 bg-secondary/10 rounded-full blur-3xl"
        animate={{
          scale: [1, 1.3, 1],
          opacity: [0.2, 0.4, 0.2],
        }}
        transition={{
          duration: 10,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 1
        }}
      />
      
      <div className="container mx-auto relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          {/* לוגו עם אנימציה */}
          <motion.div 
            className="mb-8 flex justify-center"
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ 
              type: "spring",
              stiffness: 260,
              damping: 20,
              duration: 1
            }}
          >
            <motion.div
              whileHover={{ scale: 1.1, rotate: 5 }}
              transition={{ type: "spring", stiffness: 300 }}
            >
              <Image 
                src="/logo.png" 
                alt="לוגו אוצריא" 
                width={120} 
                height={120}
                className="drop-shadow-2xl"
              />
            </motion.div>
          </motion.div>
          
          {/* כותרת עם אנימציה */}
          <motion.h1 
            className="text-5xl md:text-6xl font-bold mb-6 text-on-background font-frank"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.8 }}
          >
            ספריית אוצריא
          </motion.h1>
          
          {/* תת-כותרת */}
          <motion.p 
            className="text-xl md:text-2xl mb-8 text-on-surface/80 leading-relaxed"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.8 }}
          >
            פלטפורמה משותפת לעריכה של ספרי קודש
          </motion.p>
          
          {/* תיאור */}
          <motion.p 
            className="text-lg mb-12 text-on-surface/70 max-w-2xl mx-auto"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.8 }}
          >
            הצטרפו למהפכה הדיגיטלית של ספרות התורה. ערכו והוסיפו ספרים חדשים 
            למאגר הגדול ביותר של טקסטים תורניים מדויקים ונגישים לכולם.
          </motion.p>
          
          {/* כפתורים */}
          <motion.div 
            className="flex flex-col sm:flex-row gap-4 justify-center flex-wrap"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, duration: 0.8 }}
          >
            <motion.div
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.95 }}
            >
              <Link href="/library/about" className="flex items-center justify-center gap-2 px-8 py-4 bg-primary text-on-primary rounded-lg text-lg font-medium hover:bg-accent transition-colors shadow-lg hover:shadow-xl">
                <span className="material-symbols-outlined">info</span>
                <span>אודות הספרייה</span>
              </Link>
            </motion.div>
            <motion.div
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.95 }}
            >
              <Link href="/library/books" className="flex items-center justify-center gap-2 px-8 py-4 glass border-2 border-primary text-primary rounded-lg text-lg font-medium hover:bg-primary-container transition-colors">
                <span className="material-symbols-outlined">library_books</span>
                <span>התחל לערוך</span>
              </Link>
            </motion.div>
            <motion.div
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.95 }}
            >
              <Link href="/library/dicta-books" className="flex items-center justify-center gap-2 px-8 py-4 glass border-2 border-primary text-primary rounded-lg text-lg font-medium hover:bg-primary-container transition-colors">
                <span className="material-symbols-outlined">edit_note</span>
                <span>ערוך ספרי דיקטה</span>
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
