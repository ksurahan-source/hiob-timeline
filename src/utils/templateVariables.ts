import type { Brief } from '../types/Brief.ts';

const VAR_RE = /\{\{([^}]+)\}\}/g;

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
      out[key] = value.replace(VAR_RE, (_match, rawName: string) => {
        const name = rawName.trim();
        const replacement = variables[name];
        return replacement != null ? String(replacement) : `{{${name}}}`;
      });
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
