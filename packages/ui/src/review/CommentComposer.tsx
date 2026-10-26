import { useEffect, useMemo, useState } from 'react';
import type { FileDiff, Side } from '@dsh-code-review/core';
import { Button } from '../primitives/Button.js';
import { Input, Textarea } from '../primitives/Field.js';
import {
  selectedLines,
  validateCommentDraft,
  type CommentDraft,
  type DraftErrors,
} from './model.js';

export interface CommentComposerProps {
  file: FileDiff;
  side: Side;
  lineStart: number;
  lineEnd: number;
  maxLine: number;
  submitting?: boolean;
  serverError?: string | null;
  /** A locally restored draft for the same review, location and range. */
  initialDraft?: Partial<CommentDraft> | undefined;
  onCancel: () => void;
  onSubmit: (draft: CommentDraft) => void;
  onDraftChange?: (draft: CommentDraft) => void;
}

export function CommentComposer({
  file,
  side,
  lineStart,
  lineEnd,
  maxLine,
  submitting = false,
  serverError,
  initialDraft,
  onCancel,
  onSubmit,
  onDraftChange,
}: CommentComposerProps): JSX.Element {
  const [body, setBody] = useState(initialDraft?.body ?? '');
  const [start, setStart] = useState(initialDraft?.lineStart ?? lineStart);
  const [end, setEnd] = useState(initialDraft?.lineEnd ?? lineEnd);
  const [suggestionEnabled, setSuggestionEnabled] = useState(
    initialDraft?.suggestionEnabled ?? false,
  );
  const suggested = useMemo(
    () => selectedLines(file, side, start, end).join('\n'),
    [file, side, start, end],
  );
  const [original, setOriginal] = useState(() => initialDraft?.original || suggested);
  const [replacement, setReplacement] = useState(initialDraft?.replacement ?? '');
  const [errors, setErrors] = useState<DraftErrors>({});
  const lineLabel = start === end ? `line ${start}` : `lines ${start}–${end}`;
  const restored = initialDraft !== undefined && (initialDraft.body ?? '') !== '';

  useEffect(() => {
    onDraftChange?.({
      body,
      lineStart: start,
      lineEnd: end,
      suggestionEnabled,
      original: suggestionEnabled ? original || suggested : '',
      replacement,
    });
  }, [body, start, end, suggestionEnabled, original, replacement, suggested, onDraftChange]);

  function submit(): void {
    const draft: CommentDraft = {
      body,
      lineStart: start,
      lineEnd: end,
      suggestionEnabled,
      original: suggestionEnabled ? original || suggested : '',
      replacement,
    };
    const result = validateCommentDraft(draft, maxLine);
    setErrors(result.errors);
    if (!result.ok) return;
    onSubmit(draft);
  }

  return (
    <form
      className="cr-composer"
      aria-label={`Comment on ${lineLabel}`}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <header className="cr-composer-head">
        <span className="cr-composer-title">Comment on {lineLabel}</span>
        <span className="cr-meta">
          {file.path} · {side} side
        </span>
      </header>
      {restored ? (
        <p className="cr-draft-note" role="status">
          Draft restored from this browser. It will be discarded after posting or cancel.
        </p>
      ) : null}

      <div className="cr-composer-range">
        <Input
          label="Start line"
          type="number"
          min={1}
          max={maxLine}
          value={start}
          onChange={(event) => {
            const value = Number(event.target.value);
            setStart(value);
            if (value > end) setEnd(value);
            setErrors((current) => ({ ...current, range: undefined }));
          }}
          error={errors.range}
        />
        <Input
          label="End line"
          type="number"
          min={1}
          max={maxLine}
          value={end}
          onChange={(event) => setEnd(Number(event.target.value))}
        />
      </div>

      <Textarea
        label="Comment"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        rows={3}
        placeholder="What should change, and why?"
        error={errors.body}
        autoFocus
      />

      <label className="cr-check">
        <input
          type="checkbox"
          checked={suggestionEnabled}
          onChange={(event) => {
            setSuggestionEnabled(event.target.checked);
            if (event.target.checked && original === '') setOriginal(suggested);
          }}
        />
        <span>Add a code suggestion</span>
      </label>

      {suggestionEnabled ? (
        <div className="cr-composer-suggestion">
          <Input
            label="Original snippet"
            value={original}
            onChange={(event) => setOriginal(event.target.value)}
            hint="Must match the selected lines."
            error={errors.suggestion}
          />
          <Textarea
            label="Replacement"
            value={replacement}
            onChange={(event) => setReplacement(event.target.value)}
            rows={3}
            placeholder="Suggested replacement code"
          />
          <div className="cr-suggestion-preview" aria-label="Suggestion preview">
            <div className="cr-suggestion-block cr-suggestion-old">
              <span className="cr-suggestion-caption">Before</span>
              <pre>{original || suggested || '(empty)'}</pre>
            </div>
            <div className="cr-suggestion-block cr-suggestion-new">
              <span className="cr-suggestion-caption">After</span>
              <pre>{replacement || '(empty)'}</pre>
            </div>
          </div>
        </div>
      ) : null}

      {serverError !== null && serverError !== undefined ? (
        <p className="cr-error" role="alert">
          {serverError}
        </p>
      ) : null}

      <div className="cr-composer-actions">
        <Button type="submit" loading={submitting}>
          Post comment
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <span className="cr-meta">c comments · Esc closes</span>
      </div>
    </form>
  );
}
