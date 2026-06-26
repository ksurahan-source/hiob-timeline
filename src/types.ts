/**
 * Timeline-native types. Shared by studio editor + renderer + modal workers.
 *
 * Mental model:
 *   Timeline → many TimelineTrack → many Clip
 *   Clip references an Asset (the actual media bytes).
 *
 * Beats are markers on the Timeline, not a separate axis. Clips can snap to
 * markers but are not bound to them — that's what makes the editor an editor.
 */

export type TrackKind = 'video' | 'audio' | 'caption' | 'overlay' | 'music' | 'sfx' | 'title';
export type Aspect = '9:16' | '16:9' | '1:1';

// EDIT-4.1: emotion taxonomy driving emoji overlay selection (§4 Engine Integration Spec)
export type EmotionCode = 'joy' | 'surprise' | 'energy' | 'warmth' | 'magic' | 'validation' | 'sadness' | 'calm';

// EDIT-2.1: semantic role taxonomy for caption clips (§3.2 Engine Integration Spec)
export type CaptionType =
  | 'speaker-dialogue'  // primary narration voice (default)
  | 'pd-aside'          // PD annotator / editorial comment
  | 'reaction'          // emotional reaction label
  | 'inner-thought'     // subject's inner monologue
  | 'footnote'          // small contextual note (top-right)
  | 'sfx-emoji';        // SFX marker or emoji overlay

export type CaptionEntranceEffect = 'pop' | 'fade-in' | 'slide-in' | 'type-on' | 'bounce';
export type CaptionPosition =
  | 'lower-third-center' | 'lower-third-left' | 'lower-third-right'
  | 'center' | 'center-left' | 'upper-center' | 'top-right';

export interface CaptionConfig {
  fontFamily: string;
  fontWeight: 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
  fontSize: number;
  outlineWidth: number;
  color: string;
  position: CaptionPosition;
  entranceEffect: CaptionEntranceEffect;
  /** ms — 0 = instant pop */
  entranceDurationMs: number;
  /** ms the caption stays fully visible */
  holdMs: number;
  /** ms fade/slide out */
  exitDurationMs: number;
  /** ms after audio word start before caption appears */
  lagAfterAudioMs: number;
}

export interface Marker {
  id: string;
  /** ms from timeline start */
  timeMs: number;
  label?: string;
  /** beat index if this marker is a beat boundary */
  beatIndex?: number;
  color?: string;
}

export interface Mix {
  voice: number;
  music: number;
  sfx: number;
  /** Auto-duck music under voice clips when true. */
  autoDuck?: boolean;
  /** Duck depth 0..1: how much to attenuate music during voice (default 0.7 → reduce to 30%). */
  duck?: number;
}

export interface Transforms {
  /** -1..1, normalized horizontal offset */
  x: number;
  y: number;
  scale: number;
  rotation: number;
  /** 0..1 */
  opacity: number;
  anchorX?: number;
  anchorY?: number;
}

export type EffectKind =
  | 'fade-in' | 'fade-out'
  | 'zoom-in' | 'zoom-out' | 'ken-burns'
  | 'blur' | 'glow' | 'shake' | 'grain' | 'vignette'
  | 'glitch' | 'light-leak' | 'vhs-scanline' | 'particle'
  | 'proof-frame'
  | 'caption-pop' | 'caption-typewriter' | 'caption-border-sticker' | 'caption-style'
  | 'caption-glow' | 'caption-flame' | 'sticker' | 'watermark'
  | 'transition' | 'filter' | 'adjust' // Phase 15 G1/G2/G3 — transition, color look, color grade
  | 'speed-ramp' | 'chromatic-split' | 'light-sweep' // visual_editor 2026-06-16 — editorial whip, RGB-split fringe, specular glint sweep
  | 'emoji-overlay'; // EDIT-4.1: emotion-driven emoji overlay (pop/scale-pop/bounce)

export interface Effect {
  kind: EffectKind;
  /** ms relative to clip start */
  inMs?: number;
  outMs?: number;
  params?: Record<string, number | string | boolean>;
}

export interface Keyframe {
  property: 'x' | 'y' | 'scale' | 'rotation' | 'opacity' | 'volume';
  /** ms relative to clip start */
  timeMs: number;
  value: number;
  easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
}

export interface WordTiming {
  text: string;
  /** ms relative to the caption/audio clip start */
  startMs: number;
  endMs: number;
}

