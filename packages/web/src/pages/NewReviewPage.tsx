import { useState } from 'react';
import type { DiffScope, ApiClient } from '@dsh-code-review/ui';
import { Button, Select } from '@dsh-code-review/ui';
import { ErrorPanel, PageHeader } from '../components.js';
import { navigate } from '../router.js';

type ScopeKind = DiffScope['kind'];

interface FormState {
  repoRoot: string;
  title: string;
  kind: ScopeKind;
  baseRef: string;
  headRef: string;
  sha: string;
  reviewer: 'none' | 'worker';
}

interface FormErrors {
  repoRoot?: string;
  title?: string;
  baseRef?: string;
  headRef?: string;
  sha?: string;
}

const initialForm: FormState = {
  repoRoot: '',
  title: '',
  kind: 'range',
  baseRef: 'main',
  headRef: '',
  sha: '',
  reviewer: 'none',
};

function buildScope(form: FormState): DiffScope {
  if (form.kind === 'worktree') {
    return { kind: 'worktree', baseRef: form.baseRef.trim() };
  }
  if (form.kind === 'commit') {
    return { kind: 'commit', sha: form.sha.trim() };
  }
  return {
    kind: 'range',
    baseRef: form.baseRef.trim(),
    headRef: form.headRef.trim(),
  };
}

function validate(form: FormState): FormErrors {
  const errors: FormErrors = {};
  if (form.repoRoot.trim() === '') errors.repoRoot = 'Enter the repository path on the daemon.';
  if (form.title.trim() === '') errors.title = 'Give this review a title.';
  if (form.kind !== 'commit' && form.baseRef.trim() === '') {
    errors.baseRef = 'A base ref is required.';
  }
  if (form.kind === 'range' && form.headRef.trim() === '') {
    errors.headRef = 'A head ref is required for a range review.';
  }
  if (form.kind === 'commit' && form.sha.trim() === '') {
    errors.sha = 'A commit SHA is required.';
  }
  return errors;
}

export interface NewReviewPageProps {
  client: ApiClient;
  onCreated?: (id: string) => void;
}

