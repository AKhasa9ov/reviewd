import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CommandReviewer, FakeReviewer } from '../../src/index.js';
import type { ReviewerJob, ReviewerReport, Snapshot } from '../../src/index.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function snapshot(): Snapshot {
  return {
    schemaVersion: 1,
    scope: {
      kind: 'range',
      repoRoot: '/tmp/repo',
      baseSha: 'a'.repeat(40),
      headSha: 'b'.repeat(40),
      label: 'a..b',
      worktreeDigest: 'b'.repeat(40),
    },
    files: [],
    totals: { files: 0, added: 0, deleted: 0, truncated: false },
    warnings: [],
  };
}

function job(repoRoot = '/tmp/repo'): ReviewerJob {
  return {
    id: 'job_1',
    reviewId: 'rev_1',
    round: 1,
    kind: 'initial',
    repoRoot,
    prompt: '# Review prompt',
    snapshot: snapshot(),
  };
}

const validReport: ReviewerReport = {
  schemaVersion: 1,
  summary: 'ok',
  riskLevel: 'low',
  findings: [],
  questions: [],
  tests: { ran: false, commands: [] },
  verification: [],
};

async function repo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cr-command-'));
  roots.push(root);
  return root;
}

const cleanGit = async () => ({ stdout: '', stderr: '', code: 0 });

describe('FakeReviewer', () => {
  it('is deterministic and emits findings to the sink', async () => {
    const findings: string[] = [];
    const backend = new FakeReviewer({
      report: {
        ...validReport,
        findings: [
          {
            id: 'f1',
            severity: 'major',
            category: 'tests',
            confidence: 'medium',
            kind: 'issue',
            file: 'src/a.ts',
            lineStart: 1,
            lineEnd: 1,
            title: 'Missing test',
            rationale: 'No coverage.',
            evidence: 'none',
          },
        ],
      },
    });
    const result = await backend.run(
      job(),
      (finding) => {
        findings.push(finding.id);
      },
      new AbortController().signal,
    );
    expect(result.findings[0]?.id).toBe('f1');
    expect(findings).toEqual(['f1']);
    const again = await backend.run(job(), () => undefined, new AbortController().signal);
    expect(again).toEqual(result);
  });
});

describe('CommandReviewer', () => {
  it('runs argv with placeholders and reads the output file', async () => {
    const root = await repo();
    const script = [
      'const fs = require("node:fs");',
      'const prompt = fs.readFileSync(process.argv[1], "utf8");',
      'if (!prompt.includes("Review prompt")) process.exit(9);',
      'if (process.argv[3] !== process.env.REVIEW_REPO) process.exit(10);',
      'if (process.argv[4] !== "rev_1") process.exit(11);',
      'fs.writeFileSync(process.argv[2], JSON.stringify({',
      'schemaVersion:1,summary:"command ok",riskLevel:"low",findings:[],questions:[],',
      'tests:{ran:false,commands:[]},verification:[]}));',
    ].join('');
    const backend = new CommandReviewer({
      command: [
        process.execPath,
        '-e',
        script,
        '{promptFile}',
        '{outputFile}',
        '{repo}',
        '{reviewId}',
      ],
      runGit: cleanGit,
    });
    const result = await backend.run(job(root), () => undefined, new AbortController().signal);
    expect(result.summary).toBe('command ok');
  });

  it('parses the last fenced JSON block from stdout', async () => {
    const script = [
      'process.stdout.write("noise\\n```json\\n" + JSON.stringify({',
      'schemaVersion:1,summary:"fenced",riskLevel:"low",findings:[],questions:[],',
      'tests:{ran:false,commands:[]},verification:[]}) + "\\n```\\n");',
    ].join('');
    const backend = new CommandReviewer({
      command: [process.execPath, '-e', script],
      runGit: cleanGit,
    });
    const result = await backend.run(
      job(await repo()),
      () => undefined,
      new AbortController().signal,
    );
    expect(result.summary).toBe('fenced');
  });

  it('reports timeout and nonzero exit as typed reviewer errors', async () => {
    const timeout = new CommandReviewer({
      command: [process.execPath, '-e', 'setTimeout(() => {}, 5000)'],
      runGit: cleanGit,
      timeoutMs: 30,
    });
    await expect(
      timeout.run(job(await repo()), () => undefined, new AbortController().signal),
    ).rejects.toMatchObject({ name: 'ReviewerError', code: 'timeout' });

    const failing = new CommandReviewer({
      command: [process.execPath, '-e', 'process.exit(3)'],
      runGit: cleanGit,
    });
    await expect(
      failing.run(job(await repo()), () => undefined, new AbortController().signal),
    ).rejects.toMatchObject({ name: 'ReviewerError', code: 'nonzero-exit' });
  });

  it('rejects missing JSON output and respects cancellation', async () => {
    const empty = new CommandReviewer({
      command: [process.execPath, '-e', 'process.stdout.write("not json")'],
      runGit: cleanGit,
    });
    await expect(
      empty.run(job(await repo()), () => undefined, new AbortController().signal),
    ).rejects.toMatchObject({ name: 'ReviewerError', code: 'invalid-output' });

    const controller = new AbortController();
    const slow = new CommandReviewer({
      command: [process.execPath, '-e', 'setTimeout(() => {}, 5000)'],
      runGit: cleanGit,
      timeoutMs: 5000,
    });
    const run = slow.run(job(await repo()), () => undefined, controller.signal);
    setTimeout(() => controller.abort(), 20);
    await expect(run).rejects.toMatchObject({ name: 'ReviewerError', code: 'cancelled' });
  });

  it('flags a dirty worktree using the injected git runner', async () => {
    const root = await repo();
    let calls = 0;
    const runGit = async () => {
      calls += 1;
      return { stdout: calls === 1 ? '' : '?? dirty.txt', stderr: '', code: 0 };
    };
    const script = [
      'require("node:fs").writeFileSync("dirty.txt", "x");',
      'process.stdout.write(JSON.stringify({schemaVersion:1,summary:"dirty",riskLevel:"low",',
      'findings:[],questions:[],tests:{ran:false,commands:[]},verification:[]}));',
    ].join('');
    const backend = new CommandReviewer({
      command: [process.execPath, '-e', script],
      runGit,
    });
    const result = await backend.run(job(root), () => undefined, new AbortController().signal);
    expect(result.dirtyWorktree).toBe(true);
    expect(calls).toBe(2);
  });

  it('never invokes the command through a shell', async () => {
    const backend = new CommandReviewer({
      command: [process.execPath, '-e', 'process.stdout.write("{}")'],
      runGit: cleanGit,
    });
    const result = await backend.run(
      job(await repo()),
      () => undefined,
      new AbortController().signal,
    );
    expect(result).toEqual({});
  });
});