export interface Asset {
  id: string;
  /** which artifact row this points at (canonical store) */
  artifactId: string;
  kind: 'image' | 'video' | 'audio' | 'text';
  url?: string;
  durationMs?: number;
  width?: number;
  height?: number;
  /** which agent role produced this — surfaces in asset bin */
  producedByRole?: string;
  /** thumbnail / preview text */
  thumbnailUrl?: string;
  previewText?: string;
  title?: string;
  category?: string;
  roleCode?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface Clip {
  id: string;
  trackId: string;
  /** asset reference; null = placeholder clip (e.g. text-only caption) */
  assetId: string | null;
  /** absolute position on the timeline */
  startMs: number;
  durationMs: number;
  /** stable beat identity for generated beat clips */
  beatIndex?: number;
  /** trim into the source asset */
  inMs: number;
  outMs?: number;
  transforms: Transforms;
  effects: Effect[];
  keyframes: Keyframe[];
  attributes?: Record<string, unknown> & {
    /** LOOP_COMPOSE grammar consumed by the shared Remotion composition. */
    scene_type?: 'hook' | 'narrator' | 'proof' | 'product' | 'cta';
    scene_layer?: 'background' | 'hero' | 'narrator' | 'caption' | 'audio';
    scene_role?: string;
    logic_function?: string;
    // EDIT-2.1: caption type taxonomy (§3.2 Engine Integration Spec)
    caption_type?: CaptionType;
    caption_entrance_effect?: CaptionEntranceEffect;
    caption_emphasis_words?: string[];
    /** explicit hold duration in ms; overrides CAPTION_DEFAULTS[type].holdMs */
    caption_hold_ms?: number;
    /** explicit lag in ms relative to audio start; overrides CAPTION_DEFAULTS[type].lagAfterAudioMs */
    caption_lag_ms?: number;
    /** narrator beat index stamped by compose_and_render_v2 (EDIT-1.2) */
    narrator_beat_index?: number;
    // EDIT-3.2: J/L cut audio lead/lag
    /** J-cut: audio starts this many ms before the beat's video start */
    audio_lead_ms?: number;
    /** L-cut: audio starts this many ms after the beat's video start */
    audio_lag_ms?: number;
    // EDIT-4.1: emotion + emoji overlay attrs
    emotion?: EmotionCode;
    /** resolved emoji character, e.g. '😂'; drives emoji-overlay effect */
    emotion_emoji?: string;
    emoji_mode?: 'inline' | 'floating' | 'sticker';
    /** absolute position or named slot ('top-right' | 'bottom-center') */
    emoji_position?: { x: number; y: number } | 'top-right' | 'bottom-center';
    /** ms after clip start when emoji appears (default: 0) */
    emoji_entrance_ms?: number;
    /** how long the emoji stays visible in ms (default: 500) */
    emoji_hold_ms?: number;
  };
  /** inline text for caption/overlay clips that don't need an asset */
  textContent?: string;
  /** word-level speech alignment for karaoke captions */
  wordTimings?: WordTiming[];
  /** 0..1 per-clip volume, overrides track mix */
  volume?: number;
  locked: boolean;
  originCallId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TimelineTrack {
  id: string;
  timelineId: string;
  kind: TrackKind;
  label: string;
  zIndex: number;
  ord: number;
  muted: boolean;
  locked: boolean;
  visible: boolean;
  clips: Clip[];
}

export interface Timeline {
  id: string;
  runId: string;
  /**
   * i18n axis (Phase 0): canonical locale code (ko/en/zh-Hant-TW/...) sourced
   * from run.brief.locale. ADDITIVE — absent/null reproduces today's ko render
   * byte-identically (the renderer's resolveLocaleConfig defaults to ko).
   */
  locale?: string | null;
  fps: number;
  width: number;
  height: number;
  durationMs: number;
  aspect: Aspect;
  markers: Marker[];
  mix: Mix;
  tracks: TimelineTrack[];
  /** ISO 639-1 language code for rendering locale (e.g., 'ko', 'en', 'zh'); defaults to 'ko'. */
  locale?: string;
  createdAt: string;
  updatedAt: string;
}

// --------------------------------------------------------------
// Agent team types (mirrors agent_team / agent_call tables)
// --------------------------------------------------------------

export type AgentRoleCode =
  | 'pd' | 'researcher' | 'marketer'
  | 'scriptwriter' | 'art_director' | 'sound_designer'
  | 'editor' | 'qa'
  | 'visual_editor'; // 2026-06-16 — per-beat cinematic accent selection (see migration 0048)

export type AgentCallStatus =
  | 'queued' | 'running' | 'ok' | 'error' | 'cancelled' | 'skipped';

export interface AgentRole {
  code: AgentRoleCode;
  displayName: string;
  description: string;
  defaultOrder: number;
  producesTrack: TrackKind | null;
}

export interface AgentCall {
  id: string;
  teamId: string;
  roleCode: AgentRoleCode;
  parentCallId: string | null;
  stepIndex: number;
  status: AgentCallStatus;
  input: unknown;
  output: unknown;
  model: string | null;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  startedAt: string | null;
  endedAt: string | null;
  durationMs: number | null;
  error: { message: string } | null;
}

export interface AgentTeam {
  id: string;
  runId: string;
  keyword: string;
  status: 'assembling' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  startedAt: string;
  endedAt: string | null;
  calls: AgentCall[];
}

// --------------------------------------------------------------
// .hiob file format — single-file project export (req #5)
// --------------------------------------------------------------

export const HIOB_SCHEMA_VERSION = 1 as const;

export interface ProjectFilePayload {
  schemaVersion: typeof HIOB_SCHEMA_VERSION;
  runId: string;
  label?: string;
  timeline: Timeline;
  assets: Asset[];
  agentTeam: AgentTeam | null;
  /** ids of composition_snapshot rows already rendered from this project */
  renderHistory: Array<{
    snapshotId: string;
    renderedAt: string;
    status: 'pending' | 'rendering' | 'ready' | 'failed';
    outputUrl?: string;
  }>;
  exportedAt: string;
}
