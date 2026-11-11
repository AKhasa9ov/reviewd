import { Button } from '@sir_yami/reviewd-ui';
import { PageHeader } from '../components.js';
import { useNavigate } from '../router.js';

export function NotFoundPage({ path }: { path: string }): JSX.Element {
  const navigate = useNavigate();
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
