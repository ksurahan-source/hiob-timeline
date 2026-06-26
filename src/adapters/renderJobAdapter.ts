import type { SupabaseLike } from './reelDocumentAdapter.ts';

export type RenderJobStatus = 'queued' | 'processing' | 'done' | 'failed';

export interface StatusHistoryEntry {
  status: RenderJobStatus;
  timestamp: string;
  message?: string;
}

export interface RenderJobRow {
  id: string;
  status: RenderJobStatus;
  output_url?: string | null;
  status_history: StatusHistoryEntry[];
  reel_doc_id?: string | null;
  created_at: string;
}

export class RenderJobAdapter {
  private sb: SupabaseLike;
  private brandSlug: string;

  constructor(sb: SupabaseLike, brandSlug: string) {
    this.sb = sb;
    this.brandSlug = brandSlug;
  }

  async createRenderJob(params: {
    id: string;
    reelDocId: string;
    idempotencyKey: string;
    scriptId?: string;
    productId?: string;
  }): Promise<{ id: string; status: RenderJobStatus; cached: boolean }> {
    // Idempotency: check if key already exists
    const { data: existing } = await this.sb
      .from('render_jobs')
      .select('id, status')
      .eq('idempotency_key', params.idempotencyKey)
      .eq('brand_slug', this.brandSlug)
      .limit(1);

    const rows = existing as { id: string; status: RenderJobStatus }[] | null;
    if (rows && rows.length > 0) {
      return { id: rows[0].id, status: rows[0].status, cached: true };
    }

    const { data, error } = await this.sb
      .from('render_jobs')
      .insert({
        id: params.id,
        reel_doc_id: params.reelDocId,
        brand_slug: this.brandSlug,
        status: 'queued' as RenderJobStatus,
        idempotency_key: params.idempotencyKey,
        script_id: params.scriptId ?? null,
        product_id: params.productId ?? null,
        status_history: [] as StatusHistoryEntry[],
        queued_at: new Date().toISOString(),
      })
      .select('id, status')
      .single();

    if (error) throw new Error(`createRenderJob: ${error.message}`);
    const row = data as { id: string; status: RenderJobStatus };
    return { id: row.id, status: row.status, cached: false };
  }

  async getRenderJob(jobId: string): Promise<{
    id: string;
    status: RenderJobStatus;
    outputUrl: string | null;
    statusHistory: StatusHistoryEntry[];
    reelDocId: string | null;
  }> {
    const { data, error } = await this.sb
      .from('render_jobs')
      .select('id, status, output_url, status_history, reel_doc_id')
      .eq('id', jobId)
      .eq('brand_slug', this.brandSlug)
      .single();

    if (error) throw new Error(`getRenderJob: ${error.message}`);
    const row = data as RenderJobRow;
    return {
      id: row.id,
      status: row.status,
      outputUrl: row.output_url ?? null,
      statusHistory: row.status_history ?? [],
      reelDocId: row.reel_doc_id ?? null,
    };
  }

  async updateRenderJobStatus(
    jobId: string,
    newStatus: RenderJobStatus,
    params?: { outputUrl?: string; error?: string },
  ): Promise<void> {
    const now = new Date().toISOString();

    // Fetch current history to append (avoids raw SQL)
    const current = await this.getRenderJob(jobId);
    const newEntry: StatusHistoryEntry = {
      status: newStatus,
      timestamp: now,
      ...(params?.error ? { message: params.error } : {}),
      ...(params?.outputUrl && newStatus === 'done' ? { message: params.outputUrl } : {}),
    };
    const updatedHistory = [...current.statusHistory, newEntry];

    const update: Record<string, unknown> = {
      status: newStatus,
      updated_at: now,
      status_history: updatedHistory,
    };

    if (newStatus === 'processing') update.started_at = now;
    if (newStatus === 'done') {
      update.completed_at = now;
      if (params?.outputUrl) update.output_url = params.outputUrl;
    }
    if (newStatus === 'failed') {
      update.completed_at = now;
      if (params?.error) update.remotion_error = params.error;
    }

    const { error } = await this.sb
      .from('render_jobs')
      .update(update)
      .eq('id', jobId)
      .eq('brand_slug', this.brandSlug);

    if (error) throw new Error(`updateRenderJobStatus: ${error.message}`);
  }

  async getRenderJobsByStatus(status: RenderJobStatus): Promise<
    Array<{ id: string; createdAt: string; reelDocId: string | null }>
  > {
    const { data, error } = await this.sb
      .from('render_jobs')
      .select('id, created_at, reel_doc_id')
      .eq('status', status)
      .eq('brand_slug', this.brandSlug)
      .limit(100);

    if (error) throw new Error(`getRenderJobsByStatus: ${error.message}`);

    return (data as { id: string; created_at: string; reel_doc_id: string | null }[]).map((d) => ({
      id: d.id,
      createdAt: d.created_at,
      reelDocId: d.reel_doc_id ?? null,
    }));
  }
}
