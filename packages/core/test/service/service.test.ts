import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createId,
  ReviewLifecycle,
  ReviewServiceImpl,
  ReviewStore,
  createEvent,
  summarizeCoverage,
} from '../../src/index.js';
import type {
  Actor,
  DiffScope,
  FileDiff,
  Finding,
  ReviewerBackend,
  ReviewerJob,
  ReviewerReport,
  Snapshot,
} from '../../src/index.js';
import type { ReviewError } from '../../src/index.js';

const actor: Actor = { name: 'Ada', kind: 'human' };
const roots: string[] = [];
const stores: ReviewStore[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(stores.splice(0).map((store) => store.close()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function fileDiff(path: string, lines: string[]): FileDiff {
  return {
    path,
    status: 'modified',
    binary: false,
    oversized: false,
    added: 0,
    deleted: 0,
    hunks: [],
    oldLines: lines,
    newLines: lines,
    contentHash: null,
  };
}

function snapshot(lines = ['one', 'two', 'three', 'four'], headSha = 'b'.repeat(40)): Snapshot {
  return {
    schemaVersion: 1,
    scope: {
      kind: 'range',
      repoRoot: '/tmp/repo',
      baseSha: 'a'.repeat(40),
      headSha,
      label: `${'a'.repeat(7)}..${headSha.slice(0, 7)}`,
      worktreeDigest: headSha,
    },
    files: [fileDiff('src/a.ts', lines)],
    totals: { files: 1, added: 0, deleted: 0, truncated: false },
    warnings: [],
  };
}

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'f1',
    severity: 'blocker',
    category: 'correctness',
    confidence: 'high',
    kind: 'issue',
    file: 'src/a.ts',
    lineStart: 2,
    lineEnd: 2,
    title: 'Off by one',
    rationale: 'The loop skips the last item.',
    evidence: 'for (let i = 0; i < n - 1; i++)',
    ...overrides,
  };
}

function report(findings: Finding[] = [finding()]): ReviewerReport {
  return {
    schemaVersion: 1,
    summary: 'One blocker',
    riskLevel: 'high',
    findings,
    questions: [],
    tests: { ran: true, commands: [{ command: 'pnpm test', result: 'pass', summary: 'ok' }] },
    verification: [],
  };
}

class ReportBackend implements ReviewerBackend {
  readonly kind = 'fake' as const;
  constructor(private readonly value: ReviewerReport) {}
  async run(
    job: ReviewerJob,
    sink: (value: Finding) => Promise<void> | void,
  ): Promise<ReviewerReport> {
    for (const item of this.value.findings) await sink(item);
    return this.value;
  }
}

interface Harness {
  service: ReviewServiceImpl;
  lifecycle: ReviewLifecycle;
  store: ReviewStore;
  root: string;
  scope: DiffScope;
}

async function harness(
  options: {
    report?: ReviewerReport;
    backend?: ReviewerBackend;
    runGit?: (
      cwd: string,
      args: readonly string[],
    ) => Promise<{ stdout: string; code: number; stderr: string }>;
  } = {},
): Promise<Harness> {
  const root = await mkdtemp(join(tmpdir(), 'cr-service-'));
  roots.push(root);
  const store = await ReviewStore.open(root);
  stores.push(store);
  let tick = 0;
  const now = () => new Date(Date.UTC(2026, 9, 26, 12, 0, tick++));
  const lifecycle = new ReviewLifecycle(store, now);
  let round = 0;
  const service = new ReviewServiceImpl({
    lifecycle,
    store,
    now,
    snapshots: {
      async build() {
        round += 1;
        return snapshot(undefined, String(round).padStart(40, 'b'));
      },
    },
    ...(options.backend === undefined && options.report === undefined
      ? {}
      : { backendFactory: () => options.backend ?? new ReportBackend(options.report ?? report()) }),
    ...(options.runGit === undefined ? {} : { runGit: options.runGit }),
  });
  return {
    service,
    lifecycle,
    store,
    root,
    scope: { kind: 'range', baseRef: 'main', headRef: 'feature' },
  };
}

async function expectError(promise: Promise<unknown>, code: ReviewError['code']): Promise<void> {
  await expect(promise).rejects.toMatchObject({ name: 'ReviewError', code });
}

describe('ReviewServiceImpl', () => {
  it('creates a review with round 1 and exposes get/list/snapshot views', async () => {
    const h = await harness();
    const view = await h.service.create(
      { repoRoot: '/tmp/repo', title: 'Service', scope: h.scope },
      { actor },
    );

    expect(view.review).toMatchObject({ title: 'Service', status: 'open', version: 2 });
    expect(view.review.rounds).toHaveLength(1);
    expect(view.review.reviewer).toEqual({ backend: 'none' });
    expect(view.latestSnapshot?.files[0]?.path).toBe('src/a.ts');
    expect(view.report).toBeNull();

    const list = await h.service.list();
    expect(list.total).toBe(1);
    expect(list.items[0]).toMatchObject({ title: 'Service', roundCount: 1, commentCount: 0 });

    const snapshotView = await h.service.snapshot(view.review.id, 1, 'src/a.ts');
    expect(snapshotView).toMatchObject({ round: 1, file: 'src/a.ts' });
    expect(snapshotView.snapshot.files).toHaveLength(1);
    expect(snapshotView.snapshot.totals.files).toBe(1);

    await expect(h.service.get(view.review.id)).resolves.toMatchObject({
      review: { id: view.review.id },
    });
  });

  it('validates and persists the initiator', async () => {
    const h = await harness();
    const initiator = { harness: 'dsh', sessionId: 'session-42', cwd: '/work/repo' };
    const view = await h.service.create(
      { repoRoot: '/tmp/repo', title: 'Initiator', scope: h.scope, initiator },
      { actor },
    );
    expect(view.review.initiator).toEqual(initiator);

    await expectError(
      h.service.create(
        {
          repoRoot: '/tmp/repo',
          title: 'Bad initiator',
          scope: h.scope,
          initiator: { harness: 'dsh', sessionId: '' },
        },
        { actor },
      ),
      'validation',
    );
  });

  it('returns the same review for a repeated create request id', async () => {
    const h = await harness();
    const input = { repoRoot: '/tmp/repo', title: 'Idem', scope: h.scope };
    const first = await h.service.create(input, { actor, requestId: 'create-1' });
    const second = await h.service.create(input, { actor, requestId: 'create-1' });
    expect(second.review.id).toBe(first.review.id);
    expect(second.review.rounds).toHaveLength(1);
    const events = await h.service.events(first.review.id);
    expect(events.filter((event) => event.type === 'review/created')).toHaveLength(1);
    expect(events.filter((event) => event.type === 'round/created')).toHaveLength(1);
  });

  it('adds, replies to, and resolves comments once per request id', async () => {
    const h = await harness();
    const view = await h.service.create(
      { repoRoot: '/tmp/repo', title: 'Comments', scope: h.scope },
      { actor },
    );
    const input = {
      body: 'Please change this',
      path: 'src/a.ts',
      side: 'new' as const,
      lineStart: 2,
    };
    const first = await h.service.addComment(view.review.id, input, { actor, requestId: 'req-1' });
    const retry = await h.service.addComment(view.review.id, input, { actor, requestId: 'req-1' });
    expect(retry.comment.id).toBe(first.comment.id);

    let events = await h.service.events(view.review.id);
    expect(events.filter((event) => event.type === 'comment/added')).toHaveLength(1);

    const replied = await h.service.reply(
      view.review.id,
      first.comment.id,
      { body: 'Done' },
      { actor, requestId: 'req-2' },
    );
    expect(replied.comment.replies).toHaveLength(1);

    const resolved = await h.service.setCommentState(view.review.id, first.comment.id, 'resolved', {
      actor,
      requestId: 'req-3',
    });
    expect(resolved.comment.state).toBe('resolved');

    events = await h.service.events(view.review.id, 3);
    expect(events.every((event) => (event.seq ?? 0) > 3)).toBe(true);
    expect(events.map((event) => event.seq)).toEqual(events.map((_event, index) => 4 + index));
  });

  it('scopes idempotency keys to the operation and review', async () => {
    const h = await harness();
    const first = await h.service.create(
      { repoRoot: '/tmp/repo', title: 'First', scope: h.scope },
      { actor },
    );
    const second = await h.service.create(
      { repoRoot: '/tmp/repo', title: 'Second', scope: h.scope },
      { actor },
    );
    const input = {
      body: 'Same request id',
      path: 'src/a.ts',
      side: 'new' as const,
      lineStart: 2,
    };
    const firstComment = await h.service.addComment(first.review.id, input, {
      actor,
      requestId: 'shared',
    });
    const secondComment = await h.service.addComment(
      second.review.id,
      { ...input, body: 'Second response' },
      { actor, requestId: 'shared' },
    );
    expect(secondComment.comment.id).not.toBe(firstComment.comment.id);
    expect(secondComment.comment.body).toBe('Second response');

    const reply = await h.service.reply(
      first.review.id,
      firstComment.comment.id,
      { body: 'Distinct method' },
      { actor, requestId: 'shared' },
    );
    expect(reply.comment.replies).toHaveLength(1);

    const firstEvents = await h.service.events(first.review.id);
    const secondEvents = await h.service.events(second.review.id);
    expect(firstEvents.filter((event) => event.type === 'comment/added')).toHaveLength(1);
    expect(secondEvents.filter((event) => event.type === 'comment/added')).toHaveLength(1);
    expect(firstEvents.filter((event) => event.type === 'comment/replied')).toHaveLength(1);
  });

  it('executes concurrent duplicate requests once', async () => {
    const h = await harness();
    const view = await h.service.create(
      { repoRoot: '/tmp/repo', title: 'Concurrent', scope: h.scope },
      { actor },
    );
    const input = {
      body: 'Only once',
      path: 'src/a.ts',
      side: 'new' as const,
      lineStart: 2,
    };
    const [first, second] = await Promise.all([
      h.service.addComment(view.review.id, input, { actor, requestId: 'burst' }),
      h.service.addComment(view.review.id, input, { actor, requestId: 'burst' }),
    ]);
    expect(second.comment.id).toBe(first.comment.id);
    const events = await h.service.events(view.review.id);
    expect(events.filter((event) => event.type === 'comment/added')).toHaveLength(1);
    expect((await h.service.get(view.review.id)).review.comments).toHaveLength(1);
  });

  it('translates missing reviews, rounds, comments and invalid input to typed errors', async () => {
    const h = await harness();
    await expectError(h.service.get('rev_missing'), 'not-found');
    const view = await h.service.create(
      { repoRoot: '/tmp/repo', title: 'Errors', scope: h.scope },
      { actor },
    );
    await expectError(h.service.snapshot(view.review.id, 99), 'not-found');
    await expectError(
      h.service.addComment(
        view.review.id,
        { body: '', path: 'src/a.ts', side: 'new', lineStart: 1 },
        { actor },
      ),
      'validation',
    );
    await expectError(
      h.service.addComment(
        view.review.id,
        { body: 'x', path: 'missing.ts', side: 'new', lineStart: 1 },
        { actor },
      ),
      'validation',
    );
    await expectError(
      h.service.reply(view.review.id, 'cmt_missing', { body: 'x' }, { actor }),
      'not-found',
    );
    await expectError(
      h.service.create({ repoRoot: '/tmp/repo', title: '', scope: h.scope }, { actor }),
      'validation',
    );
  });

  it('runs a configured backend, persists findings/report and skips duplicate runs', async () => {
    const h = await harness({ report: report() });
    const view = await h.service.create(
      {
        repoRoot: '/tmp/repo',
        title: 'Reviewer',
        scope: h.scope,
        reviewer: { backend: 'fake' },
      },
      { actor },
    );

    const result = await h.service.runReviewer(view.review.id, { actor, requestId: 'run-1' });
    expect(result.findings).toHaveLength(1);
    expect(result.backend).toBe('fake');
    const loaded = await h.service.get(view.review.id);
    expect(loaded.report?.findings[0]).toMatchObject({ id: 'f1' });
    expect(loaded.review.agent).toMatchObject({ status: 'done', round: 1 });

    const retry = await h.service.runReviewer(view.review.id, { actor, requestId: 'run-1' });
    expect(retry.findings).toHaveLength(1);
    const events = await h.service.events(view.review.id);
    expect(events.filter((event) => event.type === 'agent/started')).toHaveLength(1);
    expect(events.filter((event) => event.type === 'agent/report')).toHaveLength(1);
  });

  it('records a skipped report for the none backend', async () => {
    const h = await harness();
    const view = await h.service.create(
      { repoRoot: '/tmp/repo', title: 'None', scope: h.scope },
      { actor },
    );
    const result = await h.service.runReviewer(view.review.id, { actor });
    expect(result).toMatchObject({ backend: 'none', skipped: true, findings: [] });
    const loaded = await h.service.get(view.review.id);
    expect(loaded.review.agent?.status).toBe('skipped');
    expect(loaded.report?.skipped).toBe(true);
  });

  it('submits once, closes on approve and builds a deterministic feedback package', async () => {
    const h = await harness({ report: report() });
    const view = await h.service.create(
      {
        repoRoot: '/tmp/repo',
        title: 'Submit',
        scope: h.scope,
        reviewer: { backend: 'fake' },
      },
      { actor },
    );
    await h.service.runReviewer(view.review.id, { actor });
    const applied = await h.service.addComment(
      view.review.id,
      {
        body: 'Apply this',
        path: 'src/a.ts',
        side: 'new',
        lineStart: 2,
        suggestion: { original: 'two', replacement: 'TWO' },
      },
      { actor },
    );
    await h.store.append(
      view.review.id,
      createEvent({
        reviewId: view.review.id,
        type: 'suggestion/applied',
        actor,
        data: { commentId: applied.comment.id, round: 1 },
      }),
    );
    const accepted = await h.service.addComment(
      view.review.id,
      {
        body: 'Consider this',
        path: 'src/a.ts',
        side: 'new',
        lineStart: 3,
        suggestion: { original: 'three', replacement: '3' },
      },
      { actor },
    );
    const resolved = await h.service.addComment(
      view.review.id,
      { body: 'Resolved item', path: 'src/a.ts', side: 'new', lineStart: 1 },
      { actor },
    );
    await h.service.setCommentState(view.review.id, resolved.comment.id, 'resolved', { actor });

    const submission = await h.service
      .submit(view.review.id, { verdict: 'check' as never, summary: 'x' }, { actor })
      .catch((error: unknown) => error);
    expect(submission).toMatchObject({ name: 'ReviewError', code: 'validation' });

    const first = await h.service.submit(
      view.review.id,
      { verdict: 'request-changes', summary: 'Please fix' },
      { actor, requestId: 'submit-1' },
    );
    expect(first.deliveryKey).toBe(
      `${view.review.id}:1:${first.feedback.deliveryKey.split(':')[2]}`,
    );
    expect(first.feedback.markdown).toContain('### Замечания агента (к исправлению)');
    expect(first.feedback.markdown).toContain('### Комментарии человека (open)');
    expect(first.feedback.markdown).toContain('применено человеком (не применять повторно)');
    expect(first.feedback.markdown).toContain('принято, но не применено');
    expect(first.feedback.json.appliedSuggestions).toHaveLength(1);
    expect(first.feedback.json.acceptedSuggestions).toHaveLength(1);
    expect(first.feedback.json.humanComments).toHaveLength(2);
    expect(first.feedback.json.resolved.count).toBe(1);

    const retry = await h.service.submit(
      view.review.id,
      { verdict: 'request-changes', summary: 'Please fix' },
      { actor, requestId: 'submit-1' },
    );
    expect(retry.deliveryKey).toBe(first.deliveryKey);
    const events = await h.service.events(view.review.id);
    expect(events.filter((event) => event.type === 'review/submitted')).toHaveLength(1);
    expect((await h.service.get(view.review.id)).review.status).toBe('open');

    await expectError(
      h.service.submit(view.review.id, { verdict: 'comment' }, { actor }),
      'conflict',
    );
    expect(accepted.comment.id).toMatch(/^cmt_/);
  });

  it('closes an approved review and caps oversized feedback markdown', async () => {
    const h = await harness();
    const view = await h.service.create(
      { repoRoot: '/tmp/repo', title: 'Approve', scope: h.scope },
      { actor },
    );
    await h.service.addComment(
      view.review.id,
      { body: 'z'.repeat(120 * 1024), path: 'src/a.ts', side: 'new', lineStart: 1 },
      { actor },
    );
    const submission = await h.service.submit(view.review.id, { verdict: 'approve' }, { actor });
    expect(Buffer.byteLength(submission.feedback.markdown, 'utf8')).toBeLessThanOrEqual(100 * 1024);
    expect(submission.feedback.markdown).toContain('feedback truncated at');
    const loaded = await h.service.get(view.review.id);
    expect(loaded.review.status).toBe('closed');
    await expectError(
      h.service.submit(view.review.id, { verdict: 'comment' }, { actor }),
      'conflict',
    );
  });

  it('backfills seq for legacy logs and continues numbering', async () => {
    const h = await harness();
    const view = await h.service.create(
      { repoRoot: '/tmp/repo', title: 'Legacy', scope: h.scope },
      { actor },
    );
    const path = join(h.root, 'reviews', view.review.id, 'events.jsonl');
    const lines = (await readFile(path, 'utf8')).trimEnd().split('\n');
    await writeFile(
      path,
      `${lines.map((line) => JSON.stringify({ ...JSON.parse(line), seq: undefined })).join('\n')}\n`,
    );
    const events = await h.service.events(view.review.id);
    expect(events.map((event) => event.seq)).toEqual([1, 2]);
    const appended = await h.store
      .append(
        view.review.id,
        createEvent({
          reviewId: view.review.id,
          type: 'comment/state',
          actor,
          data: { commentId: 'cmt_missing', state: 'open' },
        }),
      )
      .catch((error: unknown) => error);
    expect(appended).toMatchObject({ name: 'ReviewFoldError' });
  });

  it('cancels an active reviewer and persists a failed agent event', async () => {
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const backend: ReviewerBackend = {
      kind: 'fake',
      async run(_job, _sink, signal) {
        markStarted();
        await new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        });
        return report([]);
      },
    };
    const h = await harness({ backend });
    const view = await h.service.create(
      { repoRoot: '/tmp/repo', title: 'Cancel', scope: h.scope, reviewer: { backend: 'fake' } },
      { actor },
    );
    const run = h.service.runReviewer(view.review.id, { actor });
    // Wait for the fake backend to start; a fixed sleep races under the full
    // parallel suite and can cancel before the active job is registered.
    await started;
    await h.service.cancelAgent(view.review.id, { actor });
    await expectError(run, 'conflict');
    const events = await h.service.events(view.review.id);
    expect(events.some((event) => event.type === 'agent/failed')).toBe(true);
    expect((await h.service.get(view.review.id)).review.agent?.status).toBe('failed');
  });

  it('does not start a backend that was cancelled while the run was being prepared', async () => {
    let releaseAppend: (() => void) | undefined;
    const blockedAppend = new Promise<void>((resolve) => {
      releaseAppend = resolve;
    });
    let appendEntered: (() => void) | undefined;
    const appendStarted = new Promise<void>((resolve) => {
      appendEntered = resolve;
    });
    let backendStarted = false;
    const backend: ReviewerBackend = {
      kind: 'fake',
      async run(_job, _sink, signal) {
        backendStarted = true;
        if (signal.aborted) throw new Error('started after cancellation');
        return report([]);
      },
    };
    const h = await harness({ backend });
    const originalAppend = h.store.append.bind(h.store);
    vi.spyOn(h.store, 'append').mockImplementation(async (reviewId, event) => {
      if (event.type === 'agent/started') {
        appendEntered?.();
        await blockedAppend;
      }
      return originalAppend(reviewId, event);
    });
    const view = await h.service.create(
      {
        repoRoot: '/tmp/repo',
        title: 'Cancel race',
        scope: h.scope,
        reviewer: { backend: 'fake' },
      },
      { actor },
    );

    const run = h.service.runReviewer(view.review.id, { actor });
    await appendStarted;
    await h.service.cancelAgent(view.review.id, { actor });
    releaseAppend?.();

    await expectError(run, 'conflict');
    expect(backendStarted).toBe(false);
    expect((await h.service.get(view.review.id)).review.agent?.status).toBe('failed');
  });

  it('persists agent/finding and marks a backend failure', async () => {
    const backend: ReviewerBackend = {
      kind: 'fake',
      async run(job, sink) {
        await sink(finding());
        throw new Error('backend exploded');
      },
    };
    const h = await harness({ backend });
    const view = await h.service.create(
      { repoRoot: '/tmp/repo', title: 'Fail', scope: h.scope, reviewer: { backend: 'fake' } },
      { actor },
    );
    await expectError(h.service.runReviewer(view.review.id, { actor }), 'internal');
    const events = await h.service.events(view.review.id);
    expect(events.filter((event) => event.type === 'agent/finding')).toHaveLength(1);
    expect(events.filter((event) => event.type === 'agent/failed')).toHaveLength(1);
  });

  it('runs the configured command backend and persists dirty-worktree warnings', async () => {
    let calls = 0;
    const runGit = async () => {
      calls += 1;
      return { stdout: calls === 1 ? '' : '?? dirty.txt', stderr: '', code: 0 };
    };
    const script = [
      'const fs = require("node:fs");',
      'fs.writeFileSync(process.argv[1], JSON.stringify({schemaVersion:1,summary:"command",',
      'riskLevel:"low",findings:[],questions:[],tests:{ran:false,commands:[]},verification:[]}));',
    ].join('');
    const h = await harness({ runGit });
    const view = await h.service.create(
      {
        repoRoot: h.root,
        title: 'Command',
        scope: h.scope,
        reviewer: {
          backend: 'command',
          command: [process.execPath, '-e', script, '{outputFile}'],
        },
      },
      { actor },
    );
    const result = await h.service.runReviewer(view.review.id, { actor });
    expect(result).toMatchObject({ backend: 'command', summary: 'command', dirtyWorktree: true });
    expect(result.warnings).toContain('dirty-worktree');
    expect(calls).toBe(2);
  });

  it('rejects a refresh while the reviewer is active', async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const backend: ReviewerBackend = {
      kind: 'fake',
      async run() {
        await gate;
        return report([]);
      },
    };
    const h = await harness({ backend });
    const view = await h.service.create(
      {
        repoRoot: '/tmp/repo',
        title: 'Busy refresh',
        scope: h.scope,
        reviewer: { backend: 'fake' },
      },
      { actor },
    );
    const first = h.service.runReviewer(view.review.id, { actor });
    await new Promise((resolve) => setTimeout(resolve, 10));
    await expectError(h.service.refresh(view.review.id, {}, { actor }), 'agent-busy');
    release?.();
    await first;
  });

  it('rejects fix claims for a closed review', async () => {
    const h = await harness();
    const view = await h.service.create(
      { repoRoot: '/tmp/repo', title: 'Closed claims', scope: h.scope },
      { actor },
    );
    const comment = await h.service.addComment(
      view.review.id,
      { body: 'Fix me', path: 'src/a.ts', side: 'new', lineStart: 2 },
      { actor },
    );
    await h.service.close(view.review.id, 'closed', { actor });
    await expectError(
      h.service.claimFixStatus(
        view.review.id,
        { items: [{ commentId: comment.comment.id, status: 'fixed' }] },
        { actor },
      ),
      'conflict',
    );
  });

  it('decides the latest reviewer finding and replays it', async () => {
    const h = await harness({ report: report() });
    const view = await h.service.create(
      {
        repoRoot: '/tmp/repo',
        title: 'Decisions',
        scope: h.scope,
        reviewer: { backend: 'fake' },
      },
      { actor },
    );
    await h.service.runReviewer(view.review.id, { actor });

    const first = await h.service.decideFinding(
      view.review.id,
      'f1',
      { state: 'accepted', note: '  Fix before merge  ' },
      { actor, requestId: 'decision-1' },
    );
    expect(first.decision).toMatchObject({
      findingId: 'f1',
      round: 1,
      state: 'accepted',
      note: 'Fix before merge',
    });
    const replay = await h.service.decideFinding(
      view.review.id,
      'f1',
      { state: 'dismissed' },
      { actor, requestId: 'decision-1' },
    );
    expect(replay).toEqual(first);

    const loaded = await h.service.get(view.review.id);
    expect(loaded.review.findingDecisions).toEqual([first.decision]);
  });

  it('accepts every remaining non-praise finding without overwriting a human decision', async () => {
    const h = await harness({
      report: report([
        finding({ id: 'f1' }),
        finding({ id: 'f2' }),
        finding({ id: 'f3', kind: 'praise' }),
      ]),
    });
    const view = await h.service.create(
      {
        repoRoot: '/tmp/repo',
        title: 'Bulk decisions',
        scope: h.scope,
        reviewer: { backend: 'fake' },
      },
      { actor },
    );
    await h.service.runReviewer(view.review.id, { actor });
    const existing = await h.service.decideFinding(
      view.review.id,
      'f1',
      { state: 'dismissed', note: 'Already handled' },
      { actor },
    );

    const bulk = await h.service.decideFindings(
      view.review.id,
      { state: 'accepted' },
      { actor, requestId: 'bulk-decisions-1' },
    );

    expect(bulk).toMatchObject({
      decisions: [
        {
          findingId: 'f2',
          round: 1,
          state: 'accepted',
          by: actor,
        },
      ],
      skipped: 2,
    });
    const loaded = await h.service.get(view.review.id);
    expect(loaded.review.findingDecisions).toEqual([
      existing.decision,
      expect.objectContaining({ findingId: 'f2', state: 'accepted' }),
    ]);
    expect(loaded.review.findingDecisions).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ findingId: 'f3' })]),
    );

    const replay = await h.service.decideFindings(
      view.review.id,
      { state: 'dismissed' },
      { actor, requestId: 'bulk-decisions-1' },
    );
    // A different state is a different operation even when the client reuses a request id.
    expect(replay).toEqual({ decisions: [], skipped: 3 });
    expect((await h.service.get(view.review.id)).review.findingDecisions).toEqual([
      existing.decision,
      expect.objectContaining({ findingId: 'f2', state: 'accepted' }),
    ]);
  });

  it('decides only the selected findings', async () => {
    const h = await harness({
      report: report([finding({ id: 'f1' }), finding({ id: 'f2' }), finding({ id: 'f3' })]),
    });
    const view = await h.service.create(
      {
        repoRoot: '/tmp/repo',
        title: 'Selected bulk decisions',
        scope: h.scope,
        reviewer: { backend: 'fake' },
      },
      { actor },
    );
    await h.service.runReviewer(view.review.id, { actor });

    const bulk = await h.service.decideFindings(
      view.review.id,
      { state: 'accepted', findingIds: ['f2'] },
      { actor, requestId: 'bulk-selected-1' },
    );

    expect(bulk).toEqual({
      decisions: [expect.objectContaining({ findingId: 'f2', state: 'accepted', round: 1 })],
      skipped: 0,
    });
    expect((await h.service.get(view.review.id)).review.findingDecisions).toEqual([
      expect.objectContaining({ findingId: 'f2' }),
    ]);
  });

  it('skips praise, already decided and unknown selected findings', async () => {
    const h = await harness({
      report: report([
        finding({ id: 'f1' }),
        finding({ id: 'f2', kind: 'praise' }),
        finding({ id: 'f3' }),
      ]),
    });
    const view = await h.service.create(
      {
        repoRoot: '/tmp/repo',
        title: 'Filtered selected decisions',
        scope: h.scope,
        reviewer: { backend: 'fake' },
      },
      { actor },
    );
    await h.service.runReviewer(view.review.id, { actor });
    await h.service.decideFinding(
      view.review.id,
      'f1',
      { state: 'dismissed' },
      { actor, requestId: 'selected-existing' },
    );

    const bulk = await h.service.decideFindings(
      view.review.id,
      { state: 'accepted', findingIds: ['f1', 'f2', 'f3', 'missing'] },
      { actor, requestId: 'bulk-selected-skip' },
    );

    expect(bulk).toEqual({
      decisions: [expect.objectContaining({ findingId: 'f3', state: 'accepted', round: 1 })],
      skipped: 3,
    });
    expect((await h.service.get(view.review.id)).review.findingDecisions).toEqual([
      expect.objectContaining({ findingId: 'f1', state: 'dismissed' }),
      expect.objectContaining({ findingId: 'f3', state: 'accepted' }),
    ]);
  });

  it('rejects an empty or oversized selected finding list', async () => {
    const h = await harness({ report: report([finding({ id: 'f1' })]) });
    const view = await h.service.create(
      {
        repoRoot: '/tmp/repo',
        title: 'Invalid selected decisions',
        scope: h.scope,
        reviewer: { backend: 'fake' },
      },
      { actor },
    );
    await h.service.runReviewer(view.review.id, { actor });

    await expectError(
      h.service.decideFindings(
        view.review.id,
        { state: 'accepted', findingIds: [] },
        { actor, requestId: 'bulk-empty' },
      ),
      'validation',
    );
    await expectError(
      h.service.decideFindings(
        view.review.id,
        {
          state: 'accepted',
          findingIds: Array.from({ length: 1001 }, (_, index) => `f${index}`),
        },
        { actor, requestId: 'bulk-oversized' },
      ),
      'validation',
    );
  });

  it('does not duplicate decisions when concurrent bulk requests target the same findings', async () => {
    const h = await harness({
      report: report([finding({ id: 'f1' }), finding({ id: 'f2' })]),
    });
    const view = await h.service.create(
      {
        repoRoot: '/tmp/repo',
        title: 'Concurrent bulk decisions',
        scope: h.scope,
        reviewer: { backend: 'fake' },
      },
      { actor },
    );
    await h.service.runReviewer(view.review.id, { actor });

    const [accepted, dismissed] = await Promise.all([
      h.service.decideFindings(
        view.review.id,
        { state: 'accepted' },
        { actor, requestId: 'bulk-concurrent-accepted' },
      ),
      h.service.decideFindings(
        view.review.id,
        { state: 'dismissed' },
        { actor, requestId: 'bulk-concurrent-dismissed' },
      ),
    ]);

    expect(accepted.decisions.length + dismissed.decisions.length).toBe(2);
    const loaded = await h.service.get(view.review.id);
    const decisions = loaded.review.findingDecisions ?? [];
    expect(decisions).toHaveLength(2);
    expect(new Set(decisions.map((decision) => decision.findingId))).toEqual(new Set(['f1', 'f2']));
    expect(new Set(decisions.map((decision) => decision.state)).size).toBe(1);
  });

  it('rejects bulk decisions for a coverage-partial stored report', async () => {
    const h = await harness({ report: report() });
    const view = await h.service.create(
      {
        repoRoot: '/tmp/repo',
        title: 'Partial bulk decisions',
        scope: h.scope,
        reviewer: { backend: 'fake' },
      },
      { actor },
    );
    await h.service.runReviewer(view.review.id, { actor });

    const files = [{ path: 'src/a.ts', status: 'failed' as const }];
    await h.store.append(
      view.review.id,
      createEvent({
        reviewId: view.review.id,
        type: 'agent/report',
        actor: { name: 'Reviewer', kind: 'agent' },
        data: {
          report: {
            ...report(),
            reviewId: view.review.id,
            round: 1,
            backend: 'fake',
            rejected: [],
            warnings: [],
          },
          coverage: { files, totals: summarizeCoverage(files) },
        },
      }),
    );
    const loaded = await h.service.get(view.review.id);
    expect(loaded.review.agent?.status).toBe('partial');

    await expectError(
      h.service.decideFindings(view.review.id, { state: 'accepted' }, { actor }),
      'validation',
    );
    expect((await h.service.get(view.review.id)).review.findingDecisions ?? []).toEqual([]);
  });

  it('rejects bulk decisions when the latest round has no report', async () => {
    const h = await harness({ report: report() });
    const view = await h.service.create(
      {
        repoRoot: '/tmp/repo',
        title: 'Stale bulk decisions',
        scope: h.scope,
        reviewer: { backend: 'fake' },
      },
      { actor },
    );
    await h.service.runReviewer(view.review.id, { actor });
    await h.lifecycle.addRound(view.review.id, snapshot(undefined, 'c'.repeat(40)), actor);

    await expectError(
      h.service.decideFindings(view.review.id, { state: 'accepted' }, { actor }),
      'validation',
    );
  });

  it('rejects bulk decisions before a final report exists', async () => {
    const h = await harness();
    const view = await h.service.create(
      {
        repoRoot: '/tmp/repo',
        title: 'Unreported bulk decisions',
        scope: h.scope,
      },
      { actor },
    );

    await expectError(
      h.service.decideFindings(view.review.id, { state: 'accepted' }, { actor }),
      'validation',
    );
  });

  it('rejects bulk decisions for a closed review', async () => {
    const h = await harness({ report: report() });
    const view = await h.service.create(
      {
        repoRoot: '/tmp/repo',
        title: 'Closed bulk decisions',
        scope: h.scope,
        reviewer: { backend: 'fake' },
      },
      { actor },
    );
    await h.service.runReviewer(view.review.id, { actor });
    await h.service.close(view.review.id, 'closed', { actor });

    await expectError(
      h.service.decideFindings(view.review.id, { state: 'accepted' }, { actor }),
      'conflict',
    );
  });

  it('rejects unknown findings and invalid decision notes through the service', async () => {
    const h = await harness({ report: report() });
    const view = await h.service.create(
      {
        repoRoot: '/tmp/repo',
        title: 'Bad decisions',
        scope: h.scope,
        reviewer: { backend: 'fake' },
      },
      { actor },
    );
    await h.service.runReviewer(view.review.id, { actor });

    await expectError(
      h.service.decideFinding(view.review.id, 'missing', { state: 'accepted' }, { actor }),
      'not-found',
    );
    await expectError(
      h.service.decideFinding(
        view.review.id,
        'f1',
        { state: 'accepted', note: 'x'.repeat(4001) },
        { actor },
      ),
      'validation',
    );
  });

  it('updates review metadata, then hides a soft-deleted review', async () => {
    const h = await harness();
    const view = await h.service.create(
      { repoRoot: '/tmp/repo', title: 'Wrong title', scope: h.scope },
      { actor },
    );

    const updated = await h.service.updateReview(
      view.review.id,
      { title: '  Corrected  ', reviewer: { backend: 'worker' } },
      { actor },
    );
    expect(updated.review).toMatchObject({
      title: 'Corrected',
      reviewer: { backend: 'worker' },
      updatedBy: actor,
    });

    await h.service.deleteReview(view.review.id, { actor }, 'duplicate');
    await expectError(h.service.get(view.review.id), 'not-found');
    expect(await h.service.list()).toEqual({ items: [], total: 0, limit: 50, offset: 0 });
  });

  it('adds a round when the review scope changes', async () => {
    const h = await harness();
    const view = await h.service.create(
      { repoRoot: '/tmp/repo', title: 'Scope', scope: h.scope },
      { actor },
    );
    const nextScope: DiffScope = { kind: 'range', baseRef: 'main', headRef: 'next' };

    const updated = await h.service.updateReview(view.review.id, { scope: nextScope }, { actor });

    expect(updated.review.rounds).toHaveLength(2);
    expect(updated.review.rounds.at(-1)?.no).toBe(2);
  });

  it('re-anchors comments when the review scope changes', async () => {
    const h = await harness();
    const view = await h.service.create(
      { repoRoot: '/tmp/repo', title: 'Scope anchors', scope: h.scope },
      { actor },
    );
    const created = await h.service.addComment(
      view.review.id,
      { body: 'Keep this line', path: 'src/a.ts', side: 'new', lineStart: 2 },
      { actor },
    );

    const updated = await h.service.updateReview(
      view.review.id,
      { scope: { kind: 'range', baseRef: 'main', headRef: 'next' } },
      { actor },
    );

    const comment = updated.review.comments.find((item) => item.id === created.comment.id);
    expect(comment?.anchors.map((anchor) => anchor.round)).toEqual([1, 2]);
    expect(comment?.outcomes).toHaveLength(1);
  });

  it('edits and soft-deletes comments through the service', async () => {
    const h = await harness();
    const view = await h.service.create(
      { repoRoot: '/tmp/repo', title: 'Comments', scope: h.scope },
      { actor },
    );
    const created = await h.service.addComment(
      view.review.id,
      { body: 'Original', path: 'src/a.ts', side: 'new', lineStart: 2 },
      { actor },
    );

    const edited = await h.service.editComment(
      view.review.id,
      created.comment.id,
      { body: 'Corrected' },
      { actor },
    );
    expect(edited.comment).toMatchObject({ body: 'Corrected', editedBy: actor });

    const deleted = await h.service.deleteComment(view.review.id, created.comment.id, { actor });
    expect(deleted.comment.deletedAt).toBeDefined();
    expect((await h.service.get(view.review.id)).review.comments[0]?.deletedAt).toBeDefined();
  });

  it('soft-deletes the review, cancels the active reviewer and hides feedback', async () => {
    const backend: ReviewerBackend = {
      kind: 'fake',
      async run(_job, _sink, signal) {
        await new Promise((_resolve, reject) => {
          if (signal.aborted) {
            reject(new Error('aborted'));
            return;
          }
          signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        });
        return report([]);
      },
    };
    const h = await harness({ backend });
    const view = await h.service.create(
      { repoRoot: '/tmp/repo', title: 'Delete me', scope: h.scope, reviewer: { backend: 'fake' } },
      { actor },
    );
    const run = h.service.runReviewer(view.review.id, { actor }).catch((error: unknown) => error);
    await new Promise((resolve) => setTimeout(resolve, 10));

    await h.service.deleteReview(view.review.id, { actor }, 'duplicate');
    expect(await run).toMatchObject({ name: 'ReviewError', code: 'conflict' });
    await expectError(h.service.get(view.review.id), 'not-found');
    await expectError(h.service.latestFeedback(view.review.id), 'not-found');
    await expectError(
      h.service.claimFixStatus(
        view.review.id,
        { items: [{ commentId: 'c1', status: 'fixed' }] },
        { actor },
      ),
      'not-found',
    );

    const state = await h.store.load(view.review.id);
    expect(state.deletedAt).toBeDefined();
    expect(state.deletedBy).toEqual(actor);
    await h.service.deleteReview(view.review.id, { actor });
  });

  it('rejects a scope change while a reviewer is active', async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const backend: ReviewerBackend = {
      kind: 'fake',
      async run() {
        await gate;
        return report([]);
      },
    };
    const h = await harness({ backend });
    const view = await h.service.create(
      { repoRoot: '/tmp/repo', title: 'Busy scope', scope: h.scope, reviewer: { backend: 'fake' } },
      { actor },
    );
    const run = h.service.runReviewer(view.review.id, { actor });
    await new Promise((resolve) => setTimeout(resolve, 10));

    await expectError(
      h.service.updateReview(
        view.review.id,
        { scope: { kind: 'range', baseRef: 'main', headRef: 'other' } },
        { actor },
      ),
      'agent-busy',
    );
    release?.();
    await run;
  });

  it('rejects a reviewer while another run is active', async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const backend: ReviewerBackend = {
      kind: 'fake',
      async run() {
        await gate;
        return report([]);
      },
    };
    const h = await harness({ backend });
    const view = await h.service.create(
      { repoRoot: '/tmp/repo', title: 'Busy', scope: h.scope, reviewer: { backend: 'fake' } },
      { actor },
    );
    const first = h.service.runReviewer(view.review.id, { actor });
    await new Promise((resolve) => setTimeout(resolve, 10));
    await expectError(
      h.service.runReviewer(view.review.id, { actor, requestId: 'second' }),
      'agent-busy',
    );
    release?.();
    await first;
  });
});

describe('service id prefixes', () => {
  it('creates submission and job ids with known prefixes', () => {
    expect(createId('sub', () => new Date('2026-10-26T12:00:00.000Z'))).toMatch(/^sub_/);
    expect(createId('job', () => new Date('2026-10-26T12:00:00.000Z'))).toMatch(/^job_/);
  });
});
