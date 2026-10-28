import type {
  DiffHunk,
  FileDiff,
  ManifestFile,
  ManifestFileReason,
  ResolvedScope,
  ReviewManifest,
  Snapshot,
} from '../types.js';

const LINE_PREFIX: Record<DiffHunk['lines'][number]['kind'], string> = {
  add: '+',
  del: '-',
  context: ' ',
};

function hunkHeaderLine(hunk: DiffHunk): string {
  const section = hunk.header === '' ? '' : ` ${hunk.header}`;
  return `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@${section}`;
}

/**
 * UTF-8 byte size of the parsed hunks. This is a lower bound on the full
 * unified-diff bytes for a file (path/mode/index metadata is not retained);
 * use raw diff bytes where an exact budget matters.
 */
export function patchBytesFromHunks(hunks: readonly DiffHunk[]): number {
  let bytes = 0;
  for (const hunk of hunks) {
    bytes += Buffer.byteLength(`${hunkHeaderLine(hunk)}\n`, 'utf8');
    for (const line of hunk.lines) {
      bytes += Buffer.byteLength(`${LINE_PREFIX[line.kind]}${line.text}\n`, 'utf8');
    }
  }
  return bytes;
}

function reasonForFile(file: FileDiff): ManifestFileReason | undefined {
  if (file.reason !== undefined) return file.reason;
  if (file.ignored === true) return 'ignored';
  if (file.binary) return 'binary';
  if (file.oversized) return 'per-file-cap';
  return undefined;
}

/**
 * Maps one bounded render entry to its complete-manifest entry.
 *
 * `FileDiff.truncated` and `FileDiff.encoding` are intentionally not manifest
 * fields in R1. A missing `contentBytes` means "unknown", never "no content".
 */
export function manifestFileFromDiff(file: FileDiff): ManifestFile {
  const reason = reasonForFile(file);
  return {
    path: file.path,
    ...(file.oldPath === undefined ? {} : { oldPath: file.oldPath }),
    status: file.status,
    binary: file.binary,
    ignored: file.ignored === true,
    oversized: file.oversized,
    added: file.added,
    deleted: file.deleted,
    hunkCount: file.hunks.length,
    patchBytes: patchBytesFromHunks(file.hunks),
    ...(reason === undefined ? {} : { reason }),
  };
}

/** Builds a manifest document from already-normalized entries. */
export function reviewManifest(
  scope: ResolvedScope,
  files: readonly ManifestFile[],
  warnings: readonly string[] = [],
): ReviewManifest {
  const totals = files.reduce(
    (accumulator, file) => ({
      files: accumulator.files + 1,
      added: accumulator.added + file.added,
      deleted: accumulator.deleted + file.deleted,
      patchBytes: accumulator.patchBytes + file.patchBytes,
    }),
    { files: 0, added: 0, deleted: 0, patchBytes: 0 },
  );
  return {
    schemaVersion: 1,
    scope,
    files: [...files],
    totals,
    warnings: [...warnings],
  };
}

/**
 * Builds a complete manifest from the available render entries. Callers that
 * have the full changed-path listing must supply every path here; this helper
 * never applies a file-count cap.
 */
export function buildReviewManifest(input: {
  scope: ResolvedScope;
  files: readonly FileDiff[];
  warnings?: readonly string[];
}): ReviewManifest {
  return reviewManifest(
    input.scope,
    input.files.map((file) => manifestFileFromDiff(file)),
    input.warnings,
  );
}

/**
 * Returns the snapshot's own manifest when present. Legacy v1 snapshots only
 * retain the bounded render subset, so a truncated one gets a
 * `legacy-truncated` warning; a complete v1 snapshot already lists every path.
 * A v2 snapshot without a manifest is corrupt, so its synthesized manifest is
 * marked `manifest-missing` and coverage cannot treat the render subset as the
 * complete changed-path listing.
 *
 * `totals.truncated` is the only aggregate truncation signal a legacy snapshot
 * retains, and it covers files, diff bytes, and content bytes alike. Keeping
 * the warning for all three is deliberate: we cannot tell from a legacy
 * snapshot whether a path was omitted, only that some budget was applied.
 */
export function manifestFromSnapshot(snapshot: Snapshot): ReviewManifest {
  if (snapshot.manifest !== undefined) return snapshot.manifest;
  const warnings = [...snapshot.warnings];
  if (snapshot.schemaVersion === 2) {
    if (!warnings.includes('manifest-missing')) warnings.push('manifest-missing');
  } else if (snapshot.totals.truncated && !warnings.includes('legacy-truncated')) {
    warnings.push('legacy-truncated');
  }
  return buildReviewManifest({ scope: snapshot.scope, files: snapshot.files, warnings });
}
