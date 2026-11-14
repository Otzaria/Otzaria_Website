import dbConnect from '@/lib/db'
import Plugin from '@/models/Plugin'
import ServicePluginReview from '@/models/ServicePluginReview'
import { ASSET_KEYS } from '@/lib/servicePlugins/policy'
import { openReviewAssetStream } from '@/lib/servicePlugins/storage'
import { isPubliclyVisible, isPluginFileServable, isNativeFileServable } from '@/lib/servicePlugins/views'
import { isEnabled, disabledResponse, notFoundResponse, isObjectIdString, errorResponse } from '@/lib/servicePlugins/http'

export const dynamic = 'force-dynamic'

// Content-Disposition עם שם Unicode (RFC 5987), כמו בהורדת תוסף רגיל.
function attachment(name) {
  const ascii = name.replace(/[^\x20-\x7E]/g, '_').replace(/["\\\r\n]/g, '_')
  const encoded = encodeURIComponent(name).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`
}

// הורדה מוצמדת להגשה: כל בקשה בודקת שוב אישור/השהיה ושההגשה היא נוכחית/קודמת/היסטורית מותרת.
export async function GET(request, { params }) {
  if (!isEnabled()) return disabledResponse()
  const { pluginId, reviewId, fileKey } = await params
  if (!isObjectIdString(pluginId) || !isObjectIdString(reviewId) || !ASSET_KEYS.includes(fileKey)) return notFoundResponse()
  try {
    await dbConnect()
    const plugin = await Plugin.findById(pluginId).select('slug hasService isApproved isHidden isSuspended serviceState versions').lean()
    if (!isPubliclyVisible(plugin)) return notFoundResponse()
    const servable = fileKey === 'plugin' ? isPluginFileServable(plugin, reviewId) : isNativeFileServable(plugin, reviewId)
    if (!servable) return notFoundResponse()
    const review = await ServicePluginReview.findOne({ _id: reviewId, pluginId: plugin._id, status: 'approved' })
      .select('pluginVersion pluginAsset assets').lean()
    if (!review) return notFoundResponse()
    let name
    let sha256
    if (fileKey === 'plugin') {
      name = `${plugin.slug}-${review.pluginVersion}.otzplugin`
      sha256 = review.pluginAsset?.sha256
    } else {
      const asset = (review.assets || []).find((a) => a.key === fileKey)
      if (!asset) return notFoundResponse()
      name = asset.name
      sha256 = asset.sha256
    }
    const opened = await openReviewAssetStream(review._id, fileKey)
    if (!opened || !sha256) return notFoundResponse()
    return new Response(opened.stream, {
      headers: {
        'content-type': 'application/octet-stream',
        'content-length': String(opened.size),
        'content-disposition': attachment(name),
        'x-content-sha256': sha256,
        'x-content-type-options': 'nosniff',
        'cache-control': 'private, no-store',
      },
    })
  } catch (err) {
    return errorResponse(err, 'download')
  }
}
