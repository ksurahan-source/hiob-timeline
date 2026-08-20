import { describe, expect, test } from 'vitest';

import {
  ReelDocumentAdapter,
  type SupabaseChain,
  type SupabaseLike,
} from './reelDocumentAdapter.ts';
import { RenderJobAdapter } from './renderJobAdapter.ts';
import type { ReelDoc } from '../schema/reelDocSchema.ts';

type DbError = { message: string } | null;
type DbResponse = { data: unknown; error: DbError };

interface Operation {
  method: string;
  args: unknown[];
}

function makeClient(...responses: DbResponse[]): {
  client: SupabaseLike;
  operations: Operation[];
} {
  const operations: Operation[] = [];
  let responseIndex = 0;

  const client = {
    from(table: string): SupabaseChain {
      operations.push({ method: 'from', args: [table] });
      const response = responses[responseIndex++] ?? { data: null, error: null };
      const chain = {
        select(cols = '*') {
          operations.push({ method: 'select', args: [cols] });
          return chain;
        },
        insert(row: Record<string, unknown>) {
          operations.push({ method: 'insert', args: [row] });
          return chain;
        },
        update(row: Record<string, unknown>) {
          operations.push({ method: 'update', args: [row] });
          return chain;
        },
        eq(col: string, val: unknown) {
          operations.push({ method: 'eq', args: [col, val] });
          return chain;
        },
        single() {
          return Promise.resolve(response);
        },
        limit(n: number) {
          operations.push({ method: 'limit', args: [n] });
          return Promise.resolve(response);
        },
        then<TResult1 = DbResponse, TResult2 = never>(
          onFulfilled?: ((value: DbResponse) => TResult1 | PromiseLike<TResult1>) | null,
          onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ) {
          return Promise.resolve(response).then(onFulfilled, onRejected);
        },
      };
      return chain as unknown as SupabaseChain;
    },
  };

  return { client, operations };
}

function validDoc(overrides: Partial<ReelDoc> = {}): ReelDoc {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    version: '1.0',
    schemaHash: 'hash',
    created: '2026-08-20T00:00:00.000Z',
    updated: '2026-08-20T00:00:00.000Z',
    title: 'A reel',
    outputFormat: {
      aspectRatio: '9:16',
      width: 1080,
      height: 1920,
      fps: '30',
    },
    elements: [],
    ...overrides,
  };
}

function insertedRow(operations: Operation[]): Record<string, unknown> {
  return operations.find((item) => item.method === 'insert')?.args[0] as Record<string, unknown>;
}

function updatedRow(operations: Operation[]): Record<string, unknown> {
  return operations.find((item) => item.method === 'update')?.args[0] as Record<string, unknown>;
}

