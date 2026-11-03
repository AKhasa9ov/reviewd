// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AgentReport, Finding } from '@sir_yami/reviewd-core';
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

function report(findings: Finding[]): AgentReport {
  return {
    schemaVersion: 1,
    summary: 'summary',
    riskLevel: 'medium',
    findings,
    questions: [],
    tests: { ran: false, commands: [] },
    verification: [],
    reviewId: 'rev_multi',
    round: 1,
    backend: 'none',
    rejected: [],
    warnings: [],
  };
}

async function openFilter(
  user: ReturnType<typeof userEvent.setup>,
  label: 'Severity' | 'Category',
): Promise<HTMLElement> {
  await user.click(screen.getByRole('button', { name: new RegExp(`^${label}:`) }));
  const group = screen.getByRole('group', { name: label });
  return group;
}

describe('multi-select finding filters', () => {
  it('selects several severities and categories with OR inside and AND across groups', async () => {
    const user = userEvent.setup();
    render(
      <ReportPanel
        report={report([
          finding(1, { severity: 'major', category: 'correctness' }),
          finding(2, { severity: 'minor', category: 'security' }),
          finding(3, { severity: 'blocker', category: 'correctness' }),
          finding(4, { severity: 'nit', category: 'docs' }),
          finding(5, { severity: 'major', category: 'security' }),
        ])}
        onJump={() => undefined}
      />,
    );

    expect(screen.getByText('5 of 5 findings')).toBeInTheDocument();

    await openFilter(user, 'Severity');
    await user.click(screen.getByRole('checkbox', { name: 'major' }));
    await user.click(screen.getByRole('checkbox', { name: 'minor' }));
    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: 'Severity: major, minor' })).toBeInTheDocument();
    expect(screen.getByText('3 of 5 findings')).toBeInTheDocument();

    await openFilter(user, 'Category');
    await user.click(screen.getByRole('checkbox', { name: 'security' }));
    await user.keyboard('{Escape}');
    expect(screen.getByText('2 of 5 findings')).toBeInTheDocument();
  });

  it('supports selecting several categories and combining them with severity', async () => {
    const user = userEvent.setup();
    render(
      <ReportPanel
        report={report([
          finding(1, { severity: 'major', category: 'correctness' }),
          finding(2, { severity: 'minor', category: 'security' }),
          finding(3, { severity: 'major', category: 'docs' }),
          finding(4, { severity: 'nit', category: 'tests' }),
        ])}
        onJump={() => undefined}
      />,
    );

    await openFilter(user, 'Category');
    await user.click(screen.getByRole('checkbox', { name: 'correctness' }));
    await user.click(screen.getByRole('checkbox', { name: 'docs' }));
    await user.keyboard('{Escape}');
    expect(screen.getByText('2 of 4 findings')).toBeInTheDocument();

    await openFilter(user, 'Severity');
    await user.click(screen.getByRole('checkbox', { name: 'minor' }));
    await user.keyboard('{Escape}');
    expect(screen.getByText('0 of 4 findings')).toBeInTheDocument();
    expect(screen.getByText('No findings match these filters')).toBeInTheDocument();
  });

  it('clears one group with its All option and clears both groups with Clear filters', async () => {
    const user = userEvent.setup();
    render(
      <ReportPanel
        report={report([
          finding(1, { severity: 'major', category: 'correctness' }),
          finding(2, { severity: 'minor', category: 'security' }),
        ])}
        onJump={() => undefined}
      />,
    );

    await openFilter(user, 'Severity');
    await user.click(screen.getByRole('checkbox', { name: 'major' }));
    await user.keyboard('{Escape}');
    expect(screen.getByText('1 of 2 findings')).toBeInTheDocument();

    await openFilter(user, 'Severity');
    await user.click(screen.getByRole('checkbox', { name: 'All severities' }));
    await user.keyboard('{Escape}');
    expect(screen.getByText('2 of 2 findings')).toBeInTheDocument();

    await openFilter(user, 'Category');
    await user.click(screen.getByRole('checkbox', { name: 'security' }));
    await user.keyboard('{Escape}');
    expect(screen.getByText('1 of 2 findings')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByText('2 of 2 findings')).toBeInTheDocument();
  });

  it('resets selection and pagination when a multi-value filter changes', async () => {
    const user = userEvent.setup();
    const onDecideSelected = vi.fn(async () => true);
    const findings = Array.from({ length: 120 }, (_, index) =>
      finding(index + 1, { severity: index % 2 === 0 ? 'major' : 'minor' }),
    );
    render(
      <ReportPanel
        report={report(findings)}
        canDecide
        onDecideSelected={onDecideSelected}
        onJump={() => undefined}
      />,
    );

    await user.click(screen.getByRole('checkbox', { name: 'Select all filtered (120)' }));
    expect(screen.getByText('120 selected')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Next report page \(top\)/ }));
    expect(screen.getAllByText('51–100 of 120')).toHaveLength(2);

    await openFilter(user, 'Severity');
    await user.click(screen.getByRole('checkbox', { name: 'minor' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByText('120 selected')).not.toBeInTheDocument();
    expect(screen.getAllByText('1–50 of 60')).toHaveLength(2);
  });
});
