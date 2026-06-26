/**
 * BeatPlan — unified per-beat metadata contract (U-M1-BEATPLAN-CONTRACT).
 *
 * Mirror of apps/modal/workers/beat_plan.py::BeatPlan dataclass.
 * Use BeatPlanSchema.parse() at API boundaries to validate beat_plan artifacts
 * loaded from Supabase (artifact.kind='beat_plan', storage='inline').
 */
import { z } from 'zod';

const CaptionTypeSchema = z.enum([
  'speaker-dialogue',
  'pd-aside',
  'reaction',
  'inner-thought',
  'footnote',
  'sfx-emoji',
]);

export const BeatPlanSchema = z.object({
  // 11 core fields
  beat_index: z.number().int().min(0),
  emotion: z.string().default('인간'),
  logic_function: z.string().default(''),
  shot_type: z.string().default(''),
  render_mode: z.string().default(''),
  persona_id: z.string().default(''),
  voice_concept: z.string().default('friendly'),
  caption_text: z.string().default(''),
  caption_type: CaptionTypeSchema.default('speaker-dialogue'),
  sfx_cue: z.string().default(''),
  music_intensity: z.string().default(''),
  // 4 optional proof fields
  social_proof_wording: z.string().default(''),
  social_proof_attribution: z.string().default(''),
  proof_asset_id: z.string().default(''),
  proof_headline: z.string().default(''),
});

export type BeatPlan = z.infer<typeof BeatPlanSchema>;

export const BeatPlanListSchema = z.array(BeatPlanSchema);
export type BeatPlanList = z.infer<typeof BeatPlanListSchema>;
