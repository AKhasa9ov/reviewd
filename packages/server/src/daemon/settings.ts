import { randomBytes } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export interface RepositorySetting {
  name: string;
  path: string;
  defaultTarget?: string;
}

export interface RepositorySettings {
  repositories: RepositorySetting[];
}

const FILE = 'repositories.json';

function isSetting(value: unknown): value is RepositorySetting {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.name === 'string' &&
    item.name.trim() !== '' &&
    typeof item.path === 'string' &&
    item.path.trim() !== '' &&
    (item.defaultTarget === undefined || typeof item.defaultTarget === 'string')
  );
}

export async function readRepositorySettings(storeDir: string): Promise<RepositorySettings> {
  let raw: string;
  try {
    raw = await readFile(join(storeDir, FILE), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { repositories: [] };
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('repositories.json is not valid JSON');
  }
  const record = parsed as { repositories?: unknown };
  if (typeof parsed !== 'object' || parsed === null || !Array.isArray(record.repositories)) {
    throw new Error('repositories.json has an invalid shape');
  }
  const entries: unknown[] = record.repositories;
  if (!entries.every(isSetting)) {
    throw new Error('repositories.json has an invalid repository entry');
  }
  return {
    repositories: entries.map((item) => ({
      name: item.name.trim(),
      path: item.path.trim(),
      ...(item.defaultTarget === undefined || item.defaultTarget.trim() === ''
        ? {}
        : { defaultTarget: item.defaultTarget.trim() }),
    })),
  };
}

export async function writeRepositorySettings(
  storeDir: string,
  settings: RepositorySettings,
): Promise<void> {
  const target = join(storeDir, FILE);
  const directory = dirname(target);
  await mkdir(directory, { recursive: true });
  const temporary = `${target}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  const handle = await open(temporary, 'wx', 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(settings, null, 2)}\n`, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporary, target);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
  const directoryHandle = await open(directory, 'r');
  try {
    await directoryHandle.sync();
  } finally {
    await directoryHandle.close();
  }
}
