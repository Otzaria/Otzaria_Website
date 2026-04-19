'use client'

import { motion } from 'framer-motion'
import { useState } from 'react'
import OtzariaSoftwareHeader from '@/components/layout/OtzariaSoftwareHeader'
import OtzariaSoftwareFooter from '@/components/layout/OtzariaSoftwareFooter'

export default function FAQPage() {
  const [activeCategory, setActiveCategory] = useState('all')
  const [openQuestion, setOpenQuestion] = useState(null)

  const categories = [
    { id: 'all', label: 'הכל' },
    { id: 'general', label: 'כללי' },
    { id: 'installation', label: 'התקנה' },
    { id: 'usage', label: 'שימוש' }
  ]

  const faqs = [
    {
      id: 1,
      category: 'general',
      question: 'מהי תוכנת אוצריא?',
      answer: 'אוצריא היא תוכנה חינמית ופתוחה המספקת גישה למאגר תורני רחב.'
    },
    {
      id: 2,
      category: 'installation',
      question: 'איך מתקינים את התוכנה?',
      answer: 'ניתן להוריד את קובץ ההתקנה מדף הבית ולהריץ אותו במחשב.'
    },
    {
      id: 3,
      category: 'usage',
      question: 'האם אפשר להוסיף ספרים?',
      answer: 'כן, בגרסת הדסקטופ ניתן להוסיף קבצים לתיקיית הספרים. בגרסת ה-Web ניתן להעלות ספרים דרך ממשק ההעלאה.'
    }
  ]

  const filteredFaqs = activeCategory === 'all' 
    ? faqs 
    : faqs.filter(faq => faq.category === activeCategory)

  return (
    <div className="min-h-screen bg-background">
      <OtzariaSoftwareHeader />

      <main className="py-12 px-4">
        <div className="container mx-auto max-w-4xl">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-primary mb-4 font-frank">
              שאלות נפוצות
            </h1>
          </div>

          <div className="flex gap-3 flex-wrap justify-center mb-8">
            {categories.map(category => (
              <button
                key={category.id}
                onClick={() => setActiveCategory(category.id)}
                className={`px-6 py-2 rounded-full font-medium transition-all ${
                  activeCategory === category.id
                    ? 'bg-primary text-white shadow-lg'
                    : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                {category.label}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            {filteredFaqs.map((faq) => (
              <motion.div
                key={faq.id}
                layout
                className="bg-white rounded-xl overflow-hidden border border-gray-200 shadow-sm"
              >
                <button
                  onClick={() => setOpenQuestion(openQuestion === faq.id ? null : faq.id)}
                  className="w-full flex items-center justify-between p-6 text-right hover:bg-gray-50 transition-colors"
                >
                  <span className="text-lg font-bold text-gray-800">{faq.question}</span>
                  <span className="material-symbols-outlined text-gray-400">
                    {openQuestion === faq.id ? 'expand_less' : 'expand_more'}
                  </span>
                </button>
                {openQuestion === faq.id && (
                  <div className="px-6 pb-6 text-gray-600 leading-relaxed border-t border-gray-100 pt-4">
                    {faq.answer}
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </main>

      <OtzariaSoftwareFooter />
    </div>
  )
}
