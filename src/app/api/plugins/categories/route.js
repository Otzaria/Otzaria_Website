import { NextResponse } from 'next/server'
import dbConnect from '@/lib/db'
import PluginCategory from '@/models/PluginCategory'
import { fetchPublicPluginsByIds, orderByIds, formatCategorySummary } from '@/lib/pluginStore'
import { serverError } from '@/lib/apiResponse'

// GET /api/plugins/categories — רשימת הקטגוריות הגלויות עם מונה תוספים ציבוריים
export async function GET() {
  try {
    await dbConnect()

    const categories = await PluginCategory.find({ isVisible: true })
      .sort({ order: 1 })
      .lean()

    const pluginsById = await fetchPublicPluginsByIds(
      categories.flatMap((category) => category.pluginIds || [])
    )

    return NextResponse.json(
      categories.map((category) =>
        formatCategorySummary(category, orderByIds(category.pluginIds || [], pluginsById).length)
      ),
      { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' } }
    )
  } catch (error) {
    console.error('Error fetching plugin categories:', error)
    return serverError('Failed to fetch categories')
  }
}
