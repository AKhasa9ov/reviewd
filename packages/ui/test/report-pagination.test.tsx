// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { AgentReport, Finding } from '@dsh-code-review/core';
import { ReportPanel } from '../src/review/ReportPanel.js';

function finding(index: number): Finding {
  return {
    id: `f${index + 1}`,
    severity: 'major',
    category: 'correctness',
    confidence: 'high',
    kind: 'issue',
    file: `src/generated-${index + 1}.ts`,
    lineStart: 1,
    lineEnd: 1,
    title: `Finding ${index + 1}`,
    rationale: 'why',
    evidence: 'code',
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

function renderedFindings(): number {
  return screen.getByRole('list', { name: 'Reviewer findings' }).querySelectorAll('.cr-finding')
    .length;
}

describe('ReportPanel pagination', () => {
  it('pages findings in blocks of 50 and exposes the full total', async () => {
    const user = userEvent.setup();
    render(
      <ReportPanel
        report={report(Array.from({ length: 127 }, (_, index) => finding(index)))}
        onJump={() => undefined}
      />,
    );

    expect(screen.getByText('1–50 of 127')).toBeInTheDocument();
    expect(renderedFindings()).toBe(50);
    expect(screen.queryByText('Finding 51')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next report page' }));
    expect(screen.getByText('51–100 of 127')).toBeInTheDocument();
    expect(screen.getByText('Finding 51')).toBeInTheDocument();
    expect(renderedFindings()).toBe(50);

    await user.click(screen.getByRole('button', { name: 'Next report page' }));
    expect(screen.getByText('101–127 of 127')).toBeInTheDocument();
    expect(renderedFindings()).toBe(27);
    expect(screen.getByRole('button', { name: 'Next report page' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Previous report page' }));
    expect(screen.getByText('51–100 of 127')).toBeInTheDocument();
  });

  it('resets to the first page when the filters change', async () => {
    const user = userEvent.setup();
    const findings = Array.from({ length: 127 }, (_, index) => finding(index));
    findings[0] = { ...(findings[0] as Finding), severity: 'minor' };
    render(<ReportPanel report={report(findings)} onJump={() => undefined} />);

    await user.click(screen.getByRole('button', { name: 'Next report page' }));
    expect(screen.getByText('51–100 of 127')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Severity'), 'major');
    expect(screen.getByText('1–50 of 126')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Severity'), 'all');
    expect(screen.getByText('1–50 of 127')).toBeInTheDocument();
  });
  it('resets to the first page when the final report replaces a partial preview', async () => {
    const user = userEvent.setup();
    const findings = Array.from({ length: 127 }, (_, index) => finding(index));
    const { rerender } = render(
      <ReportPanel
        report={report(findings)}
        onJump={() => undefined}
        partial
        liveProgress={{ completedShards: 1, totalShards: 2 }}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Next report page' }));
    expect(screen.getByText('51–100 of 127')).toBeInTheDocument();

    rerender(<ReportPanel report={report(findings)} onJump={() => undefined} />);

    expect(await screen.findByText('1–50 of 127')).toBeInTheDocument();
  });
});
