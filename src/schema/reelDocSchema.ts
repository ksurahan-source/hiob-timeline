import { z } from 'zod';

// ── Primitive Types ──────────────────────────────────────────────────────────

const DurationMs = z.number().int().min(0).describe('Duration in milliseconds');
const FrameIndex = z.number().int().min(0).describe('Frame index (0-based)');
const Percent = z.number().min(0).max(100).describe('Percentage 0–100');
const HexColor = z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/).describe('Hex color #rrggbb or #rrggbbaa');
const BrandVarRef = z.string().regex(/^\{\{brand\.[a-zA-Z0-9_.]+\}\}$/).describe('Brand variable reference e.g. {{brand.colors.accent}}');
// Used in text elements: accepts either a literal hex color or a brand variable reference.
const BrandColorRef = z.union([HexColor, BrandVarRef]).describe('Hex color or {{brand.colors.*}} reference');
const BrandFontRef = z.union([z.string().min(1), BrandVarRef]).describe('Font family name or {{brand.fonts.*}} reference');
const AspectRatio = z.string().describe('Aspect ratio string e.g. "9:16"');
const Fps = z.string().describe('Frames per second string e.g. "30"');
const Easing = z.enum([
  'linear',
  'ease',
  'ease-in',
  'ease-out',
  'ease-in-out',
  'ease-in-expo',
  'ease-out-expo',
  'ease-in-back',
  'ease-out-back',
  'spring',
]).describe('Animation easing function');

// ── Animation ────────────────────────────────────────────────────────────────

const KeyframeSchema = z.object({
  time: z.number().min(0).max(100).describe('Percent through the animation 0–100'),
  opacity: z.number().min(0).max(1).optional(),
  scale: z.number().optional(),
  x: Percent.optional(),
  y: Percent.optional(),
  rotation: z.number().optional(),
  blur: z.number().min(0).optional(),
  brightness: z.number().min(0).optional(),
  // Per-keyframe easing for the OUTGOING segment (this kf → next). Falls back to
  // the parent animation's easing when omitted. Enables anticipation/overshoot
  // mid-animation (the "손맛"), matching the live clips[].keyframes path.
  easing: Easing.optional(),
}).describe('A single keyframe in a property animation');

const PropertyAnimationSchema = z.object({
  type: z.literal('property'),
  startTime: DurationMs.describe('Start time offset within the element'),
  duration: DurationMs.describe('Duration of the animation'),
  easing: Easing.default('ease-out'),
  keyframes: z.array(KeyframeSchema).min(2).describe('At least start and end keyframes'),
}).describe('Property-based keyframe animation');

// Reference a named motion preset from the AnimationRegistry (ken-burns, snap-zoom-in,
// overshoot-pop, …) instead of hand-authoring keyframes. This is what lets a ReelDoc
// SAY "apply this Envato-grade template" — the renderer resolves it via getPreset().
const PresetAnimationRefSchema = z.object({
  type: z.literal('preset'),
  presetId: z.string().min(1).describe('AnimationRegistry preset id, e.g. "snap-zoom-in"'),
  startTime: DurationMs.default(0).describe('Start time offset within the element'),
  duration: DurationMs.describe('Duration of the preset animation'),
  intensity: z.enum(['subtle', 'medium', 'strong']).default('medium'),
}).describe('Named-preset animation reference');

const AnimationSchema = z.discriminatedUnion('type', [
  PropertyAnimationSchema,
  PresetAnimationRefSchema,
]).describe('Element animation (keyframe property animation or named-preset reference)');

// ── Fill ─────────────────────────────────────────────────────────────────────

const GradientStopSchema = z.object({
  position: z.number().min(0).max(100).describe('Stop position 0–100'),
  color: HexColor,
});

const LinearGradientSchema = z.object({
  type: z.literal('linear'),
  angle: z.number().min(0).max(360).default(0),
  stops: z.array(GradientStopSchema).min(2),
});

const RadialGradientSchema = z.object({
  type: z.literal('radial'),
  stops: z.array(GradientStopSchema).min(2),
});

const GradientSchema = z.discriminatedUnion('type', [LinearGradientSchema, RadialGradientSchema]);

const SolidFillSchema = z.object({
  type: z.literal('solid'),
  color: HexColor,
});

const GradientFillSchema = z.object({
  type: z.literal('gradient'),
  gradient: GradientSchema,
});

const FillSchema = z.discriminatedUnion('type', [SolidFillSchema, GradientFillSchema]);

// ── Element Schemas (discriminated by `type`) ────────────────────────────────

