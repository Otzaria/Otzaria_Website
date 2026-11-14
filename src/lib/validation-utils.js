/**
 * Common form validation utilities
 */

/**
 * Validates password strength
 * @param {string} password - Password to validate
 * @param {number} minLength - Minimum length (default: 8)
 * @returns {Object} {isValid, error}
 */
export function validatePassword(password, minLength = 8) {
  if (!password) {
    return { isValid: false, error: 'סיסמה נדרשת' }
  }
  
  if (password.length < minLength) {
    return { isValid: false, error: `סיסמה חייבת להכיל לפחות ${minLength} תווים` }
  }
  
  return { isValid: true, error: '' }
}

/**
 * Validates email format
 * @param {string} email - Email to validate
 * @returns {Object} {isValid, error}
 */
export function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  if (!email) {
    return { isValid: false, error: 'דוא"ל נדרש' }
  }

  // codeql[js/polynomial-redos]: bound input length before testing — no real email
  // exceeds this, but it caps the regex engine's worst-case work on adversarial input.
  if (email.length > 254) {
    return { isValid: false, error: 'דוא"ל אינו תקין' }
  }

  if (!emailRegex.test(email)) {
    return { isValid: false, error: 'דוא"ל אינו תקין' }
  }
  
  return { isValid: true, error: '' }
}

// סימוני כיוון ותווים ברוחב אפס נדבקים להעתקה מטקסט RTL, ושרת הדואר דוחה כתובת שמכילה אותם
// \u05DE\u05D7\u05E8\u05D5\u05D6\u05EA \u05D5\u05DC\u05D0 regex: \u05D4-\u \u05E0\u05E4\u05EA\u05E8 \u05DB\u05D0\u05DF \u05DC\u05EA\u05D5\u05D5\u05D9\u05DD \u05E2\u05E6\u05DE\u05DD, \u05DB\u05D9 MongoDB (PCRE) \u05DC\u05D0 \u05DE\u05DB\u05D9\u05E8 \uXXXX
const INVISIBLE_CLASS = '[\u061C\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]'
const INVISIBLE_EMAIL_CHARS = new RegExp(INVISIBLE_CLASS, 'g')

/**
 * Strips invisible bidi/zero-width characters and surrounding whitespace from an email
 * @param {unknown} email - Raw email input
 * @returns {string} Cleaned email ('' for non-strings); case is preserved
 */
export function normalizeEmailInput(email) {
  return typeof email === 'string' ? email.replace(INVISIBLE_EMAIL_CHARS, '').trim() : ''
}

/**
 * Case-insensitive match for a stored email, also when an older record kept it wrapped in invisible marks
 * @param {unknown} email - Email to match
 * @returns {RegExp}
 */
export function storedEmailPattern(email) {
  const escaped = normalizeEmailInput(email).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const marks = `${INVISIBLE_CLASS}*`
  return new RegExp(`^${marks}${escaped}${marks}$`, 'i')
}

/**
 * Validates required field
 * @param {string} value - Value to validate
 * @param {string} fieldName - Field name for error message
 * @returns {Object} {isValid, error}
 */
export function validateRequired(value, fieldName = 'שדה') {
  if (!value || value.trim() === '') {
    return { isValid: false, error: `${fieldName} נדרש` }
  }
  
  return { isValid: true, error: '' }
}

/**
 * Validates two fields match
 * @param {string} value1 - First value
 * @param {string} value2 - Second value
 * @param {string} fieldName - Field name for error message
 * @returns {Object} {isValid, error}
 */
export function validateMatch(value1, value2, fieldName = 'שדות') {
  if (value1 !== value2) {
    return { isValid: false, error: `${fieldName} אינם תואמים` }
  }
  
  return { isValid: true, error: '' }
}

/**
 * Validates fields are different
 * @param {string} value1 - First value
 * @param {string} value2 - Second value
 * @param {string} fieldName - Field name for error message
 * @returns {Object} {isValid, error}
 */
export function validateDifferent(value1, value2, fieldName = 'שדה חדש') {
  if (value1 === value2) {
    return { isValid: false, error: `${fieldName} חייב להיות שונה מהנוכחי` }
  }
  
  return { isValid: true, error: '' }
}

/**
 * Validates file is selected
 * @param {File|null} file - File to validate
 * @returns {Object} {isValid, error}
 */
export function validateFile(file) {
  if (!file) {
    return { isValid: false, error: 'קובץ נדרש' }
  }
  
  return { isValid: true, error: '' }
}

/**
 * Validates file type
 * @param {File} file - File to validate
 * @param {Array<string>} allowedTypes - Allowed MIME types
 * @returns {Object} {isValid, error}
 */
export function validateFileType(file, allowedTypes = []) {
  if (!allowedTypes.includes(file.type)) {
    return { isValid: false, error: `סוג קובץ לא תואם. קבלים: ${allowedTypes.join(', ')}` }
  }
  
  return { isValid: true, error: '' }
}

/**
 * Validates file size
 * @param {File} file - File to validate
 * @param {number} maxSizeInMB - Maximum size in MB
 * @returns {Object} {isValid, error}
 */
export function validateFileSize(file, maxSizeInMB = 50) {
  const maxSizeInBytes = maxSizeInMB * 1024 * 1024
  
  if (file.size > maxSizeInBytes) {
    return { isValid: false, error: `גודל קובץ חייב להיות פחות מ-${maxSizeInMB}MB` }
  }
  
  return { isValid: true, error: '' }
}
