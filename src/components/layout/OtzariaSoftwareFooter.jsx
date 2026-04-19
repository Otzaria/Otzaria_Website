import Link from 'next/link'

export default function OtzariaSoftwareFooter() {
  return (
    <footer className="bg-gray-50 border-t border-gray-200 py-12 px-4 mt-20">
      <div className="container mx-auto max-w-6xl text-center">
        <p className="text-foreground/80 mb-4 font-medium">
          תוכנה זו נוצרה והוקדשה על ידי המפתחים והתורמים של פרויקט אוצריא
        </p>
        <div className="flex justify-center gap-6 text-sm text-foreground/60">
          <span>קוד פתוח תחת רישיון Unlicense</span>
          <a 
            href="https://github.com/sivan22/otzaria" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-primary hover:text-accent transition-colors underline decoration-dotted"
          >
            GitHub
          </a>
          <Link href="/license" className="hover:text-primary transition-colors">
            רשיון
          </Link>
          <Link href="/library" className="hover:text-primary transition-colors">
            הספרייה המקוונת
          </Link>
          <Link href="/privacy" className="hover:text-primary transition-colors">
            מדיניות פרטיות
          </Link>
        </div>
      </div>
    </footer>
  )
}