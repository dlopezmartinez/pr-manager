/**
 * HTML Sanitization Utility
 *
 * Prevents XSS attacks by sanitizing user-generated content
 * Removes scripts, event handlers, and dangerous attributes
 * while preserving safe HTML structure
 */

import DOMPurify from 'dompurify';

/**
 * Sanitize HTML content to prevent XSS attacks
 * Removes scripts, event handlers, and dangerous attributes
 * while keeping safe HTML tags and structure
 *
 * @param dirty - Potentially unsafe HTML string
 * @returns Sanitized HTML string safe to render
 */
export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    // Allow specific safe tags for rich content
    ALLOWED_TAGS: [
      'p',
      'div',
      'span',
      'br',
      'hr',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'b',
      'i',
      'u',
      'em',
      'strong',
      'a',
      'ul',
      'ol',
      'li',
      'code',
      'pre',
      'img',
      'blockquote',
    ],
    // Allow only specific safe attributes
    ALLOWED_ATTR: [
      'href',   // for <a> tags
      'src',    // for <img> tags
      'alt',    // for <img> alt text
      'title',  // for tooltips
      'class',  // for styling (controlled)
      'id',     // for linking
    ],
    // Block dangerous protocols
    ALLOWED_URI_REGEXP:
      /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|blob):|[^a-z]|[a-z+.-]*(?:[^a-z+.-:]|$))/i,
  });
}

/**
 * Sanitize plain text (remove all HTML)
 * Use when you want to allow text only, no HTML formatting
 *
 * @param dirty - Potentially unsafe string with HTML
 * @returns Plain text with all HTML removed
 */
export function sanitizeText(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [],    // No tags allowed
    ALLOWED_ATTR: [],    // No attributes allowed
  });
}

/**
 * Check if content has been modified by sanitization
 * Useful for warnings if content was changed significantly
 *
 * @param original - Original user input
 * @param sanitized - Sanitized output
 * @returns true if content was modified, false if unchanged
 */
export function wasSanitized(original: string, sanitized: string): boolean {
  return original !== sanitized;
}
