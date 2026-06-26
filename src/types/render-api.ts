/**
 * Public Render API response types — HIOB Render API v1.
 *
 * These interfaces model the JSON envelope returned by POST /api/renders and
 * GET /api/renders/:renderId. External SDK consumers import these to type their
 * integration code without coupling to the studio's internal models.
 *
 * @example
 *   import type { RenderResponse, RenderJob } from '@hiob/timeline';
 *
 *   const res = await fetch('/api/renders', { method: 'POST', body: JSON.stringify(body) });
 *   const envelope: RenderResponse = await res.json();
 *   if (envelope.success) {
 *     const job: RenderJob = envelope.data;
 *     console.log(job.render_id, job.estimated_cost_usd);
 *   }
 */

/** Lifecycle states for a render job. */
export type RenderStatus = 'queued' | 'processing' | 'complete' | 'failed' | 'cancelled';

/** A single render job record returned by the Render API. */
export interface RenderJob {
  /** Unique render job identifier (UUID). */
  render_id: string;
  /** Polling URL: GET /api/renders/{render_id} */
  status_url: string;
  /** Current job lifecycle state. */
  status?: RenderStatus;
  /** Output video URL — present only when status === 'complete'. */
  output_url?: string;
  /** Estimated render time in seconds. */
  estimated_seconds: number;
  /** Estimated cost in USD (cost model: base $0.15 + priority + effects complexity). */
  estimated_cost_usd: number;
  /**
   * Whether the render queue is live. False during Phase 1 stub (DDL pending).
   * Remove this field check once render_queue table DDL is applied.
   */
  queue_ready: boolean;
  /** ISO-8601 timestamp when the job was created. */
  created_at?: string;
}

/** Standardized error payload included in all non-success responses. */
export interface RenderApiError {
  /** Machine-readable error code (e.g. REEL_NOT_FOUND, UNAUTHORIZED). */
  code: string;
  /** Human-readable error message. */
  message: string;
  /** ISO-8601 timestamp of the error. */
  timestamp: string;
}

/**
 * Top-level response envelope for all /api/renders responses.
 *
 * Discriminated union: success:true carries data, success:false carries error.
 */
export type RenderResponse =
  | { success: true; data: RenderJob }
  | { success: false; error: RenderApiError };

/**
 * Body shape for POST /api/renders.
 *
 * @example
 *   const body: RenderRequest = {
 *     reel_id: '550e8400-e29b-41d4-a716-446655440000',
 *     priority: 'fast',
 *     modifications: { locale: 'en' },
 *   };
 */
export interface RenderRequest {
  /** UUID of the reel (maps to run.id internally). Required. */
  reel_id: string;
  /** Queue priority. Defaults to 'standard'. 'fast' adds $0.10 to estimated cost. */
  priority?: 'fast' | 'standard';
  /** Optional per-render overrides. Each key adds $0.05 to estimated cost. */
  modifications?: {
    brief_text?: string;
    visual_theme?: string;
    locale?: string;
    [key: string]: string | undefined;
  };
}
