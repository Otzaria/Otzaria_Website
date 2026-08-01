import { NextResponse } from 'next/server'
import slugify from 'slugify'
import dbConnect from '@/lib/db'
import PluginCategory from '@/models/PluginCategory'
import '@/models/Plugin' // רישום הסכימה עבור populate
import { requirePluginsAdmin } from '@/lib/adminAuth'
import {
  SLUG_RE,
  PLUGIN_PREVIEW_FIELDS,
  validateCategoryData,
  formatAdminCategory
} from '@/lib/pluginCategoryAdmin'

// GET /api/admin/plugin-categories — כל הקטגוריות (כולל מוסתרות) לתצוגת הניהול
export async function GET() {
  try {
    const auth = await requirePluginsAdmin()
    if (!auth.ok) return auth.response

    await dbConnect()
    const categories = await PluginCategory.find({})
      .sort({ order: 1 })
      .populate('pluginIds', PLUGIN_PREVIEW_FIELDS)
      .lean()

    return NextResponse.json(categories.map(formatAdminCategory))
  } catch (error) {
    console.error('Error fetching admin plugin categories:', error)
    return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 })
  }
}

// POST /api/admin/plugin-categories — יצירת קטגוריה
// body: { name, slug?, description?, icon?, showOnHome?, homeLimit? }
export async function POST(request) {
  try {
    const auth = await requirePluginsAdmin()
    if (!auth.ok) return auth.response

    let body
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const name = (body.name || '').trim()
    // אם לא סופק slug — ניסיון גזירה מהשם (לשמות עבריים slugify מחזיר ריק → נדרש ידני)
    let slug = (body.slug || '').trim().toLowerCase()
    if (!slug) {
      slug = slugify(name, { lower: true, strict: true })
    }
    if (!SLUG_RE.test(slug)) {
      return NextResponse.json(
        { error: 'לא ניתן לגזור slug אוטומטית משם עברי — יש להזין slug באנגלית (למשל study-tools)' },
        { status: 400 }
      )
    }

    const data = {
      name,
      slug,
      description: (body.description || '').trim(),
      icon: (body.icon || '').trim(),
      showOnHome: body.showOnHome === true,
      homeLimit: body.homeLimit !== undefined ? Number(body.homeLimit) : 6
    }
    const errors = validateCategoryData(data)
    if (errors.length) {
      return NextResponse.json({ error: errors.join('; ') }, { status: 400 })
    }

    await dbConnect()

    const duplicate = await PluginCategory.findOne({ $or: [{ name: data.name }, { slug: data.slug }] }).lean()
    if (duplicate) {
      return NextResponse.json(
        { error: duplicate.slug === data.slug ? 'כבר קיימת קטגוריה עם slug זהה' : 'כבר קיימת קטגוריה עם שם זהה' },
        { status: 409 }
      )
    }

    const maxOrder = await PluginCategory.findOne({}).sort({ order: -1 }).select('order').lean()
    const category = await PluginCategory.create({
      ...data,
      order: (maxOrder?.order ?? -1) + 1,
      pluginIds: [],
      createdBy: auth.session.user.id
    })

    return NextResponse.json({ success: true, category: formatAdminCategory(category.toObject()) }, { status: 201 })
  } catch (error) {
    if (error?.code === 11000) {
      return NextResponse.json({ error: 'כבר קיימת קטגוריה עם שם או slug זהים' }, { status: 409 })
    }
    console.error('Error creating plugin category:', error)
    return NextResponse.json({ error: 'Failed to create category' }, { status: 500 })
  }
}