export function NewReviewPage({ client, onCreated }: NewReviewPageProps): JSX.Element {
  const [form, setForm] = useState<FormState>(initialForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const nextErrors = validate(form);
    setErrors(nextErrors);
    setSubmitError(null);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      const result = await client.createReview({
        repoRoot: form.repoRoot.trim(),
        title: form.title.trim(),
        scope: buildScope(form),
        reviewer: { backend: form.reviewer },
      });
      const id = result.review.review.id;
      if (onCreated !== undefined) onCreated(id);
      else navigate(`/review/${encodeURIComponent(id)}`);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Could not create the review');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="New review"
        title="Set the boundary"
        description="Point reviewd at a repository and the exact range you want a human and an agent to inspect."
      />
      <form className="cr-form" onSubmit={(event) => void onSubmit(event)} noValidate>
        {submitError !== null ? (
          <ErrorPanel title="Could not create the review" message={submitError} />
        ) : null}

        <div className="cr-form-card">
          <div className="cr-form-section">
            <h2 className="cr-form-section-title">Repository</h2>
            <p className="cr-form-section-copy">
              The path is resolved on the daemon, not in this browser.
            </p>
            <label className="cr-label" htmlFor="repo-root">
              Repository path
            </label>
            <input
              id="repo-root"
              className="cr-input"
              value={form.repoRoot}
              onChange={(event) => update('repoRoot', event.target.value)}
              placeholder="/srv/repos/example"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={errors.repoRoot === undefined ? undefined : true}
              aria-describedby={errors.repoRoot === undefined ? undefined : 'repo-root-error'}
              required
            />
            {errors.repoRoot !== undefined ? (
              <span className="cr-error" id="repo-root-error" role="alert">
                {errors.repoRoot}
              </span>
            ) : null}
          </div>

          <div className="cr-form-section">
            <h2 className="cr-form-section-title">Review</h2>
            <div className="cr-form-grid">
              <div className="cr-field" style={{ gridColumn: '1 / -1' }}>
                <label className="cr-label" htmlFor="review-title">
                  Title
                </label>
                <input
                  id="review-title"
                  className="cr-input"
                  value={form.title}
                  onChange={(event) => update('title', event.target.value)}
                  placeholder="Billing retry semantics"
                  aria-invalid={errors.title === undefined ? undefined : true}
                  aria-describedby={errors.title === undefined ? undefined : 'review-title-error'}
                  required
                />
                {errors.title !== undefined ? (
                  <span className="cr-error" id="review-title-error" role="alert">
                    {errors.title}
                  </span>
                ) : null}
              </div>
              <div className="cr-field">
                <Select
                  label="Reviewer"
                  id="reviewer"
                  value={form.reviewer}
                  onChange={(event) =>
                    update('reviewer', event.target.value as FormState['reviewer'])
                  }
                  options={[
                    { value: 'none', label: 'Manual review only' },
                    { value: 'worker', label: 'Agent worker' },
                  ]}
                />
                <span className="cr-hint">
                  Manual reviews accept comments immediately. Agent worker queues a read-only
                  reviewer job.
                </span>
              </div>
              <div className="cr-field">
                <Select
                  label="Diff scope"
                  id="scope-kind"
                  value={form.kind}
                  onChange={(event) => update('kind', event.target.value as ScopeKind)}
                  options={[
                    { value: 'range', label: 'Branch range' },
                    { value: 'worktree', label: 'Working tree' },
                    { value: 'commit', label: 'Single commit' },
                  ]}
                />
              </div>
            </div>
          </div>

          <div className="cr-form-section">
            <h2 className="cr-form-section-title">Changes</h2>
            {form.kind === 'range' ? (
              <div className="cr-form-grid">
                <div className="cr-field">
                  <label className="cr-label" htmlFor="base-ref">
                    Base ref
                  </label>
                  <input
                    id="base-ref"
                    className="cr-input cr-mono"
                    value={form.baseRef}
                    onChange={(event) => update('baseRef', event.target.value)}
                    placeholder="main"
                    autoComplete="off"
                    spellCheck={false}
                    aria-invalid={errors.baseRef === undefined ? undefined : true}
                    aria-describedby={errors.baseRef === undefined ? undefined : 'base-ref-error'}
                  />
                  {errors.baseRef !== undefined ? (
                    <span className="cr-error" id="base-ref-error" role="alert">
                      {errors.baseRef}
                    </span>
                  ) : null}
                </div>
                <div className="cr-field">
                  <label className="cr-label" htmlFor="head-ref">
                    Head ref
                  </label>
                  <input
                    id="head-ref"
                    className="cr-input cr-mono"
                    value={form.headRef}
                    onChange={(event) => update('headRef', event.target.value)}
                    placeholder="feature/billing"
                    autoComplete="off"
                    spellCheck={false}
                    aria-invalid={errors.headRef === undefined ? undefined : true}
                    aria-describedby={errors.headRef === undefined ? undefined : 'head-ref-error'}
                  />
                  {errors.headRef !== undefined ? (
                    <span className="cr-error" id="head-ref-error" role="alert">
                      {errors.headRef}
                    </span>
                  ) : null}
                </div>
              </div>
            ) : form.kind === 'worktree' ? (
              <div className="cr-field">
                <label className="cr-label" htmlFor="worktree-base">
                  Base ref
                </label>
                <input
                  id="worktree-base"
                  className="cr-input cr-mono"
                  value={form.baseRef}
                  onChange={(event) => update('baseRef', event.target.value)}
                  placeholder="main"
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={errors.baseRef === undefined ? undefined : true}
                />
                <span className="cr-hint">
                  Compares the base commit with the current worktree, including untracked files.
                </span>
                {errors.baseRef !== undefined ? (
                  <span className="cr-error" role="alert">
                    {errors.baseRef}
                  </span>
                ) : null}
              </div>
            ) : (
              <div className="cr-field">
                <label className="cr-label" htmlFor="commit-sha">
                  Commit SHA
                </label>
                <input
                  id="commit-sha"
                  className="cr-input cr-mono"
                  value={form.sha}
                  onChange={(event) => update('sha', event.target.value)}
                  placeholder="4f3a2c1"
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={errors.sha === undefined ? undefined : true}
                  aria-describedby={errors.sha === undefined ? undefined : 'commit-sha-error'}
                />
                {errors.sha !== undefined ? (
                  <span className="cr-error" id="commit-sha-error" role="alert">
                    {errors.sha}
                  </span>
                ) : null}
              </div>
            )}
          </div>

          <div className="cr-form-actions">
            <Button type="submit" loading={submitting}>
              Create review
            </Button>
            <Button type="button" variant="secondary" onClick={() => navigate('/')}>
              Cancel
            </Button>
          </div>
        </div>
      </form>
    </>
  );
}