const BaseElementSchema = z.object({
  id: z.string().min(1).describe('Unique element ID within this ReelDoc'),
  x: Percent,
  y: Percent,
  opacity: z.number().min(0).max(1).default(1),
  zIndex: z.number().int().default(0),
  animations: z.array(AnimationSchema).optional(),
});

const VideoElementSchema = BaseElementSchema.extend({
  type: z.literal('video'),
  src: z.string().url().describe('Video source URL'),
  duration: DurationMs,
  width: Percent,
  height: Percent,
  scale: z.number().default(1),
  rotation: z.number().default(0),
  loop: z.boolean().default(false),
  muted: z.boolean().default(false),
  startFrom: DurationMs.default(0).describe('Trim start in source ms'),
  volume: z.number().min(0).max(2).default(1),
  fit: z.enum(['cover', 'contain', 'fill']).default('cover'),
}).describe('Video element');

const TextElementSchema = BaseElementSchema.extend({
  type: z.literal('text'),
  text: z.string().describe('Text content; may include {variable} interpolations'),
  width: Percent,
  height: Percent.optional(),
  fontSize: z.number().min(1).max(400),
  fontFamily: BrandFontRef,
  fontWeight: z.string().default('400'),
  color: BrandColorRef,
  textAlign: z.enum(['left', 'center', 'right']).default('center'),
  lineHeight: z.number().optional(),
  letterSpacing: z.number().optional(),
  textDecoration: z.enum(['none', 'underline', 'line-through']).optional(),
  backgroundColor: BrandColorRef.optional(),
  padding: z.number().optional(),
  borderRadius: z.number().optional(),
  blur: z.boolean().default(false).describe('Apply Gaussian blur (secondary text)'),
  blurAmount: z.number().min(0).optional(),
}).describe('Text element');

const ShapeElementSchema = BaseElementSchema.extend({
  type: z.literal('shape'),
  shapeType: z.enum(['rect', 'circle', 'line', 'triangle', 'star']),
  width: Percent,
  height: Percent,
  fill: FillSchema.optional(),
  stroke: z.object({
    color: HexColor,
    width: z.number().min(0),
  }).optional(),
  borderRadius: z.number().min(0).optional(),
  rotation: z.number().default(0),
}).describe('Shape element');

const AudioElementSchema = z.object({
  type: z.literal('audio'),
  id: z.string().min(1),
  src: z.string().url(),
  startTime: DurationMs,
  duration: DurationMs,
  volume: z.number().min(0).max(2).default(1),
  fade: z.object({
    fadeIn: DurationMs.optional(),
    fadeOut: DurationMs.optional(),
  }).optional(),
  loop: z.boolean().default(false),
  category: z.enum(['voice', 'music', 'sfx']).optional(),
}).describe('Audio element');

const CompositionElementSchema = BaseElementSchema.extend({
  type: z.literal('composition'),
  src: z.string().describe('Reference to nested ReelDoc id'),
  width: Percent,
  height: Percent,
}).describe('Nested composition element');

const ElementSchema = z.discriminatedUnion('type', [
  VideoElementSchema,
  TextElementSchema,
  ShapeElementSchema,
  AudioElementSchema,
  CompositionElementSchema,
]).describe('ReelDoc element (video | text | shape | audio | composition)');

// ── Brand Kit ────────────────────────────────────────────────────────────────

const FontDefinitionSchema = z.object({
  family: z.string(),
  weights: z.array(z.string()).default(['400']),
  fallback: z.string().default('sans-serif'),
  italic: z.boolean().default(false),
});

const TypographyTokenSchema = z.object({
  fontSize: z.number().min(1),
  fontFamily: z.string(),
  fontWeight: z.string().default('400'),
  lineHeight: z.number().optional(),
  letterSpacing: z.number().optional(),
  textTransform: z.enum(['none', 'uppercase', 'lowercase', 'capitalize']).optional(),
});

const BrandKitSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  colors: z.record(z.string(), HexColor).describe('Named color tokens'),
  fonts: z.record(z.string(), FontDefinitionSchema).optional(),
  typography: z.record(z.string(), TypographyTokenSchema).optional(),
  spacing: z.record(z.string(), z.number()).optional(),
  borderRadius: z.record(z.string(), z.number()).optional(),
  shadows: z.record(z.string(), z.string()).optional(),
}).describe('Brand design tokens');

// ── Animation Library ────────────────────────────────────────────────────────

const BuiltinEffectsSchema = z.object({
  kenBurns: z.boolean().default(false),
  fade: z.boolean().default(false),
  slideIn: z.enum(['none', 'left', 'right', 'up', 'down']).default('none'),
  zoom: z.number().min(1).max(3).default(1),
  chromaticSplit: z.boolean().default(false),
  speedRamp: z.boolean().default(false),
  lightSweep: z.boolean().default(false),
}).partial().optional().describe('Builtin visual effects library');

