import { useState } from 'react';
import type { Finding, FindingDecision, FindingDecisionState } from '@dsh-code-review/core';
import { Badge } from '../primitives/Feedback.js';
import { Button } from '../primitives/Button.js';
import { Textarea } from '../primitives/Field.js';

export interface FindingDecisionError {
  findingId: string;
  message: string;
}

export interface FindingDecisionControlsProps {
  finding: Finding;
  decision?: FindingDecision | undefined;
  /** Reports show the decision badge in the card header instead. */
  showStatus?: boolean;
  readOnly?: boolean;
  pending?: boolean;
  error?: string | null;
  onDecide?:
    | ((
        finding: Finding,
        state: FindingDecisionState,
        note: string | undefined,
      ) => Promise<boolean>)
    | undefined;
}

function actionLabel(state: FindingDecisionState): string {
  return state === 'accepted' ? 'Accept finding' : 'Dismiss finding';
}

export function FindingDecisionControls({
  finding,
  decision,
  showStatus = true,
  readOnly = false,
  pending = false,
  error,
  onDecide,
}: FindingDecisionControlsProps): JSX.Element | null {
  const [draftState, setDraftState] = useState<FindingDecisionState | undefined>(undefined);
  const [note, setNote] = useState('');

  if (finding.kind === 'praise' && decision === undefined) return null;

  const showActions = !readOnly && finding.kind !== 'praise' && onDecide !== undefined;

  function openForm(state: FindingDecisionState): void {
    // Opening from closed prefills the persisted note; switching state keeps the draft.
    if (draftState === undefined) setNote(decision?.note ?? '');
    setDraftState(state);
  }

  function closeForm(): void {
    setDraftState(undefined);
    setNote('');
  }

  async function submit(): Promise<void> {
    if (draftState === undefined || onDecide === undefined) return;
    const trimmed = note.trim();
    const ok = await onDecide(finding, draftState, trimmed === '' ? undefined : trimmed);
    if (ok) closeForm();
  }

  return (
    <div className="cr-finding-decision" aria-label="Finding decision">
      {decision !== undefined && (showStatus || decision.note !== undefined) ? (
        <div className="cr-finding-decision-status">
          {showStatus ? (
            <Badge tone={decision.state === 'accepted' ? 'success' : 'neutral'}>
              {decision.state === 'accepted' ? 'Accepted' : 'Dismissed'}
            </Badge>
          ) : null}
          {decision.note !== undefined ? (
            <p className="cr-finding-decision-note">
              <span className="cr-finding-decision-note-label">Note to the agent:</span>{' '}
              {decision.note}
            </p>
          ) : null}
        </div>
      ) : null}
      {showActions ? (
        <div className="cr-finding-decision-actions">
          <Button
            size="small"
            variant="secondary"
            aria-pressed={decision?.state === 'accepted'}
            disabled={pending}
            onClick={() => openForm('accepted')}
          >
            Accept
          </Button>
          <Button
            size="small"
            variant="secondary"
            aria-pressed={decision?.state === 'dismissed'}
            disabled={pending}
            onClick={() => openForm('dismissed')}
          >
            Dismiss
          </Button>
        </div>
      ) : null}
      {showActions && draftState !== undefined ? (
        <form
          className="cr-finding-decision-editor"
          aria-label={actionLabel(draftState)}
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <Textarea
            label="Note for the agent (optional)"
            hint="Sent with the next feedback package. Leave empty to decide without a note."
            value={note}
            maxLength={4000}
            rows={3}
            autoFocus
            onChange={(event) => setNote(event.target.value)}
          />
          {error !== undefined && error !== null ? (
            <p className="cr-finding-decision-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="cr-finding-decision-editor-actions">
            <Button
              type="submit"
              variant={draftState === 'accepted' ? 'primary' : 'secondary'}
              loading={pending}
            >
              {actionLabel(draftState)}
            </Button>
            <Button type="button" variant="secondary" onClick={closeForm}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
