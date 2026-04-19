import Image from 'next/image'
import Link from 'next/link'
import LinkList from '@/components/data-display/LinkList'
import { FOOTER_QUICK_LINKS, FOOTER_EXTERNAL_LINKS } from '@/lib/navigation-constants'

export default function Footer() {
  return (
    <footer className="bg-gradient-to-b from-surface to-surface-variant py-8 px-4 mt-3">
      <div className="container mx-auto max-w-6xl">
        {/* Main Footer Content */}
        <div className="grid md:grid-cols-4 gap-8 mb-12">
          {/* Logo & Description */}
          <div className="md:col-span-2">
            <div className="flex items-center gap-3 mb-4">
              <Image src="/logo.png" alt="לוגו אוצריא" width={40} height={40} className="rounded-lg" />
              <span className="text-2xl font-bold text-primary font-frank">ספריית אוצריא</span>
            </div>
            <p className="text-on-surface/70 text-lg leading-relaxed mb-6">
              פלטפורמה משותפת לעריכה של ספרי קודש.<br />
              שימור המורשת התורנית והנגשתה לכל.
            </p>
            <div className="flex gap-3">
              <Link 
                href="/library" 
                className="px-6 py-2.5 bg-primary text-on-primary rounded-lg hover:bg-accent transition-all hover:scale-105 shadow-md font-medium"
              >
                לספרייה
              </Link>
              <Link 
                href="/library/upload" 
                className="px-6 py-2.5 border-2 border-primary text-primary rounded-lg hover:bg-primary-container transition-all hover:scale-105 font-medium"
              >
                הוסף ספר
              </Link>
            </div>
          </div>
          
          {/* Quick Links - Internal */}
          <LinkList 
            title="קישורים מהירים" 
            links={FOOTER_QUICK_LINKS} 
          />

          {/* External Links */}
          <LinkList 
            title="קישורים חיצוניים" 
            links={FOOTER_EXTERNAL_LINKS} 
          />
        </div>
        
        <div className="border-t border-outline/20 pt-8 text-center text-on-surface/60 text-sm">
          <p>© {new Date().getFullYear()} ספריית אוצריא. כל הזכויות שמורות.</p>
        </div>
      </div>
    </footer>
  )
}
