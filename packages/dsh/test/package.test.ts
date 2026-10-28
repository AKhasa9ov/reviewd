import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

interface PackageJson {
  private?: boolean;
  license?: string;
  files?: string[];
  dsh?: { bundle?: { patch?: string }; client?: { platform?: string } };
}

const pkg = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8'),
) as PackageJson;

describe('publishable DSH package manifest', () => {
  it('declares the fat runtime, license and bundle entry', () => {
    expect(pkg.private).not.toBe(true);
    expect(pkg.license).toBe('MIT');
    expect(pkg.files).toEqual(
      expect.arrayContaining(['index.js', 'client.js', 'web', 'cordis.patch.yml', 'LICENSE']),
    );
    expect(pkg.dsh?.bundle?.patch).toBe('./cordis.patch.yml');
    expect(pkg.dsh?.client?.platform).toBe('web');
  });
});
