// דף תוסף בודד בחנות — Server Component. פרטי התוסף נשלפים בזמן הרינדור
// (אותה לוגיקה בדיוק כמו GET /api/plugins/[id], דרך src/lib/pluginDetail.js)
// ומועברים לחלק הלקוח, כך שהתוכן נמצא ב-HTML הראשוני. קודם הדף כולו היה
// 'use client' ושלף את התוסף ב-fetch אחרי ה-hydration: ספינר, ואז קפיצת
// פריסה גדולה (CLS 0.84) כשהתוכן דחף את הפוטר למטה.
//
// הדף דינמי (בכל בקשה, בלי מטמון) — בדיוק כמו ה-API שהחליף: מונה ההורדות
// והדירוג מוצגים טריים, כפי שהיו.
//
// תוסף מושהה נגיש רק למעלה ולמנהלי תוספים (בדיקת session). כדי לא לערב
// session ברינדור-השרת, במקרה כזה (וגם כשהמזהה/הגרסה לא נמצאו או בשגיאה)
// initialPlugin=null, וחלק הלקוח טוען מה-API כמו קודם — כולל ההפניה
// ל-/plugins כשהתוסף אינו נגיש.
import dbConnect from '@/lib/db'
import { findPluginForDetail, buildPluginDetailPayload } from '@/lib/pluginDetail'
import { parsePluginRef } from '@/lib/pluginRef'
import { isPluginSuspended } from '@/lib/pluginVisibility'
import PluginDetailClient, { type Plugin } from './PluginDetailClient'

export const dynamic = 'force-dynamic'

async function loadInitialPlugin(rawId: string): Promise<Plugin | null> {
  try {
    const { id, version } = parsePluginRef(rawId)
    if (!id || version === false) return null

    await dbConnect()
    const plugin = await findPluginForDetail(id)
    if (!plugin || isPluginSuspended(plugin)) return null

    const payload = await buildPluginDetailPayload(plugin, id, version)
    // סבב JSON — אותו מבנה בדיוק שהלקוח קיבל מה-API (תאריכים כמחרוזות וכו')
    return payload ? (JSON.parse(JSON.stringify(payload)) as Plugin) : null
  } catch (error) {
    console.error('Error loading plugin page:', error)
    return null
  }
}

function decodeParam(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export default async function PluginPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const initialPlugin = await loadInitialPlugin(decodeParam(id))
  return <PluginDetailClient key={id} initialPlugin={initialPlugin} />
}
