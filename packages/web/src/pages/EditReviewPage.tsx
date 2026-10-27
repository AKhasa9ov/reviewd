import { useEffect, useMemo, useState } from 'react';
import type { ApiClient, DiffScope, ReviewView } from '@dsh-code-review/ui';
import { Button, Input, Select, useToast } from '@dsh-code-review/ui';
import { ErrorPanel, PageHeader } from '../components.js';
import { navigate } from '../router.js';

type ScopeKind = DiffScope['kind'];
type ReviewerBackend = 'none' | 'worker' | 'command' | 'fake';

interface FormState {
  title: string;
  reviewer: ReviewerBackend;
  kind: ScopeKind;
  baseRef: string;
  headRef: string;
  sha: string;
  shasText: string;
}

interface InitialState {
  title: string;
  reviewer: ReviewerBackend;
  scopeDraft: string;
  currentLabel: string;
  hasSnapshot: boolean;
}

const SCOPE_OPTIONS = [
  { value: 'range', label: 'Merge request (branches)' },
  { value: 'worktree', label: 'Working tree' },
  { value: 'commit', label: 'Single commit' },
  { value: 'commits', label: 'Selected commits' },
];

function backendOf(view: ReviewView): ReviewerBackend {
  const backend = view.review.reviewer?.backend;
  if (backend === 'worker' || backend === 'command' || backend === 'fake') return backend;
  return 'none';
}

type SnapshotScope = NonNullable<ReviewView['latestSnapshot']>['scope'];

function resolvedScopeOf(view: ReviewView): SnapshotScope | null {
  return view.latestSnapshot?.scope ?? null;
}

function formFrom(view: ReviewView): { form: FormState; initial: InitialState } {
  const resolved = resolvedScopeOf(view);
  const kind = resolved?.kind ?? 'range';
  const form: FormState = {
    title: view.review.title,
    reviewer: backendOf(view),
    kind,
    baseRef:
      kind === 'worktree'
        ? (resolved?.baseRef ?? 'HEAD')
        : (resolved?.baseRef ?? resolved?.baseSha ?? ''),
    headRef:
      resolved?.headRef ??
      (resolved === null || resolved === undefined ? '' : (resolved.headSha ?? '')),
    sha: resolved?.headSha ?? resolved?.baseSha ?? '',
    shasText: (resolved?.shas ?? []).join(' '),
  };
  return {
    form,
    initial: {
      title: view.review.title,
      reviewer: form.reviewer,
      scopeDraft: scopeDraftKey(form),
      currentLabel: resolved?.label ?? 'No snapshot',
      hasSnapshot: resolved !== null && resolved !== undefined,
    },
  };
}

function scopeDraftKey(form: FormState): string {
  return JSON.stringify({
    kind: form.kind,
    baseRef: form.baseRef.trim(),
    headRef: form.headRef.trim(),
    sha: form.sha.trim(),
    shas: form.shasText.trim().split(/\s+/).filter(Boolean),
  });
}

function buildScope(form: FormState): DiffScope | null {
  if (form.kind === 'range') {
    const baseRef = form.baseRef.trim();
    const headRef = form.headRef.trim();
    if (baseRef === '' || headRef === '') return null;
    return { kind: 'range', baseRef, headRef };
  }
  if (form.kind === 'worktree') {
    const baseRef = form.baseRef.trim();
    if (baseRef === '') return null;
    return { kind: 'worktree', baseRef };
  }
  if (form.kind === 'commit') {
    const sha = form.sha.trim();
    if (sha === '') return null;
    return { kind: 'commit', sha };
  }
  const shas = form.shasText.trim().split(/\s+/).filter(Boolean);
  if (shas.length === 0) return null;
  return { kind: 'commits', shas };
}

export interface EditReviewPageProps {
  client: ApiClient;
  id: string;
}

