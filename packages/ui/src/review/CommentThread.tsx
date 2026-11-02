import { useState } from 'react';
import type { Comment, CommentState } from '@sir_yami/reviewd-core';
import { Badge } from '../primitives/Feedback.js';
import { Button } from '../primitives/Button.js';
import { Textarea } from '../primitives/Field.js';
import { formatAge } from '../format.js';
import { actorSource, anchorHistory, isTransferredComment } from './model.js';

export interface CommentThreadProps {
  comment: Comment;
  active?: boolean;
  compact?: boolean;
  readOnly?: boolean;
  pending?: boolean;
  onReply: (comment: Comment, body: string) => Promise<void>;
  onState: (comment: Comment, state: CommentState) => Promise<void>;
  onEdit?: (comment: Comment, body: string) => Promise<void>;
  onDelete?: (comment: Comment) => Promise<void>;
  onJump: (comment: Comment) => void;
  onFocus?: (comment: Comment) => void;
}

function stateTone(state: CommentState): 'success' | 'warning' | 'neutral' {
  if (state === 'resolved') return 'success';
  if (state === 'dismissed') return 'neutral';
  return 'warning';
}

export function CommentThread({
  comment,
  active = false,
  compact = false,
  readOnly = false,
  pending = false,
  onReply,
  onState,
  onEdit,
  onDelete,
  onJump,
  onFocus,
}: CommentThreadProps): JSX.Element {
  const [replyOpen, setReplyOpen] = useState(false);
  const [reply, setReply] = useState('');
  const [replyError, setReplyError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editBody, setEditBody] = useState(comment.body);
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const history = anchorHistory(comment);
  const source = actorSource(comment.author.kind);
  const transferred = isTransferredComment(comment);
  const quoteLines = history.to?.quote.split('\n') ?? [];
  const shownQuote = quoteLines.slice(0, compact ? 6 : 14);
  const anchor = history.to;

  async function submitReply(): Promise<void> {
    if (reply.trim() === '') {
      setReplyError('Write a reply before sending.');
      return;
    }
    setBusy(true);
    setReplyError(null);
    try {
      await onReply(comment, reply);
      setReply('');
      setReplyOpen(false);
    } catch (error) {
      setReplyError(error instanceof Error ? error.message : 'Could not send the reply.');
    } finally {
      setBusy(false);
    }
  }

  async function changeState(state: CommentState): Promise<void> {
    setBusy(true);
    try {
      await onState(comment, state);
    } finally {
      setBusy(false);
    }
  }

  if (comment.deletedAt !== undefined) {
    return (
      <article
        id={`comment-${comment.id}`}
        className={['cr-thread', 'cr-thread-deleted', compact ? 'cr-thread-compact' : '']
          .filter(Boolean)
          .join(' ')}
        aria-label={`Deleted comment by ${comment.author.name}`}
        data-testid={`comment-${comment.id}`}
      >
        <header className="cr-thread-head">
          <span className="cr-avatar" aria-hidden="true">
            {comment.author.name.slice(0, 1).toUpperCase()}
          </span>
          <span className="cr-thread-author">{comment.author.name}</span>
          <time className="cr-meta" dateTime={comment.createdAt} title={comment.createdAt}>
            {formatAge(comment.createdAt)}
          </time>
          <Badge tone="neutral">deleted</Badge>
        </header>
        <div className="cr-thread-tombstone">Comment deleted</div>
        {comment.replies.length > 0 ? (
          <ol className="cr-replies" aria-label="Replies">
            {comment.replies.map((item) => {
              const replySource = actorSource(item.author.kind);
              return (
                <li className="cr-reply" key={item.id}>
                  <div className="cr-reply-head">
                    {item.author.name === replySource.label ? null : (
                      <strong>{item.author.name}</strong>
                    )}
                    <Badge tone={replySource.tone}>{replySource.label}</Badge>
                    <time className="cr-meta" dateTime={item.createdAt}>
                      {formatAge(item.createdAt)}
                    </time>
                  </div>
                  <div className="cr-reply-body">{item.body}</div>
                </li>
              );
            })}
          </ol>
        ) : null}
      </article>
    );
  }

  async function submitEdit(): Promise<void> {
    const body = editBody.trim();
    if (body === '') {
      setEditError('Write a comment before saving.');
      return;
    }
    if (onEdit === undefined) return;
    setBusy(true);
    setEditError(null);
    try {
      await onEdit(comment, body);
      setEditOpen(false);
    } catch (error) {
      setEditError(error instanceof Error ? error.message : 'Could not save the comment.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete(): Promise<void> {
    if (onDelete === undefined) return;
    setBusy(true);
    try {
      await onDelete(comment);
      setDeleteConfirm(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article
      id={`comment-${comment.id}`}
      className={['cr-thread', compact ? 'cr-thread-compact' : '', active ? 'cr-thread-active' : '']
        .filter(Boolean)
        .join(' ')}
      aria-label={`Comment by ${comment.author.name}`}
      data-testid={`comment-${comment.id}`}
      onFocus={() => onFocus?.(comment)}
    >
      <header className="cr-thread-head">
        <span className="cr-avatar" aria-hidden="true">
          {comment.author.name.slice(0, 1).toUpperCase()}
        </span>
        {comment.author.name === source.label ? null : (
          <span className="cr-thread-author">{comment.author.name}</span>
        )}
        <Badge tone={source.tone}>{source.label}</Badge>
        <time className="cr-meta" dateTime={comment.createdAt} title={comment.createdAt}>
          {formatAge(comment.createdAt)}
        </time>
        {comment.editedAt !== undefined ? (
          <span className="cr-meta" title={comment.editedAt}>
            edited {formatAge(comment.editedAt)}
          </span>
        ) : null}
        <Badge tone={stateTone(comment.state)}>{comment.state}</Badge>
      </header>

      {anchor !== undefined ? (
        <button
          type="button"
          className="cr-anchor-jump"
          onClick={() => onJump(comment)}
          aria-label={`${anchor.path} ${history.label}${
            anchor.state !== 'active' ? ` ${anchor.state}` : ''
          } (jump to line)`}
          title={`Jump to ${anchor.path} ${history.label}`}
        >
          <span className="cr-anchor-path">
            {history.pathChanged && history.from !== undefined
              ? `${history.from.path} → ${anchor.path}`
              : anchor.path}
          </span>{' '}
          <span className="cr-anchor-line">{history.label}</span>
          {anchor.state !== 'active' ? (
            <>
              {' '}
              <Badge tone={anchor.state === 'ambiguous' ? 'warning' : 'danger'}>
                {anchor.state}
              </Badge>
            </>
          ) : null}
        </button>
      ) : null}

      <div className="cr-thread-body">{comment.body}</div>

      {shownQuote.length > 0 ? (
        <pre className="cr-quote" aria-label="Quoted code">
          {shownQuote.join('\n')}
          {quoteLines.length > shownQuote.length ? '\n…' : ''}
        </pre>
      ) : null}

      {comment.suggestion !== undefined ? (
        <div className="cr-suggestion" aria-label="Suggested change">
          <div className="cr-suggestion-head">
            <span className="cr-suggestion-label">Suggested change</span>
            {comment.suggestionState !== undefined ? (
              <Badge tone={comment.suggestionState === 'applied' ? 'success' : 'neutral'}>
                {comment.suggestionState}
              </Badge>
            ) : null}
          </div>
          <div className="cr-suggestion-block cr-suggestion-old">
            <span className="cr-suggestion-caption">Before</span>
            <pre>{comment.suggestion.original}</pre>
          </div>
          <div className="cr-suggestion-block cr-suggestion-new">
            <span className="cr-suggestion-caption">After</span>
            <pre>{comment.suggestion.replacement}</pre>
          </div>
        </div>
      ) : null}

      {comment.replies.length > 0 ? (
        <ol className="cr-replies" aria-label="Replies">
          {comment.replies.map((item) => {
            const replySource = actorSource(item.author.kind);
            return (
              <li className="cr-reply" key={item.id}>
                <div className="cr-reply-head">
                  {item.author.name === replySource.label ? null : (
                    <strong>{item.author.name}</strong>
                  )}
                  <Badge tone={replySource.tone}>{replySource.label}</Badge>
                  <time className="cr-meta" dateTime={item.createdAt}>
                    {formatAge(item.createdAt)}
                  </time>
                </div>
                <div className="cr-reply-body">{item.body}</div>
              </li>
            );
          })}
        </ol>
      ) : null}

      {!readOnly ? (
        <footer className="cr-thread-actions">
          {comment.state === 'open' ? (
            <>
              <Button
                size="small"
                variant="secondary"
                loading={busy}
                onClick={() => void changeState('resolved')}
              >
                Resolve
              </Button>
              <Button
                size="small"
                variant="ghost"
                loading={busy}
                onClick={() => void changeState('dismissed')}
              >
                Dismiss
              </Button>
            </>
          ) : (
            <Button
              size="small"
              variant="secondary"
              loading={busy}
              onClick={() => void changeState('open')}
            >
              Reopen
            </Button>
          )}
          <Button
            size="small"
            variant="ghost"
            onClick={() => setReplyOpen((value) => !value)}
            aria-expanded={replyOpen}
          >
            Reply
          </Button>
          {onEdit !== undefined && !transferred ? (
            <Button
              size="small"
              variant="ghost"
              onClick={() => {
                setEditBody(comment.body);
                setEditError(null);
                setEditOpen(true);
              }}
            >
              Edit
            </Button>
          ) : null}
          {onDelete !== undefined && !transferred ? (
            <Button
              size="small"
              variant="ghost"
              onClick={() => setDeleteConfirm(true)}
              disabled={deleteConfirm}
            >
              Delete
            </Button>
          ) : null}
          {anchor !== undefined ? (
            <Button size="small" variant="ghost" onClick={() => onJump(comment)}>
              Jump to line
            </Button>
          ) : null}
          {pending ? <span className="cr-meta">Saving…</span> : null}
        </footer>
      ) : null}

      {replyOpen && !readOnly ? (
        <div className="cr-reply-form">
          <Textarea
            label={`Reply to ${comment.author.name}`}
            value={reply}
            onChange={(event) => setReply(event.target.value)}
            rows={3}
            error={replyError ?? undefined}
            placeholder="Reply in the thread…"
          />
          <div className="cr-inline-actions">
            <Button size="small" loading={busy} onClick={() => void submitReply()}>
              Send reply
            </Button>
            <Button
              size="small"
              variant="ghost"
              onClick={() => {
                setReplyOpen(false);
                setReplyError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {editOpen && !readOnly ? (
        <div className="cr-reply-form">
          <Textarea
            label="Edit comment"
            value={editBody}
            onChange={(event) => setEditBody(event.target.value)}
            rows={4}
            error={editError ?? undefined}
          />
          <div className="cr-inline-actions">
            <Button size="small" loading={busy} onClick={() => void submitEdit()}>
              Save
            </Button>
            <Button
              size="small"
              variant="ghost"
              onClick={() => {
                setEditOpen(false);
                setEditError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {deleteConfirm && !readOnly ? (
        <div className="cr-thread-delete-confirm" role="group" aria-label="Delete comment">
          <span>Delete this comment?</span>
          <Button size="small" variant="danger" loading={busy} onClick={() => void confirmDelete()}>
            Confirm delete
          </Button>
          <Button
            size="small"
            variant="ghost"
            onClick={() => setDeleteConfirm(false)}
            disabled={busy}
          >
            Cancel
          </Button>
        </div>
      ) : null}
    </article>
  );
}
