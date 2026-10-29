// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { AgentReport, Finding, ReviewQuestion } from '@dsh-code-review/core';
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

function question(index: number): ReviewQuestion {
  return {
    id: `q${index + 1}`,
    file: `src/generated-${index + 1}.ts`,
    line: 1,
    question: `Question ${index + 1}?`,
    why: 'Need context',
  };
}

function report(
  findings: Finding[],
  questions: ReviewQuestion[] = [],
  overrides: Partial<AgentReport> = {},
): AgentReport {
  return {
    schemaVersion: 1,
    summary: 'summary',
    riskLevel: 'medium',
    findings,
    questions,
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

function renderedFindings(): number {
  return screen.getByRole('list', { name: 'Reviewer findings' }).querySelectorAll('.cr-finding')
    .length;
}

function pages(placement: 'top' | 'bottom'): HTMLElement {
  return screen.getByRole('navigation', { name: `Report pages (${placement})` });
}

function pageButton(placement: 'top' | 'bottom', name: RegExp): HTMLElement {
  return within(pages(placement)).getByRole('button', { name });
}

describe('ReportPanel browser', () => {
  it('pages findings in blocks of 50 with navigation above and below the list', async () => {
    const user = userEvent.setup();
    render(
      <ReportPanel
        report={report(Array.from({ length: 127 }, (_, index) => finding(index)))}
        onJump={() => undefined}
      />,
    );

    expect(screen.getAllByText('1–50 of 127')).toHaveLength(2);
    expect(renderedFindings()).toBe(50);
    expect(screen.queryByText('Finding 51')).not.toBeInTheDocument();
    expect(pageButton('top', /Next report page/)).toBeEnabled();
    expect(pageButton('bottom', /Next report page/)).toBeEnabled();

    await user.click(pageButton('bottom', /Next report page/));
    expect(screen.getAllByText('51–100 of 127')).toHaveLength(2);
    expect(screen.getByText('Finding 51')).toBeInTheDocument();
    expect(renderedFindings()).toBe(50);

    await user.click(pageButton('top', /Next report page/));
    expect(screen.getAllByText('101–127 of 127')).toHaveLength(2);
    expect(renderedFindings()).toBe(27);
    expect(pageButton('top', /Next report page/)).toBeDisabled();
    expect(pageButton('bottom', /Next report page/)).toBeDisabled();

    await user.click(pageButton('bottom', /Previous report page/));
    expect(screen.getAllByText('51–100 of 127')).toHaveLength(2);
  });

  it('scrolls the findings pane back to the top when the page changes', async () => {
    const user = userEvent.setup();
    render(
      <ReportPanel
        report={report(Array.from({ length: 127 }, (_, index) => finding(index)))}
        onJump={() => undefined}
      />,
    );
    const scroller = document.querySelector('.cr-report-scroll');
    if (!(scroller instanceof HTMLElement)) throw new Error('expected findings scroller');
    scroller.scrollTop = 300;

    await user.click(pageButton('bottom', /Next report page/));

    await waitFor(() => {
      expect(scroller.scrollTop).toBe(0);
    });
  });

  it('resets to the first page when the filters change', async () => {
    const user = userEvent.setup();
    const findings = Array.from({ length: 127 }, (_, index) => finding(index));
    findings[0] = { ...(findings[0] as Finding), severity: 'minor' };
    render(<ReportPanel report={report(findings)} onJump={() => undefined} />);

    await user.click(pageButton('top', /Next report page/));
    expect(screen.getAllByText('51–100 of 127')).toHaveLength(2);
    const scroller = document.querySelector('.cr-report-scroll');
    if (!(scroller instanceof HTMLElement)) throw new Error('expected findings scroller');
    scroller.scrollTop = 200;

    await user.selectOptions(screen.getByLabelText('Severity'), 'major');
    expect(screen.getAllByText('1–50 of 126')).toHaveLength(2);
    expect(scroller.scrollTop).toBe(0);

    await user.selectOptions(screen.getByLabelText('Severity'), 'all');
    expect(screen.getAllByText('1–50 of 127')).toHaveLength(2);
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

    await user.click(pageButton('top', /Next report page/));
    expect(screen.getAllByText('51–100 of 127')).toHaveLength(2);

    rerender(<ReportPanel report={report(findings)} onJump={() => undefined} />);

    expect(await screen.findAllByText('1–50 of 127')).toHaveLength(2);
  });

  it('keeps questions in their own tab without mixing them into the issue list', async () => {
    const user = userEvent.setup();
    render(
      <ReportPanel
        report={report([finding(0), finding(1)], [question(0)])}
        onJump={() => undefined}
      />,
    );

    const issuesTab = screen.getByRole('tab', { name: /Issues/ });
    const questionsTab = screen.getByRole('tab', { name: /Questions/ });
    expect(issuesTab).toHaveAttribute('aria-selected', 'true');
    expect(questionsTab).toHaveTextContent('1');

    await user.click(questionsTab);

    expect(questionsTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Question 1?')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Reviewer findings' })).not.toBeInTheDocument();

    await user.click(issuesTab);

    expect(issuesTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('list', { name: 'Reviewer findings' })).toBeInTheDocument();
  });
});
