import { z } from 'zod';

// Render contract only. Digests identify upstream receipts; this parser does not
// authenticate them or grant permission to fetch assets or dispatch paid work.
const id = z.string().min(1).max(160);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const frame = z.number().int().min(0).max(2700);
const sample = z.number().int().min(0).max(17_280_000);
const media = {
  id, url: z.string().url().max(4096).refine(value => /^https?:\/\//.test(value), 'HTTP media URL required'),
  sha256: digest,
};
const asset = z.discriminatedUnion('kind', [
  z.object({ ...media, kind: z.literal('image') }).strict(),
  z.object({ ...media, kind: z.literal('video'), durationFrames: z.number().int().positive().max(108000) }).strict(),
  z.object({ ...media, kind: z.literal('audio'), sampleRate: z.number().int().min(8000).max(192000), sampleCount: sample.positive(), sourceTextDigest: digest }).strict(),
]);
const span = { startFrame: frame, endFrame: frame.positive() };

export const frameTimelineSchema = z.object({
  schemaVersion: z.literal('FrameTimeline.v1'),
  scope: z.object({ workspaceId: id, runId: id, revision: z.number().int().positive(), approvalDigest: digest }).strict(),
  // Expand supported rates only together with the renderer and sample fixtures.
  fps: z.object({ numerator: z.literal(30), denominator: z.literal(1) }).strict(),
  width: z.union([z.literal(720), z.literal(1080)]),
  height: z.union([z.literal(1280), z.literal(1920)]),
  locale: z.enum(['ko', 'en']),
  duration: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('exact'), targetFrames: frame.positive() }).strict(),
    z.object({ mode: z.literal('range'), minFrames: frame.positive(), maxFrames: frame.positive() }).strict(),
  ]),
  totalFrames: frame.positive(),
  narrativeUnits: z.array(z.object({ id, text: z.string().min(1).max(2000), sourceTextDigest: digest, evidenceIds: z.array(id).min(1).max(64) }).strict()).min(1).max(64),
  assets: z.array(asset).min(1).max(128),
  pictures: z.array(z.object({ id, assetId: id, narrativeId: id, ...span, sourceStartFrame: z.number().int().min(0).max(108000) }).strict()).min(1).max(256),
  narration: z.array(z.object({ id, assetId: id, narrativeIds: z.array(id).min(1).max(64), sourceTextDigest: digest, alignmentDigest: digest, ...span }).strict()).min(1).max(64),
  captions: z.array(z.object({ id, narrationId: id, text: z.string().min(1).max(240), startSample: sample, endSample: sample.positive() }).strict()).max(512),
}).strict();

export type FrameTimeline = z.infer<typeof frameTimelineSchema>;
export type FrameAsset = FrameTimeline['assets'][number];
export type FrameCaption = FrameTimeline['captions'][number] & { startFrame: number; endFrame: number };
export type CompiledFrameTimeline = Omit<FrameTimeline, 'captions'> & { captions: FrameCaption[] };

function requireCondition(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(`FRAME_TIMELINE_${code}`);
}

function indexById<T extends { id: string }>(entries: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const entry of entries) {
    requireCondition(!map.has(entry.id), 'DUPLICATE_ID');
    map.set(entry.id, entry);
  }
  return map;
}

function ordered<T extends { startFrame: number; endFrame: number }>(entries: T[]): T[] {
  return [...entries].sort((a, b) => a.startFrame - b.startFrame);
}

/** Validates independent lanes and resolves caption sample boundaries once.
 * Audio assets are whole measured takes in v1; no speech trimming or retiming.
 * A caller must separately verify receipt authority and asset bytes/metadata.
 */
