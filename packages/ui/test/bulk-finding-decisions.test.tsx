// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AgentReport, Finding, FindingDecision } from '@sir_yami/reviewd-core';
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

function decision(
  findingId: string,
  state: FindingDecision['state'] = 'accepted',
): FindingDecision {
  return {
    findingId,
    round: 1,
    state,
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
  it('offers checkboxes and visible status badges for the current report', () => {
    render(
      <ReportPanel
        report={report([finding(1), finding(2), finding(3), finding(4, { kind: 'praise' })])}
        decisions={new Map([['f1', decision('f1')]])}
        canDecide
        onDecideSelected={vi.fn(async () => true)}
        onJump={() => undefined}
      />,
    );

    expect(screen.getByRole('checkbox', { name: 'Select finding Finding 2' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Select finding Finding 3' })).toBeInTheDocument();
    expect(
      screen.queryByRole('checkbox', { name: 'Select finding Finding 1' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('checkbox', { name: 'Select finding Finding 4' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Select all filtered (2)' })).toBeInTheDocument();

    const acceptedCard = screen.getByText('Finding 1').closest('.cr-finding') as HTMLElement;
    expect(within(acceptedCard).getByText('Accepted')).toBeInTheDocument();
  });

  it('hides accepted findings that already have a comment and links to Conversation', () => {
    const onOpenConversation = vi.fn();
    render(
      <ReportPanel
        report={report([finding(1), finding(2)])}
        transferredFindingIds={new Set(['f1'])}
        onOpenConversation={onOpenConversation}
        onJump={() => undefined}
      />,
    );

    expect(screen.queryByText('Finding 1')).not.toBeInTheDocument();
    expect(screen.getByText('Finding 2')).toBeInTheDocument();
    expect(screen.getByText('1 accepted')).toBeInTheDocument();
    expect(screen.getByText('moved to comments')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open Conversation' }));
    expect(onOpenConversation).toHaveBeenCalledTimes(1);
  });

  it('selects every filtered finding across pages and confirms the selected action', async () => {
    const user = userEvent.setup();
    const onDecideSelected = vi.fn(async () => true);
    render(
      <ReportPanel
        report={report(Array.from({ length: 60 }, (_, index) => finding(index + 1)))}
        canDecide
        onDecideSelected={onDecideSelected}
        onJump={() => undefined}
      />,
    );

    await user.click(screen.getByRole('checkbox', { name: 'Select all filtered (60)' }));
    expect(screen.getByText('60 selected')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next report page (top)' }));
    expect(screen.getAllByText('51–60 of 60')).toHaveLength(2);
    expect(screen.getByText('60 selected')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Accept selected (60)' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Accept 60 selected findings?');
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'This will accept 60 selected findings in the current report. Existing decisions and notes stay unchanged.',
    );
    await user.click(screen.getByRole('button', { name: 'Accept 60 findings' }));

    expect(onDecideSelected).toHaveBeenCalledWith(
      'accepted',
      Array.from({ length: 60 }, (_, index) => `f${index + 1}`),
    );
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(screen.queryByText('60 selected')).not.toBeInTheDocument();
  });

  it('accepts and dismisses only the checked findings', async () => {
    const user = userEvent.setup();
    const onDecideSelected = vi.fn(async () => true);
    render(
      <ReportPanel
        report={report([finding(1), finding(2), finding(3)])}
        canDecide
        onDecideSelected={onDecideSelected}
        onJump={() => undefined}
      />,
    );

    await user.click(screen.getByRole('checkbox', { name: 'Select finding Finding 2' }));
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Accept selected (1)' }));
    await user.click(screen.getByRole('button', { name: 'Accept 1 finding' }));
    expect(onDecideSelected).toHaveBeenLastCalledWith('accepted', ['f2']);

    await user.click(screen.getByRole('checkbox', { name: 'Select finding Finding 3' }));
    await user.click(screen.getByRole('button', { name: 'Dismiss selected (1)' }));
    await user.click(screen.getByRole('button', { name: 'Dismiss 1 finding' }));
    expect(onDecideSelected).toHaveBeenLastCalledWith('dismissed', ['f3']);
  });

  it('selects only findings matching the current filters and clears selection on filter changes', async () => {
    const user = userEvent.setup();
    const onDecideSelected = vi.fn(async () => true);
    render(
      <ReportPanel
        report={report([
          finding(1),
          finding(2, { severity: 'blocker' }),
          finding(3, { severity: 'blocker', kind: 'praise' }),
        ])}
        canDecide
        onDecideSelected={onDecideSelected}
        onJump={() => undefined}
      />,
    );

    await user.click(screen.getByRole('button', { name: /^Severity:/ }));
    await user.click(screen.getByRole('checkbox', { name: 'blocker' }));
    await user.keyboard('{Escape}');
    expect(screen.getByRole('checkbox', { name: 'Select all filtered (1)' })).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Select all filtered (1)' }));
    expect(screen.getByText('1 selected')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Severity:/ }));
    await user.click(screen.getByRole('checkbox', { name: 'All severities' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByText('1 selected')).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Select all filtered (2)' })).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Select finding Finding 1' }));
    await user.click(screen.getByRole('button', { name: 'Accept selected (1)' }));
    await user.click(screen.getByRole('button', { name: 'Accept 1 finding' }));
    expect(onDecideSelected).toHaveBeenCalledWith('accepted', ['f1']);
    expect(onDecideSelected).not.toHaveBeenCalledWith('accepted', ['f2']);
  });

  it('shows accepted and dismissed badges without expanding the card', () => {
    render(
      <ReportPanel
        report={report([finding(1), finding(2)])}
        decisions={
          new Map([
            ['f1', decision('f1', 'accepted')],
            ['f2', decision('f2', 'dismissed')],
          ])
        }
        canDecide
        onDecideSelected={vi.fn(async () => true)}
        onJump={() => undefined}
      />,
    );

    const acceptedCard = screen.getByText('Finding 1').closest('.cr-finding') as HTMLElement;
    const dismissedCard = screen.getByText('Finding 2').closest('.cr-finding') as HTMLElement;
    expect(within(acceptedCard).getByText('Accepted')).toBeInTheDocument();
    expect(within(dismissedCard).getByText('Dismissed')).toBeInTheDocument();
    expect(acceptedCard).not.toHaveClass('cr-finding-expanded');
  });

  it('keeps the dialog open on an error and lets the user cancel', async () => {
    const user = userEvent.setup();
    const onDecideSelected = vi.fn(async () => false);
    const { rerender } = render(
      <ReportPanel
        report={report([finding(1)])}
        canDecide
        onDecideSelected={onDecideSelected}
        onJump={() => undefined}
      />,
    );

    await user.click(screen.getByRole('checkbox', { name: 'Select finding Finding 1' }));
    await user.click(screen.getByRole('button', { name: 'Accept selected (1)' }));
    await user.click(screen.getByRole('button', { name: 'Accept 1 finding' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    rerender(
      <ReportPanel
        report={report([finding(1)])}
        canDecide
        onDecideSelected={onDecideSelected}
        bulkError="Could not save bulk decisions."
        onJump={() => undefined}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save bulk decisions.');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('hides selection when decisions are unavailable, the report is partial, or the review is read-only', () => {
    const onDecideSelected = vi.fn(async () => true);
    const { rerender } = render(
      <ReportPanel
        report={report([finding(1)])}
        canDecide={false}
        onDecideSelected={onDecideSelected}
        onJump={() => undefined}
      />,
    );
    expect(screen.queryByRole('checkbox', { name: /Select finding/ })).not.toBeInTheDocument();

    rerender(
      <ReportPanel
        report={report([finding(1)])}
        canDecide
        readOnly
        onDecideSelected={onDecideSelected}
        onJump={() => undefined}
      />,
    );
    expect(screen.queryByRole('checkbox', { name: /Select finding/ })).not.toBeInTheDocument();

    rerender(
      <ReportPanel
        report={report([finding(1)])}
        canDecide
        partial
        onDecideSelected={onDecideSelected}
        onJump={() => undefined}
      />,
    );
    expect(screen.queryByRole('checkbox', { name: /Select finding/ })).not.toBeInTheDocument();
  });

  it('closes an open confirmation when decisions become unavailable', async () => {
    const user = userEvent.setup();
    const onDecideSelected = vi.fn(async () => true);
    const { rerender } = render(
      <ReportPanel
        report={report([finding(1)])}
        canDecide
        onDecideSelected={onDecideSelected}
        onJump={() => undefined}
      />,
    );
    await user.click(screen.getByRole('checkbox', { name: 'Select finding Finding 1' }));
    await user.click(screen.getByRole('button', { name: 'Accept selected (1)' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    rerender(
      <ReportPanel
        report={report([finding(1)])}
        canDecide={false}
        onDecideSelected={onDecideSelected}
        onJump={() => undefined}
      />,
    );

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('closes an open confirmation when the selected round changes', async () => {
    const user = userEvent.setup();
    const onDecideSelected = vi.fn(async () => true);
    const { rerender } = render(
      <ReportPanel
        report={report([finding(1)])}
        canDecide
        round={1}
        onDecideSelected={onDecideSelected}
        onJump={() => undefined}
      />,
    );
    await user.click(screen.getByRole('checkbox', { name: 'Select finding Finding 1' }));
    await user.click(screen.getByRole('button', { name: 'Accept selected (1)' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    rerender(
      <ReportPanel
        report={report([finding(1)])}
        canDecide
        round={2}
        onDecideSelected={onDecideSelected}
        onJump={() => undefined}
      />,
    );

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
