// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AgentReport, Anchor, Comment, Finding, ReviewQuestion } from '@dsh-code-review/core';
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

function comment(overrides: Partial<Comment> = {}): Comment {
  const anchor: Anchor = {
    id: 'a1',
    round: 1,
    path: 'src/generated-1.ts',
    side: 'new',
    lineStart: 1,
    lineEnd: 1,
    quote: 'const value = 1;',
    contextBefore: [],
    contextAfter: [],
    hunkHeader: '@@ -1 +1 @@',
    contentHash: 'hash',
    state: 'active',
  };
  return {
    id: 'c1',
    reviewId: 'rev_1',
    createdAt: '2026-01-01T00:00:00.000Z',
    author: { name: 'Reviewer', kind: 'human' },
    body: 'Existing answer',
    state: 'open',
    replies: [],
    anchors: [anchor],
    outcomes: [],
    ...overrides,
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

function renderedQuestions(): number {
  return screen.getByRole('list', { name: 'Open questions' }).querySelectorAll('li').length;
}

function questionPages(placement: 'top' | 'bottom'): HTMLElement {
  return screen.getByRole('navigation', { name: `Question pages (${placement})` });
}

function questionPageButton(placement: 'top' | 'bottom', name: RegExp): HTMLElement {
  return within(questionPages(placement)).getByRole('button', { name });
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

  it('pages questions in blocks of 50 with navigation above and below the list', async () => {
    const user = userEvent.setup();
    render(
      <ReportPanel
        report={report(
          [],
          Array.from({ length: 57 }, (_, index) => question(index)),
        )}
        onJump={() => undefined}
      />,
    );

    await user.click(screen.getByRole('tab', { name: /Questions/ }));

    expect(screen.getAllByText('1–50 of 57')).toHaveLength(2);
    expect(screen.getByText('Question 1?')).toBeInTheDocument();
    expect(screen.queryByText('Question 51?')).not.toBeInTheDocument();
    expect(renderedQuestions()).toBe(50);
    expect(questionPageButton('top', /Next question page/)).toBeEnabled();
    expect(questionPageButton('bottom', /Next question page/)).toBeEnabled();

    await user.click(questionPageButton('bottom', /Next question page/));
    expect(screen.getAllByText('51–57 of 57')).toHaveLength(2);
    expect(screen.getByText('Question 51?')).toBeInTheDocument();
    expect(renderedQuestions()).toBe(7);
    expect(questionPageButton('top', /Next question page/)).toBeDisabled();
    expect(questionPageButton('bottom', /Next question page/)).toBeDisabled();

    await user.click(questionPageButton('top', /Previous question page/));
    expect(screen.getAllByText('1–50 of 57')).toHaveLength(2);
  });

  it('scrolls the questions pane back to the top when the page changes', async () => {
    const user = userEvent.setup();
    render(
      <ReportPanel
        report={report(
          [],
          Array.from({ length: 57 }, (_, index) => question(index)),
        )}
        onJump={() => undefined}
      />,
    );
    await user.click(screen.getByRole('tab', { name: /Questions/ }));
    const scroller = document.querySelector('.cr-report-questions .cr-report-scroll');
    if (!(scroller instanceof HTMLElement)) throw new Error('expected questions scroller');
    scroller.scrollTop = 300;

    await user.click(questionPageButton('bottom', /Next question page/));

    await waitFor(() => {
      expect(scroller.scrollTop).toBe(0);
    });
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

  it('shows existing finding comments and posts a reply from report', async () => {
    const user = userEvent.setup();
    const existing = comment();
    const onReply = vi.fn(async () => undefined);

    render(
      <ReportPanel
        report={report([finding(0)])}
        comments={[existing]}
        round={1}
        onJump={() => undefined}
        onReply={onReply}
        onCommentState={vi.fn(async () => undefined)}
        onCommentJump={vi.fn()}
        onAddComment={vi.fn(async () => undefined)}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Expand finding Finding 1' }));
    expect(screen.getByText('Existing answer')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reply' }));
    await user.type(screen.getByLabelText('Reply to Reviewer'), 'Thanks');
    await user.click(screen.getByRole('button', { name: 'Send reply' }));

    expect(onReply).toHaveBeenCalledWith(existing, 'Thanks');
  });

  it('shows existing answers under a report question', async () => {
    const user = userEvent.setup();
    render(
      <ReportPanel
        report={report([], [question(0)])}
        comments={[comment()]}
        round={1}
        onJump={() => undefined}
        onAddComment={vi.fn(async () => undefined)}
      />,
    );

    await user.click(screen.getByRole('tab', { name: /Questions/ }));
    expect(screen.getByText('Existing answer')).toBeInTheDocument();
  });

  it('creates a comment on a finding from report', async () => {
    const user = userEvent.setup();
    const onAddComment = vi.fn(async () => undefined);

    render(
      <ReportPanel
        report={report([finding(0)])}
        comments={[]}
        round={1}
        onJump={() => undefined}
        onAddComment={onAddComment}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Expand finding Finding 1' }));
    await user.click(screen.getByRole('button', { name: 'Comment' }));
    await user.type(screen.getByLabelText('Your comment'), 'Looks good');
    await user.click(screen.getByRole('button', { name: 'Post comment' }));

    expect(onAddComment).toHaveBeenCalledWith(
      { file: 'src/generated-1.ts', lineStart: 1, lineEnd: 1 },
      'Looks good',
    );
  });

  it('answers a question from report', async () => {
    const user = userEvent.setup();
    const onAddComment = vi.fn(async () => undefined);

    render(
      <ReportPanel
        report={report([], [question(0)])}
        comments={[]}
        round={1}
        onJump={() => undefined}
        onAddComment={onAddComment}
      />,
    );

    await user.click(screen.getByRole('tab', { name: /Questions/ }));
    await user.click(screen.getByRole('button', { name: 'Answer' }));
    await user.type(screen.getByLabelText('Your answer'), 'It is the retry budget');
    await user.click(screen.getByRole('button', { name: 'Send answer' }));

    expect(onAddComment).toHaveBeenCalledWith(
      { file: 'src/generated-1.ts', lineStart: 1, lineEnd: 1 },
      'It is the retry budget',
    );
  });

  it('hides comment and answer actions on a closed review', async () => {
    const user = userEvent.setup();
    render(
      <ReportPanel
        report={report([finding(0)], [question(0)])}
        comments={[]}
        round={1}
        readOnly
        onJump={() => undefined}
        onAddComment={vi.fn(async () => undefined)}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Expand finding Finding 1' }));
    expect(screen.queryByRole('button', { name: 'Comment' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /Questions/ }));
    expect(screen.queryByRole('button', { name: 'Answer' })).not.toBeInTheDocument();
  });
});