export function compileFrameTimeline(input: unknown): CompiledFrameTimeline {
  const timeline = frameTimelineSchema.parse(input);
  const { totalFrames, duration } = timeline;
  requireCondition(timeline.width * 16 === timeline.height * 9, 'DIMENSIONS');
  requireCondition(duration.mode === 'exact'
    ? totalFrames === duration.targetFrames
    : duration.minFrames <= totalFrames && totalFrames <= duration.maxFrames, 'DURATION_PROFILE_MISMATCH');

  const assets = indexById(timeline.assets);
  const ideas = indexById(timeline.narrativeUnits);
  const voices = indexById(timeline.narration);
  // IDs are globally unique among placed clips, even across lanes.
  indexById([...timeline.pictures, ...timeline.narration, ...timeline.captions]);
  const pictures = ordered(timeline.pictures);
  let cursor = 0;
  for (const cut of pictures) {
    requireCondition(cut.startFrame === cursor && cut.endFrame > cut.startFrame, 'PICTURE_COVERAGE');
    const source = assets.get(cut.assetId);
    requireCondition(source?.kind === 'image' || source?.kind === 'video', 'PICTURE_ASSET');
    requireCondition(ideas.has(cut.narrativeId), 'NARRATIVE_REFERENCE');
    if (source.kind === 'video') {
      requireCondition(cut.sourceStartFrame + cut.endFrame - cut.startFrame <= source.durationFrames, 'SOURCE_TRIM_OVERFLOW');
    } else {
      requireCondition(cut.sourceStartFrame === 0, 'IMAGE_SOURCE_TRIM');
    }
    cursor = cut.endFrame;
  }
  requireCondition(cursor === totalFrames, 'PICTURE_COVERAGE');

  const narration = ordered(timeline.narration);
  cursor = 0;
  for (const voice of narration) {
    const source = assets.get(voice.assetId);
    requireCondition(source?.kind === 'audio', 'NARRATION_ASSET');
    requireCondition(voice.narrativeIds.every(key => ideas.has(key)), 'NARRATIVE_REFERENCE');
    requireCondition(source.sourceTextDigest === voice.sourceTextDigest, 'SOURCE_TEXT_MISMATCH');
    requireCondition(voice.startFrame >= cursor, 'NARRATION_OVERLAP');
    requireCondition(voice.endFrame > voice.startFrame && voice.endFrame <= totalFrames, 'NARRATION_RANGE');
    const availableFrames = voice.endFrame - voice.startFrame;
    // Integer products test sample fit BEFORE any frame rounding. 48.005 s
    // must never be accepted as exact 48 s by rounding down its duration.
    requireCondition(source.sampleCount * 30 <= availableFrames * source.sampleRate, 'NARRATION_SAMPLE_OVERFLOW');
    requireCondition(availableFrames === Math.ceil(source.sampleCount * 30 / source.sampleRate), 'NARRATION_WINDOW_MISMATCH');
    cursor = voice.endFrame;
  }

  const captions = timeline.captions.map(cue => {
    const voice = voices.get(cue.narrationId);
    requireCondition(voice, 'CAPTION_NARRATION');
    const source = assets.get(voice.assetId);
    requireCondition(source?.kind === 'audio', 'NARRATION_ASSET');
    requireCondition(cue.startSample < cue.endSample && cue.endSample <= source.sampleCount, 'CAPTION_SAMPLE_RANGE');
    // Both endpoints use the same quantizer, so shared cue boundaries remain
    // shared. Only the whole AUDIO window is ceiled to preserve the last sample.
    const startFrame = voice.startFrame + Math.floor(cue.startSample * 30 / source.sampleRate);
    const endFrame = voice.startFrame + Math.floor(cue.endSample * 30 / source.sampleRate);
    requireCondition(endFrame > startFrame, 'CAPTION_SUBFRAME');
    return { ...cue, startFrame, endFrame };
  });
  const samplesByVoice = new Map<string, typeof timeline.captions>();
  for (const cue of timeline.captions) {
    const group = samplesByVoice.get(cue.narrationId) ?? [];
    group.push(cue); samplesByVoice.set(cue.narrationId, group);
  }
  for (const cues of samplesByVoice.values()) {
    let lastSample = 0;
    for (const cue of cues.sort((a, b) => a.startSample - b.startSample)) {
      requireCondition(cue.startSample >= lastSample, 'CAPTION_OVERLAP');
      lastSample = cue.endSample;
    }
  }
  const sortedCaptions = ordered(captions);
  cursor = 0;
  for (const cue of sortedCaptions) {
    requireCondition(cue.startFrame >= cursor, 'CAPTION_OVERLAP');
    cursor = cue.endFrame;
  }
  return { ...timeline, pictures, narration, captions: sortedCaptions };
}
