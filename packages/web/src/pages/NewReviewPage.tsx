import { useEffect, useState } from 'react';
import type { ApiClient, DiffScope, RepoCommit, RepositorySetting } from '@sir_yami/reviewd-ui';
import { Button, Select } from '@sir_yami/reviewd-ui';
import { ErrorPanel, PageHeader } from '../components.js';
import { Link, useNavigate } from '../router.js';

type ScopeKind = 'branch' | 'worktree' | 'commit';
type CommitsMode = 'all' | 'selected';

interface FormState {
  repoRoot: string;
  title: string;
  kind: ScopeKind;
  targetRef: string;
  sourceRef: string;
  commitsMode: CommitsMode;
  baseRef: string;
  sha: string;
  reviewer: 'none' | 'worker';
}

interface FormErrors {
  repoRoot?: string;
  title?: string;
  targetRef?: string;
  sourceRef?: string;
  commits?: string;
  baseRef?: string;
  sha?: string;
}

const initialForm: FormState = {
  repoRoot: '',
  title: '',
  kind: 'branch',
  targetRef: 'main',
  sourceRef: '',
  commitsMode: 'all',
  baseRef: 'main',
  sha: '',
  reviewer: 'none',
};

function selectedRange(commits: readonly RepoCommit[], selected: readonly string[]): string[] {
  const selectedSet = new Set(selected);
  const indexes = commits
    .map((commit, index) => (selectedSet.has(commit.sha) ? index : -1))
    .filter((index) => index >= 0);
  if (indexes.length === 0) return [];
  const oldest = Math.min(...indexes);
  const newest = Math.max(...indexes);
  return commits.slice(oldest, newest + 1).map((commit) => commit.sha);
}

function validate(
  form: FormState,
  commits: readonly RepoCommit[],
  selected: readonly string[],
): FormErrors {
  const errors: FormErrors = {};
  if (form.repoRoot.trim() === '') errors.repoRoot = 'Enter the repository path on the daemon.';
  if (form.title.trim() === '') errors.title = 'Give this review a title.';
  if (form.kind === 'branch') {
    if (form.targetRef.trim() === '') {
      errors.targetRef = 'Choose the branch this merge request is merged into.';
    }
    if (form.sourceRef.trim() === '') {
      errors.sourceRef = 'Choose the branch that contains the changes.';
    } else if (form.sourceRef.trim() === form.targetRef.trim()) {
      errors.sourceRef = 'The source and target branch must be different.';
    }
    if (form.commitsMode === 'selected' && selectedRange(commits, selected).length === 0) {
      errors.commits = 'Select at least one commit.';
    }
  }
  if (form.kind === 'worktree' && form.baseRef.trim() === '') {
    errors.baseRef = 'A base ref is required.';
  }
  if (form.kind === 'commit' && form.sha.trim() === '') {
    errors.sha = 'A commit SHA is required.';
  }
  return errors;
}

function buildScope(
  form: FormState,
  commits: readonly RepoCommit[],
  selected: readonly string[],
): DiffScope {
  if (form.kind === 'worktree') {
    return { kind: 'worktree', baseRef: form.baseRef.trim() };
  }
  if (form.kind === 'commit') {
    return { kind: 'commit', sha: form.sha.trim() };
  }
  if (form.commitsMode === 'selected') {
    return { kind: 'commits', shas: selectedRange(commits, selected) };
  }
  return {
    kind: 'range',
    baseRef: form.targetRef.trim(),
    headRef: form.sourceRef.trim(),
  };
}

export interface NewReviewPageProps {
  client: ApiClient;
  onCreated?: (id: string) => void;
  showSettingsLink?: boolean;
}

