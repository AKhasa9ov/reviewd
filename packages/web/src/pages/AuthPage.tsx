import { useState } from 'react';
import type { ApiClient } from '@dsh-code-review/ui';
import { Button, Input } from '@dsh-code-review/ui';
import { PageHeader } from '../components.js';
import { navigate } from '../router.js';

export interface AuthPageProps {
  client: ApiClient;
}

function nextPath(): string {
  const params = new URLSearchParams(window.location.search);
  const next = params.get('next');
  if (next === null || next === '' || !next.startsWith('/') || next.startsWith('//')) return '/';
  return next;
}

export function AuthPage({ client }: AuthPageProps): JSX.Element {
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (token.trim() === '') {
      setError('Enter the token configured for this daemon.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await client.authenticate(token.trim());
      setToken('');
      navigate(nextPath(), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="cr-auth-page">
      <PageHeader
        eyebrow="Authentication"
        title="Sign in to reviewd"
        description="Paste the shared token from the daemon configuration. It is exchanged for an HttpOnly session cookie and never stored in this browser."
      />
      <form className="cr-form" onSubmit={(event) => void onSubmit(event)} noValidate>
        <div className="cr-form-card">
          <Input
            label="Access token"
            type="password"
            autoComplete="current-password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            error={error ?? undefined}
            hint="At least 32 bytes; the daemon never echoes it back."
            required
          />
          <div className="cr-form-actions">
            <Button type="submit" loading={submitting}>
              Sign in
            </Button>
            <Button type="button" variant="secondary" onClick={() => navigate('/')}>
              Back to reviews
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
