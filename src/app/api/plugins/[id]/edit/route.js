import { GET as adminGET, PUT as adminPUT } from '@/app/api/admin/plugins/[id]/edit/route'

// עריכת תוסף מדף התוסף עצמו — נתיב הבעלים.
// asOwner: גם מנהל שעורך כאן את התוסף שלו נחשב משתמש רגיל לכל דבר (אותם כללים:
// השדות נגזרים מ-manifest.json, חובה להעלות גרסה וכו'), בדיוק כמו כל מעלה אחר.
// מנהל שאינו הבעלים יקבל 403 עם הפניה לממשק הניהול (ראו getAuthorizedPlugin).
const AS_OWNER = { asOwner: true }

export async function GET(request, context) {
	return adminGET(request, context, AS_OWNER)
}

export async function PUT(request, context) {
	return adminPUT(request, context, AS_OWNER)
}
