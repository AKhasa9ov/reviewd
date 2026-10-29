import type { ManifestFile } from '../types.js';

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
