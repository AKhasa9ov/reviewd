// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AgentReport, Finding, FindingDecision } from '@dsh-code-review/core';
import { ReportPanel } from '../src/review/ReportPanel.js';

function finding(index: number, overrides: Partial<Finding> = {}): Finding {
  return {
    id: `f${index}`,
    severity: 'major',
    category: 'correctness',
    confidence: 'high',
    kind: 'issue',
    file: `src/file-${index}.ts`,
    lineStart: 1,
    lineEnd: 1,
    title: `Finding ${index}`,
    rationale: 'why',
    evidence: 'code',
    ...overrides,
  };
}

function decision(findingId: string): FindingDecision {
  return {
    findingId,
    round: 1,
    state: 'accepted',
    by: { name: 'Ada', kind: 'human' },
    at: '2026-10-29T12:00:00.000Z',
  };
}

function report(findings: Finding[]): AgentReport {
  return {
    schemaVersion: 1,
    summary: 'summary',
    riskLevel: 'medium',
    findings,
    questions: [],
    tests: { ran: false, commands: [] },
    verification: [],
    reviewId: 'rev_1',
    round: 1,
    backend: 'worker',
    rejected: [],
    warnings: [],
  };
}

describe('bulk finding decisions', () => {
  it('offers accept and dismiss for every remaining non-praise finding', () => {
    render(
      <ReportPanel
        report={report([finding(1), finding(2), finding(3), finding(4, { kind: 'praise' })])}
        decisions={new Map([['f1', decision('f1')]])}
        canDecide
        onDecideAll={vi.fn(async () => true)}
        onJump={() => undefined}
      />,
    );

    expect(screen.getByRole('button', { name: 'Accept all remaining (2)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dismiss all remaining (2)' })).toBeInTheDocument();
  });

  it('counts every finding in the report, not only filtered findings', async () => {
    const user = userEvent.setup();
    render(
      <ReportPanel
        report={report([finding(1), finding(2), finding(3, { severity: 'blocker' })])}
        canDecide
        onDecideAll={vi.fn(async () => true)}
        onJump={() => undefined}
      />,
    );

    await user.selectOptions(screen.getByLabelText('Severity'), 'blocker');
    expect(screen.getByRole('button', { name: 'Accept all remaining (3)' })).toBeInTheDocument();
  });

  it('confirms accept all with the remaining count and closes after success', async () => {
    const user = userEvent.setup();
    const onDecideAll = vi.fn(async () => true);
    render(
      <ReportPanel
        report={report([finding(1), finding(2), finding(3)])}
        decisions={new Map([['f1', decision('f1')]])}
        canDecide
        onDecideAll={onDecideAll}
        onJump={() => undefined}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Accept all remaining (2)' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Accept all remaining findings?');
    expect(dialog).toHaveTextContent(
      'This will accept 2 findings in the current report. Existing decisions and notes stay unchanged.',
    );
    await user.click(screen.getByRole('button', { name: 'Accept 2 findings' }));

    expect(onDecideAll).toHaveBeenCalledWith('accepted');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('dismisses all after confirmation', async () => {
    const user = userEvent.setup();
    const onDecideAll = vi.fn(async () => true);
    render(
      <ReportPanel
        report={report([finding(1), finding(2)])}
        canDecide
        onDecideAll={onDecideAll}
        onJump={() => undefined}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Dismiss all remaining (2)' }));
    await user.click(screen.getByRole('button', { name: 'Dismiss 2 findings' }));

    expect(onDecideAll).toHaveBeenCalledWith('dismissed');
  });

  it('cancels without deciding and keeps the dialog open on a bulk error', async () => {
    const user = userEvent.setup();
    const onDecideAll = vi.fn(async () => false);
    const { rerender } = render(
      <ReportPanel
        report={report([finding(1)])}
        canDecide
        onDecideAll={onDecideAll}
        onJump={() => undefined}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Accept all remaining (1)' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onDecideAll).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Accept all remaining (1)' }));
    await user.click(screen.getByRole('button', { name: 'Accept 1 finding' }));
    expect(onDecideAll).toHaveBeenCalledWith('accepted');
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    rerender(
      <ReportPanel
        report={report([finding(1)])}
        canDecide
        onDecideAll={onDecideAll}
        bulkError="Could not save bulk decisions."
        onJump={() => undefined}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save bulk decisions.');
  });

  it('hides bulk actions when no findings remain, decisions are disabled, or the report is partial', () => {
    const onDecideAll = vi.fn(async () => true);
    const { rerender } = render(
      <ReportPanel
        report={report([finding(1)])}
        decisions={new Map([['f1', decision('f1')]])}
        canDecide
        onDecideAll={onDecideAll}
        onJump={() => undefined}
      />,
    );
    expect(screen.queryByRole('button', { name: /all remaining/ })).not.toBeInTheDocument();

    rerender(
      <ReportPanel
        report={report([finding(1)])}
        canDecide={false}
        onDecideAll={onDecideAll}
        onJump={() => undefined}
      />,
    );
    expect(screen.queryByRole('button', { name: /all remaining/ })).not.toBeInTheDocument();

    rerender(
      <ReportPanel
        report={report([finding(1)])}
        canDecide
        readOnly
        onDecideAll={onDecideAll}
        onJump={() => undefined}
      />,
    );
    expect(screen.queryByRole('button', { name: /all remaining/ })).not.toBeInTheDocument();

    rerender(
      <ReportPanel
        report={report([finding(1)])}
        canDecide
        partial
        onDecideAll={onDecideAll}
        onJump={() => undefined}
      />,
    );
    expect(screen.queryByRole('button', { name: /all remaining/ })).not.toBeInTheDocument();
  });

  it('closes an open confirmation when decisions become unavailable', async () => {
    const user = userEvent.setup();
    const onDecideAll = vi.fn(async () => true);
    const { rerender } = render(
      <ReportPanel
        report={report([finding(1)])}
        canDecide
        onDecideAll={onDecideAll}
        onJump={() => undefined}
      />,
    );
    await user.click(screen.getByRole('button', { name: /Accept all remaining/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    rerender(
      <ReportPanel
        report={report([finding(1)])}
        canDecide={false}
        onDecideAll={onDecideAll}
        onJump={() => undefined}
      />,
    );

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('closes an open confirmation when the selected round changes', async () => {
    const user = userEvent.setup();
    const onDecideAll = vi.fn(async () => true);
    const { rerender } = render(
      <ReportPanel
        report={report([finding(1)])}
        canDecide
        round={1}
        onDecideAll={onDecideAll}
        onJump={() => undefined}
      />,
    );
    await user.click(screen.getByRole('button', { name: /Accept all remaining/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    rerender(
      <ReportPanel
        report={report([finding(1)])}
        canDecide
        round={2}
        onDecideAll={onDecideAll}
        onJump={() => undefined}
      />,
    );

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
