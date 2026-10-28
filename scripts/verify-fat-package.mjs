import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';

const root = join(import.meta.dirname, '..');
const packageDir = join(root, 'packages/dsh');
const requiredFiles = [
  'index.js',
  'client.js',
  'cordis.patch.yml',
  'web/index.html',
  'LICENSE',
  'README.md',
];
const forbiddenPrefixes = ['src/', 'test/', 'tests/'];

execFileSync('pnpm', ['build'], { cwd: root, stdio: 'inherit' });

const destination = await mkdtemp(join(tmpdir(), 'cr-pack-'));
// The package `prepack` rebuilds the bundle. Keep lifecycle output off stdout so
// `--json` stays parseable; a failing prepack still exits non-zero.
const packed = JSON.parse(
  execFileSync(
    'npm',
    ['pack', '--json', '--foreground-scripts=false', '--pack-destination', destination],
    { cwd: packageDir, encoding: 'utf8' },
  ),
);

assert.equal(packed.length, 1, 'expected exactly one packed tarball');
const info = packed.at(-1);
const files = new Set(info.files.map((file) => file.path));

for (const file of requiredFiles) {
  assert.ok(files.has(file), `tarball is missing ${file}`);
}
assert.ok(
  [...files].some((file) => file.startsWith('web/assets/')),
  'tarball is missing the built web assets',
);

for (const file of files) {
  for (const prefix of forbiddenPrefixes) {
    assert.ok(!file.startsWith(prefix), `tarball must not ship ${file}`);
  }
  assert.ok(!file.endsWith('.map'), `tarball must not ship source maps (${file})`);
  assert.ok(!file.includes('node_modules/'), `tarball must not ship node_modules (${file})`);
}

const pkg = JSON.parse(await readFile(join(packageDir, 'package.json'), 'utf8'));
assert.notEqual(pkg.private, true, 'package must not be private');
assert.equal(pkg.license, 'MIT', 'package must declare the MIT license');

const tarball = isAbsolute(info.filename) ? info.filename : join(destination, info.filename);
const { size } = await stat(tarball);
assert.ok(size > 0, 'tarball must not be empty');

process.stdout.write(`fat package OK: ${tarball} (${files.size} files, ${size} bytes)\n`);
