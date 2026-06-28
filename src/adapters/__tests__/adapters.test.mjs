/**
 * ENG-03 acceptance tests — adapter save/get roundtrip + idempotency + RLS policies.
 * Run: node packages/timeline/src/adapters/__tests__/adapters.test.mjs
 *
 * Uses raw fetch (service key). Tests adapter logic via a thin in-memory shim
 * that delegates to the real Supabase PostgREST API.
 */
import fs from 'node:fs';

// ── env ──────────────────────────────────────────────────────────────────────
const env = fs.readFileSync('/home/surahanchoi/hiob/.env.master.local', 'utf8');
const get = (k) => { const m = env.match(new RegExp('^' + k + '=(.*)$', 'm')); return m ? m[1].trim() : ''; };
const URL_ = get('NEXT_PUBLIC_SUPABASE_URL');
const KEY  = get('SUPABASE_SECRET_KEY');

const hdr = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

async function pgRest(method, table, body, qs = '') {
  const url = `${URL_}/rest/v1/${table}${qs ? '?' + qs : ''}`;
  const opts = { method, headers: { ...hdr } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  return { status: r.status, data: text ? JSON.parse(text) : null };
}

// ── Minimal Supabase shim for adapters ───────────────────────────────────────
// Builds Supabase JS-compatible chainable calls → raw PostgREST fetch.
// Chain is thenable so `await chain.update().eq().eq()` works without .single().
function makeClient() {
  return {
    from(table) {
      const state = { table, selCols: '*', eqs: [], updates: null, inserts: null, single: false, limit: null };

      async function run() {
        const eqStr = state.eqs.join('&');
        if (state.inserts) {
          const res = await pgRest('POST', state.table, state.inserts, eqStr || undefined);
          if (res.status !== 201) {
            return { data: null, error: { message: JSON.stringify(res.data) } };
          }
          const rows = Array.isArray(res.data) ? res.data : [];
          return { data: state.single ? (rows[0] ?? null) : rows, error: null };
        }
        if (state.updates) {
          const res = await pgRest('PATCH', state.table, state.updates, eqStr || undefined);
          if (res.status !== 200 && res.status !== 204) {
            return { data: null, error: { message: JSON.stringify(res.data) } };
          }
          return { data: res.data, error: null };
        }
        // SELECT
        const parts = [`select=${state.selCols}`, ...state.eqs];
        if (state.limit) parts.push(`limit=${state.limit}`);
        const res = await pgRest('GET', state.table, undefined, parts.join('&'));
        if (res.status !== 200) {
          return { data: null, error: { message: JSON.stringify(res.data) } };
        }
        const rows = Array.isArray(res.data) ? res.data : [];
        if (state.single) {
          if (rows.length === 0) return { data: null, error: { message: 'not found' } };
          return { data: rows[0], error: null };
        }
        return { data: rows, error: null };
      }

      const chain = {
        select(cols = '*') { state.selCols = cols; return chain; },
        insert(row) { state.inserts = row; return chain; },
        update(row) { state.updates = row; return chain; },
        eq(col, val) { state.eqs.push(`${col}=eq.${encodeURIComponent(val)}`); return chain; },
        limit(n) { state.limit = n; return run(); },
        single() { state.single = true; return run(); },
        // Thenable: allows `await chain` and `await chain.eq(...).eq(...)`
        then(resolve, reject) { return run().then(resolve, reject); },
        catch(reject) { return run().catch(reject); },
      };
      return chain;
    },
  };
}

// ── test harness ─────────────────────────────────────────────────────────────
let passed = 0; let failed = 0;
function assert(label, cond) {
  if (cond) { console.log(`  ✓ ${label}`); passed++; }
  else       { console.error(`  ✗ FAIL: ${label}`); failed++; }
}

const NOW   = new Date().toISOString();
const BRAND = 'viewok';
const LIVE_RUN = '4572999a-b2fe-41dc-9078-63bb5c85638f';

// Stable deterministic UUIDs for ENG-03 tests
const RD1 = '990e8400-e29b-41d4-a716-eeee00000001';
const RD2 = '990e8400-e29b-41d4-a716-eeee00000002';
const RD3 = '990e8400-e29b-41d4-a716-eeee00000003';
const RJ1 = 'aa0e8400-e29b-41d4-a716-ffff00000001';
const RJ2 = 'aa0e8400-e29b-41d4-a716-ffff00000002';
const RJ3 = 'aa0e8400-e29b-41d4-a716-ffff00000003';

const BASE_DOC = {
  version: '1.0', schemaHash: 'testhash',
  created: NOW, updated: NOW,
  outputFormat: { aspectRatio: '9:16', width: 1080, height: 1920, fps: '30' },
  elements: [],
};

async function cleanup() {
  await pgRest('DELETE', 'render_logs', undefined, `render_job_id=in.(${RJ1},${RJ2},${RJ3})`);
  await pgRest('DELETE', 'render_jobs',  undefined, `id=in.(${RJ1},${RJ2},${RJ3})`);
  await pgRest('DELETE', 'reel_documents', undefined, `id=in.(${RD1},${RD2},${RD3})`);
}

// ── Import adapters ───────────────────────────────────────────────────────────
const { ReelDocumentAdapter } = await import('../reelDocumentAdapter.ts');
const { RenderJobAdapter }    = await import('../renderJobAdapter.ts');

// ── 1. RLS policies verified ─────────────────────────────────────────────────
console.log('\n1. RLS policies exist for all 6 tables');
{
  const res = await fetch(`https://api.supabase.com/v1/projects/mzxupoupldnfjhtkfrbg/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${get('SUPABASE_ACCESS_TOKEN')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: "SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('reel_documents','animations','brand_kits','render_jobs','asset_library_items','render_logs') ORDER BY tablename;" }),
  });
  const rows = await res.json();
  const tables = new Set(rows.map(r => r.tablename));
  assert('reel_documents has policy', tables.has('reel_documents'));
  assert('animations has policy', tables.has('animations'));
  assert('brand_kits has policy', tables.has('brand_kits'));
  assert('render_jobs has policy', tables.has('render_jobs'));
  assert('asset_library_items has policy', tables.has('asset_library_items'));
  assert('render_logs has policy', tables.has('render_logs'));
}

// ── 2. ReelDocumentAdapter: save → get roundtrip ─────────────────────────────
console.log('\n2. ReelDocumentAdapter: createReelDoc → getReelDoc roundtrip');
{
  await cleanup();
  const sb = makeClient();
  const adapter = new ReelDocumentAdapter(sb, BRAND);

  const doc = { ...BASE_DOC, id: RD1, title: 'ENG-03 roundtrip test' };
  const created = await adapter.createReelDoc(doc);
  assert('createReelDoc returns id', created.id === RD1);
  assert('createReelDoc returns docHash', typeof created.docHash === 'string' && created.docHash.length === 64);

  const fetched = await adapter.getReelDoc(RD1);
  assert('getReelDoc returns correct id', fetched.id === RD1);
  assert('getReelDoc returns correct title', fetched.title === 'ENG-03 roundtrip test');
  assert('getReelDoc returns correct version', fetched.version === '1.0');
}

// ── 3. ReelDocumentAdapter: updateReelDoc creates new version ────────────────
console.log('\n3. ReelDocumentAdapter: updateReelDoc creates new version with parent_doc_id');
{
  const sb = makeClient();
  const adapter = new ReelDocumentAdapter(sb, BRAND);

  const updated = { ...BASE_DOC, id: RD2, title: 'ENG-03 updated version' };
  const result = await adapter.updateReelDoc(RD1, updated);
  assert('updateReelDoc returns new id', result.id === RD2);
  assert('updateReelDoc returns docHash', typeof result.docHash === 'string' && result.docHash.length === 64);

  // Verify parent_doc_id is set in DB
  const { data } = await pgRest('GET', 'reel_documents', undefined, `id=eq.${RD2}&select=parent_doc_id,title`);
  assert('parent_doc_id links to original', data?.[0]?.parent_doc_id === RD1);
  assert('title updated', data?.[0]?.title === 'ENG-03 updated version');
}

// ── 4. ReelDocumentAdapter: deleteReelDoc sets is_active=false ───────────────
console.log('\n4. ReelDocumentAdapter: deleteReelDoc soft-deletes (is_active=false)');
{
  const sb = makeClient();
  const adapter = new ReelDocumentAdapter(sb, BRAND);

  await adapter.deleteReelDoc(RD1);
  const { data } = await pgRest('GET', 'reel_documents', undefined, `id=eq.${RD1}&select=is_active`);
  assert('is_active=false after delete', data?.[0]?.is_active === false);
}

// ── 5. RenderJobAdapter: createRenderJob ────────────────────────────────────
console.log('\n5. RenderJobAdapter: createRenderJob');
{
  const sb = makeClient();
  const adapter = new RenderJobAdapter(sb, BRAND);

  // First ensure we have a reel doc to reference (ignore if already exists from cleanup)
  await pgRest('POST', 'reel_documents', {
    id: RD3, brand_slug: BRAND, version: '1.0',
    doc: { ...BASE_DOC, id: RD3, title: 'job test' },
    doc_hash: 'test003',
  });

  const job = await adapter.createRenderJob({
    id: RJ1,
    reelDocId: RD3,
    idempotencyKey: 'eng03-idem-001',
  });
  assert('createRenderJob returns id', job.id === RJ1);
  assert('createRenderJob status=queued', job.status === 'queued');
  assert('createRenderJob cached=false', job.cached === false);
}

// ── 6. RenderJobAdapter: idempotency ────────────────────────────────────────
console.log('\n6. RenderJobAdapter: duplicate idempotency key returns cached result');
{
  const sb = makeClient();
  const adapter = new RenderJobAdapter(sb, BRAND);

  const job2 = await adapter.createRenderJob({
    id: RJ2,
    reelDocId: RD3,
    idempotencyKey: 'eng03-idem-001', // same key
  });
  assert('duplicate key returns cached=true', job2.cached === true);
  assert('duplicate key returns original id', job2.id === RJ1);
}

// ── 7. RenderJobAdapter: getRenderJob ───────────────────────────────────────
console.log('\n7. RenderJobAdapter: getRenderJob');
{
  const sb = makeClient();
  const adapter = new RenderJobAdapter(sb, BRAND);

  const fetched = await adapter.getRenderJob(RJ1);
  assert('getRenderJob id matches', fetched.id === RJ1);
  assert('getRenderJob status=queued', fetched.status === 'queued');
  assert('getRenderJob statusHistory is array', Array.isArray(fetched.statusHistory));
  assert('getRenderJob reelDocId matches', fetched.reelDocId === RD3);
}

// ── 8. RenderJobAdapter: updateRenderJobStatus with history ─────────────────
console.log('\n8. RenderJobAdapter: updateRenderJobStatus queued→processing→done');
{
  // Need a render_job with run_id (existing constraint)
  await pgRest('DELETE', 'render_jobs', undefined, `id=eq.${RJ3}`);
  await pgRest('POST', 'render_jobs', {
    id: RJ3, reel_doc_id: RD3, brand_slug: BRAND, run_id: LIVE_RUN,
    status: 'queued', idempotency_key: 'eng03-hist-001', status_history: [],
  });

  const sb = makeClient();
  const adapter = new RenderJobAdapter(sb, BRAND);

  await adapter.updateRenderJobStatus(RJ3, 'processing');
  const mid = await adapter.getRenderJob(RJ3);
  assert('status is processing', mid.status === 'processing');
  assert('statusHistory has 1 entry', mid.statusHistory.length === 1);
  assert('statusHistory entry.status=processing', mid.statusHistory[0]?.status === 'processing');

  await adapter.updateRenderJobStatus(RJ3, 'done', { outputUrl: 'https://example.com/out.mp4' });
  const final = await adapter.getRenderJob(RJ3);
  assert('status is done', final.status === 'done');
  assert('statusHistory has 2 entries', final.statusHistory.length === 2);
  assert('outputUrl is set', final.outputUrl === 'https://example.com/out.mp4');
}

// ── 9. RenderJobAdapter: getRenderJobsByStatus ───────────────────────────────
console.log('\n9. RenderJobAdapter: getRenderJobsByStatus');
{
  const sb = makeClient();
  const adapter = new RenderJobAdapter(sb, BRAND);

  const queued = await adapter.getRenderJobsByStatus('queued');
  assert('queued jobs are array', Array.isArray(queued));
  // RJ1 was created queued — but we don't assert exact count since other rows may exist
  assert('getRenderJobsByStatus returns objects with id+reelDocId', queued.every(j => j.id && 'reelDocId' in j));
}

// ── cleanup & summary ────────────────────────────────────────────────────────
await cleanup();
const total = passed + failed;
console.log(`\n→ VERIFY ENG-03 adapters: ${passed}/${total} passed`);
if (failed > 0) process.exit(1);
