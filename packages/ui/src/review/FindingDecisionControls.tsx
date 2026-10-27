import type { Finding, FindingDecision, FindingDecisionState } from '@dsh-code-review/core';
import { Badge } from '../primitives/Feedback.js';
import { Button } from '../primitives/Button.js';

export interface FindingDecisionControlsProps {
  finding: Finding;
  decision?: FindingDecision | undefined;
  readOnly?: boolean;
  pending?: boolean;
  onDecide: (finding: Finding, state: FindingDecisionState) => void;
}

export function FindingDecisionControls({
  finding,
  decision,
  readOnly = false,
  pending = false,
  onDecide,
}: FindingDecisionControlsProps): JSX.Element | null {
  if (finding.kind === 'praise' && decision === undefined) return null;

  return (
    <div className="cr-finding-decision" aria-label="Finding decision">
      {decision !== undefined ? (
        <div className="cr-finding-decision-status">
          <Badge tone={decision.state === 'accepted' ? 'success' : 'neutral'}>
            {decision.state === 'accepted' ? 'Accepted' : 'Dismissed'}
          </Badge>
          {decision.note !== undefined ? (
            <p className="cr-finding-decision-note">
              <span className="cr-finding-decision-note-label">Note to the agent:</span>{' '}
              {decision.note}
            </p>
          ) : null}
        </div>
      ) : null}
      {readOnly || finding.kind === 'praise' ? null : (
        <div className="cr-finding-decision-actions">
          <Button
            size="small"
            variant="secondary"
            aria-pressed={decision?.state === 'accepted'}
            disabled={pending}
            onClick={() => onDecide(finding, 'accepted')}
          >
            Accept
          </Button>
          <Button
            size="small"
            variant="secondary"
            aria-pressed={decision?.state === 'dismissed'}
            disabled={pending}
            onClick={() => onDecide(finding, 'dismissed')}
          >
            Dismiss
          </Button>
        </div>
      )}
    </div>
  );
}