export function EditReviewPage({ client, id }: EditReviewPageProps): JSX.Element {
  const { toast } = useToast();
  const [view, setView] = useState<ReviewView | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [initial, setInitial] = useState<InitialState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [branches, setBranches] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);
    void client
      .getReview(id)
      .then((next) => {
        if (!active) return;
        const state = formFrom(next);
        setView(next);
        setForm(state.form);
        setInitial(state.initial);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setLoadError(error instanceof Error ? error.message : 'Could not load the review.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, id]);

  const repoRoot = view?.review.repoRoot ?? '';

  useEffect(() => {
    if (repoRoot === '') return;
    let active = true;
    void client
      .listBranches(repoRoot)
      .then((result) => {
        if (active) setBranches(result.branches);
      })
      .catch(() => {
        if (active) setBranches([]);
      });
    return () => {
      active = false;
    };
  }, [client, repoRoot]);

  const closed = view?.review.status === 'closed';
  const titleChanged =
    form !== null && initial !== null && form.title.trim() !== initial.title.trim();
  const reviewerChanged = form !== null && initial !== null && form.reviewer !== initial.reviewer;
  const scopeChanged =
    form !== null &&
    initial !== null &&
    initial.hasSnapshot &&
    scopeDraftKey(form) !== initial.scopeDraft;
  const dirty = titleChanged || reviewerChanged || scopeChanged;
  const nextRound = view === null ? 0 : view.review.rounds.length + 1;

  const reviewerOptions = useMemo(() => {
    const current = initial?.reviewer ?? 'none';
    const options = [
      { value: 'none', label: 'Manual review only' },
      { value: 'worker', label: 'Agent worker' },
    ];
    if (current !== 'none' && current !== 'worker') {
      options.push({ value: current, label: `${current} (current)` });
    }
    return options;
  }, [initial?.reviewer]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((current) => (current === null ? current : { ...current, [key]: value }));
    setSubmitError(null);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (form === null || initial === null || view === null || closed) return;
    const title = form.title.trim();
    if (title === '') {
      setSubmitError('Give this review a title.');
      return;
    }
    const scope = scopeChanged ? buildScope(form) : null;
    if (scopeChanged && scope === null) {
      setSubmitError('Complete the scope fields before saving.');
      return;
    }
    const input: {
      title?: string;
      reviewer?: { backend: ReviewerBackend };
      scope?: DiffScope;
    } = {};
    if (titleChanged) input.title = title;
    if (reviewerChanged) input.reviewer = { backend: form.reviewer };
    if (scope !== null) input.scope = scope;
    if (Object.keys(input).length === 0) {
      navigate(`/review/${encodeURIComponent(id)}`);
      return;
    }

    setSaving(true);
    setSubmitError(null);
    try {
      await client.updateReview(id, input);
      toast('Review updated');
      navigate(`/review/${encodeURIComponent(id)}`);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Could not update the review.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="cr-form-loading" data-testid="edit-review-loading">
        <p className="cr-hint" role="status">
          Loading the review…
        </p>
      </div>
    );
  }

  if (loadError !== null || view === null || form === null || initial === null) {
    return (
      <>
        <PageHeader eyebrow="Edit review" title="Edit the request" />
        <ErrorPanel
          title="Could not load the review"
          message={loadError ?? 'The review is unavailable.'}
          onRetry={() => setSubmitError(null)}
        />
        <Button variant="secondary" onClick={() => navigate('/')}>
          Back to reviews
        </Button>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Edit review"
        title="Edit the request"
        description="Correct the title, reviewer or diff boundary. The repository cannot be changed; create a new review for a different repository."
      />
      <form className="cr-form" onSubmit={(event) => void onSubmit(event)} noValidate>
        <datalist id="edit-branch-options">
          {branches.map((branch) => (
            <option key={branch} value={branch} />
          ))}
        </datalist>

        {closed ? (
          <p className="cr-notice cr-notice-warning">
            Closed reviews cannot be edited. You can still delete this review from its page.
          </p>
        ) : null}
        {submitError !== null ? (
          <ErrorPanel title="Could not update the review" message={submitError} />
        ) : null}

        <div className="cr-form-card">
          <div className="cr-form-section">
            <h2 className="cr-form-section-title">Repository</h2>
            <div className="cr-form-grid">
              <div className="cr-field" style={{ gridColumn: '1 / -1' }}>
                <Input
                  label="Repository path"
                  value={repoRoot}
                  readOnly
                  disabled
                  className="cr-mono"
                  hint="The repository is fixed at creation. Create a new review to change it."
                />
              </div>
            </div>
          </div>

          <div className="cr-form-section">
            <h2 className="cr-form-section-title">Review</h2>
            <div className="cr-form-grid">
              <div className="cr-field" style={{ gridColumn: '1 / -1' }}>
                <Input
                  label="Title"
                  value={form.title}
                  onChange={(event) => update('title', event.target.value)}
                  disabled={closed}
                  required
                />
              </div>
              <div className="cr-field">
                <Select
                  label="Reviewer"
                  value={form.reviewer}
                  onChange={(event) => update('reviewer', event.target.value as ReviewerBackend)}
                  disabled={closed}
                  options={reviewerOptions}
                />
                <span className="cr-hint">
                  Manual reviews accept comments immediately. Agent worker queues a read-only
                  reviewer job.
                </span>
              </div>
              <div className="cr-field">
                <Select
                  label="Diff scope"
                  value={form.kind}
                  onChange={(event) => update('kind', event.target.value as ScopeKind)}
                  disabled={closed || !initial.hasSnapshot}
                  options={SCOPE_OPTIONS}
                />
              </div>
            </div>
          </div>

          <div className="cr-form-section">
            <h2 className="cr-form-section-title">Changes</h2>
            <p className="cr-meta">
              Current scope: <span className="cr-mono">{initial.currentLabel}</span>
            </p>
            {!initial.hasSnapshot ? (
              <p className="cr-hint">This review has no snapshot to edit.</p>
            ) : form.kind === 'range' ? (
              <div className="cr-form-grid">
                <div className="cr-field">
                  <Input
                    label="Target branch"
                    value={form.baseRef}
                    onChange={(event) => update('baseRef', event.target.value)}
                    disabled={closed}
                    list="edit-branch-options"
                    className="cr-mono"
                  />
                </div>
                <div className="cr-field">
                  <Input
                    label="Source branch"
                    value={form.headRef}
                    onChange={(event) => update('headRef', event.target.value)}
                    disabled={closed}
                    list="edit-branch-options"
                    className="cr-mono"
                  />
                </div>
              </div>
            ) : form.kind === 'worktree' ? (
              <div className="cr-field">
                <Input
                  label="Base branch"
                  value={form.baseRef}
                  onChange={(event) => update('baseRef', event.target.value)}
                  disabled={closed}
                  list="edit-branch-options"
                  className="cr-mono"
                />
              </div>
            ) : form.kind === 'commit' ? (
              <div className="cr-field">
                <Input
                  label="Commit SHA"
                  value={form.sha}
                  onChange={(event) => update('sha', event.target.value)}
                  disabled={closed}
                  className="cr-mono"
                />
              </div>
            ) : (
              <div className="cr-field">
                <Input
                  label="Commits (oldest first)"
                  value={form.shasText}
                  onChange={(event) => update('shasText', event.target.value)}
                  disabled={closed}
                  className="cr-mono"
                  hint="Space-separated commit SHAs; the range is inclusive and ordered oldest first."
                />
              </div>
            )}

            {scopeChanged && !closed ? (
              <p className="cr-notice cr-notice-warning" data-testid="scope-warning">
                Changing the scope creates round {nextRound} from a new snapshot and re-anchors
                every comment. Previous rounds and comments stay available in history.
              </p>
            ) : null}
          </div>

          <div className="cr-form-actions">
            {!closed ? (
              <Button type="submit" loading={saving} disabled={!dirty}>
                Save changes
              </Button>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              onClick={() => navigate(`/review/${encodeURIComponent(id)}`)}
              disabled={saving}
            >
              Cancel
            </Button>
          </div>
        </div>
      </form>
    </>
  );
}
