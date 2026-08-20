import { describe, expect, test } from 'vitest';

import * as publicApi from './index.ts';
import { BeatPlanListSchema, BeatPlanSchema } from './beat-plan.ts';
import { CAPTION_DEFAULTS, resolveCaptionHoldMs, resolveCaptionLagMs } from './caption-defaults.ts';
import { msToFrames, timelineToRenderProps } from './remotion-adapter.ts';
import { validateReelDoc } from './schema/reelDocSchema.ts';
import {
  buildProjectFile,
  parseProjectFile,
  serializeProjectFile,
  sha256Hex,
} from './serialize.ts';
import type { Asset, Clip, Timeline, TimelineTrack } from './types.ts';

const NOW = '2026-08-20T00:00:00.000Z';

function clip(id: string, overrides: Partial<Clip> = {}): Clip {
  return {
    id,
    trackId: 'track',
    assetId: null,
    startMs: 0,
    durationMs: 1_000,
    inMs: 0,
    transforms: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
    effects: [],
    keyframes: [],
    locked: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function track(
  id: string,
  kind: TimelineTrack['kind'],
  clips: Clip[],
  overrides: Partial<TimelineTrack> = {},
): TimelineTrack {
  return {
    id,
    timelineId: 'timeline',
    kind,
    label: id,
    zIndex: 1,
    ord: 0,
    muted: false,
    locked: false,
    visible: true,
    clips,
    ...overrides,
  };
}

function timeline(tracks: TimelineTrack[], overrides: Partial<Timeline> = {}): Timeline {
  return {
    id: 'timeline',
    runId: 'run',
    fps: 30,
    width: 1080,
    height: 1920,
    durationMs: 12_000,
    aspect: '9:16',
    markers: [],
    mix: { voice: 0.8, music: 0.25, sfx: 0.6 },
    tracks,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('timeline render contract', () => {
  test('flattens, sorts, resolves assets, locale, and every volume source', () => {
    const assets: Asset[] = [
      { id: 'asset', artifactId: 'artifact', kind: 'video', url: 'https://example.com/video.mp4' },
    ];
    const tracks = [
      track('video', 'video', [clip('video', { assetId: 'asset', beatIndex: 2, textContent: 'copy' })], {
        ord: 5,
        zIndex: 9,
      }),
      track('audio', 'audio', [clip('audio')], { ord: 1 }),
      track('music', 'music', [clip('music')], { ord: 2 }),
      track('sfx', 'sfx', [clip('sfx')], { ord: 3 }),
      track('muted', 'audio', [clip('muted')], { ord: 4, muted: true }),
      track('explicit', 'audio', [clip('explicit', { volume: 0.42, assetId: 'missing' })], { ord: 0 }),
    ];
    const result = timelineToRenderProps(timeline(tracks, { locale: 'en' }), assets);
    expect(result.locale).toBe('en');
    expect(result.clips.map((item) => item.id)).toEqual([
      'explicit',
      'audio',
      'music',
      'sfx',
      'muted',
      'video',
    ]);
    expect(result.clips.map((item) => item.volume)).toEqual([0.42, 0.8, 0.25, 0.6, 0, undefined]);
    expect(result.clips.at(-1)).toMatchObject({
      assetKind: 'video',
      url: 'https://example.com/video.mp4',
      zIndex: 9,
      beatIndex: 2,
      textContent: 'copy',
    });
    expect(result.clips[0].url).toBeUndefined();
  });

  test('defaults an absent locale and clamps frame conversion', () => {
    expect(timelineToRenderProps(timeline([]), []).locale).toBeNull();
    expect(msToFrames(1_000, 30)).toBe(30);
    expect(msToFrames(-1_000, 30)).toBe(0);
  });
});

describe('.hiob serialization', () => {
  test('builds defaults and preserves explicit history', () => {
    const base = timeline([]);
    const defaultFile = buildProjectFile({ runId: 'run', timeline: base, assets: [], agentTeam: null });
    expect(defaultFile.schemaVersion).toBe(1);
    expect(defaultFile.renderHistory).toEqual([]);
    expect(defaultFile.exportedAt).toEqual(expect.any(String));

    const history = [{ snapshotId: 'snapshot', renderedAt: NOW, status: 'ready' as const }];
    const explicit = buildProjectFile({
      runId: 'run',
      timeline: base,
      assets: [],
      agentTeam: null,
      renderHistory: history,
      label: 'Project',
    });
    expect(explicit.renderHistory).toBe(history);
    expect(parseProjectFile(serializeProjectFile(explicit))).toEqual(explicit);
  });

  test('rejects unsupported and malformed files', () => {
    expect(() => parseProjectFile('{"schemaVersion":2}')).toThrow('Unsupported .hiob schema version: 2');
    expect(() => parseProjectFile('null')).toThrow('Unsupported .hiob schema version: undefined');
    expect(() => parseProjectFile('{"schemaVersion":1}')).toThrow('missing timeline.tracks');
    expect(() => parseProjectFile('{"schemaVersion":1,"timeline":{"tracks":{}}}')).toThrow(
      'missing timeline.tracks',
    );
  });

  test('creates a deterministic SHA-256 digest', async () => {
    await expect(sha256Hex('abc')).resolves.toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('caption and beat contracts', () => {
  test('resolves explicit and default caption timings', () => {
    expect(Object.keys(CAPTION_DEFAULTS)).toHaveLength(6);
    expect(resolveCaptionLagMs('pd-aside', undefined)).toBe(CAPTION_DEFAULTS['pd-aside'].lagAfterAudioMs);
    expect(resolveCaptionLagMs(undefined, undefined)).toBe(CAPTION_DEFAULTS['speaker-dialogue'].lagAfterAudioMs);
    expect(resolveCaptionLagMs('reaction', 0)).toBe(0);
    expect(resolveCaptionHoldMs('footnote', undefined)).toBe(CAPTION_DEFAULTS.footnote.holdMs);
    expect(resolveCaptionHoldMs(undefined, undefined)).toBe(CAPTION_DEFAULTS['speaker-dialogue'].holdMs);
    expect(resolveCaptionHoldMs('reaction', 1)).toBe(1);
  });

  test('parses defaulted and complete beat plans', () => {
    expect(BeatPlanSchema.parse({ beat_index: 0 })).toMatchObject({
      beat_index: 0,
      emotion: '인간',
      caption_type: 'speaker-dialogue',
    });
    const beat = BeatPlanSchema.parse({
      beat_index: 1,
      emotion: 'joy',
      logic_function: 'hook',
      shot_type: 'close-up',
      render_mode: 'video',
      persona_id: 'persona',
      voice_concept: 'bright',
      caption_text: 'Hello',
      caption_type: 'reaction',
      sfx_cue: 'pop',
      music_intensity: 'high',
      social_proof_wording: 'proof',
      social_proof_attribution: 'source',
      proof_asset_id: 'asset',
      proof_headline: 'headline',
    });
    expect(BeatPlanListSchema.parse([beat])).toEqual([beat]);
    expect(() => BeatPlanSchema.parse({ beat_index: -1 })).toThrow();
  });
});

test('public API and root schema failure remain available', () => {
  expect(publicApi.HIOB_SCHEMA_VERSION).toBe(1);
  expect(publicApi.timelineToRenderProps).toBe(timelineToRenderProps);
  expect(publicApi.interpolateTemplate({ headline: 'before {{unfinished' }, {})).toEqual({
    headline: 'before {{unfinished',
  });
  expect(validateReelDoc(null)).toMatchObject({ ok: false, errors: [expect.stringContaining('root:')] });
});