export function NewReviewPage({
  client,
  onCreated,
  showSettingsLink = true,
}: NewReviewPageProps): JSX.Element {
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>(initialForm);
  const [repositories, setRepositories] = useState<RepositorySetting[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [branchesError, setBranchesError] = useState<string | null>(null);
  const [commits, setCommits] = useState<RepoCommit[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [commitsLoading, setCommitsLoading] = useState(false);
  const [commitsError, setCommitsError] = useState<string | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    void client
      .listRepositories()
      .then((result) => {
        if (!active) return;
        setRepositories(result.repositories);
        const first = result.repositories[0];
        if (first !== undefined) {
          setForm((current) =>
            current.repoRoot === ''
              ? {
                  ...current,
                  repoRoot: first.path,
                  targetRef: first.defaultTarget ?? current.targetRef,
                }
              : current,
          );
        }
      })
      .catch(() => {
        if (active) setRepositories([]);
      });
    return () => {
      active = false;
    };
  }, [client]);

  useEffect(() => {
    const root = form.repoRoot.trim();
    if (root === '') {
      setBranches([]);
      setBranchesError(null);
      return;
    }
    let active = true;
    setBranchesLoading(true);
    setBranchesError(null);
    void client
      .listBranches(root)
      .then((result) => {
        if (!active) return;
        setBranches(result.branches);
        setForm((current) => {
          if (current.repoRoot !== root) return current;
          const configured = repositories.find((repository) => repository.path === root);
          const preferred = configured?.defaultTarget;
          const target =
            current.targetRef !== '' && result.branches.includes(current.targetRef)
              ? current.targetRef
              : preferred !== undefined && result.branches.includes(preferred)
                ? preferred
                : result.branches.includes('main')
                  ? 'main'
                  : (result.branches[0] ?? current.targetRef);
          return { ...current, targetRef: target };
        });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setBranches([]);
        setBranchesError(
          error instanceof Error ? error.message : 'Could not list branches in this repository.',
        );
      })
      .finally(() => {
        if (active) setBranchesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, form.repoRoot, repositories]);

  useEffect(() => {
    if (
      form.kind !== 'branch' ||
      form.commitsMode !== 'selected' ||
      form.repoRoot.trim() === '' ||
      form.targetRef.trim() === '' ||
      form.sourceRef.trim() === '' ||
      form.sourceRef.trim() === form.targetRef.trim()
    ) {
      setCommits([]);
      setSelected([]);
      setCommitsError(null);
      return;
    }
    let active = true;
    setCommitsLoading(true);
    setCommitsError(null);
    setSelected([]);
    void client
      .listCommits(form.repoRoot.trim(), form.targetRef.trim(), form.sourceRef.trim())
      .then((result) => {
        if (!active) return;
        setCommits(result.commits);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setCommits([]);
        setCommitsError(
          error instanceof Error ? error.message : 'Could not list commits for this merge request.',
        );
      })
      .finally(() => {
        if (active) setCommitsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, form.kind, form.commitsMode, form.repoRoot, form.targetRef, form.sourceRef]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      const next = { ...current };
      if (key === 'kind') {
        delete next.targetRef;
        delete next.sourceRef;
        delete next.commits;
        delete next.baseRef;
        delete next.sha;
      } else if (key === 'commitsMode') {
        delete next.commits;
      } else if (
        key === 'repoRoot' ||
        key === 'title' ||
        key === 'sourceRef' ||
        key === 'targetRef' ||
        key === 'baseRef' ||
        key === 'sha'
      ) {
        delete next[key as keyof FormErrors];
        if (key === 'repoRoot' || key === 'sourceRef' || key === 'targetRef') {
          delete next.commits;
        }
      }
      return next;
    });
    setSubmitError(null);
  }

  function toggleCommit(sha: string): void {
    setSelected((current) =>
      current.includes(sha) ? current.filter((value) => value !== sha) : [...current, sha],
    );
    setErrors((current) => {
      const next = { ...current };
      delete next.commits;
      return next;
    });
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const nextErrors = validate(form, commits, selected);
    setErrors(nextErrors);
    setSubmitError(null);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      const result = await client.createReview({
        repoRoot: form.repoRoot.trim(),
        title: form.title.trim(),
        scope: buildScope(form, commits, selected),
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

  const hasErrors = Object.keys(errors).length > 0;
  const chosenShas = selectedRange(commits, selected);

  return (
    <>
      <PageHeader
        eyebrow="New review"
        title="Set the boundary"
        description="Choose a repository, the branch that carries the changes, and the branch it should merge into. reviewd records the merge-request boundary; it never merges or rewrites a branch."
      />
      <form className="cr-form" onSubmit={(event) => void onSubmit(event)} noValidate>
        <datalist id="branch-options">
          {branches.map((branch) => (
            <option key={branch} value={branch} />
          ))}
        </datalist>
        {submitError !== null ? (
          <ErrorPanel title="Could not create the review" message={submitError} />
        ) : null}
        {hasErrors ? (
          <p className="cr-form-error-summary" role="alert">
            Check the highlighted fields before creating the review.
          </p>
        ) : null}

        <div className="cr-form-card">
          <div className="cr-form-section">
            <div className="cr-form-section-head">
              <div>
                <h2 className="cr-form-section-title">Repository</h2>
                <p className="cr-form-section-copy">
                  Paths are resolved on the daemon.{' '}
                  {showSettingsLink
                    ? 'Manage saved repositories in Settings.'
                    : 'Manage saved repositories in DSH Settings → Built-in plugins → Code Review.'}
                </p>
              </div>
              {showSettingsLink ? (
                <Link className="cr-link-button" to="/settings">
                  Manage repositories
                </Link>
              ) : null}
            </div>
            <div className="cr-form-grid">
              <div className="cr-field">
                <Select
                  label="Saved repository"
                  id="saved-repository"
                  value={
                    repositories.some((repository) => repository.path === form.repoRoot)
                      ? form.repoRoot
                      : ''
                  }
                  onChange={(event) => {
                    const repository = repositories.find(
                      (item) => item.path === event.target.value,
                    );
                    setForm((current) => ({
                      ...current,
                      repoRoot: event.target.value,
                      ...(repository?.defaultTarget === undefined
                        ? {}
                        : { targetRef: repository.defaultTarget }),
                    }));
                    setErrors((current) => {
                      const next = { ...current };
                      delete next.repoRoot;
                      return next;
                    });
                  }}
                  options={[
                    { value: '', label: 'Choose a saved repository' },
                    ...repositories.map((repository) => ({
                      value: repository.path,
                      label: repository.name,
                    })),
                  ]}
                />
              </div>
              <div className="cr-field">
                <label className="cr-label" htmlFor="repo-root">
                  Repository path
                </label>
                <input
                  id="repo-root"
                  className="cr-input cr-mono"
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
            </div>
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
                    { value: 'branch', label: 'Merge request (branches)' },
                    { value: 'worktree', label: 'Working tree' },
                    { value: 'commit', label: 'Single commit' },
                  ]}
                />
              </div>
            </div>
          </div>

          <div className="cr-form-section">
            <h2 className="cr-form-section-title">Changes</h2>
            {form.kind === 'branch' ? (
              <>
                <div className="cr-form-grid">
                  <div className="cr-field">
                    <label className="cr-label" htmlFor="source-ref">
                      Source branch
                    </label>
                    <input
                      id="source-ref"
                      className="cr-input cr-mono"
                      value={form.sourceRef}
                      onChange={(event) => update('sourceRef', event.target.value)}
                      placeholder="feature/billing"
                      autoComplete="off"
                      spellCheck={false}
                      list="branch-options"
                      aria-invalid={errors.sourceRef === undefined ? undefined : true}
                      aria-describedby={
                        errors.sourceRef === undefined ? 'source-ref-hint' : 'source-ref-error'
                      }
                    />
                    {errors.sourceRef !== undefined ? (
                      <span className="cr-error" id="source-ref-error" role="alert">
                        {errors.sourceRef}
                      </span>
                    ) : (
                      <span className="cr-hint" id="source-ref-hint">
                        The branch whose commits you want to inspect.
                      </span>
                    )}
                  </div>
                  <div className="cr-field">
                    <label className="cr-label" htmlFor="target-ref">
                      Target branch
                    </label>
                    <input
                      id="target-ref"
                      className="cr-input cr-mono"
                      value={form.targetRef}
                      onChange={(event) => update('targetRef', event.target.value)}
                      placeholder="main"
                      autoComplete="off"
                      spellCheck={false}
                      list="branch-options"
                      aria-invalid={errors.targetRef === undefined ? undefined : true}
                      aria-describedby={
                        errors.targetRef === undefined ? 'target-ref-hint' : 'target-ref-error'
                      }
                    />
                    {errors.targetRef !== undefined ? (
                      <span className="cr-error" id="target-ref-error" role="alert">
                        {errors.targetRef}
                      </span>
                    ) : (
                      <span className="cr-hint" id="target-ref-hint">
                        The merge destination. Only the boundary is recorded.
                      </span>
                    )}
                  </div>
                </div>
                {branchesLoading ? (
                  <p className="cr-hint" role="status">
                    Loading branches…
                  </p>
                ) : null}
                {branchesError !== null ? (
                  <p className="cr-error" role="alert">
                    {branchesError}
                  </p>
                ) : null}

                <fieldset className="cr-commits-fieldset">
                  <legend className="cr-label">Commits</legend>
                  <label className="cr-radio">
                    <input
                      type="radio"
                      name="commits-mode"
                      value="all"
                      checked={form.commitsMode === 'all'}
                      onChange={() => {
                        update('commitsMode', 'all');
                        setErrors((current) => {
                          const next = { ...current };
                          delete next.commits;
                          return next;
                        });
                      }}
                    />
                    <span>
                      All commits in the merge request
                      <span className="cr-hint">
                        Diffs the source branch against the merge base with the target.
                      </span>
                    </span>
                  </label>
                  <label className="cr-radio">
                    <input
                      type="radio"
                      name="commits-mode"
                      value="selected"
                      checked={form.commitsMode === 'selected'}
                      onChange={() => update('commitsMode', 'selected')}
                    />
                    <span>
                      Choose commits
                      <span className="cr-hint">
                        The selection is inclusive: commits between the first and last checked
                        commit are included.
                      </span>
                    </span>
                  </label>
                  {form.commitsMode === 'selected' ? (
                    <div className="cr-commit-picker">
                      {commitsLoading ? (
                        <p className="cr-hint" role="status">
                          Loading commits…
                        </p>
                      ) : commitsError !== null ? (
                        <p className="cr-error" role="alert">
                          {commitsError}
                        </p>
                      ) : commits.length === 0 ? (
                        <p className="cr-hint">No commits found between these branches.</p>
                      ) : (
                        <ul className="cr-commit-list">
                          {commits.map((commit) => (
                            <li key={commit.sha}>
                              <label className="cr-commit-option">
                                <input
                                  type="checkbox"
                                  checked={selected.includes(commit.sha)}
                                  onChange={() => toggleCommit(commit.sha)}
                                />
                                <span className="cr-commit-sha">{commit.shortSha}</span>{' '}
                                <span className="cr-commit-subject">{commit.subject}</span>{' '}
                                <span className="cr-commit-author">{commit.author}</span>
                              </label>
                            </li>
                          ))}
                        </ul>
                      )}
                      {chosenShas.length > 0 ? (
                        <p className="cr-hint" role="status">
                          {chosenShas.length} commit{chosenShas.length === 1 ? '' : 's'} will be
                          reviewed.
                        </p>
                      ) : null}
                      {errors.commits !== undefined ? (
                        <span className="cr-error" role="alert">
                          {errors.commits}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </fieldset>
              </>
            ) : form.kind === 'worktree' ? (
              <div className="cr-field">
                <label className="cr-label" htmlFor="worktree-base">
                  Base branch
                </label>
                <input
                  id="worktree-base"
                  className="cr-input cr-mono"
                  value={form.baseRef}
                  onChange={(event) => update('baseRef', event.target.value)}
                  placeholder="main"
                  autoComplete="off"
                  spellCheck={false}
                  list="branch-options"
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
