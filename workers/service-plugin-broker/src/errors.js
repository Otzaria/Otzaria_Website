/** כשל שמדווח לשרת (`failure`): transient | quota | operator. */
export class JobFailure extends Error {
  /** `data` — פרטים מובנים ליומן השלבים המקומי בלבד (לא נשלחים לאתר). */
  constructor(failureClass, code, message, { resetAt = null, data = null } = {}) {
    super(message)
    this.name = 'JobFailure'
    this.failureClass = failureClass
    this.code = code
    this.resetAt = resetAt
    this.data = data
  }
}

export const transient = (code, message) => new JobFailure('transient', code, message)
export const operator = (code, message, data = null) => new JobFailure('operator', code, message, { data })
export const quota = (code, message, resetAt) => new JobFailure('quota', code, message, { resetAt })

/** ממצא דטרמיניסטי שמסתיים בהחלטה 0 עם דוח בעברית (ללא Claude). */
export class Rejection extends Error {
  constructor(stage, report, data = {}) {
    super(`rejected at ${stage}`)
    this.name = 'Rejection'
    this.stage = stage
    this.report = report
    this.data = data
  }
}

/** ה-lease אבד או שהמתווך נעצר — מפסיקים בלי לדווח דבר. */
export class JobAborted extends Error {
  constructor(reason) {
    super(`job aborted: ${reason}`)
    this.name = 'JobAborted'
    this.reason = reason
  }
}

export class LeaseLostError extends Error {
  constructor() {
    super('lease_lost')
    this.name = 'LeaseLostError'
  }
}

export class HttpError extends Error {
  constructor(status, code, { retryable = false, retryAfterMs = null } = {}) {
    super(`HTTP ${status}${code ? ` ${code}` : ''}`)
    this.name = 'HttpError'
    this.status = status
    this.code = code
    this.retryable = retryable
    this.retryAfterMs = retryAfterMs
  }
}

export function abortReason(signal) {
  const r = signal?.reason
  if (r instanceof JobAborted) return r
  return new JobAborted(typeof r === 'string' ? r : 'aborted')
}
