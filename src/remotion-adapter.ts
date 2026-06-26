/**
 * Adapts a Timeline (editor model) into Remotion-friendly props.
 *
 * Same input drives:
 *   - <Player /> in the Studio (instant preview)
 *   - Remotion Lambda (final MP4)
 *
 * Keeping this conversion in one place is the contract that makes WYSIWYG real:
 * if preview looks right, the render is the same.
 */
import type { Timeline, Clip, Asset, TimelineTrack } from './types';

export interface RenderClip {
  id: string;
  trackKind: TimelineTrack['kind'];
  assetKind?: Asset['kind'];
  zIndex: number;
  /** absolute timeline position */
  startMs: number;
  durationMs: number;
  beatIndex?: number;
  /** trim into the source */
  inMs: number;
  outMs?: number;
  /** flattened asset */
  url?: string;
  textContent?: string;
  wordTimings?: Clip['wordTimings'];
  transforms: Clip['transforms'];
  effects: Clip['effects'];
  keyframes: Clip['keyframes'];
  attributes?: Clip['attributes'];
  volume?: number;
}

export interface BeatMarker {
  id: string;
  beatIndex: number;
  /** Cumulative start time computed from actual TTS durations (EDIT-1.2). */
  timeMs: number;
  /** Actual TTS speech duration + breath cushion for this beat (EDIT-1.1/1.2). */
  durationMs: number;
  label?: string;
}

export interface RenderProps {
  fps: number;
  width: number;
  height: number;
  durationMs: number;
  aspect: Timeline['aspect'];
  mix: Timeline['mix'];
  clips: RenderClip[];
  /**
   * EDIT-1.2: variable-length beat markers. When present, each marker carries
   * durationMs (actual TTS duration) and timeMs (cumulative start). The renderer
   * uses these to compute beat indices and the total composition length.
   * Absent ⇒ renderer falls back to BEAT_MS=1000 fixed-length beats.
   */
  beatMarkers?: BeatMarker[] | null;
  /**
   * i18n axis (Phase 0): canonical locale code threaded to the composition so
   * caption typography + line-breaking switch per locale. Absent/null ⇒ ko
   * (byte-identical to the legacy render). See @hiob/compositions localeConfig.
   */
  locale?: string | null;
}

export function timelineToRenderProps(timeline: Timeline, assets: Asset[]): RenderProps {
  const assetById = new Map(assets.map((a) => [a.id, a] as const));
  const clips: RenderClip[] = [];

  // sort tracks by ord, then by z-index inside
  const tracks = [...timeline.tracks].sort((a, b) => a.ord - b.ord);
  for (const track of tracks) {
    if (!track.visible || track.muted && (track.kind === 'audio' || track.kind === 'music' || track.kind === 'sfx')) {
      // muted audio tracks still flow through so previews can show them as silent
      // (the renderer sets volume to 0 in that case)
    }
    for (const clip of track.clips) {
      const asset = clip.assetId ? assetById.get(clip.assetId) : undefined;
      clips.push({
        id: clip.id,
        trackKind: track.kind,
        assetKind: asset?.kind,
        zIndex: track.zIndex,
        startMs: clip.startMs,
        durationMs: clip.durationMs,
        beatIndex: clip.beatIndex,
        inMs: clip.inMs,
        outMs: clip.outMs,
        url: asset?.url,
        textContent: clip.textContent,
        wordTimings: clip.wordTimings,
        transforms: clip.transforms,
        effects: clip.effects,
        keyframes: clip.keyframes,
        attributes: clip.attributes,
        volume:
          track.muted ? 0
          : clip.volume != null ? clip.volume
          : track.kind === 'audio' ? timeline.mix.voice
          : track.kind === 'music' ? timeline.mix.music
          : track.kind === 'sfx'   ? timeline.mix.sfx
          : undefined,
      });
    }
  }

  return {
    fps: timeline.fps,
    width: timeline.width,
    height: timeline.height,
    durationMs: timeline.durationMs,
    aspect: timeline.aspect,
    mix: timeline.mix,
    clips,
    locale: timeline.locale ?? null,
  };
}

export function msToFrames(ms: number, fps: number): number {
  return Math.max(0, Math.round((ms / 1000) * fps));
}