describe('ReelDocumentAdapter', () => {
  test('gets and validates a reel document', async () => {
    const doc = validDoc();
    const { client } = makeClient({ data: { doc }, error: null });
    await expect(new ReelDocumentAdapter(client, 'brand').getReelDoc(doc.id)).resolves.toEqual(doc);
  });

  test('reports database, missing, and invalid document failures', async () => {
    const db = makeClient({ data: null, error: { message: 'offline' } });
    await expect(new ReelDocumentAdapter(db.client, 'brand').getReelDoc('one')).rejects.toThrow(
      'getReelDoc: offline',
    );

    const missing = makeClient({ data: null, error: null });
    await expect(new ReelDocumentAdapter(missing.client, 'brand').getReelDoc('two')).rejects.toThrow(
      'ReelDoc two not found',
    );

    const invalid = makeClient({ data: { doc: null }, error: null });
    await expect(new ReelDocumentAdapter(invalid.client, 'brand').getReelDoc('three')).rejects.toThrow(
      'Invalid ReelDoc: root:',
    );
  });

  test('creates documents with and without optional metadata', async () => {
    const doc = validDoc();
    const first = makeClient({ data: { id: doc.id, doc_hash: 'stored-hash' }, error: null });
    await expect(new ReelDocumentAdapter(first.client, 'brand').createReelDoc(doc)).resolves.toEqual({
      id: doc.id,
      docHash: 'stored-hash',
    });
    expect(insertedRow(first.operations)).toMatchObject({
      script_id: null,
      product_id: null,
      duration_ms: null,
    });

    const timed = validDoc({ outputFormat: { ...doc.outputFormat, durationMs: 12_000 } });
    const second = makeClient({ data: { id: doc.id, doc_hash: 'second-hash' }, error: null });
    await new ReelDocumentAdapter(second.client, 'brand').createReelDoc(timed, {
      scriptId: 'script',
      productId: 'product',
    });
    expect(insertedRow(second.operations)).toMatchObject({
      script_id: 'script',
      product_id: 'product',
      duration_ms: 12_000,
    });
  });

  test('rejects invalid input and create errors', async () => {
    const adapter = new ReelDocumentAdapter(makeClient().client, 'brand');
    await expect(adapter.createReelDoc({} as ReelDoc)).rejects.toThrow('Invalid ReelDoc:');

    const failed = makeClient({ data: null, error: { message: 'insert failed' } });
    await expect(new ReelDocumentAdapter(failed.client, 'brand').createReelDoc(validDoc())).rejects.toThrow(
      'createReelDoc: insert failed',
    );
  });

  test('creates immutable updates and reports update failures', async () => {
    const doc = validDoc({ id: '550e8400-e29b-41d4-a716-446655440001' });
    const ok = makeClient({ data: { id: doc.id, doc_hash: 'updated-hash' }, error: null });
    await expect(new ReelDocumentAdapter(ok.client, 'brand').updateReelDoc('parent', doc)).resolves.toEqual({
      id: doc.id,
      docHash: 'updated-hash',
    });
    expect(insertedRow(ok.operations)).toMatchObject({ parent_doc_id: 'parent', duration_ms: null });

    const adapter = new ReelDocumentAdapter(makeClient().client, 'brand');
    await expect(adapter.updateReelDoc('parent', {} as ReelDoc)).rejects.toThrow('Invalid ReelDoc:');

    const failed = makeClient({ data: null, error: { message: 'update failed' } });
    await expect(
      new ReelDocumentAdapter(failed.client, 'brand').updateReelDoc('parent', doc),
    ).rejects.toThrow('updateReelDoc: update failed');
  });

  test('soft deletes and reports delete failures', async () => {
    const ok = makeClient({ data: null, error: null });
    await expect(new ReelDocumentAdapter(ok.client, 'brand').deleteReelDoc('doc')).resolves.toBeUndefined();
    expect(updatedRow(ok.operations)).toEqual({ is_active: false });

    const failed = makeClient({ data: null, error: { message: 'delete failed' } });
    await expect(new ReelDocumentAdapter(failed.client, 'brand').deleteReelDoc('doc')).rejects.toThrow(
      'deleteReelDoc: delete failed',
    );
  });

  test('lists only valid documents for script and product', async () => {
    const doc = validDoc();
    const script = makeClient({ data: [{ doc }, { doc: {} }], error: null });
    await expect(new ReelDocumentAdapter(script.client, 'brand').getReelsByScript('script')).resolves.toEqual([
      doc,
    ]);

    const product = makeClient({ data: [{ doc: {} }, { doc }], error: null });
    await expect(new ReelDocumentAdapter(product.client, 'brand').getReelsByProduct('product')).resolves.toEqual([
      doc,
    ]);
  });

  test('reports list failures', async () => {
    const script = makeClient({ data: null, error: { message: 'script failed' } });
    await expect(new ReelDocumentAdapter(script.client, 'brand').getReelsByScript('script')).rejects.toThrow(
      'getReelsByScript: script failed',
    );

    const product = makeClient({ data: null, error: { message: 'product failed' } });
    await expect(new ReelDocumentAdapter(product.client, 'brand').getReelsByProduct('product')).rejects.toThrow(
      'getReelsByProduct: product failed',
    );
  });
});

