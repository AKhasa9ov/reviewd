// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type {
  AgentReport,
  AgentState,
  FileDiff,
  Finding,
  ReviewEvent,
  ReviewView,
  Snapshot,
} from '@dsh-code-review/core';
import type { ApiClient } from '../src/api/client.js';
import { ToastProvider } from '../src/primitives/Toast.js';
import { ReviewDetail } from '../src/review/ReviewDetail.js';
import { liveReportFor } from '../src/review/model.js';

const scope = {
  kind: 'range' as const,
  repoRoot: '/repo',
  baseSha: 'a',
  headSha: 'b',
  label: 'main → feature',
  worktreeDigest: 'd',
};

function finding(id: string, title: string): Finding {
  return {
    id,
    severity: 'major',
    category: 'correctness',
    confidence: 'high',
    kind: 'issue',
    file: 'src/live.ts',
    lineStart: 1,
    lineEnd: 1,
    title,
    rationale: 'why',
    evidence: 'code',
  };
}

function report(overrides: Partial<AgentReport> = {}): AgentReport {
  return {
    schemaVersion: 1,
    summary: 'shard summary',
    riskLevel: 'low',
    findings: [],
    questions: [],
    tests: { ran: false, commands: [] },
    verification: [],
    reviewId: 'rev_1',
    round: 1,
    backend: 'worker',
    rejected: [],
    warnings: [],
    ...overrides,
  };
}

function shard(index: number, count: number, value: AgentReport) {
  return {
    shardId: `shard_${String(index + 1).padStart(3, '0')}`,
    shardIndex: index,
    shardCount: count,
    round: 1,
    report: value,
  };
}

function view(
  agent: AgentState,
  final: AgentReport | null = null,
  files: FileDiff[] = [],
): ReviewView {
  const snapshot: Snapshot = {
    schemaVersion: 2,
    scope,
    files,
    totals: { files: files.length, added: 0, deleted: 0, truncated: false },
    warnings: [],
  };
  return {
    review: {
      id: 'rev_1',
      title: 'Live report',
      repoRoot: '/repo',
      status: 'open',
      createdAt: '2026-10-29T10:00:00.000Z',
      rounds: [
        {
          no: 1,
          snapshotId: 'snap_1',
          createdAt: '2026-10-29T10:00:00.000Z',
          baseSha: 'a',
          headSha: 'b',
          path: '/repo',
        },
      ],
      comments: [],
      version: 1,
      agent,
    },
    latestSnapshot: snapshot,
    report: final,
  };
}

function clientFor(value: ReviewView, events?: ApiClient['events']): ApiClient {
  return {
    getReview: vi.fn(async () => value),
    latestFeedback: vi.fn(async () => null),
    getSnapshot: vi.fn(async () => ({ snapshot: value.latestSnapshot, round: 1 })),
    events: events ?? vi.fn(() => new Promise(() => {})),
  } as unknown as ApiClient;
}

function renderReport(client: ApiClient, location = '/review/rev_1?tab=report'): void {
  render(
    <ToastProvider>
      <ReviewDetail client={client} id="rev_1" location={location} />
    </ToastProvider>,
  );
}

