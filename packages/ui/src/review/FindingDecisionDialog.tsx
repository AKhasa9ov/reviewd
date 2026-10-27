import { useState } from 'react';
import type { Finding, FindingDecision, FindingDecisionState } from '@dsh-code-review/core';
import { Button } from '../primitives/Button.js';
import { Textarea } from '../primitives/Field.js';
import { Dialog } from '../primitives/Dialog.js';

export interface FindingDecisionDialogProps {
  finding: Finding;
  state: FindingDecisionState;
  decision?: FindingDecision | undefined;
  pending?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (state: FindingDecisionState, note: string) => void;
}

function actionLabel(state: FindingDecisionState): string {
  return state === 'accepted' ? 'Accept finding' : 'Dismiss finding';
}

export function FindingDecisionDialog({
  finding,
  state,
  decision,
  pending = false,
  error,
  onClose,
  onSubmit,
}: FindingDecisionDialogProps): JSX.Element {
  const [note, setNote] = useState(decision?.note ?? '');
  const label = actionLabel(state);
  const description =
    state === 'accepted'
      ? 'The finding stays actionable and is sent to the agent with the next feedback.'
      : 'The finding is removed from actionable feedback. A note explains why so the reviewer can avoid repeating it.';

  return (
    <Dialog
      open
      title={label}
      description={description}
      onClose={pending ? () => undefined : onClose}
      actions={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant={state === 'accepted' ? 'primary' : 'secondary'}
            loading={pending}
            onClick={() => onSubmit(state, note.trim())}
          >
            {label}
          </Button>
        </>
      }
    >
      <p className="cr-dialog-copy">
        <strong>{finding.title}</strong> · {finding.file}:{finding.lineStart}
      </p>
      <Textarea
        label="Note for the agent (optional)"
        hint="Sent with the next feedback package. Leave empty to decide without a note."
        value={note}
        maxLength={4000}
        rows={4}
        disabled={pending}
        onChange={(event) => setNote(event.target.value)}
      />
      {error !== null && error !== undefined ? (
        <p className="cr-error" role="alert">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}
