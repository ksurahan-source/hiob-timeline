import assert from 'node:assert/strict';
import { test } from 'vitest';
import { compileFrameTimeline } from '../frame-timeline.ts';

const hash = 'a'.repeat(64);
export function fixture(seconds = 48) {
  const frames = seconds * 30;
  return {
    schemaVersion: 'FrameTimeline.v1',
    scope: { workspaceId: 'workspace', runId: 'run', revision: 1, approvalDigest: hash },
    fps: { numerator: 30, denominator: 1 }, width: 720, height: 1280, locale: 'ko',
    duration: { mode: 'exact', targetFrames: frames }, totalFrames: frames,
    narrativeUnits: [{ id: 'idea', text: 'A sentence across picture cuts.', sourceTextDigest: hash, evidenceIds: ['evidence'] }],
    assets: [
      { id: 'image', kind: 'image', url: 'https://assets.example/image.png', sha256: hash },
      { id: 'voice', kind: 'audio', url: 'https://assets.example/voice.wav', sha256: hash, sampleRate: 48000, sampleCount: seconds * 48000, sourceTextDigest: hash },
    ],
    pictures: [
      { id: 'p1', assetId: 'image', narrativeId: 'idea', startFrame: 0, endFrame: 24, sourceStartFrame: 0 },
      { id: 'p2', assetId: 'image', narrativeId: 'idea', startFrame: 24, endFrame: frames, sourceStartFrame: 0 },
    ],
    narration: [{ id: 'n1', assetId: 'voice', narrativeIds: ['idea'], sourceTextDigest: hash, alignmentDigest: hash, startFrame: 0, endFrame: frames }],
    captions: [
      { id: 'c1', narrationId: 'n1', text: 'A sentence', startSample: 0, endSample: 326400 },
      { id: 'c2', narrationId: 'n1', text: 'across picture cuts.', startSample: 326400, endSample: 480000 },
    ],
  };
}

test('continuous narration and captions cross picture cuts without slot padding', () => {
  const input = fixture();
  const before = structuredClone(input);
  const result = compileFrameTimeline(input);
  assert.equal(result.totalFrames, 1440);
  assert.equal(result.pictures.length, 2);
  assert.equal(result.narration.length, 1);
  assert.equal(result.captions[0].endFrame, 204);
  assert.equal(result.captions[1].startFrame, 204);
  assert.deepEqual(input, before);
});

for (const seconds of [15, 30, 48, 60]) {
  test(`${seconds} seconds uses the same frame contract`, () => {
    assert.equal(compileFrameTimeline(fixture(seconds)).totalFrames, seconds * 30);
  });
}

test('sample fit rejects 48.005 seconds even if frame rounding would fit', () => {
  const input = fixture();
  input.assets[1].sampleCount! += 240;
  assert.throws(() => compileFrameTimeline(input), /NARRATION_SAMPLE_OVERFLOW/);
});

test('3.001 seconds spans visual cuts and needs 91 frames', () => {
  const input = fixture();
  input.assets[1].sampleCount = 144048;
  input.narration[0].endFrame = 91;
  input.captions = [{ id: 'c1', narrationId: 'n1', text: 'Longer than three seconds', startSample: 0, endSample: 144048 }];
  assert.equal(compileFrameTimeline(input).narration[0].endFrame, 91);
  input.narration[0].endFrame = 90;
  assert.throws(() => compileFrameTimeline(input), /NARRATION_SAMPLE_OVERFLOW/);
});

test('range duration is explicit and preserves the final speech sample', () => {
  const input: any = fixture();
  input.duration = { mode: 'range', minFrames: 1350, maxFrames: 1650 };
  input.assets[1].sampleCount += 240;
  input.totalFrames = 1441;
  input.pictures[1].endFrame = 1441;
  input.narration[0].endFrame = 1441;
  assert.equal(compileFrameTimeline(input).totalFrames, 1441);
  input.duration.maxFrames = 1440;
  assert.throws(() => compileFrameTimeline(input), /DURATION_PROFILE_MISMATCH/);
});

const invalid: [string, (x: any) => void, RegExp][] = [
  ['picture gap', x => x.pictures[1].startFrame++, /PICTURE_COVERAGE/],
  ['picture overlap', x => x.pictures[1].startFrame--, /PICTURE_COVERAGE/],
  ['duplicate asset', x => x.assets.push(x.assets[0]), /DUPLICATE_ID/],
  ['duplicate cut', x => x.pictures[1].id = 'p1', /DUPLICATE_ID/],
  ['missing source', x => x.pictures[0].assetId = 'absent', /PICTURE_ASSET/],
  ['wrong source kind', x => x.pictures[0].assetId = 'voice', /PICTURE_ASSET/],
  ['missing idea', x => x.pictures[0].narrativeId = 'absent', /NARRATIVE_REFERENCE/],
  ['wrong narration kind', x => x.narration[0].assetId = 'image', /NARRATION_ASSET/],
  ['source text changed', x => x.narration[0].sourceTextDigest = 'b'.repeat(64), /SOURCE_TEXT_MISMATCH/],
  ['overlapping narration', x => x.narration.push({ ...x.narration[0], id: 'n2' }), /NARRATION_OVERLAP/],
  ['caption beyond speech', x => x.captions[1].endSample = 2400000, /CAPTION_SAMPLE_RANGE/],
  ['caption without speech', x => x.captions[0].narrationId = 'absent', /CAPTION_NARRATION/],
  ['overlapping captions', x => x.captions[1].startSample--, /CAPTION_OVERLAP/],
  ['exact duration mismatch', x => x.duration.targetFrames++, /DURATION_PROFILE_MISMATCH/],
  ['unknown version', x => x.schemaVersion = 'FrameTimeline.v2', /Invalid literal/],
  ['fractional frame', x => x.pictures[0].endFrame = 23.9, /integer/],
  ['unknown field', x => x.providerOverride = true, /Unrecognized key/],
];
for (const [name, mutate, error] of invalid) {
  test(`rejects ${name}`, () => {
    const input = fixture(); mutate(input);
    assert.throws(() => compileFrameTimeline(input), error);
  });
}

test('one generated video can supply multiple cuts with bounded source trims', () => {
  const input: any = fixture();
  input.assets[0] = { ...input.assets[0], kind: 'video', durationFrames: 1440 };
  input.pictures[1].sourceStartFrame = 24;
  assert.equal(compileFrameTimeline(input).pictures[1].sourceStartFrame, 24);
  input.pictures[1].sourceStartFrame = 25;
  assert.throws(() => compileFrameTimeline(input), /SOURCE_TRIM_OVERFLOW/);
});