describe('live reviewer report', () => {
  it('shows findings from completed shards before the final report exists', async () => {
    const value = view({
      status: 'running',
      round: 1,
      findings: [],
      shards: [
        shard(
          1,
          2,
          report({ summary: 'second shard', findings: [finding('f2', 'Second live finding')] }),
        ),
        shard(
          0,
          2,
          report({ summary: 'first shard', findings: [finding('f1', 'First live finding')] }),
        ),
      ],
    });

    renderReport(clientFor(value));

    expect(await screen.findByText('First live finding')).toBeInTheDocument();
    expect(screen.getByText('Second live finding')).toBeInTheDocument();
    const notice = screen.getByText('Live partial report').closest('p');
    expect(notice).toHaveTextContent('2 of 2');
    expect(screen.getByRole('tab', { name: /Report/ })).toHaveTextContent('2');
  });

  it('prefers the final aggregate when it is available', async () => {
    const final = report({
      summary: 'Final summary',
      findings: [finding('final', 'Final finding')],
    });
    const value = view(
      {
        status: 'done',
        round: 1,
        findings: final.findings,
        shards: [
          shard(
            0,
            1,
            report({ summary: 'shard summary', findings: [finding('partial', 'Partial finding')] }),
          ),
        ],
      },
      final,
    );

    renderReport(clientFor(value));

    expect(await screen.findByText('Final finding')).toBeInTheDocument();
    expect(screen.queryByText('Partial finding')).not.toBeInTheDocument();
    expect(screen.queryByText(/Live partial report/)).not.toBeInTheDocument();
  });

  it('updates the report when a shard event arrives', async () => {
    const value = view({ status: 'running', round: 1, findings: [], shards: [] });
    const event: ReviewEvent = {
      v: 1,
      id: 'evt_2',
      seq: 2,
      reviewId: 'rev_1',
      type: 'agent/shard',
      at: '2026-10-29T10:00:01.000Z',
      actor: { name: 'reviewd', kind: 'system' },
      data: {
        shardId: 'shard_001',
        shardIndex: 0,
        shardCount: 1,
        round: 1,
        report: report({
          summary: 'streamed shard',
          findings: [finding('f1', 'Streamed finding')],
        }),
      },
    };
    const events = vi
      .fn<ApiClient['events']>()
      .mockResolvedValueOnce({ events: [event], latestSeq: 2 })
      .mockImplementation(() => new Promise(() => {}));

    renderReport(clientFor(value, events));

    expect(await screen.findByText('Streamed finding')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Report/ })).toHaveTextContent('1');
    });
  });

  it('renders partial findings inline in the diff', async () => {
    const file: FileDiff = {
      path: 'src/live.ts',
      status: 'modified',
      binary: false,
      oversized: false,
      added: 1,
      deleted: 1,
      contentHash: 'h1',
      hunks: [
        {
          oldStart: 1,
          oldLines: 1,
          newStart: 1,
          newLines: 1,
          header: '@@ -1 +1 @@',
          lines: [{ kind: 'add', oldNo: null, newNo: 1, text: 'const live = true;' }],
        },
      ],
      newLines: ['const live = true;'],
    };
    const value = view(
      {
        status: 'running',
        round: 1,
        findings: [],
        shards: [shard(0, 1, report({ findings: [finding('f1', 'Inline live finding')] }))],
      },
      null,
      [file],
    );

    renderReport(clientFor(value), '/review/rev_1?tab=files');

    expect(await screen.findByText('Inline live finding')).toBeInTheDocument();
  });

  it('replaces the partial preview when the final report event arrives', async () => {
    const value = view({
      status: 'running',
      round: 1,
      findings: [],
      shards: [shard(0, 1, report({ findings: [finding('partial', 'Partial finding')] }))],
    });
    const final = report({
      summary: 'Final summary',
      findings: [finding('final', 'Final finding')],
    });
    const event: ReviewEvent = {
      v: 1,
      id: 'evt_2',
      seq: 2,
      reviewId: 'rev_1',
      type: 'agent/report',
      at: '2026-10-29T10:00:01.000Z',
      actor: { name: 'reviewd', kind: 'system' },
      data: { report: final },
    };
    const events = vi
      .fn<ApiClient['events']>()
      .mockResolvedValueOnce({ events: [event], latestSeq: 2 })
      .mockImplementation(() => new Promise(() => {}));

    renderReport(clientFor(value, events));

    expect(await screen.findByText('Final finding')).toBeInTheDocument();
    expect(screen.queryByText('Partial finding')).not.toBeInTheDocument();
    expect(screen.queryByText(/partial report/)).not.toBeInTheDocument();
  });
  it('only previews shards from the selected round', () => {
    const agent: AgentState = {
      status: 'running',
      round: 2,
      findings: [],
      shards: [
        { ...shard(0, 2, report({ round: 1, findings: [finding('r1', 'Round one')] })), round: 1 },
        { ...shard(0, 2, report({ round: 2, findings: [finding('r2', 'Round two')] })), round: 2 },
      ],
    };

    const live = liveReportFor(agent, 'rev_1', 2);

    expect(live?.report.findings.map((item) => item.id)).toEqual(['r2']);
    expect(live?.completedShards).toBe(1);
    expect(live?.totalShards).toBe(2);
    expect(liveReportFor(agent, 'rev_1', 3)).toBeNull();
  });
});
