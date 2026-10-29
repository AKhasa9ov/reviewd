import type { ManifestFile, ReviewManifest } from '../types.js';
import type { FileCoverage, ReviewCoverage } from './types.js';
import { summarizeCoverage } from './coverage.js';

export type ReviewTier = 'deep' | 'light' | 'manifest-only';
export type FileKind =
  | 'source'
  | 'test'
  | 'docs'
  | 'config'
  | 'migration'
  | 'generated'
  | 'binary'
  | 'instructions'
  | 'other';

export interface ModuleRoot {
  id: string;
  root: string;
  name?: string;
}

export interface ModuleInfo extends ModuleRoot {
  source: 'workspace' | 'convention' | 'root';
}

export interface ModuleMap {
  modules: ModuleInfo[];
  moduleFor(path: string): string;
}

const WORKSPACE_CONTAINERS = new Set([
  'packages',
  'apps',
  'services',
  'libs',
  'modules',
  'plugins',
]);

const CONVENTION_ROOTS = new Set([
  'src',
  'app',
  'backend',
  'frontend',
  'server',
  'client',
  'ui',
  'web',
  'api',
  'docs',
  'tests',
  'test',
  'e2e',
  'ui-tests',
  'migrations',
  'config',
  'scripts',
  'tools',
]);

const INSTRUCTION_FILES = new Set([
  'AGENTS.md',
  'CLAUDE.md',
  'GEMINI.md',
  '.cursorrules',
  '.github/copilot-instructions.md',
]);

const DOC_FILES = new Set([
  'README.md',
  'CHANGELOG.md',
  'ARCHITECTURE.md',
  'BACKEND_SPEC.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'LICENSE.md',
]);

const CONFIG_FILES = new Set([
  'package.json',
  'pnpm-workspace.yaml',
  'pnpm-lock.yaml',
  'package-lock.json',
  'yarn.lock',
  'uv.lock',
  'poetry.lock',
  'Cargo.lock',
  'go.sum',
  'tsconfig.json',
  'pyproject.toml',
  'requirements.txt',
  'go.mod',
  'Cargo.toml',
  'pom.xml',
  'Makefile',
  'Dockerfile',
  'docker-compose.yml',
  'docker-compose.yaml',
]);

const SOURCE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.kts',
  '.swift',
  '.c',
  '.cc',
  '.cpp',
  '.h',
  '.hpp',
  '.rb',
  '.php',
  '.cs',
  '.sh',
  '.bash',
  '.zsh',
  '.sql',
]);

const DOC_EXTENSIONS = new Set(['.md', '.mdx', '.rst', '.adoc']);
const GENERATED_DIRS = new Set([
  'dist',
  'build',
  'coverage',
  'node_modules',
  '.next',
  'out',
  'target',
  '.turbo',
  '.cache',
]);

function basename(path: string): string {
  const parts = path.split('/');
  return parts.at(-1) ?? path;
}

function extension(path: string): string {
  const name = basename(path);
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? '' : name.slice(dot).toLowerCase();
}

function normalizeRoot(root: string): string {
  const normalized = root.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  return normalized === '' ? '.' : normalized;
}

function isUnder(path: string, root: string): boolean {
  if (root === '.') return true;
  return path === root || path.startsWith(`${root}/`);
}

function conventionRoot(path: string): string {
  const parts = path.split('/');
  if (parts.length === 1) return '.';
  const first = parts[0];
  if (first === undefined) return '.';
  if (WORKSPACE_CONTAINERS.has(first) && parts.length > 2) {
    return `${first}/${parts[1] ?? ''}`;
  }
  if (CONVENTION_ROOTS.has(first)) return first;
  return first;
}

/**
 * Builds a deterministic path-to-module map. Explicit workspace roots win over
 * convention roots for the same directory; the longest matching root wins for
 * a path. Root-level files belong to the synthetic `.` module.
 */
