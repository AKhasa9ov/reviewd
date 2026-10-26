import { Button } from '@dsh-code-review/ui';
import { PageHeader } from '../components.js';
import { navigate } from '../router.js';

export function NotFoundPage({ path }: { path: string }): JSX.Element {
  return (
    <div className="cr-placeholder">
      <PageHeader
        eyebrow="404"
        title="That page does not exist"
        description={`No route matches ${path}. The review list is still one click away.`}
        actions={<Button onClick={() => navigate('/')}>Back to reviews</Button>}
      />
    </div>
  );
}
