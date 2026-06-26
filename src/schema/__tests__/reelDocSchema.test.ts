/**
 * Unit tests for ReelDocSchema + validateReelDoc.
 * Run: node --experimental-strip-types packages/timeline/src/schema/__tests__/reelDocSchema.test.ts
 */
import { ReelDocSchema, validateReelDoc } from '../reelDocSchema.ts';
import type { ReelDoc } from '../reelDocSchema.ts';

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean): void {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${label}`);
    failed++;
  }
}

const NOW = new Date().toISOString();

// ── 1. Minimal valid ReelDoc ─────────────────────────────────────────────────
console.log('\n1. Minimal valid ReelDoc');
{
  const minimal: unknown = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    version: '1.0',
    schemaHash: 'abc123def456',
    created: NOW,
    updated: NOW,
    title: 'Test Reel',
    outputFormat: {
      aspectRatio: '9:16',
      width: 1080,
      height: 1920,
      fps: '30',
    },
    elements: [],
  };
  const result = validateReelDoc(minimal);
  assert('minimal doc validates', result.ok === true);
  if (result.ok) {
    assert('version is 1.0', result.doc.version === '1.0');
    assert('fps is "30"', result.doc.outputFormat.fps === '30');
  }
}

// ── 2. VideoElement with keyframe animation ──────────────────────────────────
console.log('\n2. VideoElement with keyframe animation');
{
  const doc: unknown = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    version: '1.0',
    schemaHash: 'abc',
    created: NOW,
    updated: NOW,
    title: 'Video Test',
    outputFormat: { aspectRatio: '9:16', width: 1080, height: 1920, fps: '30' },
    elements: [
      {
        type: 'video',
        id: 'video-1',
        src: 'https://example.com/video.mp4',
        duration: 3000,
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        opacity: 1,
        scale: 1,
        rotation: 0,
        zIndex: 0,
        animations: [
          {
            type: 'property',
            startTime: 0,
            duration: 1000,
            easing: 'ease-out',
            keyframes: [
              { time: 0, opacity: 0, scale: 0.8 },
              { time: 100, opacity: 1, scale: 1 },
            ],
          },
        ],
      },
    ],
  };
  const result = validateReelDoc(doc);
  assert('VideoElement with animation validates', result.ok === true);
  if (result.ok === false) { console.error('  errors:', result.errors); }
}

// ── 3. TextElement with BrandKit ─────────────────────────────────────────────
console.log('\n3. TextElement with BrandKit');
{
  const doc: unknown = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    version: '1.0',
    schemaHash: 'abc',
    created: NOW,
    updated: NOW,
    title: 'Text Test',
    outputFormat: { aspectRatio: '9:16', width: 1080, height: 1920, fps: '30' },
    brandKit: {
      id: 'kit-1',
      name: 'Brand 1',
      colors: { primary: '#ff0000', accent: '#00ff00' },
      fonts: {
        heading: { family: 'Arial', weights: ['700'], fallback: 'sans-serif' },
      },
      typography: {
        headline: { fontSize: 48, fontFamily: 'Arial', fontWeight: '700', lineHeight: 1.2 },
      },
      spacing: { sm: 8, md: 16, lg: 24 },
      borderRadius: { sm: 4, md: 8 },
      shadows: { default: '0 2px 4px rgba(0,0,0,0.1)' },
    },
    elements: [
      {
        type: 'text',
        id: 'text-1',
        text: 'Hello {product.name}',
        x: 10,
        y: 20,
        width: 80,
        fontSize: 32,
        fontFamily: 'Arial',
        fontWeight: '700',
        color: '#ff0000',
        textAlign: 'center',
      },
    ],
  };
  const result = validateReelDoc(doc);
  assert('TextElement with BrandKit validates', result.ok === true);
  if (result.ok === false) { console.error('  errors:', result.errors); }
}

// ── 4. Reject Percent > 100 ──────────────────────────────────────────────────
console.log('\n4. Reject Percent > 100');
{
  const invalid: unknown = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    version: '1.0',
    schemaHash: 'abc',
    created: NOW,
    updated: NOW,
    title: 'Invalid',
    outputFormat: { aspectRatio: '9:16', width: 1080, height: 1920, fps: '30' },
    elements: [
      {
        type: 'video',
        id: 'video-1',
        src: 'https://example.com/video.mp4',
        duration: 3000,
        x: 150, // INVALID: > 100
        y: 0,
        width: 100,
        height: 100,
      },
    ],
  };
  const result = validateReelDoc(invalid);
  assert('Percent > 100 is rejected', result.ok === false);
  assert('errors array is non-empty', result.ok === false && result.errors.length > 0);
}

// ── 5. ShapeElement with gradient fill ──────────────────────────────────────
console.log('\n5. ShapeElement with gradient fill');
{
  const doc: unknown = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    version: '1.0',
    schemaHash: 'abc',
    created: NOW,
    updated: NOW,
    title: 'Shape Test',
    outputFormat: { aspectRatio: '9:16', width: 1080, height: 1920, fps: '30' },
    elements: [
      {
        type: 'shape',
        id: 'shape-1',
        shapeType: 'rect',
        x: 10,
        y: 10,
        width: 80,
        height: 80,
        fill: {
          type: 'gradient',
          gradient: {
            type: 'linear',
            angle: 45,
            stops: [
              { position: 0, color: '#ff0000' },
              { position: 100, color: '#0000ff' },
            ],
          },
        },
      },
    ],
  };
  const result = validateReelDoc(doc);
  assert('ShapeElement with gradient fill validates', result.ok === true);
  if (result.ok === false) { console.error('  errors:', result.errors); }
}

// ── 6. AudioElement with fade ────────────────────────────────────────────────
console.log('\n6. AudioElement with fade');
{
  const doc: unknown = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    version: '1.0',
    schemaHash: 'abc',
    created: NOW,
    updated: NOW,
    title: 'Audio Test',
    outputFormat: { aspectRatio: '9:16', width: 1080, height: 1920, fps: '30' },
    elements: [
      {
        type: 'audio',
        id: 'audio-1',
        src: 'https://example.com/audio.mp3',
        startTime: 0,
        duration: 5000,
        volume: 1,
        fade: { fadeIn: 500, fadeOut: 500 },
      },
    ],
  };
  const result = validateReelDoc(doc);
  assert('AudioElement with fade validates', result.ok === true);
  if (result.ok === false) { console.error('  errors:', result.errors); }
}

// ── 7. AudioMix validation ───────────────────────────────────────────────────
console.log('\n7. AudioMix validation');
{
  const doc: unknown = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    version: '1.0',
    schemaHash: 'abc',
    created: NOW,
    updated: NOW,
    title: 'Audio Mix',
    outputFormat: { aspectRatio: '9:16', width: 1080, height: 1920, fps: '30' },
    audioMix: {
      voiceTrack: 1.0,
      musicTrack: 0.25,
      sfxTrack: 0.6,
    },
    elements: [],
  };
  const result = validateReelDoc(doc);
  assert('AudioMix validates', result.ok === true);
  if (result.ok) {
    assert('voiceTrack preserved', result.doc.audioMix?.voiceTrack === 1.0);
    assert('musicTrack preserved', result.doc.audioMix?.musicTrack === 0.25);
  }
}

// ── 8. Type-safe exports ─────────────────────────────────────────────────────
console.log('\n8. Type-safe exports');
{
  const reel: ReelDoc = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    version: '1.0',
    schemaHash: 'abc',
    created: NOW,
    updated: NOW,
    title: 'Type Test',
    outputFormat: {
      aspectRatio: '9:16',
      width: 1080,
      height: 1920,
      fps: '30',
    },
    elements: [],
  };
  assert('TypeScript type assignment works', reel.title === 'Type Test');
  assert('ReelDocSchema is exported', typeof ReelDocSchema !== 'undefined');
  assert('validateReelDoc is exported', typeof validateReelDoc === 'function');
}

// ── Summary ──────────────────────────────────────────────────────────────────
const total = passed + failed;
console.log(`\n→ VERIFY ReelDocSchema: ${passed}/${total} passed`);
if (failed > 0) {
  process.exit(1);
}
