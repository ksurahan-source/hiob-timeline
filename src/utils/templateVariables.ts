import type { Brief } from '../types/Brief.ts';

function interpolateString(
  source: string,
  variables: Record<string, unknown>,
): string {
  let cursor = 0;
  let output = '';
  while (cursor < source.length) {
    const opening = source.indexOf('{{', cursor);
    if (opening < 0) return output + source.slice(cursor);
    const closing = source.indexOf('}}', opening + 2);
    if (closing < 0) return output + source.slice(cursor);
    const name = source.slice(opening + 2, closing).trim();
    const replacement = variables[name];
    output += source.slice(cursor, opening);
    output += replacement != null ? String(replacement) : `{{${name}}}`;
    cursor = closing + 2;
  }
  return output;
}

/**
 * Substitute `{{variable}}` placeholders in all string fields of a Brief template.
 *
 * - Missing variables (no key in `variables`) → placeholder is preserved verbatim.
 * - Null/undefined variable values → placeholder is preserved verbatim.
 * - Nested objects are traversed recursively.
 * - Non-string fields (numbers, booleans, arrays, null) pass through unchanged.
 * - Returns a new Brief; the input `template` is never mutated.
 *
 * @example
 *   interpolateTemplate(
 *     { headline: "{{brand_name}} 신제품", cta_text: "지금 {{product_name}} 보러가기" },
 *     { brand_name: "히오브", product_name: "비타 세럼" }
 *   )
 *   // → { headline: "히오브 신제품", cta_text: "지금 비타 세럼 보러가기" }
 */
export function interpolateTemplate(
  template: Brief,
  variables: Record<string, unknown>,
): Brief {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(template)) {
    if (typeof value === 'string') {
      out[key] = interpolateString(value, variables);
    } else if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      out[key] = interpolateTemplate(value as Brief, variables);
    } else {
      out[key] = value;
    }
  }
  return out as Brief;
}
