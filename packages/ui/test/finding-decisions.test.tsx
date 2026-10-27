// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Finding, FindingDecision } from '@dsh-code-review/core';
import { FindingDecisionControls } from '../src/review/FindingDecisionControls.js';

const at = '2026-10-27T12:00:00.000Z';

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'f1',
    severity: 'major',
    category: 'correctness',
    confidence: 'high',
    kind: 'issue',
    file: 'src/auth.ts',
    lineStart: 11,
    lineEnd: 11,
    title: 'Retry budget is hard-coded',
    rationale: 'The retry count cannot be configured per environment.',
    evidence: 'const retry = attempt < 3;',
    ...overrides,
  };
}

function decision(overrides: Partial<FindingDecision> = {}): FindingDecision {
  return {
    findingId: 'f1',
    round: 2,
    state: 'accepted',
    by: { name: 'Ada', kind: 'human' },
    at,
    ...overrides,
  };
}

function renderControls(
  overrides: Partial<Parameters<typeof FindingDecisionControls>[0]> = {},
): ReturnType<typeof render> {
  return render(
    <FindingDecisionControls
      finding={finding()}
      onDecide={overrides.onDecide ?? vi.fn(async () => true)}
      {...overrides}
    />,
  );
}

describe('FindingDecisionControls inline decision form', () => {
  it('expands an inline Accept form instead of a dialog', async () => {
    const user = userEvent.setup();
    renderControls();

    await user.click(screen.getByRole('button', { name: 'Accept' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const form = screen.getByRole('form', { name: 'Accept finding' });
    const note = within(form).getByLabelText('Note for the agent (optional)');
    expect(note).toHaveAttribute('maxLength', '4000');
    expect(note).toHaveFocus();
    expect(within(form).getByRole('button', { name: 'Accept finding' })).toBeInTheDocument();
    expect(within(form).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('expands an inline Dismiss form instead of a dialog', async () => {
    const user = userEvent.setup();
    renderControls();

    await user.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const form = screen.getByRole('form', { name: 'Dismiss finding' });
    expect(within(form).getByLabelText('Note for the agent (optional)')).toBeInTheDocument();
    expect(within(form).getByRole('button', { name: 'Dismiss finding' })).toBeInTheDocument();
  });

  it('submits the chosen state with a trimmed note and closes on success', async () => {
    const user = userEvent.setup();
    const onDecide = vi.fn(async () => true);
    const value = finding();
    renderControls({ finding: value, onDecide });

    await user.click(screen.getByRole('button', { name: 'Accept' }));
    const form = screen.getByRole('form', { name: 'Accept finding' });
    await user.type(
      within(form).getByLabelText('Note for the agent (optional)'),
      '  Please fix this before merge.  ',
    );
    await user.click(within(form).getByRole('button', { name: 'Accept finding' }));

    expect(onDecide).toHaveBeenCalledWith(value, 'accepted', 'Please fix this before merge.');
    expect(screen.queryByRole('form', { name: 'Accept finding' })).not.toBeInTheDocument();
  });

  it('omits an empty note when submitting', async () => {
    const user = userEvent.setup();
    const onDecide = vi.fn(async () => false);
    const value = finding();
    renderControls({ finding: value, onDecide });

    await user.click(screen.getByRole('button', { name: 'Accept' }));
    await user.type(screen.getByLabelText('Note for the agent (optional)'), '   ');
    await user.click(screen.getByRole('button', { name: 'Accept finding' }));

    expect(onDecide).toHaveBeenCalledWith(value, 'accepted', undefined);
  });

  it('cancels the inline form without deciding', async () => {
    const user = userEvent.setup();
    const onDecide = vi.fn(async () => true);
    renderControls({ onDecide });

    await user.click(screen.getByRole('button', { name: 'Accept' }));
    const form = screen.getByRole('form', { name: 'Accept finding' });
    await user.type(within(form).getByLabelText('Note for the agent (optional)'), 'Draft note');
    await user.click(within(form).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('form', { name: 'Accept finding' })).not.toBeInTheDocument();
    expect(onDecide).not.toHaveBeenCalled();
  });

  it('keeps the draft note when switching to the other action', async () => {
    const user = userEvent.setup();
    renderControls();

    await user.click(screen.getByRole('button', { name: 'Accept' }));
    await user.type(
      screen.getByLabelText('Note for the agent (optional)'),
      'Same finding, same note.',
    );
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(screen.getByRole('form', { name: 'Dismiss finding' })).toBeInTheDocument();
    expect(screen.getByLabelText('Note for the agent (optional)')).toHaveValue(
      'Same finding, same note.',
    );
  });

  it('shows the persisted decision badge and note', () => {
    renderControls({ decision: decision({ state: 'dismissed', note: 'Not worth blocking on.' }) });

    expect(screen.getByText('Dismissed')).toBeInTheDocument();
    expect(screen.getByText('Not worth blocking on.')).toBeInTheDocument();
  });

  it('prefills the persisted note when reopening the same action', async () => {
    const user = userEvent.setup();
    renderControls({ decision: decision({ note: 'Will fix in this branch.' }) });

    expect(screen.getByText('Accepted')).toBeInTheDocument();
    expect(screen.getByText('Will fix in this branch.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Accept' }));

    expect(screen.getByLabelText('Note for the agent (optional)')).toHaveValue(
      'Will fix in this branch.',
    );
  });

  it('submits a changed decision when the same action is used again', async () => {
    const user = userEvent.setup();
    const onDecide = vi.fn(async () => true);
    const value = finding();
    renderControls({ finding: value, decision: decision({ note: 'Old note' }), onDecide });

    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    const note = screen.getByLabelText('Note for the agent (optional)');
    await user.clear(note);
    await user.type(note, 'Duplicate of #12');
    await user.click(screen.getByRole('button', { name: 'Dismiss finding' }));

    expect(onDecide).toHaveBeenCalledWith(value, 'dismissed', 'Duplicate of #12');
  });

  it('renders nothing for praise without a decision', () => {
    const { container } = renderControls({ finding: finding({ kind: 'praise' }) });

    expect(container).toBeEmptyDOMElement();
  });

  it('shows a persisted decision on a read-only review without actions', () => {
    renderControls({ readOnly: true, decision: decision({ note: 'Handled in the last round.' }) });

    expect(screen.getByText('Accepted')).toBeInTheDocument();
    expect(screen.getByText('Handled in the last round.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument();
  });

  it('keeps the form open and shows an alert when the decision fails', async () => {
    const user = userEvent.setup();
    const onDecide = vi.fn(async () => false);
    const { rerender } = renderControls({ onDecide });

    await user.click(screen.getByRole('button', { name: 'Accept' }));
    await user.click(screen.getByRole('button', { name: 'Accept finding' }));

    expect(onDecide).toHaveBeenCalled();
    const form = screen.getByRole('form', { name: 'Accept finding' });
    expect(within(form).getByLabelText('Note for the agent (optional)')).toBeInTheDocument();

    rerender(
      <FindingDecisionControls
        finding={finding()}
        onDecide={onDecide}
        error="Could not save the finding decision."
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Could not save the finding decision.');
    expect(screen.getByRole('form', { name: 'Accept finding' })).toBeInTheDocument();
  });

  it('disables the actions and submit while pending but keeps Cancel enabled', async () => {
    const user = userEvent.setup();
    const { rerender } = renderControls();

    rerender(
      <FindingDecisionControls finding={finding()} onDecide={vi.fn(async () => true)} pending />,
    );

    expect(screen.getByRole('button', { name: 'Accept' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeDisabled();

    rerender(
      <FindingDecisionControls
        finding={finding()}
        onDecide={vi.fn(async () => true)}
        pending={false}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Accept' }));
    const form = screen.getByRole('form', { name: 'Accept finding' });

    rerender(
      <FindingDecisionControls finding={finding()} onDecide={vi.fn(async () => true)} pending />,
    );

    expect(within(form).getByRole('button', { name: 'Accept finding' })).toBeDisabled();
    expect(within(form).getByRole('button', { name: 'Cancel' })).toBeEnabled();
  });

  it('renders no actions when no onDecide handler is provided', () => {
    render(<FindingDecisionControls finding={finding()} />);

    expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument();
  });
});
