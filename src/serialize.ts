/**
 * .hiob file format — single-file serialization (req #5).
 *
 * A .hiob is a UTF-8 JSON file. The editor saves whenever the timeline mutates,
 * and the user can download it as a project file. Re-importing produces the
 * same editing state (clips, agent history, asset refs). Renders are recorded
 * in renderHistory; the project survives the render.
 */
import type { ProjectFilePayload, Timeline, Asset, AgentTeam } from './types';
import { HIOB_SCHEMA_VERSION } from './types';

export interface BuildArgs {
  runId: string;
  timeline: Timeline;
  assets: Asset[];
  agentTeam: AgentTeam | null;
  renderHistory?: ProjectFilePayload['renderHistory'];
  label?: string;
}

export function buildProjectFile(args: BuildArgs): ProjectFilePayload {
  return {
    schemaVersion: HIOB_SCHEMA_VERSION,
    runId: args.runId,
    label: args.label,
    timeline: args.timeline,
    assets: args.assets,
    agentTeam: args.agentTeam,
    renderHistory: args.renderHistory ?? [],
    exportedAt: new Date().toISOString(),
  };
}

export function serializeProjectFile(payload: ProjectFilePayload): string {
  // pretty so users can diff .hiob in git if they want
  return JSON.stringify(payload, null, 2);
}

export function parseProjectFile(text: string): ProjectFilePayload {
  const parsed = JSON.parse(text);
  if (parsed?.schemaVersion !== HIOB_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported .hiob schema version: ${parsed?.schemaVersion} (expected ${HIOB_SCHEMA_VERSION})`,
    );
  }
  // shallow shape check — schema validators (zod) can be layered later
  if (!parsed.timeline || !Array.isArray(parsed.timeline.tracks)) {
    throw new Error('Invalid .hiob: missing timeline.tracks');
  }
  return parsed as ProjectFilePayload;
}

/** Fast non-crypto hash used for project_file.payload_sha (audit, not security). */
export async function sha256Hex(text: string): Promise<string> {
  const enc = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