const EasingLibrarySchema = z.record(
  z.string(),
  z.string().describe('cubic-bezier(...) or named easing'),
).optional().describe('Custom easing definitions');

const PresetAnimationSchema = z.object({
  id: z.string(),
  name: z.string(),
  keyframes: z.array(KeyframeSchema).min(2),
  easing: Easing.default('ease-out'),
  duration: DurationMs,
}).describe('Custom animation preset');

// ── Output Format ────────────────────────────────────────────────────────────

const OutputFormatSchema = z.object({
  aspectRatio: AspectRatio,
  width: z.number().int().min(1),
  height: z.number().int().min(1),
  fps: Fps,
  durationMs: DurationMs.optional().describe('If omitted, auto-expands to longest element'),
}).describe('Render output format');

// ── Z-Index Layers ───────────────────────────────────────────────────────────

const ZIndexLayerSchema = z.object({
  zIndex: z.number().int(),
  label: z.string(),
});

// ── Variables ────────────────────────────────────────────────────────────────

const VariableDefinitionSchema = z.object({
  type: z.enum(['string', 'number', 'boolean', 'color', 'url']),
  required: z.boolean().default(false),
  defaultValue: z.unknown().optional(),
  description: z.string().optional(),
});

// ── Audio Mix ────────────────────────────────────────────────────────────────

const AudioMixSchema = z.object({
  voiceTrack: z.number().min(0).max(1).default(1),
  musicTrack: z.number().min(0).max(1).default(0.25),
  sfxTrack: z.number().min(0).max(1).default(0.6),
}).describe('Global audio mix levels');

// ── Metadata ─────────────────────────────────────────────────────────────────

const MetadataSchema = z.object({
  productId: z.string().optional(),
  campaignId: z.string().optional(),
  brandSlug: z.string().optional(),
  locale: z.string().optional(),
  renderMode: z.enum(['produce', 'campaign', 'preview']).optional(),
  scriptId: z.string().optional(),
}).optional().describe('Lineage metadata for feedback loops');

// ── Root ReelDoc ─────────────────────────────────────────────────────────────

const ReelDocVersionSchema = z.literal('1.0');

export const ReelDocSchema = z.object({
  id: z.string().uuid().describe('Unique document ID'),
  version: ReelDocVersionSchema,
  schemaHash: z.string().min(1).describe('SHA256 of the schema at creation time'),
  created: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}T/)).describe('ISO datetime string'),
  updated: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}T/)).describe('ISO datetime string'),
  title: z.string().min(1),
  description: z.string().optional(),
  outputFormat: OutputFormatSchema,
  elements: z.array(ElementSchema),
  zIndexLayers: z.array(ZIndexLayerSchema).optional(),
  brandKit: BrandKitSchema.optional().describe('Inline brand kit'),
  brandKitId: z.string().uuid().optional().describe('Reference to stored brand kit'),
  animationLibrary: BuiltinEffectsSchema,
  easingLibrary: EasingLibrarySchema,
  customAnimations: z.array(PresetAnimationSchema).optional(),
  variables: z.record(z.string(), VariableDefinitionSchema).optional(),
  audioMix: AudioMixSchema.optional(),
  metadata: MetadataSchema,
}).describe('ReelDoc — declarative JSON document for HIOB video rendering');

// ── Types ────────────────────────────────────────────────────────────────────

export type ReelDoc = z.infer<typeof ReelDocSchema>;
export type Element = z.infer<typeof ElementSchema>;
export type BrandKit = z.infer<typeof BrandKitSchema>;
export type VideoElement = z.infer<typeof VideoElementSchema>;
export type TextElement = z.infer<typeof TextElementSchema>;
export type ShapeElement = z.infer<typeof ShapeElementSchema>;
export type AudioElement = z.infer<typeof AudioElementSchema>;
export type OutputFormat = z.infer<typeof OutputFormatSchema>;
export type BrandKitDefinition = z.infer<typeof BrandKitSchema>;
export type AudioMix = z.infer<typeof AudioMixSchema>;
export type Animation = z.infer<typeof AnimationSchema>;
export type Keyframe = z.infer<typeof KeyframeSchema>;

// ── Validator Function ───────────────────────────────────────────────────────

export function validateReelDoc(
  doc: unknown,
): { ok: true; doc: ReelDoc } | { ok: false; errors: string[] } {
  const result = ReelDocSchema.safeParse(doc);
  if (result.success) {
    return { ok: true, doc: result.data };
  }
  const errors = result.error.errors.map(
    (e) => `${e.path.join('.') || 'root'}: ${e.message}`,
  );
  return { ok: false, errors };
}
