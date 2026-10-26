import { useEffect, useState } from 'react';
import type { ReviewState, SubmitInput } from '@dsh-code-review/core';
import { Badge } from '../primitives/Feedback.js';
import { latestAnchor } from './model.js';
import { Button } from '../primitives/Button.js';
import { Dialog } from '../primitives/Dialog.js';
import { Textarea } from '../primitives/Field.js';

const VERDICTS: Array<{
  value: SubmitInput['verdict'];
  label: string;
  description: string;
}> = [
  { value: 'approve', label: 'Approve', description: 'Close the review as approved.' },
  {
    value: 'request-changes',
    label: 'Request changes',
    description: 'Send feedback back to the agent session.',
  },
  { value: 'comment', label: 'Comment only', description: 'Send feedback without a verdict.' },
];

export interface SubmitDialogProps {
  open: boolean;
  review: ReviewState;
  submitting?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (input: SubmitInput) => void;
  onJumpComment?: (commentId: string) => void;
}

export function SubmitDialog({
  open,
  review,
  submitting = false,
  error,
  onClose,
  onSubmit,
  onJumpComment,
}: SubmitDialogProps): JSX.Element {
  const [verdict, setVerdict] = useState<SubmitInput['verdict']>('request-changes');
  const [summary, setSummary] = useState('');
  const [includeResolved, setIncludeResolved] = useState(false);
  const previous = (review.submissions?.length ?? 0) > 0;
  const pending = review.comments.filter((comment) => comment.state === 'open');
  const unresolved = pending.length;
  const resolved = review.comments.filter((comment) => comment.state === 'resolved').length;

  useEffect(() => {
    if (!open) return;
    setVerdict('request-changes');
    setSummary('');
    setIncludeResolved(false);
  }, [open]);

  return (
    <Dialog
      open={open}
      title="Submit review"
      description="The feedback package is delivered to the agent session that opened this review."
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            loading={submitting}
            onClick={() =>
              onSubmit({
                verdict,
                ...(summary.trim() === '' ? {} : { summary }),
                includeResolved: previous ? false : includeResolved,
              })
            }
          >
            Submit feedback
          </Button>
        </>
      }
    >
      <div className="cr-submit">
        <div className="cr-recipient-warning" role="note">
          <strong>Recipient session</strong>
          <p>
            Sending feedback resumes the agent session that initiated this review. The package
            includes unresolved comments{previous ? ' only' : ''}, findings and verification.
          </p>
        </div>

        <fieldset className="cr-verdict-field">
          <legend className="cr-label">Verdict</legend>
          <div className="cr-verdict-options">
            {VERDICTS.map((option) => (
              <label className="cr-verdict-option" key={option.value}>
                <input
                  type="radio"
                  name="verdict"
                  value={option.value}
                  checked={verdict === option.value}
                  onChange={() => setVerdict(option.value)}
                />
                <span>
                  <strong>{option.label}</strong>
                  <span className="cr-meta">{option.description}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <Textarea
          label="Summary"
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          rows={4}
          placeholder="What should the agent do next? Context for the feedback package."
        />

        <div className="cr-submit-counts">
          <Badge tone={unresolved > 0 ? 'warning' : 'success'}>{unresolved} unresolved</Badge>
          <Badge tone="neutral">{resolved} resolved</Badge>
          {previous ? <Badge tone="info">follow-up submission</Badge> : null}
        </div>

        {pending.length > 0 ? (
          <section className="cr-submit-pending" aria-label="Pending comments in this submission">
            <div className="cr-submit-pending-head">
              <h3>Pending comments</h3>
              <span>{pending.length}</span>
            </div>
            <p className="cr-meta">
              These unresolved threads will be sent to the agent. Double-check them before
              submitting.
            </p>
            <ol className="cr-submit-pending-list">
              {pending.map((comment) => {
                const anchor = latestAnchor(comment);
                const body = comment.body.replace(/\s+/g, ' ').trim();
                return (
                  <li key={comment.id}>
                    <button
                      type="button"
                      className="cr-submit-pending-item"
                      disabled={onJumpComment === undefined}
                      onClick={() => onJumpComment?.(comment.id)}
                    >
                      <span className="cr-submit-pending-path cr-mono">
                        {anchor === undefined ? 'unanchored' : `${anchor.path}:${anchor.lineStart}`}
                      </span>
                      <span className="cr-submit-pending-body">{body}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
        ) : null}

        <label className="cr-check">
          <input
            type="checkbox"
            checked={previous ? false : includeResolved}
            disabled={previous}
            onChange={(event) => setIncludeResolved(event.target.checked)}
          />
          <span>Include resolved comments in the package</span>
        </label>
        {previous ? (
          <p className="cr-meta">
            This review was submitted before. Only unresolved comments are sent again.
          </p>
        ) : null}

        {error !== null && error !== undefined ? (
          <p className="cr-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
