import type { TestRepo } from './repo.js';

/** Changed files in the large-review regression fixture. */
export const LARGE_REVIEW_FILE_COUNT = 882;

/** Added lines per generated file; enough to exceed the 2 MiB render budget. */
export const LARGE_REVIEW_LINES_PER_FILE = 96;

/** Deterministic changed paths for the large-review fixture. */
export function largeReviewPaths(count: number = LARGE_REVIEW_FILE_COUNT): string[] {
  return Array.from(
    { length: count },
    (_, index) => `src/file-${String(index).padStart(3, '0')}.ts`,
  );
}

function fileContent(index: number): string {
  const lines = Array.from(
    { length: LARGE_REVIEW_LINES_PER_FILE },
    (_, line) => `file ${index} line ${line} ${'x'.repeat(24)}`,
  );
  return `${lines.join('\n')}\n`;
}

/**
 * Seeds the deterministic large-review repository: a base commit on `main`,
 * then a `feature` branch adding `count` 96-line files under
 * `src/file-000..881.ts`. Leaves `feature` checked out and returns the added
 * paths in order. Generated on demand in a temp repo; nothing is committed to
 * this repository.
 */
export async function seedLargeReview(
  repo: Pick<TestRepo, 'write' | 'commit' | 'git'>,
  count: number = LARGE_REVIEW_FILE_COUNT,
): Promise<string[]> {
  await repo.write('base.txt', 'base\n');
  await repo.commit('base');
  await repo.git('checkout', '-b', 'feature');
  const paths = largeReviewPaths(count);
  for (const [index, path] of paths.entries()) {
    await repo.write(path, fileContent(index));
  }
  await repo.commit('large review');
  return paths;
}
