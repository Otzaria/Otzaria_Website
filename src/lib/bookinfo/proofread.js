/** Recognize system requests created by older deployments. */
export const PROOFREAD_CHANGE_SET_KEY = 'system:proofread'
export const isProofreadChangeSet = (doc) => doc?.bookKey === PROOFREAD_CHANGE_SET_KEY
