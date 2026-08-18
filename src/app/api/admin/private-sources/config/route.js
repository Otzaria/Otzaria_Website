import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectDB from '@/lib/db';
import SystemConfig from '@/models/SystemConfig';
import { isAdmin } from '@/lib/roles';
import { CONFIG_KEYS, MANUAL_SETS_KEY, loadManualSets, loadOptionConfigs } from '@/lib/private-sources';
import { validateManualSets } from '@/lib/private-sources-sets';

const ALLOWED_KEYS = [...Object.values(CONFIG_KEYS), MANUAL_SETS_KEY];

const CONFIG_LABELS = {
  [CONFIG_KEYS.statuses]: 'סטטוסים למקורות ספרים פרטיים',
  [CONFIG_KEYS.methods]: 'אופני קבלת אישור לספרים פרטיים',
  [CONFIG_KEYS.platforms]: 'פלטפורמות מאושרות לספרים פרטיים',
  [MANUAL_SETS_KEY]: 'סטים ידניים של ספרים פרטיים',
};

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session?.user?.role)) return null;
  return session;
}

const forbidden = () => NextResponse.json({ error: 'Forbidden' }, { status: 403 });

/** GET — שלוש רשימות האופציות (עם ברירות מחדל כשאין ערך שמור) + הסטים הידניים. */
export async function GET() {
  const session = await requireAdmin();
  if (!session) return forbidden();

  try {
    await connectDB();
    const [options, manualSets] = await Promise.all([loadOptionConfigs(), loadManualSets()]);
    return NextResponse.json({ success: true, options, manualSets });
  } catch (error) {
    console.error('Error loading private-source configs:', error);
    return NextResponse.json({ error: 'שגיאה בטעינת ההגדרות' }, { status: 500 });
  }
}

/** שומר ערך מנורמל ב-SystemConfig ומחזיר תשובת JSON */
async function saveConfig(key, value, session) {
  await connectDB();

  await SystemConfig.findOneAndUpdate(
    { key },
    { value, label: CONFIG_LABELS[key], lastUpdatedBy: session.user?.id },
    { upsert: true, returnDocument: 'after' }
  );

  return NextResponse.json({ success: true, key, value });
}

/** POST { key, value } — עדכון רשימת אופציות או הסטים הידניים (מפתחות מותרים בלבד). */
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

    // הסטים הידניים אינם רשימת { label, color } אלא { label, bookPaths } —
    // ולכן ולידציה נפרדת, ומותר שהאובייקט יהיה ריק (אין סטים כלל).
    if (key === MANUAL_SETS_KEY) {
      const { value: manualSets, error } = validateManualSets(value);
      if (error) return NextResponse.json({ error }, { status: 400 });
      return saveConfig(key, manualSets, session);
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

    return saveConfig(key, normalized, session);
  } catch (error) {
    console.error('Error saving private-source config:', error);
    return NextResponse.json({ error: 'שגיאה בשמירת ההגדרות' }, { status: 500 });
  }
}
