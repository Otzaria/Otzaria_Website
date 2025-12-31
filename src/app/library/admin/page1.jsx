import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { redirect } from 'next/navigation'
import AdminClient from './AdminClient'

export default async function AdminPage() {
  const session = await getServerSession(authOptions)
  
  // בדיקה בצד השרת - לפני טעינת הדף
  if (!session) {
    redirect('/library/auth/login')
  }
  
  if (session.user.role !== 'admin') {
    redirect('/library/dashboard')
  }

  return <AdminClient session={session} />
}

