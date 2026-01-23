/**
 * Safe query parameter extraction utilities
 * Handles Express query params which can be string | string[] | ParsedQs | undefined
 */

function toStringValue(value: any): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return String(value[0]);
  if (typeof value === 'object') return undefined; // ParsedQs object
  return String(value);
}

export function getQueryString(value: any): string | undefined {
  return toStringValue(value);
}

export function getQueryBoolean(value: any): boolean | undefined {
  const str = toStringValue(value);
  if (!str) return undefined;
  return str === 'true';
}

export function getQueryNumber(value: any): number | undefined {
  const str = toStringValue(value);
  if (!str) return undefined;
  const num = Number(str);
  return isNaN(num) ? undefined : num;
}

/**
 * Convert Express params/query to string (handles string | string[] | ParsedQs)
 */
export function toStr(value: any): string | undefined {
  return toStringValue(value);
}
