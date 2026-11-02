import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

interface PackageJson {
  name?: string;
  version?: string;
  private?: boolean;
  description?: string;
  license?: string;
  files?: string[];
  main?: string;
  repository?: { type?: string; url?: string; directory?: string };
  homepage?: string;
  bugs?: { url?: string };
  publishConfig?: { access?: string };
  dsh?: { bundle?: { patch?: string }; client?: { platform?: string } };
}

const pkg = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8'),
) as PackageJson;
const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');

describe('publishable DSH package manifest', () => {
  it('declares the public package identity and license', () => {
    expect(pkg.name).toBe('@sir_yami/reviewd');
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
    expect(pkg.private).not.toBe(true);
    expect(pkg.license).toBe('MIT');
    expect(pkg.publishConfig?.access).toBe('public');
  });

  it('ships the fat runtime, README and license', () => {
    expect(pkg.files).toEqual(
      expect.arrayContaining(['index.js', 'client.js', 'web', 'cordis.patch.yml', 'LICENSE']),
    );
    expect(pkg.files).toContain('README.md');
    expect(pkg.files).toContain('LICENSE');
    expect(pkg.main).toBe('./index.js');
    expect(pkg.dsh?.bundle?.patch).toBe('./cordis.patch.yml');
    expect(pkg.dsh?.client?.platform).toBe('web');
  });

  it('has public repository metadata for the registry', () => {
    expect(pkg.repository?.url).toContain('github.com/AKhasa9ov/reviewd');
    expect(pkg.repository?.directory).toBe('packages/dsh');
    expect(pkg.homepage).toContain('github.com/AKhasa9ov/reviewd');
    expect(pkg.bugs?.url).toContain('github.com/AKhasa9ov/reviewd');
  });
});

describe('package README install and operation contract', () => {
  it('documents the one-command DSH install', () => {
    expect(readme).toContain('dsh plugin --profile web add @sir_yami/reviewd');
  });

  it('documents embedded mode, the first-run store and the storeDir override', () => {
    expect(readme).toContain('Embedded (default)');
    expect(readme).toContain('/code-review');
    expect(readme).toContain('$HOME/.local/share/dsh-code-review');
    expect(readme).toContain('storeDir');
  });

  it('documents external mode and its token requirement', () => {
    expect(readme).toContain('embedded: false');
    expect(readme).toContain('daemonUrl');
    expect(readme).toContain('at least 32 characters');
  });

  it('documents DSH session auth, worker disablement and data/security behavior', () => {
    expect(readme).toContain('DSH session');
    expect(readme).toContain('worker: false');
    expect(readme).toMatch(/uninstall/i);
    expect(readme).toMatch(/retention/i);
    expect(readme).toMatch(/loopback/i);
  });
});