export function buildModuleMap(
  files: readonly ManifestFile[],
  roots: readonly ModuleRoot[] = [],
): ModuleMap {
  const byRoot = new Map<string, ModuleInfo>();
  const add = (root: string, source: ModuleInfo['source'], info?: ModuleRoot): void => {
    const normalized = normalizeRoot(root);
    if (normalized === '.' && source !== 'root') return;
    const existing = byRoot.get(normalized);
    if (existing !== undefined && !(source === 'workspace' && existing.source === 'convention')) {
      return;
    }
    if (existing !== undefined && source === 'workspace') {
      byRoot.set(normalized, {
        id: info?.id ?? existing.id,
        root: normalized,
        ...(info?.name === undefined && existing.name === undefined
          ? {}
          : { name: info?.name ?? existing.name }),
        source,
      });
      return;
    }
    byRoot.set(normalized, {
      id: info?.id ?? normalized,
      root: normalized,
      ...(info?.name === undefined ? {} : { name: info.name }),
      source,
    });
  };

  for (const root of roots) {
    add(root.root, 'workspace', root);
  }
  for (const path of files.map((file) => file.path)) {
    add(conventionRoot(path), 'convention');
  }
  add('.', 'root');

  const modules = [...byRoot.values()].sort((left, right) => {
    if (left.id < right.id) return -1;
    if (left.id > right.id) return 1;
    return 0;
  });
  const orderedByRoot = [...modules].sort((left, right) => right.root.length - left.root.length);

  return {
    modules,
    moduleFor(path: string): string {
      for (const module of orderedByRoot) {
        if (isUnder(path, module.root)) return module.id;
      }
      return '.';
    },
  };
}

function isGenerated(file: ManifestFile): boolean {
  if (file.reason === 'generated') return true;
  const name = basename(file.path);
  if (
    name === 'pnpm-lock.yaml' ||
    name === 'package-lock.json' ||
    name === 'yarn.lock' ||
    name === 'uv.lock' ||
    name === 'poetry.lock' ||
    name === 'Cargo.lock' ||
    name === 'go.sum'
  ) {
    return true;
  }
  if (/(\.min\.|\.generated\.)/.test(name)) return true;
  return file.path.split('/').some((part) => GENERATED_DIRS.has(part));
}

function isInstructions(path: string): boolean {
  return INSTRUCTION_FILES.has(path) || path.startsWith('.dsh/');
}

function isMigration(path: string): boolean {
  if (extension(path) === '.sql') return true;
  return /(^|\/)(migrations?|alembic|migrate)\//.test(path);
}

