import { GET as serveUpload } from '@/app/uploads/[...path]/route'

// יעד ה-rewrite של סריקות ישנות, לפני ש-Next מגיש קובץ מ-public.
export async function GET(request, { params }) {
  const { path } = await params
  return serveUpload(request, { params: Promise.resolve({ path: ['books', ...path] }) })
}
