/**
 * Unit tests for interpolateTemplate.
 * Run: node --experimental-strip-types packages/timeline/src/utils/__tests__/templateVariables.test.ts
 */
import { interpolateTemplate } from '../templateVariables.ts';
import type { Brief } from '../../types/Brief.ts';

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean): void {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${label}`);
    failed++;
  }
}

function eq(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ── 1. Basic substitution ──────────────────────────────────────────────────
console.log('\n1. Basic substitution');
{
  const tmpl: Brief = {
    headline: '{{brand_name}} 신제품',
    cta_text: '지금 {{product_name}} 보러가기',
  };
  const result = interpolateTemplate(tmpl, {
    brand_name: '히오브',
    product_name: '비타 세럼',
  });
  assert('headline replaced', result.headline === '히오브 신제품');
  assert('cta_text replaced', result.cta_text === '지금 비타 세럼 보러가기');
  assert('input not mutated', tmpl.headline === '{{brand_name}} 신제품');
}

// ── 2. Missing variables preserved verbatim ────────────────────────────────
console.log('\n2. Missing variables');
{
  const tmpl: Brief = {
    headline: '{{missing_var}} 제품',
    product_name: '{{product_name}} 추천',
  };
  const result = interpolateTemplate(tmpl, { product_name: '리얼 세럼' });
  assert('unknown placeholder preserved', result.headline === '{{missing_var}} 제품');
  assert('known var replaced in string', result.product_name === '리얼 세럼 추천');
}

// ── 3. Null and undefined variable values preserved ────────────────────────
console.log('\n3. Null/undefined variable values');
{
  const tmpl: Brief = {
    headline: '{{null_var}} {{undef_var}} {{present_var}}',
  };
  const result = interpolateTemplate(tmpl, {
    null_var: null,
    undef_var: undefined,
    present_var: '값',
  });
  assert(
    'null + undefined preserved, defined replaced',
    result.headline === '{{null_var}} {{undef_var}} 값',
  );
}

// ── 4. Nested object fields traversed recursively ──────────────────────────
console.log('\n4. Nested fields');
{
  const tmpl: Brief = {
    headline: '{{product_name}} 출시',
    meta: {
      title: '{{brand_name}} — {{product_name}}',
      count: 42,
    },
  };
  const result = interpolateTemplate(tmpl, {
    brand_name: '히오브',
    product_name: '비타 세럼',
  });
  assert('top-level replaced', result.headline === '비타 세럼 출시');
  const meta = result.meta as Record<string, unknown>;
  assert('nested string replaced', meta.title === '히오브 — 비타 세럼');
  assert('nested non-string unchanged', meta.count === 42);
}

// ── 5. Multiple placeholders in one field ──────────────────────────────────
console.log('\n5. Multiple placeholders in one field');
{
  const tmpl: Brief = {
    headline: '{{a}} + {{b}} = {{a}}{{b}}',
  };
  const result = interpolateTemplate(tmpl, { a: '1', b: '2' });
  assert('all occurrences replaced', result.headline === '1 + 2 = 12');
}

// ── 6. Edge cases ─────────────────────────────────────────────────────────
console.log('\n6. Edge cases');
{
  const tmpl: Brief = {
    headline: '',
    count: 99,
    arr: [1, 2, 3],
    nullField: null,
    subheadline: '   {{  spaced  }}   ',
  };
  const result = interpolateTemplate(tmpl, { spaced: '답' });
  assert('empty string unchanged', result.headline === '');
  assert('number field pass-through', result.count === 99);
  assert('array field pass-through', eq(result.arr, [1, 2, 3]));
  assert('null field pass-through', result.nullField === null);
  assert(
    'trimmed placeholder name resolved',
    (result.subheadline as string) === '   답   ',
  );
}

// ── Summary ────────────────────────────────────────────────────────────────
const total = passed + failed;
console.log(`\n→ VERIFY interpolateTemplate: ${passed}/${total} passed`);
if (failed > 0) {
  process.exit(1);
}
