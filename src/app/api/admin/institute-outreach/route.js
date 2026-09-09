import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectDB from '@/lib/db';
import InstituteOutreach from '@/models/InstituteOutreach';
import SystemConfig from '@/models/SystemConfig';
import { isAdmin } from '@/lib/roles';
import { requireAccess, badRequest, notFound, serverError } from '@/lib/apiResponse';
import { loadOptionConfigs } from '@/lib/private-sources';
import {
  OUTREACH_STATUSES,
  OUTREACH_STATUSES_CONFIG_KEY,
  DEFAULT_OUTREACH_STATUS,
  outreachKeys,
  findDuplicates,
} from '@/lib/institute-outreach';

function cleanString(value, max = 2000) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

const serialize = (record) => ({ ...record, _id: String(record._id) });

/** רשימת סטטוסי הפניות, עם נפילה לברירות המחדל */
async function loadOutreachStatuses() {
  const doc = await SystemConfig.findOne({ key: OUTREACH_STATUSES_CONFIG_KEY }).lean();
  const value = doc?.value;
  return value && typeof value === 'object' && Object.keys(value).length > 0
    ? value
    : OUTREACH_STATUSES;
}

/** GET — כל הפניות (החדשות בראש) יחד עם רשימות הסטטוסים ואופני הפנייה. */
export async function GET() {
  const session = await getServerSession(authOptions);
  const denied = requireAccess(session, isAdmin);
  if (denied) return denied;

  try {
    await connectDB();
    const [records, statuses, options] = await Promise.all([
      InstituteOutreach.find({}).sort({ outreachDate: -1, createdAt: -1 }).lean(),
      loadOutreachStatuses(),
      loadOptionConfigs(),
    ]);

    return NextResponse.json({
      success: true,
      items: records.map(serialize),
      statuses,
      channels: options.methods,
    });
  } catch (error) {
    console.error('Error loading institute outreach records:', error);
    return serverError('שגיאה בטעינת הפניות');
  }
}

/**
 * POST — יצירה או עדכון של פנייה.
 *
 * לפני השמירה נבדק שוב בשרת אם קיימת פנייה לאותו נמען; אם כן והמשתמש לא אישר
 * במפורש (confirmDuplicate) — הבקשה נדחית עם 409 ורשימת הפניות המתנגשות,
 * כדי שגם שמירה במקביל משני מסכים לא תיצור כפילות בשקט.
 */
export async function POST(request) {
  const session = await getServerSession(authOptions);
  const denied = requireAccess(session, isAdmin);
  if (denied) return denied;

  try {
    const body = await request.json();
    const id = cleanString(body?._id, 100);

    const contact = {
      instituteName: cleanString(body?.instituteName, 300),
      contactName: cleanString(body?.contactName, 300),
      contactPhone: cleanString(body?.contactPhone, 100),
      contactEmail: cleanString(body?.contactEmail, 300),
    };

    if (!contact.instituteName && !contact.contactName) {
      return badRequest('חובה למלא שם מכון או שם איש קשר');
    }

    let outreachDate = null;
    if (body?.outreachDate) {
      const parsed = new Date(body.outreachDate);
      if (!Number.isNaN(parsed.getTime())) outreachDate = parsed;
    }

    await connectDB();

    const keys = outreachKeys(contact);

    // בדיקת כפילות — רק מול רשומות שיש להן מפתח משותף כלשהו
    const orClauses = [
      keys.phoneKey && { phoneKey: keys.phoneKey },
      keys.emailKey && { emailKey: keys.emailKey },
      keys.nameKey && { nameKey: keys.nameKey },
      keys.instituteKey && { instituteKey: keys.instituteKey },
    ].filter(Boolean);

    const candidates = orClauses.length
      ? await InstituteOutreach.find({ $or: orClauses }).lean()
      : [];
    const duplicates = findDuplicates(candidates, contact, id);

    if (duplicates.length > 0 && !body?.confirmDuplicate) {
      return NextResponse.json(
        {
          error: 'קיימת כבר פנייה לאותו נמען',
          duplicate: true,
          duplicates: duplicates.map(serialize),
        },
        { status: 409 }
      );
    }

    const update = {
      ...contact,
      ...keys,
      outreachBy: cleanString(body?.outreachBy, 300),
      outreachByEmail: cleanString(body?.outreachByEmail, 300),
      outreachDate,
      channel: cleanString(body?.channel, 100),
      subject: cleanString(body?.subject, 5000),
      responseText: cleanString(body?.responseText, 20000),
      notes: cleanString(body?.notes, 20000),
      status: cleanString(body?.status, 100) || DEFAULT_OUTREACH_STATUS,
      duplicateAcknowledged: duplicates.length > 0 ? true : Boolean(body?.duplicateAcknowledged),
      duplicateReason: cleanString(body?.duplicateReason, 2000),
      updatedBy: session.user?.email || session.user?.name || '',
    };

    let record;
    if (id) {
      record = await InstituteOutreach.findByIdAndUpdate(id, { $set: update }, { new: true }).lean();
      if (!record) return notFound('הפנייה לא נמצאה');
    } else {
      record = (
        await InstituteOutreach.create({
          ...update,
          createdBy: session.user?.email || session.user?.name || '',
        })
      ).toObject();
    }

    return NextResponse.json({ success: true, record: serialize(record) });
  } catch (error) {
    console.error('Error saving institute outreach record:', error);
    return serverError('שגיאה בשמירת הפנייה');
  }
}

/** DELETE ?id=... — מחיקת פנייה. */
export async function DELETE(request) {
  const session = await getServerSession(authOptions);
  const denied = requireAccess(session, isAdmin);
  if (denied) return denied;

  try {
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return badRequest('חסר מזהה פנייה');

    await connectDB();
    const result = await InstituteOutreach.deleteOne({ _id: id });
    if (result.deletedCount === 0) {
      return notFound('לא נמצאה פנייה למחיקה');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting institute outreach record:', error);
    return serverError('שגיאה במחיקת הפנייה');
  }
}
