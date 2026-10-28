import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import type { ApiClient, ReviewSummary } from '@dsh-code-review/ui';
import {
  Badge,
  Button,
  EmptyState,
  Input,
  ReviewsIcon,
  SearchIcon,
  Select,
  Skeleton,
  formatAge,
} from '@dsh-code-review/ui';
import { ErrorPanel, PageHeader } from '../components.js';
import { Link, navigate } from '../router.js';

type StatusFilter = 'all' | 'open' | 'closed';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
];

function ListSkeleton(): JSX.Element {
  return (
    <div className="cr-list" aria-hidden="true" data-testid="review-list-loading">
      {[0, 1, 2, 3].map((index) => (
        <div className="cr-review-row" key={index}>
          <div className="cr-review-main">
            <Skeleton width={`${46 + index * 9}%`} height={16} />
            <div style={{ height: 7 }} />
            <Skeleton width="30%" height={10} />
          </div>
          <Skeleton width="80%" height={22} radius={999} />
          <Skeleton width="65%" height={12} />
          <Skeleton width={52} height={12} />
          <Skeleton width={62} height={22} radius={999} />
          <Skeleton width={56} height={12} />
        </div>
      ))}
    </div>
  );
}

function ReviewRow({ review }: { review: ReviewSummary }): JSX.Element {
  const notFixed = review.notFixedCount ?? 0;
  return (
    <Link className="cr-review-row" to={`/review/${encodeURIComponent(review.id)}`}>
      <div className="cr-review-main">
        <span className="cr-review-title">{review.title}</span>
        <span className="cr-review-id">{review.id}</span>
      </div>
      <span className="cr-scope" title={review.scope}>
        {review.scope ?? '—'}
      </span>
      <span className="cr-author">{review.author ?? 'unknown'}</span>
      <time className="cr-age" dateTime={review.createdAt}>
        {formatAge(review.createdAt)}
      </time>
      <Badge tone={review.status === 'open' ? 'success' : 'neutral'}>{review.status}</Badge>
      <span className="cr-not-fixed" data-zero={notFixed === 0}>
        {notFixed} not fixed
      </span>
    </Link>
  );
}

/** Last path segment, with the original path as the fallback for roots and empty values. */
export function repoName(repoRoot: string): string {
  const trimmed = repoRoot.replace(/[\\/]+$/, '');
  if (trimmed === '' || /^[A-Za-z]:$/.test(trimmed)) return repoRoot;
  const separator = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  return trimmed.slice(separator + 1) || repoRoot;
}

function matchesQuery(review: ReviewSummary, query: string): boolean {
  const value = query.trim().toLowerCase();
  if (value === '') return true;
  return review.title.toLowerCase().includes(value) || review.id.toLowerCase().includes(value);
}

interface ReviewGroupProps {
  repoRoot: string;
  reviews: ReviewSummary[];
  collapsed: boolean;
  onToggle: (repoRoot: string) => void;
}

function ReviewGroup({ repoRoot, reviews, collapsed, onToggle }: ReviewGroupProps): JSX.Element {
  const id = useId();
  const headingId = `${id}-heading`;
  const rowsId = `${id}-rows`;
  const count = reviews.length === 1 ? '1 review' : `${reviews.length} reviews`;
  return (
    <section className="cr-review-group" aria-labelledby={headingId}>
      <h2 className="cr-review-group-heading" id={headingId}>
        <button
          type="button"
          className="cr-review-group-toggle"
          aria-expanded={!collapsed}
          aria-controls={rowsId}
          onClick={() => onToggle(repoRoot)}
        >
          <span className="cr-review-group-chevron" aria-hidden="true" />
          <span className="cr-review-group-name">{repoName(repoRoot)}</span>
          <span className="cr-review-group-path" title={repoRoot}>
            {repoRoot}
          </span>
          <span className="cr-review-group-count">{count}</span>
        </button>
      </h2>
      <div className="cr-review-group-rows" id={rowsId} hidden={collapsed}>
        {reviews.map((review) => (
          <ReviewRow review={review} key={review.id} />
        ))}
      </div>
    </section>
  );
}

