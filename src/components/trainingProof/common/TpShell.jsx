import Header from '@/components/layout/Header'

// המעטפת של כל מסכי "הגהה לאימון המודלים": הכותרת של האתר ותוכן ממורכז
export default function TpShell({ children, wide = false }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main id="main-content" className="w-full flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <div className={`mx-auto flex flex-col gap-4 ${wide ? 'max-w-6xl' : 'max-w-5xl'}`}>{children}</div>
      </main>
    </div>
  )
}