function isTest(path: string): boolean {
  if (/(^|\/)(test|tests|__tests__|e2e|ui-tests|spec|specs)\//.test(path)) return true;
  return /\.(test|spec)\.[^/]+$/.test(path);
}

function isDocs(path: string): boolean {
  if (path.startsWith('docs/')) return true;
  if (DOC_FILES.has(basename(path))) return true;
  return DOC_EXTENSIONS.has(extension(path));
}

function isConfig(path: string): boolean {
  const name = basename(path);
  if (CONFIG_FILES.has(name)) return true;
  if (path.startsWith('.github/')) return true;
  if (
    /^(tsconfig|vite|vitest|eslint|prettier|playwright|jest|rollup|webpack).*\.(json|js|mjs|cjs|ts)$/.test(
      name,
    )
  ) {
    return true;
  }
  if (/^\.env(\..*)?$/.test(name)) return true;
  return extension(path) === '.yml' || extension(path) === '.yaml' || extension(path) === '.toml';
}

function isSource(path: string): boolean {
  return SOURCE_EXTENSIONS.has(extension(path));
}

/**
 * Classifies a changed path by kind. Manifest policy (`generated`) and binary
 * metadata take priority over the path shape; `ignored` alone does not change
 * the kind because ignore policy is applied by the tier planner.
 */
export function classifyFile(file: ManifestFile): FileKind {
  if (isInstructions(file.path)) return 'instructions';
  if (file.binary) return 'binary';
  if (isGenerated(file)) return 'generated';
  if (isMigration(file.path)) return 'migration';
  if (isTest(file.path)) return 'test';
  if (isDocs(file.path)) return 'docs';
  if (isConfig(file.path)) return 'config';
  if (isSource(file.path)) return 'source';
  return 'other';
}

/**
 * User-facing docs are deep-reviewed because they can change behavior or
 * contracts. Internal notes are still docs, but light.
 */
export function isUserFacingDoc(path: string): boolean {
  if (path.startsWith('docs/internal/')) return false;
  if (path.startsWith('docs/')) return true;
  const name = basename(path);
  return DOC_FILES.has(name) || /^README\./i.test(name);
}

export interface ShardLimits {
  maxFiles: number;
  maxPatchBytes: number;
}

export const DEFAULT_SHARD_LIMITS: ShardLimits = Object.freeze({
  maxFiles: 12,
  maxPatchBytes: 120_000,
});

export interface PlanFile {
  path: string;
  moduleId: string;
  kind: FileKind;
  tier: ReviewTier;
  shardId?: string;
  /** Policy reason for a manifest-only file; absent for reviewed files. */
  reason?: string;
}

export interface ReviewShard {
  id: string;
  moduleId: string;
  tier: 'deep' | 'light';
  effort: 'deep' | 'light';
  paths: string[];
  fileCount: number;
  patchBytes: number;
}

export interface ReviewPlan {
  schemaVersion: 1;
  files: PlanFile[];
  shards: ReviewShard[];
  coverage: ReviewCoverage;
  coveragePlan: {
    total: number;
    byTier: Record<ReviewTier, number>;
  };
  riskFlags: string[];
  limits: ShardLimits;
}

const INCOMPLETE_MANIFEST_WARNINGS = new Set([
  'manifest-listing-truncated',
  'untracked-list-truncated',
  'manifest-missing',
]);

function byteCompare(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

function isNoHunks(file: ManifestFile): boolean {
  return (
    file.reason === undefined &&
    !file.binary &&
    !file.ignored &&
    file.hunkCount === 0 &&
    file.added === 0 &&
    file.deleted === 0
  );
}

function policyReason(file: ManifestFile, kind: FileKind): string | undefined {
  if (file.reason !== undefined && ['generated', 'binary', 'ignored'].includes(file.reason)) {
    return file.reason;
  }
  if (file.ignored) return 'ignored';
  if (file.binary) return 'binary';
  if (kind === 'generated') return 'generated';
  return undefined;
}

function tierFor(file: ManifestFile, kind: FileKind, moduleHasSource: boolean): ReviewTier {
  if (kind === 'binary' || kind === 'generated' || file.ignored) return 'manifest-only';
  switch (kind) {
    case 'source':
    case 'config':
    case 'migration':
    case 'instructions':
      return 'deep';
    case 'test':
      return moduleHasSource ? 'deep' : 'light';
    case 'docs':
      return isUserFacingDoc(file.path) ? 'deep' : 'light';
    case 'other':
      return 'light';
  }
}

function riskFlags(input: {
  manifest: ReviewManifest;
  files: readonly PlanFile[];
  modules: number;
}): string[] {
  const flags: string[] = [];
  const generated = input.files.filter((file) => file.tier === 'manifest-only').length;
  if (input.manifest.totals.files >= 100 || input.manifest.totals.patchBytes >= 1_000_000) {
    flags.push('large-diff');
  }
  if (input.files.length >= 10 && generated * 10 >= input.files.length) {
    flags.push('generated-heavy');
  }
  if (input.manifest.warnings.some((warning) => INCOMPLETE_MANIFEST_WARNINGS.has(warning))) {
    flags.push('manifest-incomplete');
  }
  if (
    input.files.some((file) => /(^|\/)(auth|security|crypto|migrations?|config)\//.test(file.path))
  ) {
    flags.push('security-sensitive');
  }
  if (!input.files.some((file) => file.tier === 'deep' && file.kind === 'source')) {
    flags.push('no-source');
  }
  if (input.modules > 8) flags.push('many-modules');
  return flags;
}

/**
 * Builds a pure, deterministic review plan. The planner never executes a
 * shard, calls a model, or marks work complete; every deep/light file starts
 * pending in the returned coverage ledger.
 */
export function buildReviewPlan(input: {
  manifest: ReviewManifest;
  moduleRoots?: readonly ModuleRoot[];
  limits?: Partial<ShardLimits>;
}): ReviewPlan {
  const limits: ShardLimits = {
    maxFiles: Math.max(1, Math.trunc(input.limits?.maxFiles ?? DEFAULT_SHARD_LIMITS.maxFiles)),
    maxPatchBytes: Math.max(
      1,
      Math.trunc(input.limits?.maxPatchBytes ?? DEFAULT_SHARD_LIMITS.maxPatchBytes),
    ),
  };
  const modules = buildModuleMap(input.manifest.files, input.moduleRoots);
  const kinds = new Map<string, FileKind>();
  for (const file of input.manifest.files) {
    kinds.set(file.path, classifyFile(file));
  }
  const sourceModules = new Set<string>();
  for (const file of input.manifest.files) {
    if (kinds.get(file.path) === 'source') sourceModules.add(modules.moduleFor(file.path));
  }

  const files: PlanFile[] = input.manifest.files.map((file) => {
    const kind = kinds.get(file.path) ?? 'other';
    const moduleId = modules.moduleFor(file.path);
    const tier = tierFor(file, kind, sourceModules.has(moduleId));
    const reason = tier === 'manifest-only' ? policyReason(file, kind) : undefined;
    return {
      path: file.path,
      moduleId,
      kind,
      tier,
      ...(reason === undefined ? {} : { reason }),
    };
  });
  const byPath = new Map(files.map((file) => [file.path, file]));

  const groups = new Map<string, PlanFile[]>();
  for (const file of files) {
    if (file.tier === 'manifest-only') continue;
    const manifestFile = input.manifest.files.find((item) => item.path === file.path);
    if (manifestFile === undefined || isNoHunks(manifestFile)) continue;
    const key = `${file.moduleId}\0${file.tier}`;
    const group = groups.get(key) ?? [];
    group.push(file);
    groups.set(key, group);
  }

  const shards: ReviewShard[] = [];
  const keys = [...groups.keys()].sort(byteCompare);
  for (const key of keys) {
    const group = groups.get(key) ?? [];
    group.sort((left, right) => byteCompare(left.path, right.path));
    let current: PlanFile[] = [];
    let currentBytes = 0;
    const flush = (): void => {
      if (current.length === 0) return;
      const id = `shard_${String(shards.length + 1).padStart(3, '0')}`;
      const first = current[0];
      if (first === undefined) return;
      const shard: ReviewShard = {
        id,
        moduleId: first.moduleId,
        tier: first.tier === 'deep' ? 'deep' : 'light',
        effort: first.tier === 'deep' ? 'deep' : 'light',
        paths: current.map((file) => file.path),
        fileCount: current.length,
        patchBytes: currentBytes,
      };
      shards.push(shard);
      for (const file of current) file.shardId = id;
      current = [];
      currentBytes = 0;
    };
    for (const file of group) {
      const manifestFile = input.manifest.files.find((item) => item.path === file.path);
      const bytes = manifestFile?.patchBytes ?? 0;
      if (
        current.length > 0 &&
        (current.length >= limits.maxFiles || currentBytes + bytes > limits.maxPatchBytes)
      ) {
        flush();
      }
      current.push(file);
      currentBytes += bytes;
    }
    flush();
  }

  const coverageFiles: FileCoverage[] = input.manifest.files.map((manifestFile) => {
    const planFile = byPath.get(manifestFile.path);
    if (planFile === undefined) {
      return { path: manifestFile.path, status: 'skipped', reason: 'render-budget' };
    }
    if (planFile.tier === 'manifest-only') {
      return {
        path: planFile.path,
        status: 'manifest-only',
        ...(planFile.reason === undefined ? {} : { reason: planFile.reason }),
      };
    }
    if (isNoHunks(manifestFile)) {
      return { path: planFile.path, status: 'no-hunks' };
    }
    if (planFile.shardId !== undefined) {
      return { path: planFile.path, status: 'pending', shardId: planFile.shardId };
    }
    return { path: planFile.path, status: 'skipped', reason: 'render-budget' };
  });
  const coverage: ReviewCoverage = {
    files: coverageFiles,
    totals: summarizeCoverage(coverageFiles),
    ...(input.manifest.warnings.some((warning) => INCOMPLETE_MANIFEST_WARNINGS.has(warning))
      ? { incomplete: true }
      : {}),
  };

  const byTier: Record<ReviewTier, number> = {
    deep: files.filter((file) => file.tier === 'deep').length,
    light: files.filter((file) => file.tier === 'light').length,
    'manifest-only': files.filter((file) => file.tier === 'manifest-only').length,
  };
  return {
    schemaVersion: 1,
    files,
    shards,
    coverage,
    coveragePlan: { total: files.length, byTier },
    riskFlags: riskFlags({
      manifest: input.manifest,
      files,
      modules: modules.modules.length,
    }),
    limits,
  };
}

/** Returns a detached copy of the plan's coverage ledger for event persistence. */
export function coverageFromPlan(plan: ReviewPlan): ReviewCoverage {
  return {
    files: plan.coverage.files.map((file) => ({ ...file })),
    totals: summarizeCoverage(plan.coverage.files),
    ...(plan.coverage.incomplete === true ? { incomplete: true } : {}),
  };
}
