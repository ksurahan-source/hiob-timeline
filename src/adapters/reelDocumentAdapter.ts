import { validateReelDoc, type ReelDoc } from '../schema/reelDocSchema.ts';

type QueryResult = Promise<{ data: unknown; error: { message: string } | null }>;

// Minimal chainable interface — avoids importing @supabase/supabase-js.
// Every method returns SupabaseChain so arbitrary .eq().eq().limit() chains type-check.
export interface SupabaseChain extends Promise<{ data: unknown; error: { message: string } | null }> {
  select(cols?: string): SupabaseChain;
  insert(row: Record<string, unknown>): SupabaseChain;
  update(row: Record<string, unknown>): SupabaseChain;
  eq(col: string, val: unknown): SupabaseChain;
  single(): QueryResult;
  limit(n: number): QueryResult;
}

export interface SupabaseLike {
  from(table: string): SupabaseChain;
}

async function sha256hex(data: string): Promise<string> {
  const buf = new TextEncoder().encode(data);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export class ReelDocumentAdapter {
  private sb: SupabaseLike;
  private brandSlug: string;

  constructor(sb: SupabaseLike, brandSlug: string) {
    this.sb = sb;
    this.brandSlug = brandSlug;
  }

  async getReelDoc(reelDocId: string): Promise<ReelDoc> {
    const { data, error } = await this.sb
      .from('reel_documents')
      .select('doc')
      .eq('id', reelDocId)
      .eq('brand_slug', this.brandSlug)
      .single();

    if (error) throw new Error(`getReelDoc: ${error.message}`);
    if (!data) throw new Error(`ReelDoc ${reelDocId} not found`);

    const row = data as { doc: unknown };
    const validation = validateReelDoc(row.doc);
    if (validation.ok === false) throw new Error(`Invalid ReelDoc: ${validation.errors.join('; ')}`);
    return validation.doc;
  }

  async createReelDoc(
    reelDoc: ReelDoc,
    metadata?: { scriptId?: string; productId?: string },
  ): Promise<{ id: string; docHash: string }> {
    const validation = validateReelDoc(reelDoc);
    if (validation.ok === false) throw new Error(`Invalid ReelDoc: ${validation.errors.join('; ')}`);

    const docHash = await sha256hex(JSON.stringify(reelDoc));

    const { data, error } = await this.sb
      .from('reel_documents')
      .insert({
        id: reelDoc.id,
        brand_slug: this.brandSlug,
        version: reelDoc.version,
        doc: reelDoc as unknown as Record<string, unknown>,
        doc_hash: docHash,
        title: reelDoc.title,
        duration_ms: reelDoc.outputFormat.durationMs ?? null,
        aspect_ratio: reelDoc.outputFormat.aspectRatio,
        script_id: metadata?.scriptId ?? null,
        product_id: metadata?.productId ?? null,
      })
      .select('id, doc_hash')
      .single();

    if (error) throw new Error(`createReelDoc: ${error.message}`);
    const row = data as { id: string; doc_hash: string };
    return { id: row.id, docHash: row.doc_hash };
  }

  async updateReelDoc(
    parentDocId: string,
    updatedReelDoc: ReelDoc,
  ): Promise<{ id: string; docHash: string }> {
    const validation = validateReelDoc(updatedReelDoc);
    if (validation.ok === false) throw new Error(`Invalid ReelDoc: ${validation.errors.join('; ')}`);

    const docHash = await sha256hex(JSON.stringify(updatedReelDoc));

    const { data, error } = await this.sb
      .from('reel_documents')
      .insert({
        id: updatedReelDoc.id,
        brand_slug: this.brandSlug,
        version: updatedReelDoc.version,
        doc: updatedReelDoc as unknown as Record<string, unknown>,
        doc_hash: docHash,
        parent_doc_id: parentDocId,
        title: updatedReelDoc.title,
        duration_ms: updatedReelDoc.outputFormat.durationMs ?? null,
        aspect_ratio: updatedReelDoc.outputFormat.aspectRatio,
      })
      .select('id, doc_hash')
      .single();

    if (error) throw new Error(`updateReelDoc: ${error.message}`);
    const row = data as { id: string; doc_hash: string };
    return { id: row.id, docHash: row.doc_hash };
  }

  async deleteReelDoc(reelDocId: string): Promise<void> {
    const { error } = await this.sb
      .from('reel_documents')
      .update({ is_active: false })
      .eq('id', reelDocId)
      .eq('brand_slug', this.brandSlug);

    if (error) throw new Error(`deleteReelDoc: ${error.message}`);
  }

  async getReelsByScript(scriptId: string): Promise<ReelDoc[]> {
    const { data, error } = await this.sb
      .from('reel_documents')
      .select('doc')
      .eq('script_id', scriptId)
      .eq('brand_slug', this.brandSlug)
      .limit(100);

    if (error) throw new Error(`getReelsByScript: ${error.message}`);

    return (data as { doc: unknown }[])
      .map((row) => {
        const v = validateReelDoc(row.doc);
        return v.ok ? v.doc : null;
      })
      .filter((d): d is ReelDoc => d !== null);
  }

  async getReelsByProduct(productId: string): Promise<ReelDoc[]> {
    const { data, error } = await this.sb
      .from('reel_documents')
      .select('doc')
      .eq('product_id', productId)
      .eq('brand_slug', this.brandSlug)
      .limit(100);

    if (error) throw new Error(`getReelsByProduct: ${error.message}`);

    return (data as { doc: unknown }[])
      .map((row) => {
        const v = validateReelDoc(row.doc);
        return v.ok ? v.doc : null;
      })
      .filter((d): d is ReelDoc => d !== null);
  }
}
