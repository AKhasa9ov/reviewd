import { useState } from 'react';
import type { Comment, CommentState } from '@sir_yami/reviewd-core';
import { Button } from '../primitives/Button.js';
import { Textarea } from '../primitives/Field.js';
import { CommentThread } from './CommentThread.js';

export type ThreadAction = 'comment' | 'answer';

export interface ThreadConversationProps {
  comments: readonly Comment[];
  action?: ThreadAction;
  readOnly?: boolean;
  activeCommentId?: string | undefined;
  pendingCommentId?: string | undefined;
  onReply?: ((comment: Comment, body: string) => Promise<void>) | undefined;
  onState?: ((comment: Comment, state: CommentState) => Promise<void>) | undefined;
  onEdit?: ((comment: Comment, body: string) => Promise<void>) | undefined;
  onDelete?: ((comment: Comment) => Promise<void>) | undefined;
  onJump?: ((comment: Comment) => void) | undefined;
  onFocus?: ((comment: Comment) => void) | undefined;
  onAdd?: ((body: string) => Promise<void>) | undefined;
}

const noReply = async (): Promise<void> => undefined;
const noState = async (): Promise<void> => undefined;
const noJump = (): void => undefined;

export function ThreadConversation({
  comments,
  action = 'comment',
  readOnly = false,
  activeCommentId,
  pendingCommentId,
  onReply,
  onState,
  onEdit,
  onDelete,
  onJump,
  onFocus,
  onAdd,
}: ThreadConversationProps): JSX.Element | null {
  const [addOpen, setAddOpen] = useState(false);
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canAdd = !readOnly && onAdd !== undefined;
  const threadReadOnly = readOnly || onReply === undefined || onState === undefined;
  const isAnswer = action === 'answer';

  if (comments.length === 0 && !canAdd) return null;

  async function submit(): Promise<void> {
    if (body.trim() === '') {
      setError(isAnswer ? 'Write an answer before sending.' : 'Write a comment before posting.');
      return;
    }
    if (onAdd === undefined) return;
    setBusy(true);
    setError(null);
    try {
      await onAdd(body.trim());
      setBody('');
      setAddOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save your message.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="cr-topic-thread"
      aria-label={isAnswer ? 'Question thread' : 'Finding thread'}
    >
      {comments.length > 0 ? (
        <ol className="cr-topic-thread-list" aria-label={isAnswer ? 'Answers' : 'Comments'}>
          {comments.map((comment) => (
            <li key={comment.id}>
              <CommentThread
                comment={comment}
                compact
                readOnly={threadReadOnly}
                active={activeCommentId === comment.id}
                pending={pendingCommentId === comment.id}
                onReply={onReply ?? noReply}
                onState={onState ?? noState}
                onJump={onJump ?? noJump}
                {...(onEdit === undefined ? {} : { onEdit })}
                {...(onDelete === undefined ? {} : { onDelete })}
                {...(onFocus === undefined ? {} : { onFocus })}
              />
            </li>
          ))}
        </ol>
      ) : null}

      {canAdd && !addOpen ? (
        <div className="cr-topic-thread-actions">
          <Button size="small" variant="secondary" onClick={() => setAddOpen(true)}>
            {isAnswer ? 'Answer' : 'Comment'}
          </Button>
        </div>
      ) : null}

      {canAdd && addOpen ? (
        <form
          className="cr-topic-thread-form"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <Textarea
            label={isAnswer ? 'Your answer' : 'Your comment'}
            value={body}
            rows={3}
            disabled={busy}
            onChange={(event) => {
              setBody(event.target.value);
              setError(null);
            }}
          />
          <p className="cr-meta">
            {isAnswer
              ? 'Saved as a comment on this line and visible in the diff.'
              : 'Saved as a comment on this finding line and visible in the diff.'}
          </p>
          {error !== null ? (
            <p className="cr-topic-thread-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="cr-topic-thread-form-actions">
            <Button type="submit" size="small" disabled={busy}>
              {isAnswer ? 'Send answer' : 'Post comment'}
            </Button>
            <Button
              type="button"
              size="small"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setAddOpen(false);
                setBody('');
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
