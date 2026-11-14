import dbConnect from '@/lib/db'
import { getPublicServiceInfo } from '@/lib/servicePlugins/views'
import { isEnabled, disabledResponse, notFoundResponse, isObjectIdString, errorResponse } from '@/lib/servicePlugins/http'

export const dynamic = 'force-dynamic'

// פרטי ההורדה והזיהוי הציבוריים של תוסף שירות מאושר.
export async function GET(request, { params }) {
  if (!isEnabled()) return disabledResponse()
  const { pluginId } = await params
  if (!isObjectIdString(pluginId)) return notFoundResponse()
  try {
    await dbConnect()
    const info = await getPublicServiceInfo(pluginId)
    if (!info) return notFoundResponse()
    return Response.json(info, { headers: { 'cache-control': 'public, max-age=60' } })
  } catch (err) {
    return errorResponse(err, 'public info')
  }
}
