import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface TestRepo {
  root: string;
  git: (...args: string[]) => Promise<string>;
  write: (path: string, content: string) => Promise<void>;
  writeBytes: (path: string, content: Uint8Array) => Promise<void>;
  commit: (message: string) => Promise<string>;
  commitStaged: (message: string) => Promise<string>;
  cleanup: () => Promise<void>;
}

export async function makeRepo(): Promise<TestRepo> {
  const root = await mkdtemp(join(tmpdir(), 'cr-repo-'));
  const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1' };
  const git = async (...args: string[]): Promise<string> => {
    const { stdout } = await execFileAsync('git', args, { cwd: root, env });
    return stdout.trim();
  };
  const writeBytes = async (path: string, content: Uint8Array): Promise<void> => {
    const absolute = join(root, path);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, content);
  };
  const write = async (path: string, content: string): Promise<void> => {
    await writeBytes(path, Buffer.from(content, 'utf8'));
  };
  const commit = async (message: string): Promise<string> => {
    await git('add', '-A');
    return await commitStaged(message);
  };
  const commitStaged = async (message: string): Promise<string> => {
    await git('commit', '-m', message);
    return git('rev-parse', 'HEAD');
  };

  await git('init', '-b', 'main');
  await git('config', 'user.email', 'test@example.com');
  await git('config', 'user.name', 'Test User');

  return {
    root,
    git,
    write,
    writeBytes,
    commit,
    commitStaged,
    cleanup: async () => {
      await rm(root, { recursive: true, force: true });
    },
  };
}
