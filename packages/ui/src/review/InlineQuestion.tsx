import { useId, useState } from 'react';
import type { Comment, CommentState, ReviewQuestion } from '@dsh-code-review/core';
import { Badge } from '../primitives/Feedback.js';
import { ThreadConversation } from './ThreadConversation.js';

export interface InlineQuestionProps {
  question: ReviewQuestion;
  comments?: readonly Comment[];
  readOnly?: boolean;
  activeCommentId?: string | undefined;
  pendingCommentId?: string | undefined;
  onReply?: ((comment: Comment, body: string) => Promise<void>) | undefined;
  onState?: ((comment: Comment, state: CommentState) => Promise<void>) | undefined;
  onEdit?: ((comment: Comment, body: string) => Promise<void>) | undefined;
  onDelete?: ((comment: Comment) => Promise<void>) | undefined;
  onJump?: ((comment: Comment) => void) | undefined;
  onFocus?: ((comment: Comment) => void) | undefined;
  onAnswer?: ((body: string) => Promise<void>) | undefined;
}

export function InlineQuestion({
  question,
  comments = [],
  readOnly = false,
  activeCommentId,
  pendingCommentId,
  onReply,
  onState,
  onEdit,
  onDelete,
  onJump,
  onFocus,
  onAnswer,
}: InlineQuestionProps): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const bodyId = `question-body-${useId()}`;
  const answerCount = comments.length;

  return (
    <article
      className={[
        'cr-inline-question',
        expanded ? 'cr-inline-question-expanded' : 'cr-inline-question-collapsed',
      ]
        .filter(Boolean)
        .join(' ')}
      role="cell"
      aria-label={`question: ${question.question}`}
    >
      <div className="cr-inline-question-row">
        <button
          type="button"
          className="cr-inline-question-header"
          aria-expanded={expanded}
          aria-controls={expanded ? bodyId : undefined}
          aria-label={expanded ? 'Collapse question' : 'Expand question'}
          onClick={() => setExpanded((value) => !value)}
        >
          <span className="cr-inline-question-toggle" aria-hidden="true">
            {expanded ? '▾' : '▸'}
          </span>
          <span className="cr-inline-question-mark" aria-hidden="true">
            ?
          </span>
          <span className="cr-inline-question-main">
            <span className="cr-inline-question-head">
              <Badge tone="info">question</Badge>
              <span className="cr-meta">line {question.line}</span>
              {answerCount > 0 ? (
                <span className="cr-meta">
                  {answerCount} {answerCount === 1 ? 'answer' : 'answers'}
                </span>
              ) : null}
            </span>
          </span>
        </button>
        {!expanded && onAnswer !== undefined && !readOnly ? (
          <button
            type="button"
            className="cr-inline-question-cta"
            aria-label="Answer question"
            onClick={() => setExpanded(true)}
          >
            Answer
          </button>
        ) : null}
      </div>
      {expanded ? (
        <div className="cr-inline-question-body" id={bodyId}>
          <p className="cr-inline-question-text">{question.question}</p>
          <p className="cr-inline-question-why">
            <span className="cr-meta">Why:</span> {question.why}
          </p>
          <ThreadConversation
            comments={comments}
            action="answer"
            readOnly={readOnly}
            activeCommentId={activeCommentId}
            pendingCommentId={pendingCommentId}
            onReply={onReply}
            onState={onState}
            onEdit={onEdit}
            onDelete={onDelete}
            onJump={onJump}
            onFocus={onFocus}
            onAdd={onAnswer}
          />
        </div>
      ) : null}
    </article>
  );
}
