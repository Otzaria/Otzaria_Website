import Link from 'next/link'
export default function ContributeSection() {
  const benefits = [
    {
      icon: 'lock_open',
      title: 'נגישות',
      description: 'הפיכת ספרים נדירים לזמינים לכל אדם בעולם'
    },
    {
      icon: 'shield',
      title: 'שימור',
      description: 'הגנה על טקסטים מפני אובדן או נזק פיזי'
    },
    {
      icon: 'groups',
      title: 'שיתוף',
      description: 'יצירת קהילה של עורכים'
    },
    {
      icon: 'check_circle',
      title: 'דיוק',
      description: 'עריכה משותפת מבטיחה טקסטים מדויקים יותר'
    }
  ]

  return (
    <section id="contribute" className="py-20 px-4 bg-gradient-to-b from-background to-surface/30 relative overflow-hidden">
      {/* אלמנטים דקורטיביים */}
      <div className="absolute top-40 left-10 w-64 h-64 bg-accent/5 rounded-full blur-3xl animate-drift" />

      <div className="container mx-auto max-w-6xl relative z-10">
        {/* Main Heading */}
        <div className="text-center mb-12 animate-enter-up">
          <h2 className="text-4xl md:text-5xl font-bold mb-4 text-on-surface">
            החשיבות של הוספת ספרים חדשים
          </h2>
          <p className="text-xl text-on-surface/70 max-w-3xl mx-auto">
            כל ספר שמתווסף לאוצריא הוא לבנה נוספת במבנה הדיגיטלי של מורשת ישראל
          </p>
        </div>

        {/* Benefits Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {benefits.map((benefit, index) => (
            <div
              key={index}
              style={{ animationDelay: `${index * 0.1}s` }}
              className="glass p-6 rounded-xl hover:shadow-xl transition-all duration-300 hover:-translate-y-2 hover:scale-[1.02] group cursor-pointer animate-enter-up"
            >
              <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mb-4 transition-transform duration-500 group-hover:rotate-[360deg] group-hover:scale-110">
                <span className="material-symbols-outlined text-3xl text-primary">{benefit.icon}</span>
              </div>
              <h3 className="text-xl font-bold mb-2 text-on-surface group-hover:text-primary transition-colors">
                {benefit.title}
              </h3>
              <p className="text-on-surface/70">
                {benefit.description}
              </p>
            </div>
          ))}
        </div>

        {/* CTA Section */}
        <div
          className="glass-strong p-8 md:p-12 rounded-2xl text-center relative overflow-hidden animate-enter-scale"
          style={{ animationDelay: '0.4s' }}
        >
          {/* זוהר ברקע */}
          <div
            className="absolute inset-0 bg-gradient-to-r from-primary/5 via-accent/5 to-primary/5 animate-pan"
            style={{ backgroundSize: '200% 200%' }}
          />

          <div className="relative z-10">
            <h3 className="text-2xl md:text-3xl font-bold mb-4 text-on-surface">
              מוכנים לתרום לפרויקט?
            </h3>
            <p className="text-lg text-on-surface/70 mb-8 max-w-2xl mx-auto">
              ספרים רבים עדיין אינם זמינים בפורמט דיגיטלי נגיש. כל תרומה עוזרת לשמר ולהנגיש את האוצר התורני לדורות הבאים.
            </p>
            <div className="flex flex-col gap-6 justify-center items-center">
              {/* שורה ראשונה - לחצנים קיימים */}
              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center flex-wrap">
                                  <Link
                    href="/library/upload"
                    className="flex items-center justify-center gap-2 px-8 py-4 bg-primary text-on-primary rounded-lg text-lg font-medium hover:bg-accent transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105 hover:-translate-y-0.5 active:scale-95 w-full sm:w-auto"
                  >
                    <span className="material-symbols-outlined">add</span>
                    <span>הוסף ספר חדש</span>
                  </Link>
                                  <Link
                    href="/library/books"
                    className="flex items-center justify-center gap-2 px-8 py-4 bg-surface text-on-surface rounded-lg text-lg font-medium hover:bg-surface-variant transition-all duration-200 border border-outline hover:scale-105 hover:-translate-y-0.5 active:scale-95 w-full sm:w-auto"
                  >
                    <span className="material-symbols-outlined">library_books</span>
                    <span>ערוך בספרייה</span>
                  </Link>
                                  <Link
                    href="/library/dicta-books"
                    className="flex items-center justify-center gap-2 px-8 py-4 bg-surface text-on-surface rounded-lg text-lg font-medium hover:bg-surface-variant transition-all duration-200 border border-outline hover:scale-105 hover:-translate-y-0.5 active:scale-95 w-full sm:w-auto"
                  >
                    <span className="material-symbols-outlined">edit_note</span>
                    <span>ערוך ספרי דיקטה</span>
                  </Link>
              </div>

              {/* שורה שנייה - לחצנים חדשים */}
              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center flex-wrap">
                                  <Link
                    href="/library/info"
                    className="flex items-center justify-center gap-2 px-8 py-4 bg-surface text-on-surface rounded-lg text-lg font-medium hover:bg-surface-variant transition-all duration-200 border border-outline hover:scale-105 hover:-translate-y-0.5 active:scale-95 w-full sm:w-auto"
                  >
                    <span className="material-symbols-outlined">info</span>
                    <span>הוסף מידע על ספרים</span>
                  </Link>
                                  <Link
                    href="/library/acronyms"
                    className="flex items-center justify-center gap-2 px-8 py-4 bg-surface text-on-surface rounded-lg text-lg font-medium hover:bg-surface-variant transition-all duration-200 border border-outline hover:scale-105 hover:-translate-y-0.5 active:scale-95 w-full sm:w-auto"
                  >
                    <span className="material-symbols-outlined">short_text</span>
                    <span>הוסף כינויי ספרים</span>
                  </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
