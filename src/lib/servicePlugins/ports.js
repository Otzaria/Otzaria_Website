// הבעלות על פורט נשמרת ב-Plugin, תחת אינדקס ייחודי: אין חלון בין בדיקה לכתיבה.
import Plugin from '../../models/Plugin.js'
import ServicePluginReview from '../../models/ServicePluginReview.js'

export const portKeys = (assets) => [...new Set((assets || []).map(({ os, port }) => `${os}:${port}`))].sort()
export const portTaken = () => ({ ok: false, status: 409, code: 'port_taken', message: 'אחד מפורטי הזיהוי כבר שייך לתוסף שירות אחר. יש לבחור פורט אחר' })
export const isPortDuplicate = (err) => err?.code === 11000 &&
  (err.keyPattern?.['serviceState.reservedPortKeys'] || err.message?.includes('service_port_owner'))

/** תאימות למסמכים שנוצרו לפני הוספת האינדקס, כולל הגרסה הקודמת. */
export async function findPortConflict(pluginId, assets) {
  const keys = portKeys(assets)
  if (!keys.length) return null
  if (await Plugin.exists({ _id: { $ne: pluginId }, 'serviceState.reservedPortKeys': { $in: keys } })) return portTaken()
  const others = await Plugin.find({ _id: { $ne: pluginId }, hasService: true,
    'serviceState.reservedPortKeys.0': { $exists: false },
    $or: [{ 'serviceState.ports.0': { $exists: true } }, { 'serviceState.previousServiceReview': { $ne: null } }],
  })
    .select('serviceState.ports serviceState.previousServiceReview').lean()
  if (others.some((p) => portKeys(p.serviceState?.ports).some((k) => keys.includes(k)))) return portTaken()
  const previous = others.map((p) => p.serviceState?.previousServiceReview).filter(Boolean)
  const pairs = (assets || []).map(({ os, port }) => ({ assets: { $elemMatch: { os, port } } }))
  const pending = await ServicePluginReview.exists({
    pluginId: { $ne: pluginId },
    $and: [{ $or: [{ activeKey: { $type: 'string' } }, { _id: { $in: previous } }] }, { $or: pairs }],
  })
  return pending ? portTaken() : null
}

/**
 * משחרר רק פורטים שאינם שייכים לשירות הנוכחי, לקודם או להגשה הפעילה.
 * CAS על המצביעים והרשימה מונע דריסה של שמירה מקבילה. כשל משאיר שריון עודף עד הניקוי הבא.
 */
export async function syncPortReservations(pluginId) {
  const plugin = await Plugin.findById(pluginId).select('serviceState').lean()
  if (!plugin?.serviceState) return
  const s = plugin.serviceState || {}
  const ids = [s.currentServiceReview, s.previousServiceReview, s.activeReviewId].filter(Boolean)
  const reviews = await ServicePluginReview.find({ _id: { $in: ids } }).select('assets').lean()
  // יצירת טיוטה נועלת לפני הוספת ההגשה: אין לשחרר את הפורטים שלה בזמן הביניים.
  if (ids.some((id) => !reviews.some((r) => String(r._id) === String(id)))) return
  const keys = portKeys([...(s.ports || []), ...reviews.flatMap((r) => r.assets || [])])
  await Plugin.updateOne({
    _id: pluginId,
    'serviceState.activeReviewId': s.activeReviewId ?? null,
    'serviceState.currentServiceReview': s.currentServiceReview ?? null,
    'serviceState.previousServiceReview': s.previousServiceReview ?? null,
    'serviceState.reservedPortKeys': s.reservedPortKeys ?? null,
  }, { $set: { 'serviceState.reservedPortKeys': keys } })
}
