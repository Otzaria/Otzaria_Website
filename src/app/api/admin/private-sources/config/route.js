import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectDB from '@/lib/db';
import SystemConfig from '@/models/SystemConfig';
import { isAdmin } from '@/lib/roles';
import { CONFIG_KEYS, loadOptionConfigs } from '@/lib/private-sources';

const ALLOWED_KEYS = Object.values(CONFIG_KEYS);

const CONFIG_LABELS = {
  [CONFIG_KEYS.statuses]: 'סטטוסים למקורות ספרים פרטיים',
  [CONFIG_KEYS.methods]: 'אופני קבלת אישור לספרים פרטיים',
  [CONFIG_KEYS.platforms]: 'פלטפורמות מאושרות לספרים פרטיים',
};

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session?.user?.role)) return null;
  return session;
}

const forbidden = () => NextResponse.json({ error: 'Forbidden' }, { status: 403 });

/** GET — שלוש רשימות האופציות (עם ברירות מחדל כשאין ערך שמור). */
export async function GET() {
  const session = await requireAdmin();
  if (!session) return forbidden();

  try {
    await connectDB();
    const options = await loadOptionConfigs();
    return NextResponse.json({ success: true, options });
  } catch (error) {
    console.error('Error loading private-source configs:', error);
    return NextResponse.json({ error: 'שגיאה בטעינת ההגדרות' }, { status: 500 });
  }
}

/** POST { key, value } — עדכון אחת משלוש הרשימות (מפתחות מותרים בלבד). */
export async function POST(request) {
  const session = await requireAdmin();
  if (!session) return forbidden();

  try {
    const { key, value } = await request.json();

    if (!ALLOWED_KEYS.includes(key)) {
      return NextResponse.json({ error: 'מפתח הגדרות לא מורשה' }, { status: 400 });
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return NextResponse.json({ error: 'ערך הגדרות לא תקין' }, { status: 400 });
    }

    // נרמול: כל ערך חייב להיות { label, color }.
    // Object.create(null) — כדי ש-"__proto__" ייכתב כמאפיין רגיל ולא ידרוס פרוטוטיפ.
    const byKey = Object.create(null);
    for (const [optionKey, config] of Object.entries(value)) {
      const label = typeof config?.label === 'string' ? config.label.trim() : '';
      if (!optionKey || !label) continue;
      byKey[optionKey] = {
        label,
        color: typeof config?.color === 'string' && config.color ? config.color : '#94a3b8',
      };
    }
    const normalized = { ...byKey };

    if (Object.keys(normalized).length === 0) {
      return NextResponse.json({ error: 'חובה להשאיר לפחות ערך אחד ברשימה' }, { status: 400 });
    }

    await connectDB();

    await SystemConfig.findOneAndUpdate(
      { key },
      { value: normalized, label: CONFIG_LABELS[key], lastUpdatedBy: session.user?.id },
      { upsert: true, returnDocument: 'after' }
    );

    return NextResponse.json({ success: true, key, value: normalized });
  } catch (error) {
    console.error('Error saving private-source config:', error);
    return NextResponse.json({ error: 'שגיאה בשמירת ההגדרות' }, { status: 500 });
  }
}
