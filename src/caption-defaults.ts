/**
 * EDIT-2.1: Per-type caption defaults (§3.2 Engine Integration Spec / Grammar §I.1).
 *
 * Consumed by:
 *   - TimelineCompositionV2 (renderer) — to style caption clips by type
 *   - team_orchestrator.py (Python mirror in caption_encoder.py) — for server-side defaults
 *   - studio editor inspector — to show type-specific style hints
 *
 * Override order (highest wins):
 *   clip.attributes.caption_lag_ms > CAPTION_DEFAULTS[type].lagAfterAudioMs
 *   clip.attributes.caption_hold_ms > CAPTION_DEFAULTS[type].holdMs
 *   clip.attributes.caption_entrance_effect > CAPTION_DEFAULTS[type].entranceEffect
 */
import type { CaptionConfig, CaptionType } from './types';

export const CAPTION_DEFAULTS: Record<CaptionType, CaptionConfig> = {
  'speaker-dialogue': {
    fontFamily: 'Yoon Gothic',
    fontWeight: 400,
    fontSize: 40,
    outlineWidth: 2,
    color: '#FFFFFF',
    position: 'lower-third-center',
    entranceEffect: 'pop',
    entranceDurationMs: 0,
    holdMs: 2000,
    exitDurationMs: 200,
    lagAfterAudioMs: 0,
  },

  'pd-aside': {
    fontFamily: 'Gossi-Cheong',
    fontWeight: 700,
    fontSize: 48,
    outlineWidth: 5,
    color: '#FFFFFF',
    position: 'lower-third-left',
    entranceEffect: 'fade-in',
    entranceDurationMs: 300,
    holdMs: 2500,
    exitDurationMs: 200,
    lagAfterAudioMs: 350,
  },

  'reaction': {
    fontFamily: 'Yoon Gothic',
    fontWeight: 700,
    fontSize: 44,
    outlineWidth: 3,
    color: '#FFFF33',
    position: 'center-left',
    entranceEffect: 'slide-in',
    entranceDurationMs: 300,
    holdMs: 2400,
    exitDurationMs: 150,
    lagAfterAudioMs: 150,
  },

  'inner-thought': {
    fontFamily: 'Yoon Gothic',
    fontWeight: 300,
    fontSize: 36,
    outlineWidth: 1,
    color: '#DDEEFF',
    position: 'upper-center',
    entranceEffect: 'fade-in',
    entranceDurationMs: 400,
    holdMs: 2000,
    exitDurationMs: 300,
    lagAfterAudioMs: 0,
  },

  'footnote': {
    fontFamily: 'Yoon Gothic',
    fontWeight: 300,
    fontSize: 28,
    outlineWidth: 1,
    color: '#CCCCCC',
    position: 'top-right',
    entranceEffect: 'fade-in',
    entranceDurationMs: 200,
    holdMs: 3000,
    exitDurationMs: 200,
    lagAfterAudioMs: 0,
  },

  'sfx-emoji': {
    fontFamily: 'system-ui, sans-serif',
    fontWeight: 400,
    fontSize: 64,
    outlineWidth: 0,
    color: '#FFFFFF',
    position: 'center',
    entranceEffect: 'pop',
    entranceDurationMs: 80,
    holdMs: 1500,
    exitDurationMs: 150,
    lagAfterAudioMs: 0,
  },
};

/** Resolve the effective lag for a caption clip (clip override > type default). */
export function resolveCaptionLagMs(
  captionType: CaptionType | undefined,
  clipLagMs: number | undefined,
): number {
  if (clipLagMs != null) return clipLagMs;
  return CAPTION_DEFAULTS[captionType ?? 'speaker-dialogue'].lagAfterAudioMs;
}

/** Resolve the effective hold for a caption clip (clip override > type default). */
export function resolveCaptionHoldMs(
  captionType: CaptionType | undefined,
  clipHoldMs: number | undefined,
): number {
  if (clipHoldMs != null) return clipHoldMs;
  return CAPTION_DEFAULTS[captionType ?? 'speaker-dialogue'].holdMs;
}
