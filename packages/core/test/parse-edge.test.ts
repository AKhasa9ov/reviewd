import { describe, expect, it } from 'vitest';
import { parseUnifiedDiff } from '../src/diff/parse.js';

const ADDED = `diff --git a/src/new.ts b/src/new.ts
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1,2 @@
+one
+two
`;

const DELETED = `diff --git a/src/gone.ts b/src/gone.ts
deleted file mode 100644
index 2222222..0000000
--- a/src/gone.ts
+++ /dev/null
@@ -1,2 +0,0 @@
-one
-two
`;

const RENAMED = `diff --git a/src/old.ts b/src/new.ts
similarity index 90%
rename from src/old.ts
rename to src/new.ts
--- a/src/old.ts
+++ b/src/new.ts
@@ -1 +1 @@
-old
+new
`;

const BINARY = `diff --git a/logo.png b/logo.png
new file mode 100644
index 0000000..3333333
Binary files /dev/null and b/logo.png differ
`;

const TWO_FILES = `diff --git a/a.txt b/a.txt
--- a/a.txt
+++ b/a.txt
@@ -1 +1 @@
-a
+A
diff --git a/b.txt b/b.txt
--- a/b.txt
+++ b/b.txt
@@ -1 +1,2 @@
 b
+c
`;

const NO_NEWLINE = `diff --git a/n.txt b/n.txt
--- a/n.txt
+++ b/n.txt
@@ -1 +1 @@
-old
\\ No newline at end of file
+new
\\ No newline at end of file
`;

const SPACES = `diff --git a/assets/with space.txt b/assets/with space.txt
--- a/assets/with space.txt
+++ b/assets/with space.txt
@@ -1 +1 @@
-old
+new
`;

const MODE_ONLY = `diff --git a/run.sh b/run.sh
old mode 100644
new mode 100755
`;

const GITLINK_MODIFIED = `diff --git a/vendor/lib b/vendor/lib
index 1111111..2222222 160000
--- a/vendor/lib
+++ b/vendor/lib
@@ -1 +1 @@
-Subproject commit 1111111111111111111111111111111111111111
+Subproject commit 2222222222222222222222222222222222222222
`;

const HUNK_TEXT = `diff --git a/notes.txt b/notes.txt
--- a/notes.txt
+++ b/notes.txt
@@ -1,3 +1,3 @@
 keep
---- three dashes
++++ four pluses
 tail
`;

describe('parseUnifiedDiff edge cases', () => {
  it('marks an added file and keeps the new path', () => {
    const [file] = parseUnifiedDiff(ADDED);
    expect(file?.status).toBe('added');
    expect(file?.path).toBe('src/new.ts');
    expect(file?.added).toBe(2);
    expect(file?.deleted).toBe(0);
    expect(file?.hunks[0]?.oldStart).toBe(0);
  });

  it('marks a deleted file and keeps the old path', () => {
    const [file] = parseUnifiedDiff(DELETED);
    expect(file?.status).toBe('deleted');
    expect(file?.path).toBe('src/gone.ts');
    expect(file?.added).toBe(0);
    expect(file?.deleted).toBe(2);
  });

  it('records rename source and target', () => {
    const [file] = parseUnifiedDiff(RENAMED);
    expect(file?.status).toBe('renamed');
    expect(file?.path).toBe('src/new.ts');
    expect(file?.oldPath).toBe('src/old.ts');
  });

  it('marks a binary file without hunks', () => {
    const [file] = parseUnifiedDiff(BINARY);
    expect(file?.binary).toBe(true);
    expect(file?.path).toBe('logo.png');
    expect(file?.hunks).toEqual([]);
  });

  it('parses multiple files in one diff', () => {
    const files = parseUnifiedDiff(TWO_FILES);
    expect(files.map((file) => file.path)).toEqual(['a.txt', 'b.txt']);
    expect(files[1]?.added).toBe(1);
  });

  it('ignores the no-newline marker', () => {
    const [file] = parseUnifiedDiff(NO_NEWLINE);
    expect(file?.hunks[0]?.lines.map((line) => line.text)).toEqual(['old', 'new']);
  });

  it('keeps spaces in paths', () => {
    const [file] = parseUnifiedDiff(SPACES);
    expect(file?.path).toBe('assets/with space.txt');
  });

  it('parses a mode-only change without hunks', () => {
    const [file] = parseUnifiedDiff(MODE_ONLY);
    expect(file?.status).toBe('modified');
    expect(file?.oldMode).toBe('100644');
    expect(file?.newMode).toBe('100755');
    expect(file?.hunks).toEqual([]);
  });

  it('records the gitlink mode from the index line', () => {
    const [file] = parseUnifiedDiff(GITLINK_MODIFIED);
    expect(file?.indexMode).toBe('160000');
    expect(file?.oldMode).toBeUndefined();
    expect(file?.newMode).toBeUndefined();
    expect(file?.status).toBe('modified');
  });

  it('does not mistake hunk content for file headers', () => {
    const [file] = parseUnifiedDiff(HUNK_TEXT);
    expect(file?.hunks[0]?.lines[1]).toEqual({
      kind: 'del',
      oldNo: 2,
      newNo: null,
      text: '--- three dashes',
    });
    expect(file?.hunks[0]?.lines[2]).toEqual({
      kind: 'add',
      oldNo: null,
      newNo: 2,
      text: '+++ four pluses',
    });
  });
});
