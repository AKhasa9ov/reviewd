import { useCallback, useEffect, useState } from 'react';
import type { ApiClient, HealthResponse } from '@sir_yami/reviewd-ui';
import { Badge, Button, Skeleton } from '@sir_yami/reviewd-ui';
import { ErrorPanel, PageHeader } from '../components.js';

export interface HealthPageProps {
  client: ApiClient;
}

export function HealthPage({ client }: HealthPageProps): JSX.Element {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(
    async (signal: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const result = await client.health();
        if (!signal.aborted) setHealth(result);
      } catch (err) {
        if (!signal.aborted) setError(err instanceof Error ? err.message : 'Health check failed');
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [client],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, reloadKey]);

  return (
    <div className="cr-health-page">
      <PageHeader
        eyebrow="Operations"
        title="Daemon health"
        description="A public, unauthenticated read of the reviewd process and its store."
        actions={
          <Button variant="secondary" onClick={() => setReloadKey((value) => value + 1)}>
            Refresh
          </Button>
        }
      />
      {error !== null ? (
        <ErrorPanel
          title="Health check failed"
          message={error}
          onRetry={() => setReloadKey((value) => value + 1)}
        />
      ) : loading && health === null ? (
        <div className="cr-form-card" aria-label="Loading health">
          <Skeleton width="40%" height={18} />
          <Skeleton width="100%" height={12} />
          <Skeleton width="72%" height={12} />
        </div>
      ) : health !== null ? (
        <>
          <div className="cr-form-card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <Badge tone={health.status === 'ok' ? 'success' : 'danger'}>{health.status}</Badge>
              <span className="cr-meta">
                store {health.store.writable ? 'writable' : 'read-only'} · git{' '}
                {health.git.ok ? 'ok' : 'unavailable'}
                {health.version === undefined ? '' : ` · v${health.version}`}
              </span>
            </div>
          </div>
          <pre className="cr-code-block" aria-label="Raw health response">
            {JSON.stringify(health, null, 2)}
          </pre>
        </>
      ) : null}
    </div>
  );
}
