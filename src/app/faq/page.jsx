'use client'

import { motion } from 'framer-motion'
import { useState } from 'react'
import OtzariaSoftwareHeader from '@/components/layout/OtzariaSoftwareHeader'
import OtzariaSoftwareFooter from '@/components/layout/OtzariaSoftwareFooter'
import { categories, faqs } from '@/lib/faq-data'

export default function FAQPage() {
  const [activeCategory, setActiveCategory] = useState('all')
  const [openQuestion, setOpenQuestion] = useState(null)

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
            <p className="text-on-surface/70 text-lg">
              מענה לשאלות הנפוצות ביותר על תוכנת אוצריא
            </p>
          </div>

          <div className="flex gap-3 flex-wrap justify-center mb-8">
            {categories.map(category => (
              <button
                key={category.id}
                onClick={() => setActiveCategory(category.id)}
                className={`px-6 py-2 rounded-full font-medium transition-all ${
                  activeCategory === category.id
                    ? 'bg-primary text-white shadow-lg'
                    : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200'
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
                className="bg-white rounded-xl overflow-hidden border border-neutral-200 shadow-sm"
              >
                <button
                  onClick={() => setOpenQuestion(openQuestion === faq.id ? null : faq.id)}
                  className="w-full flex items-center justify-between p-6 text-right hover:bg-neutral-50 transition-colors"
                >
                  <span className="text-lg font-bold text-neutral-800">{faq.question}</span>
                  <span className="material-symbols-outlined text-neutral-400 flex-shrink-0 mr-4">
                    {openQuestion === faq.id ? 'expand_less' : 'expand_more'}
                  </span>
                </button>
                {openQuestion === faq.id && (
                  <div className="px-6 pb-6 text-neutral-600 leading-relaxed border-t border-neutral-100 pt-4 whitespace-pre-line">
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
