import { describe, expect, it } from 'vitest';
import { parseUnifiedDiff } from '../src/diff/parse.js';

const SIMPLE = `diff --git a/src/a.ts b/src/a.ts
index 1111111..2222222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,3 +1,4 @@
 const a = 1;
-const b = 2;
+const b = 3;
+const c = 4;
 const d = 5;
`;

describe('parseUnifiedDiff', () => {
  it('parses one hunk with line numbers and counts', () => {
    const files = parseUnifiedDiff(SIMPLE);
    expect(files).toHaveLength(1);

    const file = files[0];
    expect(file?.path).toBe('src/a.ts');
    expect(file?.status).toBe('modified');
    expect(file?.binary).toBe(false);
    expect(file?.added).toBe(2);
    expect(file?.deleted).toBe(1);
    expect(file?.hunks).toHaveLength(1);
    expect(file?.hunks[0]?.header).toBe('');
    expect(file?.hunks[0]?.lines).toEqual([
      { kind: 'context', oldNo: 1, newNo: 1, text: 'const a = 1;' },
      { kind: 'del', oldNo: 2, newNo: null, text: 'const b = 2;' },
      { kind: 'add', oldNo: null, newNo: 2, text: 'const b = 3;' },
      { kind: 'add', oldNo: null, newNo: 3, text: 'const c = 4;' },
      { kind: 'context', oldNo: 3, newNo: 4, text: 'const d = 5;' },
    ]);
  });

  it('returns an empty array for an empty diff', () => {
    expect(parseUnifiedDiff('')).toEqual([]);
  });
});
