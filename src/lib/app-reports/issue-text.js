/**
 * טקסט ה-issue הציבורי ב-GitHub. לעולם לא נכנסים לכאן מייל, אבחון או תוכן הלוג.
 */
import { redactEmails } from './redact.js';
import { PUBLIC_SITE_URL } from './config.js';

export const TYPE_LABELS_HE = Object.freeze({ bug: 'תקלה', crash: 'קריסה', performance: 'ביצועים', suggestion: 'הצעה' });
export const TRIGGER_LABELS_HE = Object.freeze({ manual: 'ידני', crash_prompt: 'אחרי קריסה', auto_crash: 'אוטומטי' });

const MAX_TITLE_CHARS = 250;

export const reportPageUrl = (reportId) => `${PUBLIC_SITE_URL}/library/admin/app-reports/${encodeURIComponent(reportId)}`;

export const issueLabels = (report) => ['from-app', report.type, `platform:${report.platform}`];

// טקסט משתמש: בלי מייל, בלי תיוג משתמשי GitHub ובלי סימונים שמתחזים למרקרים שלנו
export function sanitizeUserText(text) {
  return redactEmails(text)
    .replace(/<!--/g, '&lt;!--')
    .replace(/-->/g, '--&gt;')
    .replace(/@(?=[A-Za-z0-9])/g, '@​');
}

const tableCell = (text) => sanitizeUserText(text).replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

function codeBlock(lines) {
  const content = lines.join('\n');
  const longest = Math.max(0, ...(content.match(/`+/g) || []).map((m) => m.length));
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `${fence}\n${content}\n${fence}`;
}

export function isCrashReport(report) {
  return report.type === 'crash' || report.trigger !== 'manual';
}

export function buildIssueTitle(report) {
  const prefix = isCrashReport(report) ? '[קריסה]' : '[דיווח מהתוכנה]';
  const title = `${prefix} ${sanitizeUserText(report.title).replace(/\s+/g, ' ').trim()}`;
  // GitHub דוחה כותרת ארוכה מ-256 תווים, והניקוי מאריך את הטקסט (מייל, @, <!--)
  return [...title].length > MAX_TITLE_CHARS ? `${[...title].slice(0, MAX_TITLE_CHARS - 1).join('')}…` : title;
}

export function buildMarkers(report) {
  const lines = [`<!-- app-report: ${report.reportId} -->`];
  if (report.signatureHash) lines.push(`<!-- app-signature: ${report.signatureHash} -->`);
  lines.push(`<!-- app-labels: ${issueLabels(report).join(', ')} -->`);
  return lines.join('\n');
}

function osText(report) {
  const extra = [report.osVersion, report.arch ? `(${report.arch})` : ''].filter(Boolean).join(' ');
  return extra ? `${report.platform} ${extra}` : report.platform;
}

export const publicImageUrl = (token) => `${PUBLIC_SITE_URL}/api/app-reports/images/${encodeURIComponent(token)}`;

// ה-API של GitHub אינו מקבל קבצים, ולכן התמונות מוטמעות מקישור ציבורי באתר.
function imagesSection(report) {
  const images = (report.fileIds?.images || []).filter((img) => img.publicToken);
  if (!images.length) return null;
  return ['### צילומי מסך', ...images.map((img, i) => `![צילום מסך ${i + 1}](${publicImageUrl(img.publicToken)})`)].join('\n\n');
}

/** @param {{previousIssueNumber?: number|null}} [opts] */
export function buildIssueBody(report, { previousIssueNumber = null } = {}) {
  const parts = [];
  parts.push('### תיאור');
  parts.push(report.description ? sanitizeUserText(report.description) : '_(ללא תיאור)_');
  if (report.stepsToReproduce) {
    parts.push('### שלבים לשחזור');
    parts.push(sanitizeUserText(report.stepsToReproduce));
  }
  parts.push([
    '| פרט | ערך |',
    '|---|---|',
    `| סוג | ${TYPE_LABELS_HE[report.type] || report.type} |`,
    `| גרסה | ${tableCell(report.appVersion)} |`,
    `| מערכת הפעלה | ${tableCell(osText(report))} |`,
    `| מקור | ${TRIGGER_LABELS_HE[report.trigger] || report.trigger} |`,
  ].join('\n'));
  if (report.signature?.exceptionType) {
    parts.push('### חתימה');
    parts.push(codeBlock([report.signature.exceptionType, ...(report.signature.frames || [])].map(sanitizeUserText)));
  }
  const images = imagesSection(report);
  if (images) parts.push(images);
  if (previousIssueNumber) parts.push(`קודם: #${previousIssueNumber}`);
  parts.push(`[הדוח המלא והקבצים (למפתחים)](${reportPageUrl(report.reportId)})`);
  parts.push(buildMarkers(report));
  return parts.join('\n\n');
}

export function buildMergeComment(report) {
  const parts = [];
  parts.push('**דיווח נוסף עם אותה חתימה**');
  parts.push([
    '| פרט | ערך |',
    '|---|---|',
    `| גרסה | ${tableCell(report.appVersion)} |`,
    `| מערכת הפעלה | ${tableCell(osText(report))} |`,
    `| מקור | ${TRIGGER_LABELS_HE[report.trigger] || report.trigger} |`,
  ].join('\n'));
  if (report.description) parts.push(sanitizeUserText(report.description));
  const images = imagesSection(report);
  if (images) parts.push(images);
  parts.push(`[הדוח המלא והקבצים (למפתחים)](${reportPageUrl(report.reportId)})`);
  parts.push(`<!-- app-report: ${report.reportId} -->`);
  return parts.join('\n\n');
}