describe('RenderJobAdapter', () => {
  test('returns an idempotent cached job', async () => {
    const { client } = makeClient({ data: [{ id: 'existing', status: 'processing' }], error: null });
    await expect(
      new RenderJobAdapter(client, 'brand').createRenderJob({
        id: 'new',
        reelDocId: 'doc',
        idempotencyKey: 'key',
      }),
    ).resolves.toEqual({ id: 'existing', status: 'processing', cached: true });
  });

  test('creates jobs for empty and null idempotency results', async () => {
    const empty = makeClient(
      { data: [], error: null },
      { data: { id: 'job', status: 'queued' }, error: null },
    );
    await expect(
      new RenderJobAdapter(empty.client, 'brand').createRenderJob({
        id: 'job',
        reelDocId: 'doc',
        idempotencyKey: 'key',
      }),
    ).resolves.toEqual({ id: 'job', status: 'queued', cached: false });
    expect(insertedRow(empty.operations)).toMatchObject({ script_id: null, product_id: null });

    const nil = makeClient(
      { data: null, error: null },
      { data: { id: 'job-2', status: 'queued' }, error: null },
    );
    await new RenderJobAdapter(nil.client, 'brand').createRenderJob({
      id: 'job-2',
      reelDocId: 'doc',
      idempotencyKey: 'key-2',
      scriptId: 'script',
      productId: 'product',
    });
    expect(insertedRow(nil.operations)).toMatchObject({ script_id: 'script', product_id: 'product' });
  });

  test('reports create failures', async () => {
    const failed = makeClient(
      { data: [], error: null },
      { data: null, error: { message: 'create failed' } },
    );
    await expect(
      new RenderJobAdapter(failed.client, 'brand').createRenderJob({
        id: 'job',
        reelDocId: 'doc',
        idempotencyKey: 'key',
      }),
    ).rejects.toThrow('createRenderJob: create failed');
  });

  test('gets jobs with stored values and defaults', async () => {
    const stored = makeClient({
      data: {
        id: 'job',
        status: 'done',
        output_url: 'https://example.com/out.mp4',
        status_history: [{ status: 'done', timestamp: 'now' }],
        reel_doc_id: 'doc',
      },
      error: null,
    });
    await expect(new RenderJobAdapter(stored.client, 'brand').getRenderJob('job')).resolves.toMatchObject({
      outputUrl: 'https://example.com/out.mp4',
      reelDocId: 'doc',
      statusHistory: [{ status: 'done', timestamp: 'now' }],
    });

    const defaults = makeClient({ data: { id: 'job', status: 'queued' }, error: null });
    await expect(new RenderJobAdapter(defaults.client, 'brand').getRenderJob('job')).resolves.toMatchObject({
      outputUrl: null,
      reelDocId: null,
      statusHistory: [],
    });

    const failed = makeClient({ data: null, error: { message: 'get failed' } });
    await expect(new RenderJobAdapter(failed.client, 'brand').getRenderJob('job')).rejects.toThrow(
      'getRenderJob: get failed',
    );
  });

  test.each([
    ['processing', undefined],
    ['queued', { outputUrl: 'ignored' }],
    ['done', undefined],
    ['done', { outputUrl: 'https://example.com/out.mp4' }],
    ['failed', undefined],
    ['failed', { error: 'render failed' }],
  ] as const)('updates %s status with the expected fields', async (status, params) => {
    const client = makeClient(
      {
        data: {
          id: 'job',
          status: 'queued',
          status_history: [{ status: 'queued', timestamp: 'before' }],
        },
        error: null,
      },
      { data: null, error: null },
    );
    await new RenderJobAdapter(client.client, 'brand').updateRenderJobStatus('job', status, params);
    const update = updatedRow(client.operations);
    expect(update.status).toBe(status);
    expect((update.status_history as unknown[]).length).toBe(2);
    if (status === 'processing') expect(update.started_at).toEqual(expect.any(String));
    if (status === 'done') expect(update.completed_at).toEqual(expect.any(String));
    if (status === 'failed') expect(update.completed_at).toEqual(expect.any(String));
    if (params?.outputUrl && status === 'done') expect(update.output_url).toBe(params.outputUrl);
    if (params?.error) expect(update.remotion_error).toBe(params.error);
  });

  test('reports status update failures', async () => {
    const client = makeClient(
      { data: { id: 'job', status: 'queued', status_history: [] }, error: null },
      { data: null, error: { message: 'write failed' } },
    );
    await expect(
      new RenderJobAdapter(client.client, 'brand').updateRenderJobStatus('job', 'processing'),
    ).rejects.toThrow('updateRenderJobStatus: write failed');
  });

  test('lists jobs and applies null defaults', async () => {
    const ok = makeClient({
      data: [
        { id: 'one', created_at: 'first', reel_doc_id: 'doc' },
        { id: 'two', created_at: 'second', reel_doc_id: null },
      ],
      error: null,
    });
    await expect(new RenderJobAdapter(ok.client, 'brand').getRenderJobsByStatus('queued')).resolves.toEqual([
      { id: 'one', createdAt: 'first', reelDocId: 'doc' },
      { id: 'two', createdAt: 'second', reelDocId: null },
    ]);

    const failed = makeClient({ data: null, error: { message: 'list failed' } });
    await expect(new RenderJobAdapter(failed.client, 'brand').getRenderJobsByStatus('failed')).rejects.toThrow(
      'getRenderJobsByStatus: list failed',
    );
  });
});
