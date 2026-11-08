// השם וההסבר של "הצעות עריכה" — משותפים למסך ולשלד הטעינה שלו (אותו טקסט, אותה שבירת שורות).
// של "התנגשויות בסנכרון" — ב-lib/adminSuggestions/conflictTerms.js.

import { adminScreenTitle } from '@/lib/adminNav'

// השם — מהסרגל (lib/adminNav), אותו שם בכל מקום
export const SUGGESTIONS_TITLE = adminScreenTitle('moderation')
export const SUGGESTIONS_DESCRIPTION = 'שינויים בטקסט של ספרים שמשתמשים הציעו. מה שתאשר נכנס לספר.'

/** תוויות הבוררים בסרגל הסינון (גם בשלד) */
export const FILTER_LABELS = ['ספר', 'מציע', 'סוג']