export interface ReviewListPageProps {
  client: ApiClient;
}

export function ReviewListPage({ client }: ReviewListPageProps): JSX.Element {
  const [status, setStatus] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');
  const [reviews, setReviews] = useState<ReviewSummary[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());

  const load = useCallback(
    async (signal: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const page = await client.listReviews({
          limit: 50,
          ...(status === 'all' ? {} : { status }),
        });
        if (signal.aborted) return;
        setReviews(page.items);
        setTotal(page.total);
      } catch (err) {
        if (signal.aborted) return;
        if (err instanceof Error && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Failed to load reviews');
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [client, status],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, reloadKey]);

  const filtered = useMemo(
    () => (reviews ?? []).filter((review) => matchesQuery(review, query)),
    [query, reviews],
  );

  const groups = useMemo(() => {
    const byRepo = new Map<string, ReviewSummary[]>();
    for (const review of filtered) {
      const rows = byRepo.get(review.repoRoot);
      if (rows === undefined) byRepo.set(review.repoRoot, [review]);
      else rows.push(review);
    }
    return [...byRepo.entries()];
  }, [filtered]);

  const toggleGroup = useCallback((repoRoot: string) => {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(repoRoot)) next.delete(repoRoot);
      else next.add(repoRoot);
      return next;
    });
  }, []);

  if (error !== null && reviews === null) {
    return (
      <>
        <PageHeader
          eyebrow="Workspace"
          title="Reviews"
          description="Review changes before they merge. Every note stays attached to the line it was written on."
          actions={
            <Button onClick={() => navigate('/new')} icon={<span aria-hidden="true">+</span>}>
              New review
            </Button>
          }
        />
        <ErrorPanel
          title="The review daemon is unreachable"
          message={error}
          onRetry={() => setReloadKey((value) => value + 1)}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Reviews"
        description="Review changes before they merge. Every note stays attached to the line it was written on."
        actions={
          <Button onClick={() => navigate('/new')} icon={<span aria-hidden="true">+</span>}>
            New review
          </Button>
        }
      />

      <div className="cr-toolbar">
        <div className="cr-search">
          <span className="cr-search-icon">
            <SearchIcon size={16} />
          </span>
          <Input
            label="Search reviews"
            hideLabel
            type="search"
            placeholder="Search by title or review id"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div className="cr-field cr-field-select">
          <Select
            label="Filter by status"
            hideLabel
            options={STATUS_OPTIONS}
            value={status}
            onChange={(event) => setStatus(event.target.value as StatusFilter)}
          />
        </div>
        <span className="cr-meta" aria-live="polite">
          {loading ? 'Loading…' : `${filtered.length} of ${total}`}
        </span>
      </div>

      {loading && reviews === null ? (
        <ListSkeleton />
      ) : filtered.length === 0 ? (
        <div className="cr-list">
          {query.trim() !== '' || status !== 'all' ? (
            <EmptyState
              icon={<SearchIcon size={20} />}
              title="No matching reviews"
              description="Try a different search term or clear the status filter."
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setQuery('');
                    setStatus('all');
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<ReviewsIcon size={22} />}
              title="No reviews yet"
              description="Start a review when a branch is ready, or ask your agent to create one for the current worktree."
              action={<Button onClick={() => navigate('/new')}>Create the first review</Button>}
            />
          )}
        </div>
      ) : (
        <div className="cr-list">
          <div className="cr-list-head" aria-hidden="true">
            <span>Review</span>
            <span>Scope</span>
            <span>Author</span>
            <span>Age</span>
            <span>Status</span>
            <span>Not fixed</span>
          </div>
          {groups.map(([repoRoot, groupReviews]) => (
            <ReviewGroup
              key={repoRoot}
              repoRoot={repoRoot}
              reviews={groupReviews}
              collapsed={collapsedGroups.has(repoRoot)}
              onToggle={toggleGroup}
            />
          ))}
        </div>
      )}
    </>
  );
}
